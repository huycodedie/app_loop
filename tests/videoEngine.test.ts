import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { VideoEngine } from '../src/main/ffmpeg/VideoEngine';
import { FFprobeService } from '../src/main/ffmpeg/FFprobeService';
import { MediaInfo, RepeatJobConfig } from '../src/shared/types';

vi.mock('../src/main/services/Logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const execFileAsync = promisify(execFile);
const binarySuffix = process.platform === 'win32' ? '.exe' : '';
const ffmpegPath = path.resolve(`resources/ffmpeg/ffmpeg${binarySuffix}`);
const ffprobePath = path.resolve(`resources/ffmpeg/ffprobe${binarySuffix}`);

describe('VideoEngine production workflow regressions', () => {
  let root: string;
  let config: RepeatJobConfig;
  let media: MediaInfo;
  let probe: { probeMedia: ReturnType<typeof vi.fn> };
  let manager: { getFFmpegPath: ReturnType<typeof vi.fn>; getFFprobePath: ReturnType<typeof vi.fn> };
  let tempManager: { createJobDirectory: (id: string) => string; cleanupJobDirectory: (id: string) => void };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'video-engine-'));
    config = {
      inputPath: path.join(root, 'source.webm'),
      outputFolder: path.join(root, 'out'),
      outputFilenameTemplate: '{original_name}_{repeat_count}x',
      repeatCount: 1,
      audioFadeInEnabled: false,
      audioFadeInDurationSeconds: 0,
      durationLimitEnabled: true,
      durationLimitSeconds: 3600,
      gpuMode: 'CPU',
    };
    media = {
      filePath: config.inputPath, fileName: 'source.webm', fileSize: 100,
      duration: 653, formatName: 'matroska,webm', bitrate: 1000,
      videoStreams: [{ index: 0, codecName: 'h264', codecLongName: 'H.264', width: 160,
        height: 120, fps: 25, bitrate: 1000, duration: 653, pixFmt: 'yuv420p', aspectRatio: '4:3' }],
      audioStreams: [], hasAudio: false,
    };
    probe = { probeMedia: vi.fn().mockResolvedValue(media) };
    manager = {
      getFFmpegPath: vi.fn().mockResolvedValue(ffmpegPath),
      getFFprobePath: vi.fn().mockResolvedValue(ffprobePath),
    };
    tempManager = {
      createJobDirectory: (id) => {
        const dir = path.join(root, `job_${id}`);
        fs.mkdirSync(dir, { recursive: true });
        return dir;
      },
      cleanupJobDirectory: (id) => fs.rmSync(path.join(root, `job_${id}`), { force: true, recursive: true }),
    };
  });

  afterEach(() => {
    fs.rmSync(root, { force: true, recursive: true });
    vi.restoreAllMocks();
  });

  function createEngine(useRealProbe = false): VideoEngine {
    return new VideoEngine(manager as any,
      useRealProbe ? new FFprobeService(manager as any) : probe as any,
      { getEncoderForMode: vi.fn().mockResolvedValue('libx264') } as any,
      tempManager as any);
  }

  function mockMediaStages(engine: VideoEngine) {
    const normalize = vi.spyOn(engine as any, 'normalizeSource').mockResolvedValue({ encoderUsed: 'libx264' });
    const partial = vi.spyOn(engine as any, 'buildPartialCopy').mockResolvedValue(undefined);
    const concat = vi.spyOn(engine as any, 'concatSegments').mockImplementation(async (...args: any[]) => {
      fs.writeFileSync(args[2], 'output');
    });
    vi.spyOn(engine as any, 'verifyOutput').mockResolvedValue(undefined);
    return { normalize, partial, concat };
  }

  it('honors MINIMUM mode and names the MP4 with the calculated repeat count', async () => {
    config.durationMode = 'MINIMUM';
    const engine = createEngine();
    const stages = mockMediaStages(engine);
    const output = await engine.processVideo('minimum', config);
    expect(stages.partial).not.toHaveBeenCalled();
    expect(stages.concat.mock.calls[0][4]).toBe(3918);
    expect(path.basename(output)).toMatch(/^source_6x.*\.mp4$/);
  });

  it('passes maximum overshoot protection into the production plan', async () => {
    config.durationMode = 'MINIMUM';
    config.maxOvershootSeconds = 60;
    const engine = createEngine();
    const stages = mockMediaStages(engine);
    await engine.processVideo('overshoot', config);
    expect(stages.partial.mock.calls[0][3]).toBe(335);
    expect(stages.concat.mock.calls[0][4]).toBe(3600);
    expect(stages.normalize.mock.calls[0][6]).toBe(true);
  });

  it('cancels while probing and never starts encoding', async () => {
    let finishProbe!: (info: MediaInfo) => void;
    probe.probeMedia.mockReturnValue(new Promise<MediaInfo>((resolve) => { finishProbe = resolve; }));
    const engine = createEngine();
    const stages = mockMediaStages(engine);
    const task = engine.processVideo('cancel-probe', config);
    expect(engine.cancelProcess('cancel-probe')).toBe(true);
    finishProbe(media);
    await expect(task).rejects.toMatchObject({ code: 'PROCESS_CANCELLED' });
    expect(stages.normalize).not.toHaveBeenCalled();
    expect(engine.cancelProcess('cancel-probe')).toBe(false);
  });

  it('does not start FFmpeg if cancelled while resolving its executable', async () => {
    let finishResolution!: (value: string) => void;
    let enteredResolution!: () => void;
    const startedResolution = new Promise<void>((resolve) => { enteredResolution = resolve; });
    manager.getFFmpegPath.mockImplementation(() => {
      enteredResolution();
      return new Promise<string>((resolve) => { finishResolution = resolve; });
    });
    const engine = createEngine();
    const task = engine.processVideo('cancel-resolution', config);
    await startedResolution;
    expect(engine.cancelProcess('cancel-resolution')).toBe(true);
    finishResolution(ffmpegPath);
    await expect(task).rejects.toMatchObject({ code: 'PROCESS_CANCELLED' });
    expect(fs.existsSync(path.join(root, 'job_cancel-resolution'))).toBe(false);
  });

  it.skipIf(!fs.existsSync(ffmpegPath) || !fs.existsSync(ffprobePath))(
    'keeps the full final repeat in MINIMUM and trims it in EXACT with bundled FFmpeg',
    async () => {
      config.inputPath = path.join(root, 'duration-source.mp4');
      config.durationLimitSeconds = 5;
      await execFileAsync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y',
        '-f', 'lavfi', '-i', 'testsrc2=size=160x120:rate=25:duration=2',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', config.inputPath]);

      const engine = createEngine(true);
      const realProbe = new FFprobeService(manager as any);
      const outputs: Record<string, number> = {};
      for (const durationMode of ['MINIMUM', 'EXACT'] as const) {
        config.durationMode = durationMode;
        const stages: string[] = [];
        const output = await engine.processVideo(`duration-${durationMode}`, config, (progress) => {
          stages.push(progress.stage);
        });
        const info = await realProbe.probeMedia(output);
        outputs[durationMode] = info.duration;
        expect(info.duration).toBeCloseTo(durationMode === 'MINIMUM' ? 6 : 5, 1);
        expect(stages.includes('BUILDING_PARTIAL_END')).toBe(durationMode === 'EXACT');
        const decoded = await execFileAsync(ffmpegPath, ['-hide_banner', '-loglevel', 'error',
          '-xerror', '-i', output, '-f', 'null', '-']);
        expect(decoded.stderr).toBe('');
        const frames = await execFileAsync(ffprobePath, ['-v', 'error', '-count_frames',
          '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', output]);
        expect(Number(frames.stdout.trim())).toBe(durationMode === 'MINIMUM' ? 150 : 125);
      }
      expect(outputs.MINIMUM).toBeGreaterThan(outputs.EXACT);
    }, 60000);

  it.skipIf(!fs.existsSync(ffmpegPath) || !fs.existsSync(ffprobePath))(
    'creates a fully decodable exact output from HEVC + 48 kHz mono AAC with a partial tail',
    async () => {
      config.inputPath = path.join(root, 'hevc-source.mkv');
      config.durationLimitSeconds = 2.4;
      await execFileAsync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y',
        '-f', 'lavfi', '-i', 'testsrc2=size=160x120:rate=25:duration=2',
        '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=2',
        '-c:v', 'libx265', '-pix_fmt', 'yuv420p', '-x265-params', 'log-level=error:pools=1',
        '-c:a', 'aac', config.inputPath]);
      const engine = createEngine(true);
      const output = await engine.processVideo('hevc-partial', config);
      const info = await new FFprobeService(manager as any).probeMedia(output);
      expect(path.extname(output)).toBe('.mp4');
      expect(info.duration).toBeCloseTo(2.4, 0);
      expect(info.audioStreams[0].sampleRate).toBe(44100);
      expect(info.audioStreams[0].channels).toBe(2);
      const decoded = await execFileAsync(ffmpegPath, ['-hide_banner', '-loglevel', 'error',
        '-xerror', '-i', output, '-f', 'null', '-']);
      expect(decoded.stderr).toBe('');
      const frames = await execFileAsync(ffprobePath, ['-v', 'error', '-count_frames',
        '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', output]);
      expect(Number(frames.stdout.trim())).toBeGreaterThanOrEqual(60);
    }, 60000);
});

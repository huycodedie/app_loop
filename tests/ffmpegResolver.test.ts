import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FFmpegManager } from '../src/main/ffmpeg/FFmpegManager';
import { AppError } from '../src/shared/errors';
import fs from 'fs';
import path from 'path';

describe('FFmpegManager Executable Resolver Unit Tests', () => {
  let ffmpegManager: FFmpegManager;

  beforeEach(() => {
    ffmpegManager = new FFmpegManager();
    // Unit tests must not depend on installed binaries, cold-start time or PATH.
    vi.spyOn(ffmpegManager as any, 'validateExecutable').mockResolvedValue({ valid: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('should return ExecutableResolution structure on resolve()', async () => {
    const res = await ffmpegManager.resolve();
    expect(res).toHaveProperty('source');
    expect(res).toHaveProperty('ffmpegAvailable');
    expect(res).toHaveProperty('ffprobeAvailable');
    expect(typeof res.ffmpegAvailable).toBe('boolean');
    expect(typeof res.ffprobeAvailable).toBe('boolean');
  });

  it('should throw AppError with code FFPROBE_MISSING when getFFprobePath() fails', async () => {
    // Mock resolve returning null paths
    vi.spyOn(ffmpegManager, 'resolve').mockResolvedValueOnce({
      ffmpegPath: null,
      ffprobePath: null,
      source: 'NOT_FOUND',
      ffmpegAvailable: false,
      ffprobeAvailable: false,
    });

    await expect(ffmpegManager.getFFprobePath()).rejects.toMatchObject({
      code: 'FFPROBE_MISSING', message: expect.stringContaining('Không tìm thấy FFprobe'),
    });
  });

  it('should throw AppError with code FFMPEG_MISSING when getFFmpegPath() fails', async () => {
    vi.spyOn(ffmpegManager, 'resolve').mockResolvedValueOnce({
      ffmpegPath: null,
      ffprobePath: null,
      source: 'NOT_FOUND',
      ffmpegAvailable: false,
      ffprobeAvailable: false,
    });

    await expect(ffmpegManager.getFFmpegPath()).rejects.toMatchObject({
      code: 'FFMPEG_MISSING', message: expect.stringContaining('Không tìm thấy FFmpeg'),
    });
  });

  it('should throw AppError when custom folder does not exist', async () => {
    await expect(ffmpegManager.setCustomFolder('E:/NonExistentFolder_12345')).rejects.toThrowError(AppError);
  });

  it('continues searching when FFmpeg and FFprobe are in different PATH folders', async () => {
    const ffmpegDir = path.resolve('fake-ffmpeg-path');
    const ffprobeDir = path.resolve('fake-ffprobe-path');
    const ext = process.platform === 'win32' ? '.exe' : '';
    const ffmpegPath = path.join(ffmpegDir, `ffmpeg${ext}`);
    const ffprobePath = path.join(ffprobeDir, `ffprobe${ext}`);
    vi.stubEnv('PATH', [ffmpegDir, ffprobeDir].join(path.delimiter));
    vi.spyOn(fs, 'existsSync').mockImplementation((candidate) =>
      candidate === ffmpegDir || candidate === ffprobeDir);
    vi.mocked((ffmpegManager as any).validateExecutable).mockImplementation(async (...args: any[]) => ({
      valid: args[0] === ffmpegPath || args[0] === ffprobePath,
      version: 'test',
    }));
    await expect(ffmpegManager.resolve()).resolves.toMatchObject({
      source: 'SYSTEM_PATH', ffmpegPath, ffprobePath,
      ffmpegAvailable: true, ffprobeAvailable: true,
    });
  });
});

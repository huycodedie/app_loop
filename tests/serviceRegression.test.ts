import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { QueueService } from '../src/main/services/QueueService';
import { WatchFolderService } from '../src/main/services/WatchFolderService';
import { SchedulerService } from '../src/main/services/SchedulerService';
import { SourceFileStatusService } from '../src/main/services/SourceFileStatusService';
import { getNextScheduledRun } from '../src/shared/utils/cronSchedule';
import { JobRecord, RepeatJobConfig, WatchFolderConfig } from '../src/shared/types';

vi.mock('../src/main/database/db', () => ({ getDatabase: vi.fn() }));
vi.mock('../src/main/services/Logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('chokidar', () => ({ default: { watch: vi.fn(() => ({ on: vi.fn(), close: vi.fn(async () => {}) })) } }));

let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'vrs_services_')); });
afterEach(() => { vi.useRealTimers(); fs.rmSync(root, { recursive: true, force: true }); });

const baseConfig = (inputPath: string, outputFolder: string): RepeatJobConfig => ({
  inputPath, outputFolder, outputFilenameTemplate: '{original_name}_custom', repeatCount: 7,
  audioFadeInEnabled: false, audioFadeInDurationSeconds: 0,
  durationLimitEnabled: true, durationLimitSeconds: 601, durationMode: 'MINIMUM', maxOvershootSeconds: 600,
  gpuMode: 'CPU', encoder: 'libx265', crf: 22, preset: 'fast',
});

function queueFixture() {
  const jobs: JobRecord[] = [];
  const jobsRepo = {
    recoverInterruptedJobs: vi.fn(), getAllJobs: () => jobs,
    getJobById: (id: string) => jobs.find((job) => job.id === id),
    createJob: (job: JobRecord) => { jobs.push(job); return job; },
    updateJobPaths: (id: string, updates: Partial<JobRecord>) => Object.assign(jobs.find((job) => job.id === id)!, updates),
    updateJobPlan: (id: string, updates: Partial<JobRecord>) => Object.assign(jobs.find((job) => job.id === id)!, updates),
    updateJobStatus: (id: string, status: JobRecord['status'], stage: JobRecord['stage'], progress: number, error?: string) => {
      const job = jobs.find((entry) => entry.id === id);
      if (job) Object.assign(job, { status, stage, progress, error });
    }, deleteJob: vi.fn(),
  };
  const settings = { outputFolder: root, encoder: 'libx264', gpuMode: 'NVIDIA', outputFilenameTemplate: 'global', autoStartQueue: false, renameSourceFiles: true, errorNamingMode: 'SIMPLE', backgroundCompletionNotifications: false };
  const settingsRepo = { getSettings: () => settings };
  const historyRepo = { addHistory: vi.fn() };
  const output = path.join(root, 'result.mp4');
  const engine = { processVideo: vi.fn(async (_jobId: string, _config: RepeatJobConfig) => { fs.writeFileSync(output, 'result'); return output; }), cancelProcess: vi.fn() };
  const probe = { probeMedia: vi.fn(async (inputPath: string) => {
    if (!fs.existsSync(inputPath)) throw new Error('Missing input');
    return { duration: 600, fileSize: 6, fileName: path.basename(inputPath) };
  }) };
  const source = new SourceFileStatusService();
  vi.spyOn(source, 'recordSourceError').mockImplementation((record) => ({ ...record, id: 'error', failedAt: '' }));
  const service = new QueueService(jobsRepo as any, historyRepo as any, settingsRepo as any, engine as any, probe as any, source);
  return { service, jobs, settings, engine, historyRepo, source, probe };
}

describe('Real QueueService regression coverage', () => {
  it('keeps duration mode, encoder, GPU and naming settings from enqueue to processing', async () => {
    const fixture = queueFixture();
    const input = path.join(root, 'input.mp4'); fs.writeFileSync(input, 'input');
    const config = baseConfig(input, path.join(root, 'new-output'));
    const job = await fixture.service.addJob(config);
    expect(job.durationMode).toBe('MINIMUM');
    expect(job.expectedFinalDuration).toBe(1200);
    expect(job.manualRepeatCount).toBe(7);
    fixture.settings.outputFilenameTemplate = 'changed-global';
    await (fixture.service as any).processNextInQueue();
    expect(fixture.engine.processVideo.mock.calls[0][1]).toMatchObject({
      durationMode: 'MINIMUM', maxOvershootSeconds: 600, repeatCount: 7,
      gpuMode: 'CPU', encoder: 'libx265', outputFilenameTemplate: '{original_name}_custom', crf: 22,
    });
    expect(fixture.jobs[0].outputPath).toBe(path.join(root, 'result.mp4'));
  });

  it('persists renamed failure source paths and locks the daily output directory for retry', async () => {
    const fixture = queueFixture();
    const input = path.join(root, 'clip_PROCESSING.mp4'); fs.writeFileSync(input, 'input');
    fixture.engine.processVideo.mockRejectedValueOnce(new Error('encoder failed'));
    const job = await fixture.service.addJob(baseConfig(input, root), { sourceType: 'WATCH_FOLDER', autoDailyOutputFolder: true });
    await (fixture.service as any).processNextInQueue();
    expect(job.status).toBe('FAILED');
    expect(job.inputPath).toBe(path.join(root, 'clip_ERROR.mp4'));
    expect(fs.existsSync(job.inputPath)).toBe(true);
    const lockedFolder = job.resolvedOutputDirectory;
    fixture.service.pauseQueue();
    expect(await fixture.service.retryJob(job.id)).toBe(true);
    await (fixture.service as any).processNextInQueue(); // paused, no work
    (fixture.service as any).isPaused = false;
    await (fixture.service as any).processNextInQueue();
    expect(job.status).toBe('COMPLETED');
    expect(job.resolvedOutputDirectory).toBe(lockedFolder);
    expect(job.inputPath).toBe(path.join(root, 'clip_DONE.mp4'));
  });

  it('waits for active cancellation cleanup and records CANCELLED without an error', async () => {
    const fixture = queueFixture();
    const input = path.join(root, 'input.mp4'); fs.writeFileSync(input, 'input');
    let rejectProcess: (err: Error) => void = () => {};
    fixture.engine.processVideo.mockImplementationOnce(() => new Promise<string>((_, reject) => { rejectProcess = reject; }));
    fixture.engine.cancelProcess.mockImplementation(() => rejectProcess(new Error('SIGKILL')));
    const job = await fixture.service.addJob(baseConfig(input, root));
    const processing = (fixture.service as any).processNextInQueue();
    await vi.waitFor(() => expect(fixture.engine.processVideo).toHaveBeenCalledOnce());
    const errorEvent = vi.fn(); fixture.service.on('job-error', errorEvent);
    await fixture.service.cancelActiveJobAndWait();
    await processing;
    expect(job.status).toBe('CANCELLED');
    expect(errorEvent).not.toHaveBeenCalled();
    expect(fixture.historyRepo.addHistory).not.toHaveBeenCalled();
  });

  it('prevents retrying an active job', async () => {
    const fixture = queueFixture();
    const input = path.join(root, 'input.mp4'); fs.writeFileSync(input, 'input');
    const job = await fixture.service.addJob(baseConfig(input, root));
    job.status = 'PROCESSING';
    expect(await fixture.service.retryJob(job.id)).toBe(false);
  });
});

describe('Real WatchFolderService regression coverage', () => {
  function watchFixture() {
    const config: WatchFolderConfig = { id: 'rule', folderPath: root, outputFolder: root, repeatCount: 2,
      audioFadeInEnabled: false, audioFadeInDurationSeconds: 0, durationLimitEnabled: false, durationLimitSeconds: null,
      autoDailyOutputFolder: false, enabled: true, createdAt: '', renameSourceFiles: false };
    const repo = { getAllWatchFolders: () => [config], getWatchFolderById: () => config,
      isFileProcessed: vi.fn(() => false), recordProcessedFile: vi.fn() };
    const queue = { addJob: vi.fn(async () => ({})), getQueue: () => [] };
    const source = { recoverProcessingFiles: vi.fn(), renameSourceFile: vi.fn(), recordSourceError: vi.fn() };
    return { service: new WatchFolderService(repo as any, queue as any, source as any), config, queue, source };
  }
  it('cancels pending debounce jobs when paused or a rule is stopped', async () => {
    vi.useFakeTimers();
    const { service, config, queue } = watchFixture();
    const input = path.join(root, 'input.mp4'); fs.writeFileSync(input, 'input');
    (service as any).handleNewFile(config, input); service.pauseAll();
    await vi.advanceTimersByTimeAsync(2500);
    expect(queue.addJob).not.toHaveBeenCalled();
    (service as any).isPaused = false;
    (service as any).handleNewFile(config, input); service.stopWatcher(config.id);
    await vi.advanceTimersByTimeAsync(2500);
    expect(queue.addJob).not.toHaveBeenCalled();
  });
  it('does not repeat crash recovery while resuming live jobs', () => {
    const { service, source } = watchFixture();
    service.initWatchers(); service.pauseAll(); service.resumeAll(); service.shutdown();
    expect(source.recoverProcessingFiles).toHaveBeenCalledOnce();
  });
  it('uses the latest rule settings for pending files', async () => {
    vi.useFakeTimers();
    const { service, config, queue } = watchFixture();
    const input = path.join(root, 'input.mp4'); fs.writeFileSync(input, 'input');
    (service as any).handleNewFile(config, input);
    config.repeatCount = 9; config.encoder = 'libx265';
    await vi.advanceTimersByTimeAsync(2500);
    expect(queue.addJob).toHaveBeenCalledWith(expect.objectContaining({ repeatCount: 9, encoder: 'libx265' }), expect.anything());
  });
});

describe('Cron and SchedulerService regression coverage', () => {
  it('computes recurrence, steps, ranges and day-of-week in local time', () => {
    expect(getNextScheduledRun('0 0 * * *', new Date(2026, 9, 10, 12))).toEqual(new Date(2026, 9, 11));
    expect(getNextScheduledRun('*/15 9-17 * * 1-5', new Date(2026, 9, 9, 17, 59))).toEqual(new Date(2026, 9, 12, 9));
    expect(getNextScheduledRun('0 0 * * 7', new Date(2026, 9, 10))).toEqual(new Date(2026, 9, 11));
    expect(() => getNextScheduledRun('0 25 * * *')).toThrow();
    expect(() => getNextScheduledRun('*/0 * * * *')).toThrow();
    expect(() => getNextScheduledRun('0 0 20-10 * *')).toThrow();
    expect(getNextScheduledRun('0 0 */2 * *', new Date(2026, 9, 11))).toEqual(new Date(2026, 9, 13));
    expect(getNextScheduledRun('0 0 * * */2', new Date(2026, 9, 11))).toEqual(new Date(2026, 9, 13));
    expect(getNextScheduledRun('0 0 29 2 *', new Date(2026, 0, 1))).toEqual(new Date(2028, 1, 29));
  });
  it('awaits enqueue before advancing recurrence and retains due time when enqueue fails', async () => {
    const due = new Date(Date.now() - 60_000).toISOString();
    const repo = { getAllSchedules: () => [{ id: 's', name: 'Daily', enabled: true, nextRun: due,
      jobConfigJson: '{}', cronExpression: '* * * * *' }], updateScheduleRun: vi.fn() };
    const queue = { addJob: vi.fn().mockRejectedValueOnce(new Error('missing source')).mockResolvedValueOnce({}) };
    const service = new SchedulerService(repo as any, queue as any);
    await (service as any).checkSchedules();
    expect(repo.updateScheduleRun).not.toHaveBeenCalled();
    await (service as any).checkSchedules();
    expect(repo.updateScheduleRun).toHaveBeenCalledWith('s', expect.any(String), expect.any(String));
    expect(new Date(repo.updateScheduleRun.mock.calls[0][2]).getTime()).toBeGreaterThan(Date.now());
  });
  it('initializes next_run for schedules created by previous app versions', async () => {
    const repo = { getAllSchedules: () => [{ id: 's', enabled: true, jobConfigJson: '{}', cronExpression: '0 0 * * *' }], updateScheduleRun: vi.fn() };
    const queue = { addJob: vi.fn() };
    await (new SchedulerService(repo as any, queue as any) as any).checkSchedules();
    expect(repo.updateScheduleRun).toHaveBeenCalledWith('s', '', expect.any(String));
    expect(queue.addJob).not.toHaveBeenCalled();
  });
});

describe('Source status parsing regression coverage', () => {
  it('preserves legitimate source numbering and ignores status words inside a name', () => {
    expect(SourceFileStatusService.getOriginalFilename('clip_001.mp4')).toBe('clip_001.mp4');
    expect(SourceFileStatusService.generateTargetFilename('clip_001.mp4', 'COMPLETED')).toBe('clip_001_DONE.mp4');
    expect(SourceFileStatusService.hasStatusSuffix('all_done_today.mp4')).toBe(false);
    expect(SourceFileStatusService.getOriginalFilename('clip_RECOVERY_ERROR.mp4')).toBe('clip.mp4');
    expect(SourceFileStatusService.getOriginalFilename('clip_ERROR_FFMPEG_001.mp4')).toBe('clip.mp4');
  });
});

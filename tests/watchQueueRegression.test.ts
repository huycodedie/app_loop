import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { QueueService } from '../src/main/services/QueueService';
import { WatchFolderService } from '../src/main/services/WatchFolderService';
import { SourceFileStatusService } from '../src/main/services/SourceFileStatusService';
import { JobRecord, RepeatJobConfig, WatchFolderConfig } from '../src/shared/types';

vi.mock('../src/main/database/db', () => ({ getDatabase: vi.fn() }));
vi.mock('../src/main/services/Logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('chokidar', () => ({ default: { watch: vi.fn(() => ({ on: vi.fn(), close: vi.fn(async () => {}) })) } }));

let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'vrs_watch_queue_')); });
afterEach(() => { vi.useRealTimers(); fs.rmSync(root, { recursive: true, force: true }); });

function fixture() {
  const jobs = new Map<string, JobRecord>();
  const save = (job: JobRecord) => { jobs.set(job.id, structuredClone(job)); return job; };
  const jobsRepo = {
    recoverInterruptedJobs: vi.fn(), getAllJobs: () => [...jobs.values()].map(job => structuredClone(job)),
    getJobById: (id: string) => jobs.get(id), createJob: save,
    updatePendingWatchFolderJob: vi.fn((job: JobRecord) => { save(job); return true; }),
    updateJobPaths: (id: string, updates: Partial<JobRecord>) => Object.assign(jobs.get(id)!, updates),
    updateJobPlan: (id: string, updates: Partial<JobRecord>) => Object.assign(jobs.get(id)!, updates),
    updateJobStatus: (id: string, status: JobRecord['status'], stage: JobRecord['stage'], progress: number) => {
      Object.assign(jobs.get(id)!, { status, stage, progress });
    },
  };
  const settings = { outputFolder: root, outputFilenameTemplate: 'global', encoder: 'libx264', gpuMode: 'CPU',
    autoStartQueue: false, renameSourceFiles: false, errorNamingMode: 'SIMPLE', backgroundCompletionNotifications: false };
  const settingsRepo = { getSettings: () => settings };
  const probe = { probeMedia: vi.fn(async (inputPath: string) => ({ duration: 6, fileSize: 6, fileName: path.basename(inputPath) })) };
  const engine = { processVideo: vi.fn(async (_id: string, config: RepeatJobConfig) => path.join(config.outputFolder, 'result.mp4')) };
  const source = new SourceFileStatusService();
  const queue = new QueueService(jobsRepo as any, { addHistory: vi.fn() } as any, settingsRepo as any, engine as any, probe as any, source);
  let rule: WatchFolderConfig = { id: 'rain-rule', name: 'Rain', folderPath: root, outputFolder: path.join(root, 'old-output'),
    repeatCount: 2, audioFadeInEnabled: false, audioFadeInDurationSeconds: 0,
    durationLimitEnabled: true, durationLimitSeconds: 10, durationMode: 'EXACT', maxOvershootSeconds: null,
    autoDailyOutputFolder: true, dailyFolderFormat: 'DAY_MONTH', renameSourceFiles: false,
    gpuMode: 'CPU', encoder: 'libx264', enabled: true, createdAt: new Date().toISOString() };
  const watchRepo = { getAllWatchFolders: () => [rule], getWatchFolderById: () => rule,
    updateWatchFolder: (_id: string, updates: Partial<WatchFolderConfig>) => (rule = { ...rule, ...updates }),
    isFileProcessed: () => false, recordProcessedFile: vi.fn() };
  const watcher = new WatchFolderService(watchRepo as any, queue, source, settingsRepo as any);
  const config = (name = 'clip'): RepeatJobConfig => ({
    inputPath: path.join(root, `${name}.mp4`), outputFolder: rule.outputFolder,
    outputFilenameTemplate: '{original_name}_{repeat_count}x', repeatCount: rule.repeatCount,
    audioFadeInEnabled: rule.audioFadeInEnabled, audioFadeInDurationSeconds: rule.audioFadeInDurationSeconds,
    durationLimitEnabled: rule.durationLimitEnabled, durationLimitSeconds: rule.durationLimitSeconds,
    durationMode: rule.durationMode, maxOvershootSeconds: rule.maxOvershootSeconds,
    gpuMode: 'CPU', encoder: 'libx264',
  });
  const metadata = () => ({ sourceType: 'WATCH_FOLDER' as const, watchFolderId: rule.id, watchFolderName: rule.name,
    baseOutputDirectory: rule.outputFolder, autoDailyOutputFolder: rule.autoDailyOutputFolder, renameSourceFiles: rule.renameSourceFiles ?? false });
  return { jobs, jobsRepo, queue, watcher, probe, engine, config, metadata, rule: () => rule };
}

describe('Watch Folder edits through the real services', () => {
  it('updates pending mode/output snapshots by exact rule id and leaves active, completed, manual and other rules alone', async () => {
    const f = fixture();
    const waiting = await f.queue.addJob(f.config('waiting'), f.metadata());
    const ready = await f.queue.addJob(f.config('ready'), f.metadata()); f.jobs.get(ready.id)!.status = 'READY';
    const active = await f.queue.addJob(f.config('active'), f.metadata()); f.jobs.get(active.id)!.status = 'PROCESSING';
    const complete = await f.queue.addJob(f.config('complete'), f.metadata()); f.jobs.get(complete.id)!.status = 'COMPLETED';
    const other = await f.queue.addJob(f.config('other'), { ...f.metadata(), watchFolderId: 'other-rule' });
    const manual = await f.queue.addJob(f.config('manual'));
    const untouched = [active, complete, other, manual].map(job => structuredClone(f.jobs.get(job.id)));
    const newOutput = path.join(root, 'new-output');
    f.watcher.updateWatchFolderConfiguration(f.rule().id, {
      name: 'Rain edited', outputFolder: newOutput, durationMode: 'MINIMUM', gpuMode: 'NVIDIA', encoder: 'h264_nvenc',
    });
    for (const job of [waiting, ready]) {
      expect(f.jobs.get(job.id)).toMatchObject({
        watchFolderName: 'Rain edited', baseOutputDirectory: newOutput, durationMode: 'MINIMUM',
        repeatCount: 2, expectedFinalDuration: 12, overshootSeconds: 2,
        configSnapshot: { outputFolder: newOutput, durationMode: 'MINIMUM', gpuMode: 'NVIDIA', encoder: 'h264_nvenc' },
      });
    }
    expect([active, complete, other, manual].map(job => f.jobs.get(job.id))).toEqual(untouched);
    await (f.queue as any).processNextInQueue();
    expect(f.engine.processVideo.mock.calls[0][1]).toMatchObject({ durationMode: 'MINIMUM', encoder: 'h264_nvenc' });
    expect(f.engine.processVideo.mock.calls[0][1].outputFolder.startsWith(newOutput)).toBe(true);
    f.queue.pauseQueue();
  });

  it('retains a retried locked date folder for non-output edits and unlocks it on an explicit output edit', async () => {
    const f = fixture();
    const job = await f.queue.addJob(f.config(), f.metadata());
    const locked = path.join(f.rule().outputFolder, '9_10');
    Object.assign(f.jobs.get(job.id)!, { status: 'FAILED', resolvedOutputDirectory: locked });
    f.queue.pauseQueue(); await f.queue.retryJob(job.id);
    f.watcher.updateWatchFolderConfiguration(f.rule().id, { name: 'New name', durationMode: 'MINIMUM' });
    expect(f.jobs.get(job.id)?.resolvedOutputDirectory).toBe(locked);
    const newOutput = path.join(root, 'explicit-output');
    f.watcher.updateWatchFolderConfiguration(f.rule().id, { outputFolder: newOutput });
    expect(f.jobs.get(job.id)?.resolvedOutputDirectory).toBeUndefined();
    expect(f.jobs.get(job.id)?.outputPath).toBe(path.join(newOutput, 'clip.mp4'));
  });

  it('uses the saved edit when a file was already probing during Save', async () => {
    const f = fixture();
    let finishProbe!: (info: { duration: number; fileSize: number; fileName: string }) => void;
    f.probe.probeMedia.mockImplementationOnce(() => new Promise(resolve => { finishProbe = resolve; }));
    const adding = f.queue.addJob(f.config(), f.metadata());
    const newOutput = path.join(root, 'edited-during-probe');
    f.watcher.updateWatchFolderConfiguration(f.rule().id, { name: 'Latest', outputFolder: newOutput,
      durationMode: 'MINIMUM', autoDailyOutputFolder: false });
    finishProbe({ duration: 6, fileSize: 6, fileName: 'clip.mp4' });
    const job = await adding;
    expect(job).toMatchObject({ watchFolderId: 'rain-rule', watchFolderName: 'Latest', sourceDurationSeconds: 6,
      baseOutputDirectory: newOutput, autoDailyOutputFolder: false, expectedFinalDuration: 12,
      configSnapshot: { outputFolder: newOutput, durationMode: 'MINIMUM' } });
    expect(fs.existsSync(newOutput)).toBe(true);
  });

  it('carries persisted rule identity and name from a pending watcher event after edit', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const input = path.join(root, 'detected.mp4'); fs.writeFileSync(input, 'input');
    (f.watcher as any).handleNewFile(f.rule(), input);
    f.watcher.updateWatchFolderConfiguration(f.rule().id, { name: 'Changed before enqueue', durationMode: 'MINIMUM' });
    await vi.advanceTimersByTimeAsync(2100);
    expect([...f.jobs.values()]).toHaveLength(1);
    expect([...f.jobs.values()][0]).toMatchObject({ watchFolderId: 'rain-rule', watchFolderName: 'Changed before enqueue',
      durationMode: 'MINIMUM', expectedFinalDuration: 12 });
    f.watcher.shutdown();
  });

  it('refreshes legacy plan fields from source probing before rendering with updated MINIMUM settings', async () => {
    const f = fixture();
    const job = await f.queue.addJob(f.config(), f.metadata());
    delete f.jobs.get(job.id)!.sourceDurationSeconds;
    delete f.jobs.get(job.id)!.configSnapshot;
    f.watcher.updateWatchFolderConfiguration(f.rule().id, { durationMode: 'MINIMUM', durationLimitSeconds: 13 });
    expect(f.jobs.get(job.id)?.expectedFinalDuration).toBeUndefined();
    await (f.queue as any).processNextInQueue();
    expect(f.jobs.get(job.id)).toMatchObject({ sourceDurationSeconds: 6, repeatCount: 3, expectedFinalDuration: 18, overshootSeconds: 5 });
    expect(f.engine.processVideo.mock.calls[0][1]).toMatchObject({ durationMode: 'MINIMUM', durationLimitSeconds: 13 });
  });

  it('finishes an already marked pending source after its rule disables source renaming', async () => {
    const f = fixture();
    f.rule().renameSourceFiles = true;
    const markedConfig = f.config('clip_PROCESSING'); fs.writeFileSync(markedConfig.inputPath, 'source');
    const job = await f.queue.addJob(markedConfig, f.metadata());
    f.watcher.updateWatchFolderConfiguration(f.rule().id, { renameSourceFiles: false });
    expect(f.jobs.get(job.id)?.renameSourceFiles).toBe(true);
    await (f.queue as any).processNextInQueue();
    expect(f.jobs.get(job.id)?.inputPath).toBe(path.join(root, 'clip_DONE.mp4'));
    expect(fs.existsSync(markedConfig.inputPath)).toBe(false);
    expect(fs.existsSync(path.join(root, 'clip_DONE.mp4'))).toBe(true);
  });

  it('preserves the source rename lifecycle when its rule changes during probing', async () => {
    const f = fixture();
    f.rule().renameSourceFiles = true;
    const markedConfig = f.config('racing_PROCESSING'); fs.writeFileSync(markedConfig.inputPath, 'source');
    let finishProbe!: (info: { duration: number; fileSize: number; fileName: string }) => void;
    f.probe.probeMedia.mockImplementationOnce(() => new Promise(resolve => { finishProbe = resolve; }));
    const adding = f.queue.addJob(markedConfig, f.metadata());
    f.watcher.updateWatchFolderConfiguration(f.rule().id, { renameSourceFiles: false });
    finishProbe({ duration: 6, fileSize: 6, fileName: 'racing_PROCESSING.mp4' });
    const job = await adding;
    expect(job.renameSourceFiles).toBe(true);
    await (f.queue as any).processNextInQueue();
    expect(f.jobs.get(job.id)?.inputPath).toBe(path.join(root, 'racing_DONE.mp4'));
    expect(fs.existsSync(markedConfig.inputPath)).toBe(false);
  });

  it('keeps previously unmarked pending sources unmarked when the rule enables renaming', async () => {
    const f = fixture();
    const config = f.config('unmarked'); fs.writeFileSync(config.inputPath, 'source');
    const job = await f.queue.addJob(config, f.metadata());
    f.watcher.updateWatchFolderConfiguration(f.rule().id, { renameSourceFiles: true });
    expect(f.jobs.get(job.id)?.renameSourceFiles).toBe(false);
    await (f.queue as any).processNextInQueue();
    expect(f.jobs.get(job.id)?.inputPath).toBe(config.inputPath);
    expect(fs.existsSync(path.join(root, 'unmarked_DONE.mp4'))).toBe(false);
  });
});

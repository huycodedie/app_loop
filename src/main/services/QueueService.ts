import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { JobsRepository } from '../repositories/JobsRepository';
import { HistoryRepository } from '../repositories/HistoryRepository';
import { SettingsRepository } from '../repositories/SettingsRepository';
import { VideoEngine } from '../ffmpeg/VideoEngine';
import { FFprobeService } from '../ffmpeg/FFprobeService';
import { SourceFileStatusService } from './SourceFileStatusService';
import { JobRecord, RepeatJobConfig, JobStatus, JobStage, JobSourceType, ErrorNamingMode, WatchFolderConfig } from '@shared/types';
import { ProcessingProgress } from '@shared/types/progress';
import { calculateRepeatPlan } from '@shared/utils/repeatPlan';
import { resolveOutputDirectory, ensureDirectoryExists, DailyFolderFormat } from '@shared/utils/outputDirectoryResolver';
import { AppError } from '@shared/errors';
import { logger } from './Logger';

/** Metadata passed alongside RepeatJobConfig for source tracking. */
export interface JobMetadata {
  sourceType?: JobSourceType;
  watchFolderId?: string;
  watchFolderName?: string;
  autoDailyOutputFolder?: boolean;
  baseOutputDirectory?: string;
  dailyFolderFormat?: string;
  renameSourceFiles?: boolean;
  errorNamingMode?: ErrorNamingMode;
}

/** Minimum wall-clock ms between SQLite progress writes (throttle). */
const DB_PERSIST_INTERVAL_MS = 1500;
/** Minimum wall-clock ms between IPC progress emissions (throttle). */
const IPC_EMIT_INTERVAL_MS = 500;

export class QueueService extends EventEmitter {
  private isProcessingQueue: boolean = false;
  private isPaused: boolean = false;
  private activeJobId: string | null = null;
  private cancelledJobs = new Set<string>();
  private latestWatchFolderConfigs = new Map<string, WatchFolderConfig>();

  constructor(
    private jobsRepo: JobsRepository,
    private historyRepo: HistoryRepository,
    private settingsRepo: SettingsRepository,
    private videoEngine: VideoEngine,
    private ffprobeService: FFprobeService,
    private sourceStatusService?: SourceFileStatusService
  ) {
    super();
    this.jobsRepo.recoverInterruptedJobs();
  }

  public getQueue(): JobRecord[] {
    return this.jobsRepo.getAllJobs();
  }

  public async addJob(config: RepeatJobConfig, metadata?: JobMetadata): Promise<JobRecord> {
    const mediaInfo = await this.ffprobeService.probeMedia(config.inputPath);

    // A rule can be edited while ffprobe is running. Reapply its latest saved
    // settings before the synchronous insert/start sequence, so an old watcher
    // callback cannot enqueue a stale output path or duration mode after Save.
    const latestRule = metadata?.sourceType === 'WATCH_FOLDER' && metadata.watchFolderId
      ? this.latestWatchFolderConfigs.get(metadata.watchFolderId) : undefined;
    if (latestRule) {
      config = this.watchJobConfig(latestRule, config);
      metadata = this.watchJobMetadata(latestRule, metadata!);
    }
    
    // Calculate authoritative repeat plan for this media file
    const plan = calculateRepeatPlan(
      mediaInfo.duration,
      config.repeatCount,
      config.durationLimitEnabled ?? false,
      config.durationLimitSeconds ?? null,
      config.durationMode ?? 'EXACT',
      config.maxOvershootSeconds ?? null
    );

    // Disk space check before queueing
    const settings = this.settingsRepo.getSettings();
    const outputDir = config.outputFolder || settings.outputFolder || path.dirname(config.inputPath);
    fs.mkdirSync(outputDir, { recursive: true });

    const requiredBytes = mediaInfo.fileSize * (plan.effectiveRepeatCount + 1.5);
    this.checkFreeDiskSpace(outputDir, requiredBytes);

    const jobRecord: JobRecord = {
      id: `job_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      inputPath: config.inputPath,
      sourceDurationSeconds: mediaInfo.duration,
      outputPath: path.join(outputDir, mediaInfo.fileName),
      repeatCount: plan.effectiveRepeatCount,
      effectiveRepeatCount: plan.effectiveRepeatCount,
      manualRepeatCount: plan.requestedRepeatCount,
      audioFadeInEnabled: config.audioFadeInEnabled ?? true,
      audioFadeInDurationSeconds: config.audioFadeInDurationSeconds ?? 5.0,
      durationLimitEnabled: config.durationLimitEnabled ?? false,
      durationLimitSeconds: config.durationLimitSeconds ?? null,
      durationMode: config.durationMode ?? 'EXACT',
      maxOvershootSeconds: config.maxOvershootSeconds ?? null,
      expectedFinalDuration: plan.effectiveDurationSeconds,
      overshootSeconds: plan.overshootSeconds,
      configSnapshot: {
        ...config,
        outputFolder: outputDir,
        gpuMode: config.gpuMode ?? settings.gpuMode,
        encoder: config.encoder ?? settings.encoder,
        outputFilenameTemplate: config.outputFilenameTemplate || settings.outputFilenameTemplate,
      },
      renameSourceFiles: metadata?.renameSourceFiles ?? settings.renameSourceFiles,
      errorNamingMode: metadata?.errorNamingMode ?? settings.errorNamingMode,
      originalFilename: SourceFileStatusService.getOriginalFilename(config.inputPath),
      currentFilename: path.basename(config.inputPath),
      introEnd: config.introEndSeconds,
      status: 'WAITING',
      stage: 'IDLE',
      progress: 0,
      priority: 0,
      createdAt: new Date().toISOString(),
      sourceType: metadata?.sourceType ?? 'MANUAL',
      watchFolderId: metadata?.sourceType === 'WATCH_FOLDER' ? metadata.watchFolderId : undefined,
      watchFolderName: metadata?.sourceType === 'WATCH_FOLDER' ? metadata.watchFolderName : undefined,
      autoDailyOutputFolder: metadata?.autoDailyOutputFolder ?? false,
      baseOutputDirectory: metadata?.baseOutputDirectory ?? outputDir,
    };

    this.jobsRepo.createJob(jobRecord);
    this.emitQueueUpdated();

    if (settings.autoStartQueue && !this.isPaused) {
      this.processNextInQueue();
    }

    return jobRecord;
  }

  /** Apply an explicit rule edit to its pending jobs and any enqueue still probing. */
  public updateWatchFolderJobs(rule: WatchFolderConfig, previousRule: WatchFolderConfig): void {
    this.latestWatchFolderConfigs.set(rule.id, { ...rule });
    const settings = this.settingsRepo.getSettings();
    const outputChanged = path.resolve(rule.outputFolder).toLowerCase() !== path.resolve(previousRule.outputFolder).toLowerCase()
      || rule.autoDailyOutputFolder !== previousRule.autoDailyOutputFolder
      || rule.dailyFolderFormat !== previousRule.dailyFolderFormat;
    let changed = false;
    for (const job of this.jobsRepo.getAllJobs()) {
      if (job.sourceType !== 'WATCH_FOLDER' || job.watchFolderId !== rule.id
        || !['WAITING', 'READY'].includes(job.status)) continue;
      const config = this.watchJobConfig(rule, job.configSnapshot ?? {
        inputPath: job.inputPath, outputFolder: rule.outputFolder,
        outputFilenameTemplate: '{original_name}_{repeat_count}x', repeatCount: rule.repeatCount,
        audioFadeInEnabled: job.audioFadeInEnabled, audioFadeInDurationSeconds: job.audioFadeInDurationSeconds,
        durationLimitEnabled: job.durationLimitEnabled, durationLimitSeconds: job.durationLimitSeconds,
        gpuMode: settings.gpuMode, encoder: settings.encoder,
      });
      const plan = job.sourceDurationSeconds !== undefined
        ? calculateRepeatPlan(job.sourceDurationSeconds, config.repeatCount, config.durationLimitEnabled,
          config.durationLimitSeconds, config.durationMode, config.maxOvershootSeconds) : undefined;
      const resolvedOutputDirectory = outputChanged ? undefined : job.resolvedOutputDirectory;
      changed = this.jobsRepo.updatePendingWatchFolderJob({
        ...job,
        watchFolderName: this.watchRuleName(rule),
        configSnapshot: config,
        outputPath: path.join(resolvedOutputDirectory || rule.outputFolder, path.basename(job.outputPath)),
        baseOutputDirectory: rule.outputFolder,
        autoDailyOutputFolder: rule.autoDailyOutputFolder,
        resolvedOutputDirectory,
        manualRepeatCount: config.repeatCount,
        repeatCount: plan?.effectiveRepeatCount ?? (config.durationLimitEnabled ? job.repeatCount : config.repeatCount),
        effectiveRepeatCount: plan?.effectiveRepeatCount ?? (config.durationLimitEnabled ? job.effectiveRepeatCount : config.repeatCount),
        audioFadeInEnabled: config.audioFadeInEnabled,
        audioFadeInDurationSeconds: config.audioFadeInDurationSeconds,
        durationLimitEnabled: config.durationLimitEnabled,
        durationLimitSeconds: config.durationLimitSeconds,
        durationMode: config.durationMode,
        maxOvershootSeconds: config.maxOvershootSeconds,
        expectedFinalDuration: plan?.effectiveDurationSeconds,
        overshootSeconds: plan?.overshootSeconds,
        // The source may already have been marked _PROCESSING before enqueue.
        // Keep that source's lifecycle policy so a rule edit cannot abandon it.
        renameSourceFiles: job.renameSourceFiles,
        errorNamingMode: rule.errorNamingMode ?? settings.errorNamingMode,
      }) || changed;
    }
    if (changed) this.emitQueueUpdated();
  }

  private watchRuleName(rule: WatchFolderConfig): string {
    return rule.name?.trim() || path.basename(rule.folderPath) || rule.id;
  }

  private watchJobConfig(rule: WatchFolderConfig, config: RepeatJobConfig): RepeatJobConfig {
    return {
      ...config,
      outputFolder: rule.outputFolder,
      repeatCount: rule.repeatCount,
      audioFadeInEnabled: rule.audioFadeInEnabled ?? true,
      audioFadeInDurationSeconds: rule.audioFadeInDurationSeconds ?? 5,
      durationLimitEnabled: rule.durationLimitEnabled ?? false,
      durationLimitSeconds: rule.durationLimitSeconds ?? null,
      durationMode: rule.durationMode ?? 'EXACT',
      maxOvershootSeconds: rule.maxOvershootSeconds ?? null,
      gpuMode: rule.gpuMode ?? config.gpuMode ?? 'AUTO',
      encoder: rule.encoder ?? config.encoder,
    };
  }

  private watchJobMetadata(rule: WatchFolderConfig, metadata: JobMetadata): JobMetadata {
    const settings = this.settingsRepo.getSettings();
    return { ...metadata, watchFolderId: rule.id, watchFolderName: this.watchRuleName(rule),
      baseOutputDirectory: rule.outputFolder, autoDailyOutputFolder: rule.autoDailyOutputFolder,
      // Detection already applied this policy before ffprobe started. Later
      // rule edits govern future detections, while this source keeps its policy.
      dailyFolderFormat: rule.dailyFolderFormat, renameSourceFiles: metadata.renameSourceFiles,
      errorNamingMode: rule.errorNamingMode ?? settings.errorNamingMode };
  }

  public removeJob(jobId: string): boolean {
    if (this.activeJobId === jobId) {
      this.cancelJob(jobId);
    }
    this.jobsRepo.deleteJob(jobId);
    this.emitQueueUpdated();
    return true;
  }

  public cancelActiveJob(): void {
    if (this.activeJobId) {
      this.cancelJob(this.activeJobId);
    }
  }

  public async cancelActiveJobAndWait(): Promise<void> {
    this.isPaused = true;
    if (!this.isProcessingQueue) return;
    const idle = new Promise<void>((resolve) => this.once('idle', resolve));
    this.cancelActiveJob();
    await idle;
  }

  public cancelJob(jobId: string): boolean {
    const job = this.jobsRepo.getJobById(jobId);
    if (!job || ['COMPLETED', 'FAILED', 'CANCELLED'].includes(job.status)) return false;
    if (this.activeJobId === jobId) {
      this.cancelledJobs.add(jobId);
      this.videoEngine.cancelProcess(jobId);
    } else {
      this.jobsRepo.updateJobStatus(jobId, 'CANCELLED', 'IDLE', job.progress);
      this.emitQueueUpdated();
    }
    return true;
  }

  public pauseQueue(): boolean {
    this.isPaused = true;
    return true;
  }

  public resumeQueue(): boolean {
    this.isPaused = false;
    this.processNextInQueue();
    return true;
  }

  public async retryJob(jobId: string): Promise<boolean> {
    const job = this.jobsRepo.getJobById(jobId);
    if (!job) return false;
    if (this.activeJobId === jobId || job.status === 'PROCESSING') return false;

    // Reset all progress fields for a fresh attempt
    this.jobsRepo.updateJobStatus(jobId, 'WAITING', 'IDLE', 0, undefined);
    this.emitQueueUpdated();

    // Emit a reset progress event so Renderer clears stale live data
    const retryResetEvent: ProcessingProgress = {
      jobId,
      stage: 'ANALYZING',
      stageProgress: 0,
      overallProgress: 0,
      processedSeconds: 0,
      expectedOutputDurationSeconds: 0,
      frame: null,
      fps: null,
      speed: null,
      elapsedSeconds: 0,
      estimatedRemainingSeconds: null,
      updatedAt: Date.now(),
    };
    this.emit('progress', retryResetEvent);

    if (!this.isPaused) {
      this.processNextInQueue();
    }
    return true;
  }

  public clearCompleted(): boolean {
    const jobs = this.jobsRepo.getAllJobs();
    for (const job of jobs) {
      if (job.status === 'COMPLETED' || job.status === 'CANCELLED') {
        this.jobsRepo.deleteJob(job.id);
      }
    }
    this.emitQueueUpdated();
    return true;
  }

  private async processNextInQueue(): Promise<void> {
    if (this.isProcessingQueue || this.isPaused) return;

    const queue = this.jobsRepo.getAllJobs();
    const nextJob = queue.find((j) => j.status === 'WAITING' || j.status === 'READY');

    if (!nextJob) return;

    this.isProcessingQueue = true;
    this.activeJobId = nextJob.id;

    const startTime = Date.now();

    // Immediately persist PROCESSING status + emit
    this.jobsRepo.updateJobStatus(nextJob.id, 'PROCESSING', 'ANALYZING', 0);
    this.emitQueueUpdated();

    // Throttle state for this job
    let lastDbWrite = 0;
    let lastIpcEmit = 0;
    let lastProgress: ProcessingProgress | null = null;

    try {
      const mediaInfo = await this.ffprobeService.probeMedia(nextJob.inputPath);
      if (this.cancelledJobs.has(nextJob.id)) throw new AppError('PROCESS_CANCELLED', 'Đã hủy tác vụ.');
      const settings = this.settingsRepo.getSettings();

      const refreshedPlan = calculateRepeatPlan(mediaInfo.duration, nextJob.manualRepeatCount ?? nextJob.repeatCount,
        nextJob.durationLimitEnabled, nextJob.durationLimitSeconds, nextJob.durationMode, nextJob.maxOvershootSeconds);
      this.jobsRepo.updateJobPlan(nextJob.id, {
        sourceDurationSeconds: mediaInfo.duration, repeatCount: refreshedPlan.effectiveRepeatCount,
        effectiveRepeatCount: refreshedPlan.effectiveRepeatCount,
        expectedFinalDuration: refreshedPlan.effectiveDurationSeconds, overshootSeconds: refreshedPlan.overshootSeconds,
      });
      this.emitQueueUpdated();

      // Resolve output directory at job processing start time
      // Retried jobs keep their previously locked resolvedOutputDirectory
      const baseOutDir = nextJob.baseOutputDirectory || path.dirname(nextJob.outputPath);
      const resolution = resolveOutputDirectory({
        baseOutputDirectory: baseOutDir,
        autoDailyFolder: nextJob.autoDailyOutputFolder ?? false,
        jobStartedAt: new Date(startTime),
      });

      const effectiveOutputDir = nextJob.resolvedOutputDirectory || resolution.resolvedOutputDirectory;
      ensureDirectoryExists(effectiveOutputDir);
      this.jobsRepo.updateJobPaths(nextJob.id, { resolvedOutputDirectory: effectiveOutputDir });

      const config: RepeatJobConfig = {
        ...nextJob.configSnapshot,
        inputPath: nextJob.inputPath,
        outputFolder: effectiveOutputDir,
        outputFilenameTemplate: nextJob.configSnapshot?.outputFilenameTemplate || settings.outputFilenameTemplate,
        repeatCount: nextJob.manualRepeatCount ?? nextJob.repeatCount,
        audioFadeInEnabled: nextJob.audioFadeInEnabled,
        audioFadeInDurationSeconds: nextJob.audioFadeInDurationSeconds,
        durationLimitEnabled: nextJob.durationLimitEnabled,
        durationLimitSeconds: nextJob.durationLimitSeconds,
        durationMode: nextJob.durationMode ?? 'EXACT',
        maxOvershootSeconds: nextJob.maxOvershootSeconds ?? null,
        gpuMode: nextJob.configSnapshot?.gpuMode ?? settings.gpuMode,
        encoder: nextJob.configSnapshot?.encoder ?? settings.encoder,
      };

      const finalOutputPath = await this.videoEngine.processVideo(
        nextJob.id,
        config,
        (progressData: ProcessingProgress) => {
          const now = Date.now();
          const prevStage = lastProgress?.stage;
          lastProgress = progressData;

          const isImmediate =
            progressData.stage !== prevStage ||     // stage change
            progressData.overallProgress === 0 ||   // job start
            progressData.overallProgress >= 99;     // near completion

          // ── IPC emit (throttled at 500ms, immediate on key events) ──
          if (isImmediate || now - lastIpcEmit >= IPC_EMIT_INTERVAL_MS) {
            lastIpcEmit = now;
            this.emit('progress', progressData);
          }

          // ── SQLite persist (throttled at 1500ms, immediate on key events) ──
          if (isImmediate || now - lastDbWrite >= DB_PERSIST_INTERVAL_MS) {
            lastDbWrite = now;
            this.jobsRepo.updateJobStatus(
              nextJob.id,
              'PROCESSING',
              progressData.stage,
              progressData.overallProgress
            );
          }
        }
      );
      if (this.cancelledJobs.has(nextJob.id)) throw new AppError('PROCESS_CANCELLED', 'Đã hủy tác vụ.');

      const processingTimeMs = Date.now() - startTime;
      const outputSizeBytes = fs.existsSync(finalOutputPath) ? fs.statSync(finalOutputPath).size : 0;
      const originalDuration = mediaInfo.duration;

      // Use centralized RepeatPlan calculation for accurate history fields
      const plan = calculateRepeatPlan(
        originalDuration,
        nextJob.manualRepeatCount ?? nextJob.repeatCount,
        nextJob.durationLimitEnabled,
        nextJob.durationLimitSeconds,
        nextJob.durationMode ?? 'EXACT',
        nextJob.maxOvershootSeconds ?? null
      );

      this.jobsRepo.updateJobStatus(nextJob.id, 'COMPLETED', 'COMPLETED', 100);

      let finalInputPath = nextJob.inputPath;
      let originalFilename = nextJob.originalFilename || SourceFileStatusService.getOriginalFilename(nextJob.inputPath);
      let currentFilename = path.basename(nextJob.inputPath);

      // Requirement 6 & 21: Rename Watch Folder source file to _DONE on successful completion
      if (
        nextJob.sourceType === 'WATCH_FOLDER' &&
        (nextJob.renameSourceFiles ?? settings.renameSourceFiles) &&
        this.sourceStatusService
      ) {
        const renameRes = this.sourceStatusService.renameSourceFile(nextJob.inputPath, 'COMPLETED');
        if (renameRes.success) {
          finalInputPath = renameRes.newPath;
          currentFilename = renameRes.currentFilename;
          originalFilename = renameRes.originalFilename;
        }
      }
      this.jobsRepo.updateJobPaths(nextJob.id, {
        inputPath: finalInputPath, outputPath: finalOutputPath, originalFilename, currentFilename,
      });

      // Emit final 100% progress event
      this.emit('progress', {
        jobId: nextJob.id,
        stage: 'COMPLETED',
        stageProgress: 100,
        overallProgress: 100,
        processedSeconds: plan.effectiveDurationSeconds,
        expectedOutputDurationSeconds: plan.effectiveDurationSeconds,
        frame: null,
        fps: null,
        speed: null,
        elapsedSeconds: processingTimeMs / 1000,
        estimatedRemainingSeconds: 0,
        updatedAt: Date.now(),
      } satisfies ProcessingProgress);

      // Save History with source provenance, originalFilename, and resolved output directory
      this.historyRepo.addHistory({
        id: `hist_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        jobId: nextJob.id,
        inputFile: finalInputPath,
        originalFilename,
        currentFilename,
        outputFile: finalOutputPath,
        createdTime: nextJob.createdAt,
        startedTime: new Date(startTime).toISOString(),
        completedTime: new Date().toISOString(),
        originalDuration,
        repeatCount: plan.effectiveRepeatCount,
        effectiveRepeatCount: plan.effectiveRepeatCount,
        manualRepeatCount: nextJob.manualRepeatCount ?? plan.requestedRepeatCount,
        audioFadeInEnabled: nextJob.audioFadeInEnabled,
        audioFadeInDurationSeconds: nextJob.audioFadeInDurationSeconds,
        naturalDuration: plan.naturalDurationSeconds,
        durationLimitEnabled: nextJob.durationLimitEnabled,
        requestedDurationLimit: nextJob.durationLimitSeconds,
        durationMode: plan.durationMode,
        maxOvershootSeconds: nextJob.maxOvershootSeconds ?? null,
        actualOutputDuration: plan.effectiveDurationSeconds,
        overshootSeconds: plan.overshootSeconds,
        partialFinalCopy: plan.hasPartialFinalCopy,
        finalDuration: plan.effectiveDurationSeconds,
        fullCopyCount: plan.fullCopyCount,
        partialCopyDurationSeconds: plan.partialCopyDurationSeconds,
        encoder: config.encoder ?? settings.encoder,
        gpu: config.gpuMode,
        status: 'COMPLETED',
        processingTimeMs,
        outputSizeBytes,
        jobSourceType: nextJob.sourceType ?? 'MANUAL',
        autoDailyOutputFolder: nextJob.autoDailyOutputFolder ?? false,
        dailyFolderName: nextJob.autoDailyOutputFolder ? path.basename(effectiveOutputDir) : undefined,
        resolvedOutputDirectory: effectiveOutputDir,
      });

      // Desktop Notification on Completion
      this.sendDesktopNotification(
        'Video Repeat Studio',
        `Đã xử lý xong: ${path.basename(finalInputPath)}`
      );

    } catch (err: any) {
      const errorMsg = err.message || 'Unknown processing error';
      const wasCancelled = this.cancelledJobs.has(nextJob.id) || err?.code === 'PROCESS_CANCELLED';

      // Retain last known progress on failure — do not reset to 0
      const snap = lastProgress as ProcessingProgress | null;
      const failedProgress = snap ? snap.overallProgress : 0;
      const settings = this.settingsRepo.getSettings();

      let finalInputPath = nextJob.inputPath;
      let originalFilename = nextJob.originalFilename || SourceFileStatusService.getOriginalFilename(nextJob.inputPath);
      let currentFilename = path.basename(nextJob.inputPath);

      // Requirement 7 & 8: Rename source file to _ERROR on failure and record error
      let errorCategory = 'GENERAL';
      if (errorMsg.includes('NVENC') || errorMsg.includes('encoder') || errorMsg.includes('FFmpeg')) {
        errorCategory = 'FFMPEG';
      } else if (errorMsg.includes('audio') || errorMsg.includes('sound') || errorMsg.includes('fade')) {
        errorCategory = 'AUDIO';
      } else if (errorMsg.includes('codec') || errorMsg.includes('stream')) {
        errorCategory = 'CODEC';
      } else if (errorMsg.includes('luồng video') || errorMsg.includes('input')) {
        errorCategory = 'INPUT';
      }

      if (
        nextJob.sourceType === 'WATCH_FOLDER' &&
        (nextJob.renameSourceFiles ?? settings.renameSourceFiles) &&
        this.sourceStatusService
      ) {
        const renameRes = this.sourceStatusService.renameSourceFile(
          nextJob.inputPath,
          wasCancelled ? 'SKIPPED' : 'FAILED',
          { errorCategory, mode: nextJob.errorNamingMode ?? settings.errorNamingMode }
        );
        if (renameRes.success) {
          finalInputPath = renameRes.newPath;
          currentFilename = renameRes.currentFilename;
          originalFilename = renameRes.originalFilename;
        }

        if (!wasCancelled) this.sourceStatusService.recordSourceError({
          jobId: nextJob.id,
          sourcePath: finalInputPath,
          originalFilename,
          currentFilename,
          errorStatus: 'FAILED',
          errorMessage: errorMsg,
          failedStage: snap ? snap.stage : 'UNKNOWN',
        });
      }
      this.jobsRepo.updateJobPaths(nextJob.id, { inputPath: finalInputPath, originalFilename, currentFilename });

      this.jobsRepo.updateJobStatus(nextJob.id, wasCancelled ? 'CANCELLED' : 'FAILED', 'IDLE', failedProgress, wasCancelled ? '' : errorMsg);

      if (!wasCancelled) this.emit('job-error', { jobId: nextJob.id, error: errorMsg });

      // Emit failure progress event with retained percentage
      const failureEvent: ProcessingProgress = {
        jobId: nextJob.id,
        stage: 'FINALIZING',
        stageProgress: failedProgress,
        overallProgress: failedProgress,
        processedSeconds: snap ? snap.processedSeconds : 0,
        expectedOutputDurationSeconds: snap ? snap.expectedOutputDurationSeconds : 0,
        frame: null,
        fps: null,
        speed: null,
        elapsedSeconds: (Date.now() - startTime) / 1000,
        estimatedRemainingSeconds: null,
        updatedAt: Date.now(),
      };
      this.emit('progress', failureEvent);

      // Desktop Notification on Error
      if (!wasCancelled) this.sendDesktopNotification(
        'Lỗi xử lý video',
        `Gặp lỗi khi xử lý ${path.basename(finalInputPath)}: ${errorMsg}`
      );

    } finally {
      this.cancelledJobs.delete(nextJob.id);
      this.activeJobId = null;
      this.isProcessingQueue = false;
      this.emit('idle');
      this.emitQueueUpdated();

      // Check if user requested "Quit after current job"
      if (this.quitAfterCurrentJob) {
        logger.info('QUEUE', 'Quit after current job requested. Triggering application quit...');
        this.emit('quit-after-job-ready');
        return;
      }

      // Trigger next iteration
      setImmediate(() => this.processNextInQueue());
    }
  }

  private quitAfterCurrentJob: boolean = false;

  public setQuitAfterCurrentJob(value: boolean): void {
    this.quitAfterCurrentJob = value;
  }

  public isQuittingAfterCurrentJob(): boolean {
    return this.quitAfterCurrentJob;
  }

  public getQueueSummary(): {
    activeJobName: string | null;
    activeProgress: number;
    processingCount: number;
    pendingCount: number;
    totalCount: number;
  } {
    const queue = this.getQueue();
    const active = queue.find((j) => j.status === 'PROCESSING');
    const pending = queue.filter((j) => j.status === 'WAITING' || j.status === 'READY');

    return {
      activeJobName: active ? path.basename(active.inputPath) : null,
      activeProgress: active ? active.progress : 0,
      processingCount: active ? 1 : 0,
      pendingCount: pending.length,
      totalCount: queue.length,
    };
  }

  private sendDesktopNotification(title: string, body: string): void {
    try {
      const settings = this.settingsRepo.getSettings();
      if (!settings.backgroundCompletionNotifications) return;

      const { Notification } = require('electron');
      if (Notification && Notification.isSupported()) {
        new Notification({
          title,
          body,
        }).show();
      }
    } catch (err) {
      // Safe fallback if notifications fail or running in pure test environment
    }
  }

  private checkFreeDiskSpace(targetPath: string, requiredBytes: number): void {
    try {
      const stats = fs.statfsSync(targetPath);
      if (stats.bavail * stats.bsize < requiredBytes) {
        throw new AppError('DISK_FULL', `Không đủ dung lượng trống trong thư mục: ${targetPath}`);
      }
      const testFile = path.join(targetPath, `.write_test_${Date.now()}`);
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError('PERMISSION_DENIED', `Cannot write to target output folder: ${targetPath}`);
    }
  }

  private emitQueueUpdated(): void {
    this.emit('queue-updated', this.getQueue());
  }
}

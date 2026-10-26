import chokidar, { FSWatcher } from 'chokidar';
import path from 'path';
import fs from 'fs';
import { WatchFolderRepository } from '../repositories/WatchFolderRepository';
import { SettingsRepository } from '../repositories/SettingsRepository';
import { QueueService } from './QueueService';
import { SourceFileStatusService } from './SourceFileStatusService';
import { WatchFolderConfig } from '@shared/types';
import { AppError } from '@shared/errors';
import { logger } from './Logger';

export interface WatchFolderStatusSummary {
  total: number;
  active: number;
  isPaused: boolean;
  hasError: boolean;
}

export class WatchFolderService {
  private watchers: Map<string, FSWatcher> = new Map();
  private pendingFiles: Map<string, { timer: NodeJS.Timeout; ruleId: string }> = new Map();
  private inFlightFiles = new Set<string>();
  private recoveredOnStartup = false;
  private isPaused: boolean = false;
  private erroredRules: Set<string> = new Set();

  constructor(
    private watchRepo: WatchFolderRepository,
    private queueService: QueueService,
    private sourceStatusService?: SourceFileStatusService,
    private settingsRepo?: SettingsRepository
  ) {}

  public initWatchers(): void {
    if (this.isPaused) return;

    const configs = this.watchRepo.getAllWatchFolders();
    const folderPaths = configs.map((c) => c.folderPath);

    // Startup crash recovery for lingering _PROCESSING files
    if (this.sourceStatusService && !this.recoveredOnStartup) {
      const settings = this.settingsRepo ? this.settingsRepo.getSettings() : null;
      const recoveryAction = settings?.crashRecoveryAction ?? 'RESET_TO_WAITING';
      const trackedPaths = new Set(this.queueService.getQueue()
        .filter((job) => !['COMPLETED', 'FAILED', 'CANCELLED'].includes(job.status))
        .map((job) => path.resolve(job.inputPath).toLowerCase()));
      this.sourceStatusService.recoverProcessingFiles(folderPaths, recoveryAction, trackedPaths);
      this.recoveredOnStartup = true;
    }

    logger.info('WATCH_FOLDER', `Initializing ${configs.length} Watch Folder rules...`);
    for (const config of configs) {
      if (config.enabled) {
        this.startWatcher(config);
      }
    }
  }

  public startWatcher(config: WatchFolderConfig): void {
    if (this.isPaused || !config.enabled) return;
    // ── Safe Duplicate Watcher Protection ──
    if (this.watchers.has(config.id)) {
      this.stopWatcher(config.id);
    }

    if (!fs.existsSync(config.folderPath)) {
      logger.warn('WATCH_FOLDER', `Input directory does not exist for rule "${config.folderPath}"`);
      this.erroredRules.add(config.id);
      return;
    }

    this.erroredRules.delete(config.id);

    try {
      const watcher = chokidar.watch(config.folderPath, {
        ignored: /(^|[\/\\])\../, // ignore dotfiles
        persistent: true,
        depth: 0,
        awaitWriteFinish: {
          stabilityThreshold: config.stabilityThresholdMs ?? 3000,
          pollInterval: 500,
        },
      });

      watcher.on('add', (filePath) => {
        if (this.isPaused) return;
        this.handleNewFile(config, filePath);
      });

      watcher.on('error', (err) => {
        logger.error('WATCH_FOLDER', `Watcher error on ${config.folderPath}`, err);
        this.erroredRules.add(config.id);
      });

      this.watchers.set(config.id, watcher);
      logger.info('WATCH_FOLDER', `Watcher started for: ${config.folderPath}`);
    } catch (err) {
      logger.error('WATCH_FOLDER', `Failed to start watcher for ${config.folderPath}`, err);
      this.erroredRules.add(config.id);
    }
  }

  public stopWatcher(id: string): void {
    for (const [key, pending] of this.pendingFiles) {
      if (pending.ruleId === id) {
        clearTimeout(pending.timer);
        this.pendingFiles.delete(key);
      }
    }
    this.erroredRules.delete(id);
    const watcher = this.watchers.get(id);
    if (watcher) {
      watcher.close();
      this.watchers.delete(id);
      logger.info('WATCH_FOLDER', `Watcher stopped for rule ID: ${id}`);
    }
  }

  public pauseAll(): void {
    this.isPaused = true;
    for (const pending of this.pendingFiles.values()) clearTimeout(pending.timer);
    this.pendingFiles.clear();
    for (const [id, watcher] of this.watchers.entries()) {
      watcher.close();
    }
    this.watchers.clear();
    logger.info('WATCH_FOLDER', 'Watch Folder service PAUSED from Tray/System.');
  }

  public resumeAll(): void {
    this.isPaused = false;
    this.initWatchers();
    this.rescanFolderFiles();
    logger.info('WATCH_FOLDER', 'Watch Folder service RESUMED from Tray/System.');
  }

  public isPausedState(): boolean {
    return this.isPaused;
  }

  public getStatus(): WatchFolderStatusSummary {
    const configs = this.watchRepo.getAllWatchFolders();
    const enabledConfigs = configs.filter((c) => c.enabled);

    return {
      total: enabledConfigs.length,
      active: this.isPaused ? 0 : this.watchers.size,
      isPaused: this.isPaused,
      hasError: this.erroredRules.size > 0,
    };
  }

  public updateWatchFolderConfiguration(id: string, updates: Partial<WatchFolderConfig>): WatchFolderConfig {
    const oldConfig = this.watchRepo.getWatchFolderById(id);
    if (!oldConfig) {
      throw new AppError('INVALID_INPUT', `Không tìm thấy cấu hình Thư mục theo dõi với ID: ${id}`);
    }

    // Duplicate folder path check
    if (updates.folderPath && updates.folderPath !== oldConfig.folderPath) {
      const allConfigs = this.watchRepo.getAllWatchFolders();
      const duplicate = allConfigs.find(
        (c) => c.id !== id && path.normalize(c.folderPath) === path.normalize(updates.folderPath!)
      );
      if (duplicate) {
        logger.warn(
          'WATCH_FOLDER',
          `Duplicate watch folder path warning: "${updates.folderPath}" is already monitored by rule "${duplicate.name || duplicate.id}"`
        );
      }
    }

    const updated = this.watchRepo.updateWatchFolder(id, updates);
    this.queueService.updateWatchFolderJobs(updated, oldConfig);

    // If folderPath or enabled state changed, restart watcher for this rule
    const pathChanged = updates.folderPath && updates.folderPath !== oldConfig.folderPath;
    const enabledToggled = updates.enabled !== undefined && updates.enabled !== oldConfig.enabled;

    const stabilityChanged = updates.stabilityThresholdMs !== undefined && updates.stabilityThresholdMs !== oldConfig.stabilityThresholdMs;
    if (pathChanged || enabledToggled || stabilityChanged) {
      this.stopWatcher(id);
      if (updated.enabled && !this.isPaused) {
        this.startWatcher(updated);
      }
    }

    logger.info('WATCH_FOLDER', `Watch Folder configuration updated for ID: ${id} ("${updated.folderPath}")`);
    return updated;
  }

  public getWatchFolderStats(id: string): { lastProcessedFile: string | null; countToday: number } {
    const last = this.watchRepo.getLastProcessedFile(id);
    const countToday = this.watchRepo.getProcessedCountToday(id);
    return {
      lastProcessedFile: last ? path.basename(last.filePath) : null,
      countToday,
    };
  }

  public shutdown(): void {
    this.isPaused = true;
    for (const timer of this.pendingFiles.values()) {
      clearTimeout(timer.timer);
    }
    this.pendingFiles.clear();

    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
    logger.info('WATCH_FOLDER', 'Watch Folder service shut down cleanly.');
  }

  /**
   * Rescan input directories upon resume to process any new video files
   * that arrived while the service was paused.
   */
  private rescanFolderFiles(): void {
    const configs = this.watchRepo.getAllWatchFolders();
    for (const config of configs) {
      if (!config.enabled || !fs.existsSync(config.folderPath)) continue;

      try {
        const files = fs.readdirSync(config.folderPath);
        for (const fileName of files) {
          const fullPath = path.join(config.folderPath, fileName);
          const stat = fs.statSync(fullPath);
          if (stat.isFile()) {
            this.handleNewFile(config, fullPath);
          }
        }
      } catch (err) {
        logger.error('WATCH_FOLDER', `Error rescanning folder ${config.folderPath}`, err);
      }
    }
  }

  private handleNewFile(config: WatchFolderConfig, filePath: string): void {
    if (this.isPaused) return;
    const fileKey = `${config.id}:${path.resolve(filePath).toLowerCase()}`;
    if (this.inFlightFiles.has(fileKey)) return;
    const ext = path.extname(filePath).toLowerCase();
    const validExts = ['.mp4', '.mov', '.mkv', '.avi', '.m4v', '.wmv'];
    if (!validExts.includes(ext)) return;

    const fileName = path.basename(filePath);

    // Requirement 13 & 17: Ignore files that already contain status suffixes (_PROCESSING, _DONE, _ERROR, _SKIPPED)
    if (SourceFileStatusService.hasStatusSuffix(fileName)) {
      return;
    }

    // Deduplication check
    if (this.watchRepo.isFileProcessed(config.id, filePath)) {
      return;
    }

    // Debounce stability check
    if (this.pendingFiles.has(fileKey)) {
      clearTimeout(this.pendingFiles.get(fileKey)!.timer);
    }

    const timer = setTimeout(async () => {
      this.pendingFiles.delete(fileKey);
      const latestConfig = this.watchRepo.getWatchFolderById(config.id);
      if (this.isPaused || !latestConfig?.enabled || latestConfig.folderPath !== config.folderPath || !fs.existsSync(filePath)) return;
      config = latestConfig;
      this.inFlightFiles.add(fileKey);
      let actualInputPath = filePath;
      let renamed = false;
      let enqueued = false;
      try {
        const settings = this.settingsRepo ? this.settingsRepo.getSettings() : null;
        const isRenameEnabled = config.renameSourceFiles ?? (settings?.renameSourceFiles ?? true);

        // Rename rain.mp4 -> rain_PROCESSING.mp4 before queueing
        if (isRenameEnabled && this.sourceStatusService) {
          const renameRes = this.sourceStatusService.renameSourceFile(filePath, 'PROCESSING');
          if (renameRes.success) {
            actualInputPath = renameRes.newPath;
            renamed = actualInputPath !== filePath;
          } else {
            throw new AppError('WATCH_FOLDER_ERROR', `Không thể đổi tên tệp nguồn: ${filePath}`);
          }
        }

        logger.info('WATCH_FOLDER', `New file detected: ${filePath} (renamed to: ${actualInputPath}) -> enqueuing job`);

        await this.queueService.addJob(
          {
            inputPath: actualInputPath,
            outputFolder: config.outputFolder,
            outputFilenameTemplate: '{original_name}_{repeat_count}x',
            repeatCount: config.repeatCount,
            audioFadeInEnabled: config.audioFadeInEnabled ?? true,
            audioFadeInDurationSeconds: config.audioFadeInDurationSeconds ?? 5.0,
            durationLimitEnabled: config.durationLimitEnabled ?? false,
            durationLimitSeconds: config.durationLimitSeconds ?? null,
            durationMode: config.durationMode ?? 'EXACT',
            maxOvershootSeconds: config.maxOvershootSeconds ?? null,
            gpuMode: config.gpuMode ?? 'AUTO',
            encoder: config.encoder,
          },
          {
            sourceType: 'WATCH_FOLDER',
            watchFolderId: config.id,
            watchFolderName: config.name?.trim() || path.basename(config.folderPath) || config.id,
            autoDailyOutputFolder: config.autoDailyOutputFolder ?? false,
            baseOutputDirectory: config.outputFolder,
            dailyFolderFormat: config.dailyFolderFormat ?? 'DAY_MONTH',
            renameSourceFiles: isRenameEnabled,
            errorNamingMode: config.errorNamingMode ?? settings?.errorNamingMode ?? 'SIMPLE',
          }
        );

        enqueued = true;

        this.watchRepo.recordProcessedFile(
          `pf_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          config.id,
          actualInputPath
        );
      } catch (err) {
        if (!enqueued && renamed && this.sourceStatusService) {
          const failed = this.sourceStatusService.renameSourceFile(actualInputPath, 'FAILED', {
            mode: config.errorNamingMode ?? 'SIMPLE', errorCategory: 'INPUT',
          });
          this.sourceStatusService.recordSourceError({
            sourcePath: failed.newPath, originalFilename: failed.originalFilename,
            currentFilename: failed.currentFilename, errorStatus: 'FAILED',
            errorMessage: err instanceof Error ? err.message : String(err), failedStage: 'ENQUEUE',
          });
        }
        logger.error('WATCH_FOLDER', `Failed to enqueue detected file: ${filePath}`, err);
      } finally {
        this.inFlightFiles.delete(fileKey);
      }
    }, 2000);

    this.pendingFiles.set(fileKey, { timer, ruleId: config.id });
  }
}


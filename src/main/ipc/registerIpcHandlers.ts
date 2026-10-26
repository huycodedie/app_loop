import { app, ipcMain, dialog, BrowserWindow, shell } from 'electron';
import { IPC_CHANNELS } from '@shared/constants';
import { SettingsRepository } from '../repositories/SettingsRepository';
import { JobsRepository } from '../repositories/JobsRepository';
import { HistoryRepository } from '../repositories/HistoryRepository';
import { WatchFolderRepository } from '../repositories/WatchFolderRepository';
import { ProfilesRepository } from '../repositories/ProfilesRepository';
import { SchedulesRepository } from '../repositories/SchedulesRepository';
import { FFmpegManager } from '../ffmpeg/FFmpegManager';
import { FFprobeService } from '../ffmpeg/FFprobeService';
import { GpuManager } from '../gpu/GpuManager';
import { VideoEngine } from '../ffmpeg/VideoEngine';
import { QueueService } from '../services/QueueService';
import { WatchFolderService } from '../services/WatchFolderService';
import { PerformanceMonitor } from '../services/PerformanceMonitor';
import { SourceFileStatusService } from '../services/SourceFileStatusService';
import { AppSettings, RepeatJobConfig, WatchFolderConfig } from '@shared/types';
import { AppError } from '@shared/errors';
import fs from 'fs';

export function registerIpcHandlers(
  mainWindow: BrowserWindow,
  settingsRepo: SettingsRepository,
  jobsRepo: JobsRepository,
  historyRepo: HistoryRepository,
  watchRepo: WatchFolderRepository,
  profilesRepo: ProfilesRepository,
  schedulesRepo: SchedulesRepository,
  ffmpegManager: FFmpegManager,
  ffprobeService: FFprobeService,
  gpuManager: GpuManager,
  videoEngine: VideoEngine,
  queueService: QueueService,
  watchFolderService: WatchFolderService,
  performanceMonitor: PerformanceMonitor,
  sourceStatusService?: SourceFileStatusService
): void {
  // Source File Errors Handler
  ipcMain.handle(IPC_CHANNELS.SOURCE_ERRORS_LIST, async () => {
    return sourceStatusService ? sourceStatusService.getSourceErrors() : [];
  });
  // Video Handlers
  ipcMain.handle(IPC_CHANNELS.VIDEO_SELECT, async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Chọn video nguồn',
      filters: [
        { name: 'Tệp Video', extensions: ['mp4', 'mov', 'mkv', 'avi', 'm4v', 'wmv'] },
        { name: 'Tất cả tệp', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle(IPC_CHANNELS.VIDEO_PROBE, async (_, filePath: string) => {
    if (!filePath || typeof filePath !== 'string') {
      throw new AppError('INVALID_INPUT', 'Đường dẫn tệp không hợp lệ.');
    }
    return ffprobeService.probeMedia(filePath);
  });

  ipcMain.handle(IPC_CHANNELS.VIDEO_PROCESS, async (_, config: RepeatJobConfig) => {
    const job = await queueService.addJob(config);
    return { jobId: job.id };
  });

  ipcMain.handle(IPC_CHANNELS.VIDEO_CANCEL, async (_, jobId: string) => {
    return queueService.cancelJob(jobId);
  });

  // Shell File / Folder Handlers
  ipcMain.handle('shell:open-file', async (_, filePath: string) => {
    if (filePath && fs.existsSync(filePath)) {
      await shell.openPath(filePath);
      return true;
    }
    return false;
  });

  ipcMain.handle('shell:open-folder', async (_, folderPath: string) => {
    if (folderPath && fs.existsSync(folderPath)) {
      shell.showItemInFolder(folderPath);
      return true;
    }
    return false;
  });

  // Queue Handlers
  ipcMain.handle(IPC_CHANNELS.QUEUE_LIST, () => queueService.getQueue());
  ipcMain.handle(IPC_CHANNELS.QUEUE_ADD, (_, config: RepeatJobConfig) => queueService.addJob(config));
  ipcMain.handle(IPC_CHANNELS.QUEUE_REMOVE, (_, jobId: string) => queueService.removeJob(jobId));
  ipcMain.handle(IPC_CHANNELS.QUEUE_PAUSE, () => queueService.pauseQueue());
  ipcMain.handle(IPC_CHANNELS.QUEUE_RESUME, () => queueService.resumeQueue());
  ipcMain.handle(IPC_CHANNELS.QUEUE_RETRY, (_, jobId: string) => queueService.retryJob(jobId));
  ipcMain.handle(IPC_CHANNELS.QUEUE_CLEAR, () => queueService.clearCompleted());

  // Settings Handlers
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, () => settingsRepo.getSettings());
  ipcMain.handle(IPC_CHANNELS.SETTINGS_UPDATE, (_, partial: Partial<AppSettings>) => {
    const updated = { ...settingsRepo.getSettings(), ...partial };
    if (typeof partial.launchAtStartup === 'boolean' || typeof partial.startMinimized === 'boolean') {
      app.setLoginItemSettings({
        openAtLogin: updated.launchAtStartup,
        args: updated.launchAtStartup && updated.startMinimized ? ['--minimized'] : [],
      });
    }
    return settingsRepo.updateSettings(partial);
  });
  ipcMain.handle('dialog:select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // History Handlers
  ipcMain.handle(IPC_CHANNELS.HISTORY_LIST, () => historyRepo.getAllHistory());
  ipcMain.handle(IPC_CHANNELS.HISTORY_DELETE, (_, id: string) => {
    historyRepo.deleteHistory(id);
    return true;
  });

  ipcMain.handle(IPC_CHANNELS.HISTORY_EXPORT, async (_, format: 'csv' | 'json') => {
    const history = historyRepo.getAllHistory();
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Xuất lịch sử',
      defaultPath: `video_repeat_history.${format}`,
      filters: [{ name: format.toUpperCase(), extensions: [format] }],
    });

    if (result.canceled || !result.filePath) return null;

    if (format === 'json') {
      fs.writeFileSync(result.filePath, JSON.stringify(history, null, 2), 'utf8');
    } else {
      let csv = 'ID,Input File,Output File,Created,Duration,Intro,Repeat,Count,Final Duration,Status\n';
      for (const h of history) {
        csv += `"${h.id}","${h.inputFile}","${h.outputFile}","${h.createdTime}",${h.originalDuration},${h.introDuration},${h.repeatDuration},${h.repeatCount},${h.finalDuration},"${h.status}"\n`;
      }
      fs.writeFileSync(result.filePath, csv, 'utf8');
    }
    return result.filePath;
  });

  // FFmpeg & GPU
  ipcMain.handle(IPC_CHANNELS.FFMPEG_STATUS, () => ffmpegManager.getStatus());
  ipcMain.handle(IPC_CHANNELS.FFMPEG_CHECK, async () => {
    const status = await ffmpegManager.getStatus();
    return status.installed;
  });
  ipcMain.handle(IPC_CHANNELS.FFMPEG_SET_FOLDER, async (_, folderPath: string) => {
    return ffmpegManager.setCustomFolder(folderPath);
  });
  ipcMain.handle(IPC_CHANNELS.GPU_DETECT, () => gpuManager.detectCapabilities());

  // Watch Folders
  ipcMain.handle(IPC_CHANNELS.WATCH_FOLDER_LIST, () => watchRepo.getAllWatchFolders());
  ipcMain.handle(IPC_CHANNELS.WATCH_FOLDER_ADD, (_, config) => {
    const newConfig = watchRepo.addWatchFolder({
      ...config,
      id: `wf_${Date.now()}`,
      createdAt: new Date().toISOString(),
    });
    watchFolderService.startWatcher(newConfig);
    return newConfig;
  });
  ipcMain.handle(IPC_CHANNELS.WATCH_FOLDER_UPDATE, (_, id: string, updates: Partial<WatchFolderConfig>) => {
    return watchFolderService.updateWatchFolderConfiguration(id, updates);
  });
  ipcMain.handle(IPC_CHANNELS.WATCH_FOLDER_REMOVE, (_, id: string) => {
    watchFolderService.stopWatcher(id);
    watchRepo.removeWatchFolder(id);
    return true;
  });
  ipcMain.handle(IPC_CHANNELS.WATCH_FOLDER_TOGGLE, (_, id: string, enabled: boolean) => {
    return watchFolderService.updateWatchFolderConfiguration(id, { enabled });
  });
  ipcMain.handle(IPC_CHANNELS.WATCH_FOLDER_GET_STATS, (_, id: string) => {
    return watchFolderService.getWatchFolderStats(id);
  });

  // Scheduler
  ipcMain.handle(IPC_CHANNELS.SCHEDULER_LIST, () => schedulesRepo.getAllSchedules());
  ipcMain.handle(IPC_CHANNELS.SCHEDULER_CREATE, (_, schedule) => {
    return schedulesRepo.createSchedule({
      ...schedule,
      id: `sched_${Date.now()}`,
      createdAt: new Date().toISOString(),
    });
  });
  ipcMain.handle(IPC_CHANNELS.SCHEDULER_DELETE, (_, id: string) => {
    schedulesRepo.deleteSchedule(id);
    return true;
  });

  // Watch Folder Pause/Resume All
  ipcMain.handle(IPC_CHANNELS.WATCH_FOLDER_PAUSE_ALL, () => {
    watchFolderService.pauseAll();
    return true;
  });
  ipcMain.handle(IPC_CHANNELS.WATCH_FOLDER_RESUME_ALL, () => {
    watchFolderService.resumeAll();
    return true;
  });

  // Events forwarding with window guards
  queueService.on('queue-updated', (queue) => {
    if (!mainWindow.isDestroyed() && mainWindow.webContents) {
      mainWindow.webContents.send(IPC_CHANNELS.EVENT_QUEUE_UPDATED, queue);
    }
  });

  queueService.on('progress', (data) => {
    // Forward full ProcessingProgress payload to renderer
    if (!mainWindow.isDestroyed() && mainWindow.webContents) {
      mainWindow.webContents.send(IPC_CHANNELS.EVENT_PROGRESS, data);
    }

    // Update Windows taskbar progress indicator
    // overallProgress is 0–100; setProgressBar expects 0.0–1.0 (-1 = clear)
    if (!mainWindow.isDestroyed()) {
      const pct = typeof data.overallProgress === 'number' ? data.overallProgress : 0;
      if (pct >= 100) {
        mainWindow.setProgressBar(-1); // clear on completion
      } else if (pct > 0) {
        mainWindow.setProgressBar(pct / 100);
      }
    }
  });

  queueService.on('job-error', (data) => {
    if (!mainWindow.isDestroyed() && mainWindow.webContents) {
      mainWindow.webContents.send(IPC_CHANNELS.EVENT_ERROR, data);
    }
    // Clear taskbar progress on error
    if (!mainWindow.isDestroyed()) {
      mainWindow.setProgressBar(-1);
    }
  });

  performanceMonitor.on('metrics', (metrics: any) => {
    if (!mainWindow.isDestroyed() && mainWindow.webContents) {
      mainWindow.webContents.send(IPC_CHANNELS.EVENT_PERFORMANCE, metrics);
    }
  });
}

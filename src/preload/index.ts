import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '@shared/constants';
import { RepeatJobConfig, AppSettings, WatchFolderConfig } from '@shared/types';
import { IElectronAPI } from './types';

const api: IElectronAPI = {
  // Video & Shell
  selectVideoFile: () => ipcRenderer.invoke(IPC_CHANNELS.VIDEO_SELECT),
  probeVideo: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.VIDEO_PROBE, filePath),
  processVideo: (config: RepeatJobConfig) => ipcRenderer.invoke(IPC_CHANNELS.VIDEO_PROCESS, config),
  cancelVideoProcess: (jobId: string) => ipcRenderer.invoke(IPC_CHANNELS.VIDEO_CANCEL, jobId),
  getPreviewUrl: (filePath: string) => `video-media://${encodeURIComponent(filePath)}`,
  openFile: (filePath: string) => ipcRenderer.invoke('shell:open-file', filePath),
  openFolder: (folderPath: string) => ipcRenderer.invoke('shell:open-folder', folderPath),

  // Queue
  getQueue: () => ipcRenderer.invoke(IPC_CHANNELS.QUEUE_LIST),
  addJobToQueue: (config: RepeatJobConfig) => ipcRenderer.invoke(IPC_CHANNELS.QUEUE_ADD, config),
  removeJobFromQueue: (jobId: string) => ipcRenderer.invoke(IPC_CHANNELS.QUEUE_REMOVE, jobId),
  pauseQueue: () => ipcRenderer.invoke(IPC_CHANNELS.QUEUE_PAUSE),
  resumeQueue: () => ipcRenderer.invoke(IPC_CHANNELS.QUEUE_RESUME),
  retryJob: (jobId: string) => ipcRenderer.invoke(IPC_CHANNELS.QUEUE_RETRY, jobId),
  clearCompletedJobs: () => ipcRenderer.invoke(IPC_CHANNELS.QUEUE_CLEAR),

  // Settings
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
  updateSettings: (settings: Partial<AppSettings>) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_UPDATE, settings),
  selectFolder: () => ipcRenderer.invoke('dialog:select-folder'),

  // History
  getHistory: () => ipcRenderer.invoke(IPC_CHANNELS.HISTORY_LIST),
  deleteHistory: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.HISTORY_DELETE, id),
  exportHistory: (format: 'csv' | 'json') => ipcRenderer.invoke(IPC_CHANNELS.HISTORY_EXPORT, format),

  // FFmpeg & GPU
  getFFmpegStatus: () => ipcRenderer.invoke(IPC_CHANNELS.FFMPEG_STATUS),
  checkFFmpeg: () => ipcRenderer.invoke(IPC_CHANNELS.FFMPEG_CHECK),
  setFFmpegFolder: (folderPath: string) => ipcRenderer.invoke(IPC_CHANNELS.FFMPEG_SET_FOLDER, folderPath),
  detectGpuCapabilities: () => ipcRenderer.invoke(IPC_CHANNELS.GPU_DETECT),

  // Watch Folders
  getWatchFolders: () => ipcRenderer.invoke(IPC_CHANNELS.WATCH_FOLDER_LIST),
  addWatchFolder: (config) => ipcRenderer.invoke(IPC_CHANNELS.WATCH_FOLDER_ADD, config),
  updateWatchFolder: (id: string, config: Partial<WatchFolderConfig>) => ipcRenderer.invoke(IPC_CHANNELS.WATCH_FOLDER_UPDATE, id, config),
  removeWatchFolder: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.WATCH_FOLDER_REMOVE, id),
  toggleWatchFolder: (id: string, enabled: boolean) => ipcRenderer.invoke(IPC_CHANNELS.WATCH_FOLDER_TOGGLE, id, enabled),
  getWatchFolderStats: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.WATCH_FOLDER_GET_STATS, id),
  getSourceErrors: () => ipcRenderer.invoke(IPC_CHANNELS.SOURCE_ERRORS_LIST),

  // Scheduler
  getSchedules: () => ipcRenderer.invoke(IPC_CHANNELS.SCHEDULER_LIST),
  createSchedule: (schedule) => ipcRenderer.invoke(IPC_CHANNELS.SCHEDULER_CREATE, schedule),
  deleteSchedule: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.SCHEDULER_DELETE, id),

  // Subscriptions
  onProgress: (callback) => {
    const handler = (_: unknown, data: any) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.EVENT_PROGRESS, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.EVENT_PROGRESS, handler);
  },
  onStageChange: (callback) => {
    const handler = (_: unknown, data: any) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.EVENT_STAGE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.EVENT_STAGE, handler);
  },
  onError: (callback) => {
    const handler = (_: unknown, data: any) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.EVENT_ERROR, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.EVENT_ERROR, handler);
  },
  onQueueUpdated: (callback) => {
    const handler = (_: unknown, queue: any) => callback(queue);
    ipcRenderer.on(IPC_CHANNELS.EVENT_QUEUE_UPDATED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.EVENT_QUEUE_UPDATED, handler);
  },
  onPerformanceUpdated: (callback) => {
    const handler = (_: unknown, metrics: any) => callback(metrics);
    ipcRenderer.on(IPC_CHANNELS.EVENT_PERFORMANCE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.EVENT_PERFORMANCE, handler);
  },
};

contextBridge.exposeInMainWorld('api', api);

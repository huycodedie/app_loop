import {
  MediaInfo,
  RepeatJobConfig,
  JobRecord,
  HistoryRecord,
  AppSettings,
  GpuCapabilities,
  WatchFolderConfig,
  ScheduleConfig,
  PerformanceMetrics,
  JobStage,
  ExecutableResolution,
} from '@shared/types';
import { ProcessingProgress } from '@shared/types/progress';

export interface IElectronAPI {
  // Video & Shell
  selectVideoFile: () => Promise<string | null>;
  probeVideo: (filePath: string) => Promise<MediaInfo>;
  processVideo: (config: RepeatJobConfig) => Promise<{ jobId: string }>;
  cancelVideoProcess: (jobId: string) => Promise<boolean>;
  getPreviewUrl: (filePath: string) => string;
  openFile: (filePath: string) => Promise<boolean>;
  openFolder: (folderPath: string) => Promise<boolean>;

  // Queue
  getQueue: () => Promise<JobRecord[]>;
  addJobToQueue: (config: RepeatJobConfig) => Promise<JobRecord>;
  removeJobFromQueue: (jobId: string) => Promise<boolean>;
  pauseQueue: () => Promise<boolean>;
  resumeQueue: () => Promise<boolean>;
  retryJob: (jobId: string) => Promise<boolean>;
  clearCompletedJobs: () => Promise<boolean>;

  // Settings
  getSettings: () => Promise<AppSettings>;
  updateSettings: (settings: Partial<AppSettings>) => Promise<AppSettings>;
  selectFolder: () => Promise<string | null>;

  // History
  getHistory: () => Promise<HistoryRecord[]>;
  deleteHistory: (id: string) => Promise<boolean>;
  exportHistory: (format: 'csv' | 'json') => Promise<string | null>;

  // FFmpeg & GPU
  getFFmpegStatus: () => Promise<{
    installed: boolean;
    version: string;
    path: string;
    probePath: string;
    resolution: ExecutableResolution;
  }>;
  checkFFmpeg: () => Promise<boolean>;
  setFFmpegFolder: (folderPath: string) => Promise<ExecutableResolution>;
  detectGpuCapabilities: () => Promise<GpuCapabilities>;

  // Watch Folders
  getWatchFolders: () => Promise<WatchFolderConfig[]>;
  addWatchFolder: (config: Omit<WatchFolderConfig, 'id' | 'createdAt'>) => Promise<WatchFolderConfig>;
  updateWatchFolder: (id: string, config: Partial<WatchFolderConfig>) => Promise<WatchFolderConfig>;
  removeWatchFolder: (id: string) => Promise<boolean>;
  toggleWatchFolder: (id: string, enabled: boolean) => Promise<WatchFolderConfig>;
  getWatchFolderStats: (id: string) => Promise<{ lastProcessedFile: string | null; countToday: number }>;
  getSourceErrors: () => Promise<any[]>;

  // Scheduler
  getSchedules: () => Promise<ScheduleConfig[]>;
  createSchedule: (schedule: Omit<ScheduleConfig, 'id' | 'createdAt'>) => Promise<ScheduleConfig>;
  deleteSchedule: (id: string) => Promise<boolean>;

  // Event Subscriptions
  onProgress: (callback: (data: ProcessingProgress) => void) => () => void;
  onStageChange: (callback: (data: { jobId: string; stage: JobStage }) => void) => () => void;
  onError: (callback: (data: { jobId: string; error: string }) => void) => () => void;
  onQueueUpdated: (callback: (queue: JobRecord[]) => void) => () => void;
  onPerformanceUpdated: (callback: (metrics: PerformanceMetrics) => void) => () => void;
}

declare global {
  interface Window {
    api: IElectronAPI;
  }
}

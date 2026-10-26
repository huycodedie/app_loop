export const IPC_CHANNELS = {
  // Video operations
  VIDEO_SELECT: 'video:select',
  VIDEO_PROBE: 'video:probe',
  VIDEO_PROCESS: 'video:process',
  VIDEO_CANCEL: 'video:cancel',

  // Queue operations
  QUEUE_LIST: 'queue:list',
  QUEUE_ADD: 'queue:add',
  QUEUE_REMOVE: 'queue:remove',
  QUEUE_PAUSE: 'queue:pause',
  QUEUE_RESUME: 'queue:resume',
  QUEUE_RETRY: 'queue:retry',
  QUEUE_CLEAR: 'queue:clear',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',

  // History
  HISTORY_LIST: 'history:list',
  HISTORY_DELETE: 'history:delete',
  HISTORY_EXPORT: 'history:export',

  // FFmpeg & GPU
  FFMPEG_STATUS: 'ffmpeg:status',
  FFMPEG_CHECK: 'ffmpeg:check',
  FFMPEG_SET_FOLDER: 'ffmpeg:set-folder',
  GPU_DETECT: 'gpu:detect',

  // Watch Folders
  WATCH_FOLDER_LIST: 'watch-folder:list',
  WATCH_FOLDER_ADD: 'watch-folder:add',
  WATCH_FOLDER_UPDATE: 'watch-folder:update',
  WATCH_FOLDER_REMOVE: 'watch-folder:remove',
  WATCH_FOLDER_TOGGLE: 'watch-folder:toggle',
  WATCH_FOLDER_GET_STATS: 'watch-folder:get-stats',
  WATCH_FOLDER_PAUSE_ALL: 'watch-folder:pause-all',
  WATCH_FOLDER_RESUME_ALL: 'watch-folder:resume-all',

  // Scheduler
  SCHEDULER_LIST: 'scheduler:list',
  SCHEDULER_CREATE: 'scheduler:create',
  SCHEDULER_UPDATE: 'scheduler:update',
  SCHEDULER_DELETE: 'scheduler:delete',

  // System & Tray Operations
  SYSTEM_SHOW_MAIN_WINDOW: 'system:show-main-window',
  SYSTEM_QUIT_APP: 'system:quit-app',

  // Source File Status & Errors
  SOURCE_ERRORS_LIST: 'source-errors:list',

  // Events (Main -> Renderer)
  EVENT_PROGRESS: 'processing:progress',
  EVENT_STAGE: 'processing:stage',
  EVENT_ERROR: 'processing:error',
  EVENT_QUEUE_UPDATED: 'queue:updated',
  EVENT_PERFORMANCE: 'performance:updated',
  EVENT_WATCH_EVENT: 'watch-folder:event',
} as const;

export const DEFAULT_SETTINGS = {
  outputFolder: '',
  tempFolder: '',
  repeatCount: 3,
  audioFadeInEnabled: true,
  audioFadeInDurationSeconds: 5.0,
  durationLimitEnabled: false,
  durationLimitSeconds: 10800, // 3 hours
  gpuMode: 'AUTO' as const,
  encoder: 'libx264' as const,
  theme: 'dark' as const,
  language: 'vi',
  notifications: true,
  outputFilenameTemplate: '{original_name}_{repeat_count}x',
  ffmpegPath: '',
  ffprobePath: '',
  autoStartQueue: true,
  maxConcurrentJobs: 1,

  // Background & System Tray Defaults
  runInBackground: true,
  closeBehavior: 'TRAY' as const,
  launchAtStartup: false,
  startMinimized: false,
  showCloseToTrayNotification: true,
  backgroundCompletionNotifications: true,

  // Source File Status Management Defaults
  renameSourceFiles: true,
  errorNamingMode: 'SIMPLE' as const,
  crashRecoveryAction: 'RESET_TO_WAITING' as const,
};

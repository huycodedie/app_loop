export interface VideoStreamInfo {
  index: number;
  codecName: string;
  codecLongName: string;
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  duration: number;
  pixFmt: string;
  aspectRatio: string;
}

export interface AudioStreamInfo {
  index: number;
  codecName: string;
  codecLongName: string;
  channels: number;
  sampleRate: number;
  bitrate: number;
  duration: number;
}

export interface MediaInfo {
  filePath: string;
  fileName: string;
  fileSize: number;
  duration: number;
  formatName: string;
  bitrate: number;
  videoStreams: VideoStreamInfo[];
  audioStreams: AudioStreamInfo[];
  hasAudio: boolean;
}

export type JobStatus =
  | 'WAITING'
  | 'READY'
  | 'PROCESSING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'INTERRUPTED';

export type JobStage =
  | 'ANALYZING'
  | 'PREPARING'
  | 'CALCULATING_REPEAT_PLAN'
  | 'PREPARING_FULL_SOURCE'
  | 'BUILDING_REPEAT_SEQUENCE'
  | 'BUILDING_PARTIAL_END'
  | 'VERIFYING_REPEAT_SEQUENCE'
  | 'APPLYING_AUDIO_FADE'
  | 'ENCODING'
  | 'CONCATENATING'
  | 'VERIFYING'
  | 'VERIFYING_FINAL_OUTPUT'
  | 'FINALIZING'
  | 'CLEANING'
  | 'COMPLETED'
  | 'IDLE';

export type JobSourceType = 'MANUAL' | 'WATCH_FOLDER' | 'SCHEDULER';

export type GpuMode = 'AUTO' | 'NVIDIA' | 'AMD' | 'INTEL' | 'CPU';

export type EncoderType =
  | 'h264_nvenc'
  | 'hevc_nvenc'
  | 'h264_qsv'
  | 'hevc_qsv'
  | 'h264_amf'
  | 'hevc_amf'
  | 'libx264'
  | 'libx265'
  | 'copy';

export type DurationMode = 'EXACT' | 'MINIMUM';

export interface RepeatJobConfig {
  inputPath: string;
  outputFolder: string;
  outputFilenameTemplate: string;
  repeatCount: number;
  audioFadeInEnabled: boolean;
  audioFadeInDurationSeconds: number;
  /** When true, output is capped at durationLimitSeconds. */
  durationLimitEnabled: boolean;
  /** Maximum output duration in seconds. Null when limit is disabled. */
  durationLimitSeconds: number | null;
  /** Duration Mode: 'EXACT' (trim end) vs 'MINIMUM' (complete repeats) */
  durationMode?: DurationMode;
  /** Maximum extra overshoot allowed in seconds for MINIMUM mode */
  maxOvershootSeconds?: number | null;
  gpuMode: GpuMode;
  encoder?: EncoderType;
  preset?: string;
  crf?: number;
  /** @deprecated Legacy field — not used by current engine */
  introEndSeconds?: number;
}

export interface JobRecord {
  /** Settings captured when queued; pending watch jobs follow explicit edits to their rule. */
  configSnapshot?: RepeatJobConfig;
  /** Probed source duration, retained to recalculate a pending job after a rule edit. */
  sourceDurationSeconds?: number;
  renameSourceFiles?: boolean;
  errorNamingMode?: ErrorNamingMode;
  id: string;
  inputPath: string;
  outputPath: string;
  repeatCount: number;
  /** Calculated effective repeat count (equals repeatCount if duration limit is OFF) */
  effectiveRepeatCount?: number;
  /** Original manual repeat count */
  manualRepeatCount?: number;
  audioFadeInEnabled: boolean;
  audioFadeInDurationSeconds: number;
  durationLimitEnabled: boolean;
  durationLimitSeconds: number | null;
  /** Duration Mode: 'EXACT' vs 'MINIMUM' */
  durationMode?: DurationMode;
  /** Maximum extra overshoot allowed in seconds */
  maxOvershootSeconds?: number | null;
  /** Expected final output duration in seconds */
  expectedFinalDuration?: number;
  /** Overshoot extra duration in seconds */
  overshootSeconds?: number;
  /** @deprecated Legacy field */
  introEnd?: number;
  status: JobStatus;
  stage: JobStage;
  progress: number;
  priority: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  /** Source that created this job */
  sourceType?: JobSourceType;
  /** Stable rule identity and display name captured for Watch Folder jobs. */
  watchFolderId?: string;
  watchFolderName?: string;
  /** Fully resolved output directory (includes daily subfolder if applicable) */
  resolvedOutputDirectory?: string;
  /** Whether auto daily output folder was enabled for this job */
  autoDailyOutputFolder?: boolean;
  /** The base output directory before daily folder resolution */
  baseOutputDirectory?: string;
  /** Original filename before status renaming */
  originalFilename?: string;
  /** Current filename after status renaming */
  currentFilename?: string;
}

export interface HistoryRecord {
  id: string;
  jobId: string;
  inputFile: string;
  outputFile: string;
  createdTime: string;
  startedTime?: string;
  completedTime?: string;
  originalDuration: number;
  repeatCount: number;
  /** Effective repeat count used */
  effectiveRepeatCount?: number;
  /** User's original manual repeat count */
  manualRepeatCount?: number;
  audioFadeInEnabled: boolean;
  audioFadeInDurationSeconds: number;
  /** naturalDuration = sourceDuration × repeatCount (before limit) */
  naturalDuration: number;
  durationLimitEnabled: boolean;
  requestedDurationLimit: number | null;
  /** Duration Mode: 'EXACT' vs 'MINIMUM' */
  durationMode?: DurationMode;
  maxOvershootSeconds?: number | null;
  actualOutputDuration?: number;
  overshootSeconds?: number;
  partialFinalCopy?: boolean;
  /** Actual output file duration (may be shorter than naturalDuration) */
  finalDuration: number;
  /** Number of complete source copies included */
  fullCopyCount: number;
  /** Duration of the partial final copy in seconds (0 if none) */
  partialCopyDurationSeconds: number;
  encoder: string;
  gpu: string;
  status: JobStatus;
  processingTimeMs: number;
  outputSizeBytes: number;
  failureReason?: string;
  /** Source that created this job */
  jobSourceType?: JobSourceType;
  /** Whether auto daily output folder was enabled */
  autoDailyOutputFolder?: boolean;
  /** Daily subfolder name, e.g. '12_8' */
  dailyFolderName?: string;
  /** Fully resolved output directory */
  resolvedOutputDirectory?: string;
  /** Original source filename before renaming */
  originalFilename?: string;
  /** Current source filename after status renaming */
  currentFilename?: string;
  /** @deprecated */
  introDuration?: number;
  /** @deprecated */
  repeatDuration?: number;
}

export type CloseBehavior = 'TRAY' | 'QUIT';
export type ErrorNamingMode = 'SIMPLE' | 'ADVANCED';
export type CrashRecoveryAction = 'RESET_TO_WAITING' | 'MARK_ERROR';

export interface SourceFileErrorRecord {
  id: string;
  jobId?: string;
  sourcePath: string;
  originalFilename: string;
  currentFilename: string;
  errorStatus: string;
  errorMessage: string;
  failedStage?: string;
  failedAt: string;
}

export interface AppSettings {
  outputFolder: string;
  tempFolder: string;
  repeatCount: number;
  audioFadeInEnabled: boolean;
  audioFadeInDurationSeconds: number;
  durationLimitEnabled: boolean;
  durationLimitSeconds: number;
  gpuMode: GpuMode;
  encoder: EncoderType;
  theme: 'dark' | 'light';
  language: string;
  notifications: boolean;
  outputFilenameTemplate: string;
  ffmpegPath: string;
  ffprobePath: string;
  autoStartQueue: boolean;
  maxConcurrentJobs: number;

  // Background & System Tray Settings
  runInBackground: boolean;
  closeBehavior: CloseBehavior;
  launchAtStartup: boolean;
  startMinimized: boolean;
  showCloseToTrayNotification: boolean;
  backgroundCompletionNotifications: boolean;

  // Source File Status Management Settings
  renameSourceFiles: boolean;
  errorNamingMode: ErrorNamingMode;
  crashRecoveryAction: CrashRecoveryAction;
}

export type ExecutableSource =
  | 'USER_CONFIGURED'
  | 'BUNDLED'
  | 'DEVELOPMENT_RESOURCES'
  | 'SYSTEM_PATH'
  | 'NOT_FOUND';

export interface ExecutableResolution {
  ffmpegPath: string | null;
  ffprobePath: string | null;
  source: ExecutableSource;
  ffmpegAvailable: boolean;
  ffprobeAvailable: boolean;
  ffmpegVersion?: string;
  ffprobeVersion?: string;
  resolvedFolder?: string | null;
}

export interface GpuEncoderCapability {
  encoder: EncoderType;
  name: string;
  vendor: 'NVIDIA' | 'AMD' | 'INTEL' | 'CPU';
  isAvailable: boolean;
}

export interface GpuCapabilities {
  gpuName: string;
  gpuVendor: string;
  availableEncoders: GpuEncoderCapability[];
  selectedEncoder: EncoderType;
}

export interface WatchFolderConfig {
  id: string;
  name?: string;
  folderPath: string;
  outputFolder: string;
  repeatCount: number;
  audioFadeInEnabled: boolean;
  audioFadeInDurationSeconds: number;
  durationLimitEnabled: boolean;
  durationLimitSeconds: number | null;
  durationMode?: DurationMode;
  maxOvershootSeconds?: number | null;
  /** Enable automatic date-based output subfolders */
  autoDailyOutputFolder: boolean;
  /** Daily folder naming format. Default: 'DAY_MONTH' */
  dailyFolderFormat?: string;
  /** Enable automatic source file status renaming (_PROCESSING, _DONE, _ERROR) */
  renameSourceFiles?: boolean;
  /** Error naming style ('SIMPLE' | 'ADVANCED') */
  errorNamingMode?: ErrorNamingMode;
  gpuMode?: GpuMode;
  encoder?: EncoderType;
  stabilityThresholdMs?: number;
  enabled: boolean;
  createdAt: string;
  updatedAt?: string;
  /** @deprecated */
  introEnd?: number;
}

export interface ScheduleConfig {
  id: string;
  name: string;
  jobConfigJson: string;
  cronExpression: string;
  durationMode?: DurationMode;
  maxOvershootSeconds?: number | null;
  nextRun?: string;
  lastRun?: string;
  enabled: boolean;
  createdAt: string;
}

export interface ProfileConfig {
  id: string;
  name: string;
  description?: string;
  encoder: EncoderType;
  gpuMode: GpuMode;
  preset: string;
  crf: number;
  outputFolder: string;
  container: string;
  audioBitrate: string;
  filenameTemplate: string;
  defaultRepeatCount: number;
  audioFadeInEnabled: boolean;
  defaultAudioFadeInDuration: number;
  durationLimitEnabled: boolean;
  defaultDurationLimitSeconds: number;
  durationMode?: DurationMode;
  maxOvershootSeconds?: number | null;
  isDefault?: boolean;
  createdAt: string;
}

export interface PerformanceMetrics {
  fps: number;
  speed: number;
  elapsedTimeMs: number;
  etaSeconds: number;
  currentFrame: number;
  cpuUsage: number;
  ramUsageMb: number;
  gpuUsage: number;
  gpuMemoryMb: number;
  diskFreeGb: number;
  stage: JobStage;
}

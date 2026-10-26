export type ErrorCode =
  | 'INVALID_INPUT'
  | 'UNSUPPORTED_MEDIA'
  | 'FFMPEG_MISSING'
  | 'FFPROBE_MISSING'
  | 'FFPROBE_FAILED'
  | 'ENCODER_UNAVAILABLE'
  | 'GPU_FAILED'
  | 'DISK_FULL'
  | 'PERMISSION_DENIED'
  | 'OUTPUT_EXISTS'
  | 'OUTPUT_INVALID'
  | 'DATABASE_ERROR'
  | 'WATCH_FOLDER_ERROR'
  | 'PROCESS_CANCELLED'
  | 'PROCESS_INTERRUPTED'
  | 'IPC_ERROR'
  | 'UNKNOWN';

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

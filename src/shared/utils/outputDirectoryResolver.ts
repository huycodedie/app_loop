/**
 * Output Directory Resolver
 *
 * Centralized utility for resolving output directories, including
 * automatic date-based subfolder creation for Watch Folder jobs.
 *
 * RULES:
 *   - Uses LOCAL date (not UTC) for folder naming.
 *   - Daily folder format default: DAY_MONTH  e.g. "12_8" for August 12.
 *   - Folder is locked at job processing start time — never changes mid-job.
 *   - Works in both Main (Node.js) and Renderer environments cleanly.
 */

export type DailyFolderFormat = 'DAY_MONTH';

export interface OutputDirectoryResolution {
  /** The root/base output directory configured by the user. */
  baseOutputDirectory: string;
  /** The daily subfolder name, e.g. "12_8". Null when auto-daily is off. */
  dailyFolderName: string | null;
  /** The fully resolved output path including daily subfolder if applicable. */
  resolvedOutputDirectory: string;
}

export interface ResolveOutputDirectoryOptions {
  /** Root output folder configured on the Watch Folder / job. */
  baseOutputDirectory: string;
  /** Whether automatic date-based subfolders are enabled. */
  autoDailyFolder: boolean;
  /** The datetime used to derive the daily folder. Should be job processing start time. */
  jobStartedAt: Date;
  /** Folder naming format. Default: 'DAY_MONTH'. */
  dailyFolderFormat?: DailyFolderFormat;
}

/**
 * Compute the daily subfolder name from a local Date.
 *
 * Default format 'DAY_MONTH':
 *   August 1   → "1_8"
 *   August 11  → "11_8"
 *   December 31 → "31_12"
 *   January 1   → "1_1"
 *
 * Uses LOCAL date components (getDate / getMonth), not UTC.
 */
export function getDailyFolderName(
  date: Date,
  format: DailyFolderFormat = 'DAY_MONTH'
): string {
  const day = date.getDate();       // 1–31, local
  const month = date.getMonth() + 1; // 1–12, local

  switch (format) {
    case 'DAY_MONTH':
    default:
      return `${day}_${month}`;
  }
}

/**
 * Resolve the final output directory for a job.
 *
 * When autoDailyFolder is ON:
 *   baseOutputDirectory + dailyFolderName → resolvedOutputDirectory
 *   e.g. "D:\Repeat_Output" + "12_8" → "D:\Repeat_Output\12_8"
 *
 * When autoDailyFolder is OFF:
 *   resolvedOutputDirectory = baseOutputDirectory
 */
export function resolveOutputDirectory(
  opts: ResolveOutputDirectoryOptions
): OutputDirectoryResolution {
  const { baseOutputDirectory, autoDailyFolder, jobStartedAt, dailyFolderFormat } = opts;

  if (!autoDailyFolder) {
    return {
      baseOutputDirectory,
      dailyFolderName: null,
      resolvedOutputDirectory: baseOutputDirectory,
    };
  }

  const dailyFolderName = getDailyFolderName(jobStartedAt, dailyFolderFormat || 'DAY_MONTH');
  const sep = baseOutputDirectory.includes('/') ? '/' : '\\';
  const cleanBase = baseOutputDirectory.replace(/[/\\]+$/, '');
  const resolvedOutputDirectory = `${cleanBase}${sep}${dailyFolderName}`;

  return {
    baseOutputDirectory,
    dailyFolderName,
    resolvedOutputDirectory,
  };
}

/**
 * Ensure a directory exists, creating it recursively if necessary.
 * Safe to call when directory already exists.
 */
export function ensureDirectoryExists(dirPath: string): void {
  try {
    const fs = require('fs');
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  } catch {
    // Environment without Node fs or directory already exists
  }
}

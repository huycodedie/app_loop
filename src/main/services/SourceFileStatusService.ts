import fs from 'fs';
import path from 'path';
import { getDatabase } from '../database/db';
import { logger } from './Logger';

export type SourceFileStatus = 'WAITING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
export type ErrorNamingMode = 'SIMPLE' | 'ADVANCED';

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

export interface RenameResult {
  success: boolean;
  newPath: string;
  originalFilename: string;
  currentFilename: string;
}

export class SourceFileStatusService {
  private static readonly STATUS_SUFFIX = /(?:_RECOVERY_ERROR|_PROCESSING|_DONE|_ERROR(?:_[A-Z0-9]+)?|_SKIPPED)(?:_\d{3,})?$/i;

  /**
   * Check if a filename contains any status suffix (_PROCESSING, _DONE, _ERROR, _SKIPPED).
   */
  public static hasStatusSuffix(filename: string): boolean {
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    return SourceFileStatusService.STATUS_SUFFIX.test(base);
  }

  /**
   * Extract the clean original filename by removing status suffixes and collision counters.
   * e.g., "rain_PROCESSING.mp4" -> "rain.mp4"
   *       "rain_DONE_001.mp4" -> "rain.mp4"
   *       "mưa_nặng_ERROR_FFMPEG.mp4" -> "mưa_nặng.mp4"
   */
  public static getOriginalFilename(filename: string): string {
    const ext = path.extname(filename);
    let base = path.basename(filename, ext);

    // Counters only belong to a status suffix; preserve ordinary names such as clip_001.
    base = base.replace(SourceFileStatusService.STATUS_SUFFIX, '');

    return `${base}${ext}`;
  }

  /**
   * Generate target filename based on status and naming options.
   */
  public static generateTargetFilename(
    originalFilename: string,
    targetStatus: SourceFileStatus,
    options?: { errorCategory?: string; mode?: ErrorNamingMode }
  ): string {
    const ext = path.extname(originalFilename);
    const cleanOriginalBase = path.basename(
      SourceFileStatusService.getOriginalFilename(originalFilename),
      ext
    );

    let suffix = '';
    switch (targetStatus) {
      case 'PROCESSING':
        suffix = '_PROCESSING';
        break;
      case 'COMPLETED':
        suffix = '_DONE';
        break;
      case 'FAILED':
        if (options?.mode === 'ADVANCED' && options?.errorCategory) {
          const category = options.errorCategory.toUpperCase().replace(/[^A-Z0-9]/g, '');
          suffix = `_ERROR_${category}`;
        } else {
          suffix = '_ERROR';
        }
        break;
      case 'SKIPPED':
        suffix = '_SKIPPED';
        break;
      case 'WAITING':
      default:
        suffix = '';
        break;
    }

    return `${cleanOriginalBase}${suffix}${ext}`;
  }

  /**
   * Safe unique path resolver for collision avoidance.
   * e.g., if "rain_DONE.mp4" exists, returns "rain_DONE_001.mp4".
   */
  public static generateUniquePath(dir: string, targetFilename: string): string {
    const fullPath = path.join(dir, targetFilename);
    if (!fs.existsSync(fullPath)) {
      return fullPath;
    }

    const ext = path.extname(targetFilename);
    const base = path.basename(targetFilename, ext);

    let counter = 1;
    let newPath = fullPath;
    while (fs.existsSync(newPath)) {
      const counterStr = String(counter).padStart(3, '0');
      newPath = path.join(dir, `${base}_${counterStr}${ext}`);
      counter++;
    }

    return newPath;
  }

  /**
   * Safely rename a source file on disk.
   */
  public renameSourceFile(
    currentPath: string,
    targetStatus: SourceFileStatus,
    options?: { errorCategory?: string; mode?: ErrorNamingMode }
  ): RenameResult {
    const originalFilename = SourceFileStatusService.getOriginalFilename(currentPath);

    if (!fs.existsSync(currentPath)) {
      logger.warn('WATCH_FOLDER', `Source file rename target does not exist: ${currentPath}`);
      return {
        success: false,
        newPath: currentPath,
        originalFilename,
        currentFilename: path.basename(currentPath),
      };
    }

    const dir = path.dirname(currentPath);
    const targetFilename = SourceFileStatusService.generateTargetFilename(
      originalFilename,
      targetStatus,
      options
    );

    // If file already has the exact target filename, return success directly
    if (path.basename(currentPath) === targetFilename) {
      return {
        success: true,
        newPath: currentPath,
        originalFilename,
        currentFilename: targetFilename,
      };
    }

    const targetPath = SourceFileStatusService.generateUniquePath(dir, targetFilename);

    try {
      fs.renameSync(currentPath, targetPath);
      logger.info('WATCH_FOLDER', `Source file renamed: "${path.basename(currentPath)}" -> "${path.basename(targetPath)}"`);
      return {
        success: true,
        newPath: targetPath,
        originalFilename,
        currentFilename: path.basename(targetPath),
      };
    } catch (err: any) {
      logger.warn('WATCH_FOLDER', `Failed to rename source file "${currentPath}" -> "${targetPath}": ${err.message}`);
      return {
        success: false,
        newPath: currentPath,
        originalFilename,
        currentFilename: path.basename(currentPath),
      };
    }
  }

  /**
   * Record detailed error information in SQLite table `source_file_errors`.
   */
  public recordSourceError(
    record: Omit<SourceFileErrorRecord, 'id' | 'failedAt'>
  ): SourceFileErrorRecord {
    const db = getDatabase();
    const id = `sfe_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const failedAt = new Date().toISOString();

    try {
      db.prepare(
        `INSERT INTO source_file_errors (
          id, job_id, source_path, original_filename, current_filename, error_status, error_message, failed_stage, failed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        record.jobId || null,
        record.sourcePath,
        record.originalFilename,
        record.currentFilename,
        record.errorStatus,
        record.errorMessage,
        record.failedStage || null,
        failedAt
      );

      logger.info('DATABASE', `Recorded source error for ${record.originalFilename} in database.`);
    } catch (err) {
      logger.error('DATABASE', 'Failed to insert source file error record', err);
    }

    return {
      id,
      ...record,
      failedAt,
    };
  }

  /**
   * Query source error history from database.
   */
  public getSourceErrors(): SourceFileErrorRecord[] {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM source_file_errors ORDER BY failed_at DESC').all() as any[];

    return rows.map((r) => ({
      id: r.id,
      jobId: r.job_id,
      sourcePath: r.source_path,
      originalFilename: r.original_filename,
      currentFilename: r.current_filename,
      errorStatus: r.error_status,
      errorMessage: r.error_message,
      failedStage: r.failed_stage,
      failedAt: r.failed_at,
    }));
  }

  /**
   * Startup crash recovery:
   * Scans Watch Folder input directories for `*_PROCESSING.mp4` files left behind by an ungraceful shutdown.
   * Returns them to WAITING state (`rain.mp4`) so they can be processed cleanly.
   */
  public recoverProcessingFiles(folderPaths: string[], action: 'RESET_TO_WAITING' | 'MARK_ERROR' = 'RESET_TO_WAITING', excludedPaths: Set<string> = new Set()): { recoveredCount: number; errorsCount: number } {
    let recoveredCount = 0;
    let errorsCount = 0;

    for (const folderPath of folderPaths) {
      if (!fs.existsSync(folderPath)) continue;

      try {
        const files = fs.readdirSync(folderPath);
        for (const fileName of files) {
          if (/_PROCESSING(?:_\d{3,})?\.[^.]+$/i.test(fileName)) {
            const currentPath = path.join(folderPath, fileName);
            if (excludedPaths.has(path.resolve(currentPath).toLowerCase()) || !fs.statSync(currentPath).isFile()) continue;
            const targetStatus: SourceFileStatus = action === 'MARK_ERROR' ? 'FAILED' : 'WAITING';
            const res = this.renameSourceFile(currentPath, targetStatus, { errorCategory: 'RECOVERY' });

            if (res.success) {
              recoveredCount++;
              logger.info('WATCH_FOLDER', `Startup recovery: Renamed lingering processing file "${fileName}" -> "${path.basename(res.newPath)}"`);
            } else {
              errorsCount++;
            }
          }
        }
      } catch (err) {
        logger.error('WATCH_FOLDER', `Error scanning folder for crash recovery: ${folderPath}`, err);
      }
    }

    return { recoveredCount, errorsCount };
  }
}

import fs from 'fs';
import path from 'path';
import { app, dialog } from 'electron';
import { FFmpegManager } from '../ffmpeg/FFmpegManager';
import { GpuManager } from '../gpu/GpuManager';
import { getDatabase } from '../database/db';
import { logger } from './Logger';

export interface ValidationReport {
  success: boolean;
  ffmpegOk: boolean;
  ffprobeOk: boolean;
  dbOk: boolean;
  writePermissionsOk: boolean;
  gpuOk: boolean;
  ffmpegVersion?: string;
  ffprobeVersion?: string;
  resolvedFolder?: string;
  errors: string[];
  warnings: string[];
}

export class RuntimeValidator {
  constructor(
    private ffmpegManager: FFmpegManager,
    private gpuManager: GpuManager
  ) {}

  public async validateOnStartup(): Promise<ValidationReport> {
    logger.info('STARTUP', 'Beginning startup runtime validation checks...');

    const report: ValidationReport = {
      success: true,
      ffmpegOk: false,
      ffprobeOk: false,
      dbOk: false,
      writePermissionsOk: false,
      gpuOk: false,
      errors: [],
      warnings: [],
    };

    // 1. FFmpeg & FFprobe verification
    try {
      const resolution = await this.ffmpegManager.resolve(true);
      report.ffmpegOk = resolution.ffmpegAvailable;
      report.ffprobeOk = resolution.ffprobeAvailable;
      report.ffmpegVersion = resolution.ffmpegVersion;
      report.ffprobeVersion = resolution.ffprobeVersion;
      report.resolvedFolder = resolution.resolvedFolder || undefined;

      if (!resolution.ffmpegAvailable) {
        report.errors.push('Không tìm thấy executable ffmpeg.exe hợp lệ.');
      }
      if (!resolution.ffprobeAvailable) {
        report.errors.push('Không tìm thấy executable ffprobe.exe hợp lệ.');
      }
      if (resolution.ffmpegAvailable && resolution.ffprobeAvailable) {
        logger.info(
          'FFMPEG',
          `FFmpeg & FFprobe verified (${resolution.source}) at ${resolution.resolvedFolder} | Version: ${resolution.ffmpegVersion}`
        );
      } else {
        logger.error('FFMPEG', `FFmpeg verification failed. Source: ${resolution.source}`);
      }
    } catch (err: any) {
      report.ffmpegOk = false;
      report.ffprobeOk = false;
      report.errors.push(`Lỗi kiểm tra FFmpeg: ${err.message}`);
      logger.error('FFMPEG', 'Exception during FFmpeg verification', err);
    }

    // 2. Database verification & auto-creation
    try {
      const db = getDatabase();
      const testRow = db.prepare('SELECT count(*) as cnt FROM sqlite_master').get();
      if (testRow) {
        report.dbOk = true;
        logger.info('DATABASE', 'SQLite database verified successfully.');
      } else {
        report.dbOk = false;
        report.errors.push('Tệp cơ sở dữ liệu SQLite không phản hồi truy vấn.');
        logger.error('DATABASE', 'SQLite query test returned empty result.');
      }
    } catch (err: any) {
      report.dbOk = false;
      report.errors.push(`Lỗi kết nối hoặc khởi tạo SQLite database: ${err.message}`);
      logger.error('DATABASE', 'Exception during SQLite verification', err);
    }

    // 3. Directory write permissions verification
    try {
      const userDataDir = app ? app.getPath('userData') : path.join(process.cwd(), '.data');
      const tempDir = path.join(userDataDir, 'temp');

      [userDataDir, tempDir].forEach((dir) => {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        const testFile = path.join(dir, `.write_test_${Date.now()}`);
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
      });

      report.writePermissionsOk = true;
      logger.info('STARTUP', `Directory write permissions verified for: ${userDataDir}`);
    } catch (err: any) {
      report.writePermissionsOk = false;
      report.errors.push(`Không có quyền ghi tệp vào thư mục ứng dụng (%APPDATA%): ${err.message}`);
      logger.error('STARTUP', 'Exception during write permissions check', err);
    }

    // 4. GPU Detection
    try {
      const gpuCaps = await this.gpuManager.detectCapabilities();
      report.gpuOk = true;
      logger.info(
        'STARTUP',
        `GPU detected: ${gpuCaps.gpuName} (${gpuCaps.gpuVendor}) | Selected encoder: ${gpuCaps.selectedEncoder}`
      );
    } catch (err: any) {
      report.gpuOk = false;
      report.warnings.push(`Cảnh báo phát hiện GPU: ${err.message}. Ứng dụng sẽ dùng bộ mã hóa CPU fallback.`);
      logger.warn('STARTUP', 'GPU detection returned warning/error (CPU fallback ready)', err);
    }

    // Overall status
    report.success = report.ffmpegOk && report.ffprobeOk && report.dbOk && report.writePermissionsOk;

    if (!report.success) {
      logger.error('STARTUP', 'Runtime validation FAILED', report);
      this.showValidationDialog(report);
    } else {
      logger.info('STARTUP', 'All runtime validation checks PASSED successfully.');
    }

    return report;
  }

  private showValidationDialog(report: ValidationReport): void {
    const errorDetails = report.errors.join('\n• ');
    dialog.showErrorBox(
      'Khởi tạo ứng dụng thất bại - Video Repeat Studio',
      `Ứng dụng phát hiện lỗi cấu hình khi khởi động:\n\n• ${errorDetails}\n\nHãy kiểm tra lại quyền ghi tệp hoặc tải lại bản cài đặt đầy đủ.`
    );
  }
}

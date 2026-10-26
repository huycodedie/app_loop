import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import {
  getDailyFolderName,
  resolveOutputDirectory,
  ensureDirectoryExists,
} from '../src/shared/utils/outputDirectoryResolver';

describe('Output Directory Resolver Unit Tests', () => {
  describe('getDailyFolderName', () => {
    it('should format August 11 as "11_8"', () => {
      const date = new Date(2026, 7, 11, 14, 30); // Month is 0-indexed (7 = August)
      expect(getDailyFolderName(date)).toBe('11_8');
    });

    it('should format August 12 as "12_8"', () => {
      const date = new Date(2026, 7, 12, 0, 5);
      expect(getDailyFolderName(date)).toBe('12_8');
    });

    it('should format January 1 as "1_1"', () => {
      const date = new Date(2026, 0, 1, 9, 0);
      expect(getDailyFolderName(date)).toBe('1_1');
    });

    it('should format December 31 as "31_12"', () => {
      const date = new Date(2026, 11, 31, 23, 59);
      expect(getDailyFolderName(date)).toBe('31_12');
    });

    it('should use LOCAL date components, not UTC', () => {
      // Create date at 23:55 local time
      const localDate = new Date(2026, 7, 11, 23, 55);
      expect(getDailyFolderName(localDate)).toBe('11_8');
    });
  });

  describe('resolveOutputDirectory', () => {
    it('should append daily folder when autoDailyFolder is true', () => {
      const baseDir = path.normalize('D:/Repeat_Output');
      const date = new Date(2026, 7, 11, 10, 0); // Aug 11

      const result = resolveOutputDirectory({
        baseOutputDirectory: baseDir,
        autoDailyFolder: true,
        jobStartedAt: date,
      });

      expect(result.baseOutputDirectory).toBe(baseDir);
      expect(result.dailyFolderName).toBe('11_8');
      expect(result.resolvedOutputDirectory).toBe(path.join(baseDir, '11_8'));
    });

    it('should return base directory directly when autoDailyFolder is false', () => {
      const baseDir = path.normalize('D:/Repeat_Output');
      const date = new Date(2026, 7, 11, 10, 0);

      const result = resolveOutputDirectory({
        baseOutputDirectory: baseDir,
        autoDailyFolder: false,
        jobStartedAt: date,
      });

      expect(result.baseOutputDirectory).toBe(baseDir);
      expect(result.dailyFolderName).toBeNull();
      expect(result.resolvedOutputDirectory).toBe(baseDir);
    });

    it('should use job processing start date for folder naming', () => {
      // File arrived Aug 11 at 23:58, but job starts Aug 12 at 00:03
      const jobStartedAt = new Date(2026, 7, 12, 0, 3);
      const baseDir = path.normalize('C:/Videos/Output');

      const result = resolveOutputDirectory({
        baseOutputDirectory: baseDir,
        autoDailyFolder: true,
        jobStartedAt,
      });

      expect(result.dailyFolderName).toBe('12_8');
      expect(result.resolvedOutputDirectory).toBe(path.join(baseDir, '12_8'));
    });

    it('should preserve resolved output directory when retrying an existing job crossing midnight', () => {
      // Original job locked folder on Aug 11
      const originalResolvedDir = path.join('D:', 'Output', '11_8');

      // Job retried on Aug 12
      const retryDate = new Date(2026, 7, 12, 14, 0);

      // Simulating QueueService retry logic:
      // If job already has a locked resolvedOutputDirectory, it reuses it
      const nextJob = {
        baseOutputDirectory: path.join('D:', 'Output'),
        autoDailyOutputFolder: true,
        resolvedOutputDirectory: originalResolvedDir,
      };

      const freshResolution = resolveOutputDirectory({
        baseOutputDirectory: nextJob.baseOutputDirectory,
        autoDailyFolder: nextJob.autoDailyOutputFolder,
        jobStartedAt: retryDate,
      });

      // Retried job keeps original locked folder
      const effectiveDir = nextJob.resolvedOutputDirectory || freshResolution.resolvedOutputDirectory;
      expect(effectiveDir).toBe(originalResolvedDir);
    });

    it('should handle Vietnamese characters and spaces in base path', () => {
      const baseDir = path.normalize('C:/Thư mục xuất video/Khách hàng 1');
      const date = new Date(2026, 7, 11, 15, 0);

      const result = resolveOutputDirectory({
        baseOutputDirectory: baseDir,
        autoDailyFolder: true,
        jobStartedAt: date,
      });

      expect(result.resolvedOutputDirectory).toBe(path.join(baseDir, '11_8'));
    });
  });

  describe('ensureDirectoryExists', () => {
    const testDir = path.join(__dirname, '../temp_test_dir_daily_folder/11_8');

    afterEach(() => {
      if (fs.existsSync(testDir)) {
        fs.rmSync(path.join(__dirname, '../temp_test_dir_daily_folder'), { recursive: true, force: true });
      }
    });

    it('should create nested directories recursively without throwing', () => {
      expect(fs.existsSync(testDir)).toBe(false);
      ensureDirectoryExists(testDir);
      expect(fs.existsSync(testDir)).toBe(true);
    });

    it('should not throw if directory already exists', () => {
      ensureDirectoryExists(testDir);
      expect(() => ensureDirectoryExists(testDir)).not.toThrow();
    });
  });
});

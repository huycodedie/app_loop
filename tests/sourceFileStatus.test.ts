import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { SourceFileStatusService } from '../src/main/services/SourceFileStatusService';

describe('Source File Status Management Unit & Integration Tests', () => {
  let tempDir: string;
  let service: SourceFileStatusService;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vrs_status_test_'));
    service = new SourceFileStatusService();
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }
  });

  describe('1. Suffix Detection & Original Filename Extraction', () => {
    it('should detect status suffixes correctly', () => {
      expect(SourceFileStatusService.hasStatusSuffix('rain.mp4')).toBe(false);
      expect(SourceFileStatusService.hasStatusSuffix('rain_PROCESSING.mp4')).toBe(true);
      expect(SourceFileStatusService.hasStatusSuffix('rain_DONE.mp4')).toBe(true);
      expect(SourceFileStatusService.hasStatusSuffix('rain_ERROR.mp4')).toBe(true);
      expect(SourceFileStatusService.hasStatusSuffix('rain_ERROR_FFMPEG.mp4')).toBe(true);
      expect(SourceFileStatusService.hasStatusSuffix('rain_SKIPPED.mp4')).toBe(true);
    });

    it('should extract original filename cleanly', () => {
      expect(SourceFileStatusService.getOriginalFilename('rain.mp4')).toBe('rain.mp4');
      expect(SourceFileStatusService.getOriginalFilename('rain_PROCESSING.mp4')).toBe('rain.mp4');
      expect(SourceFileStatusService.getOriginalFilename('rain_DONE.mp4')).toBe('rain.mp4');
      expect(SourceFileStatusService.getOriginalFilename('rain_DONE_001.mp4')).toBe('rain.mp4');
      expect(SourceFileStatusService.getOriginalFilename('rain_ERROR_FFMPEG.mp4')).toBe('rain.mp4');
      expect(SourceFileStatusService.getOriginalFilename('mưa_nặng_DONE.mp4')).toBe('mưa_nặng.mp4');
      expect(SourceFileStatusService.getOriginalFilename('heavy rain night_PROCESSING.mp4')).toBe('heavy rain night.mp4');
    });

    it('should not duplicate status suffixes', () => {
      const fn1 = SourceFileStatusService.generateTargetFilename('rain_DONE.mp4', 'COMPLETED');
      expect(fn1).toBe('rain_DONE.mp4');

      const fn2 = SourceFileStatusService.generateTargetFilename('rain_PROCESSING.mp4', 'COMPLETED');
      expect(fn2).toBe('rain_DONE.mp4');
    });
  });

  describe('2. Disk Renaming & Status Transitions', () => {
    it('1. rain.mp4 success workflow -> rain_PROCESSING.mp4 -> rain_DONE.mp4', () => {
      const srcFile = path.join(tempDir, 'rain.mp4');
      fs.writeFileSync(srcFile, 'dummy content');

      // Stage 1: Move to PROCESSING
      const res1 = service.renameSourceFile(srcFile, 'PROCESSING');
      expect(res1.success).toBe(true);
      expect(path.basename(res1.newPath)).toBe('rain_PROCESSING.mp4');
      expect(fs.existsSync(res1.newPath)).toBe(true);
      expect(fs.existsSync(srcFile)).toBe(false);

      // Stage 2: Move to COMPLETED
      const res2 = service.renameSourceFile(res1.newPath, 'COMPLETED');
      expect(res2.success).toBe(true);
      expect(path.basename(res2.newPath)).toBe('rain_DONE.mp4');
      expect(fs.existsSync(res2.newPath)).toBe(true);
      expect(fs.existsSync(res1.newPath)).toBe(false);
    });

    it('2. rain.mp4 failure workflow -> rain_PROCESSING.mp4 -> rain_ERROR.mp4', () => {
      const srcFile = path.join(tempDir, 'rain.mp4');
      fs.writeFileSync(srcFile, 'dummy content');

      const res1 = service.renameSourceFile(srcFile, 'PROCESSING');
      expect(res1.success).toBe(true);

      const res2 = service.renameSourceFile(res1.newPath, 'FAILED');
      expect(res2.success).toBe(true);
      expect(path.basename(res2.newPath)).toBe('rain_ERROR.mp4');
      expect(fs.existsSync(res2.newPath)).toBe(true);
    });

    it('3. Advanced error naming mode: rain_ERROR_FFMPEG.mp4', () => {
      const srcFile = path.join(tempDir, 'nvenc_fail.mp4');
      fs.writeFileSync(srcFile, 'dummy video');

      const res1 = service.renameSourceFile(srcFile, 'PROCESSING');
      const res2 = service.renameSourceFile(res1.newPath, 'FAILED', {
        errorCategory: 'FFMPEG',
        mode: 'ADVANCED',
      });

      expect(res2.success).toBe(true);
      expect(path.basename(res2.newPath)).toBe('nvenc_fail_ERROR_FFMPEG.mp4');
    });

    it('4. Startup crash recovery restores _PROCESSING files to waiting state', () => {
      const lingering1 = path.join(tempDir, 'storm_PROCESSING.mp4');
      const lingering2 = path.join(tempDir, 'ocean_PROCESSING.mp4');
      fs.writeFileSync(lingering1, 'dummy');
      fs.writeFileSync(lingering2, 'dummy');

      const recoveryRes = service.recoverProcessingFiles([tempDir], 'RESET_TO_WAITING');
      expect(recoveryRes.recoveredCount).toBe(2);

      expect(fs.existsSync(path.join(tempDir, 'storm.mp4'))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'ocean.mp4'))).toBe(true);
      expect(fs.existsSync(lingering1)).toBe(false);
    });

    it('5. Collision handling generates _DONE_001.mp4 when target name exists', () => {
      const existingDone = path.join(tempDir, 'sunset_DONE.mp4');
      fs.writeFileSync(existingDone, 'existing done file');

      const procFile = path.join(tempDir, 'sunset_PROCESSING.mp4');
      fs.writeFileSync(procFile, 'processing file');

      const res = service.renameSourceFile(procFile, 'COMPLETED');
      expect(res.success).toBe(true);
      expect(path.basename(res.newPath)).toBe('sunset_DONE_001.mp4');
      expect(fs.existsSync(res.newPath)).toBe(true);
      expect(fs.existsSync(existingDone)).toBe(true);
    });

    it('6. Supports Vietnamese filenames with accents and spaces', () => {
      const vnFile = path.join(tempDir, 'mưa_nặng_hạt đêm.mp4');
      fs.writeFileSync(vnFile, 'content');

      const res1 = service.renameSourceFile(vnFile, 'PROCESSING');
      expect(path.basename(res1.newPath)).toBe('mưa_nặng_hạt đêm_PROCESSING.mp4');

      const res2 = service.renameSourceFile(res1.newPath, 'COMPLETED');
      expect(path.basename(res2.newPath)).toBe('mưa_nặng_hạt đêm_DONE.mp4');
      expect(fs.existsSync(res2.newPath)).toBe(true);
    });
  });
});

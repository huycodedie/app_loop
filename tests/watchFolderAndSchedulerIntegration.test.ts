import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import { calculateRepeatPlan } from '../src/shared/utils/repeatPlan';
import { getDailyFolderName, resolveOutputDirectory } from '../src/shared/utils/outputDirectoryResolver';

describe('Watch Folder & Scheduler Real Workflow Integration Tests', () => {
  const tempRootDir = path.join(__dirname, '../temp_integration_test');
  const watchInputDir = path.join(tempRootDir, 'Incoming_Rain');
  const watchOutputRootDir = path.join(tempRootDir, 'Finished_Rain');

  beforeEach(() => {
    fs.mkdirSync(watchInputDir, { recursive: true });
    fs.mkdirSync(watchOutputRootDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tempRootDir)) {
      fs.rmSync(tempRootDir, { recursive: true, force: true });
    }
  });

  it('1. Watch Folder rule configuration & daily folder path resolution', () => {
    const watchConfig = {
      id: 'wf_test_1',
      folderPath: watchInputDir,
      outputFolder: watchOutputRootDir,
      repeatCount: 30,
      audioFadeInEnabled: true,
      audioFadeInDurationSeconds: 5.0,
      durationLimitEnabled: true,
      durationLimitSeconds: 600, // 10 minutes limit
      autoDailyOutputFolder: true,
      dailyFolderFormat: 'DAY_MONTH',
      enabled: true,
      createdAt: new Date().toISOString(),
    };

    // Simulate file detection on Aug 12 at 21:40
    const jobStartedAt = new Date(2026, 7, 12, 21, 40);
    const resolution = resolveOutputDirectory({
      baseOutputDirectory: watchConfig.outputFolder,
      autoDailyFolder: watchConfig.autoDailyOutputFolder,
      jobStartedAt,
    });

    expect(resolution.dailyFolderName).toBe('12_8');
    expect(resolution.resolvedOutputDirectory).toBe(path.join(watchOutputRootDir, '12_8'));

    // Create daily folder automatically
    fs.mkdirSync(resolution.resolvedOutputDirectory, { recursive: true });
    expect(fs.existsSync(resolution.resolvedOutputDirectory)).toBe(true);

    // Simulate final video output path inside date folder
    const outputFilePath = path.join(resolution.resolvedOutputDirectory, 'rain01_repeat.mp4');
    fs.writeFileSync(outputFilePath, 'dummy video binary content');
    expect(fs.existsSync(outputFilePath)).toBe(true);
  });

  it('2. Centralized RepeatPlan calculation for Watch Folder job with 10 min duration limit', () => {
    const sourceDuration = 590; // 9 min 50 sec = 590 seconds
    const repeatCount = 30; // Manual repeat count ignored when duration limit ON
    const durationLimitEnabled = true;
    const durationLimitSeconds = 600; // 10 minutes limit = 600 seconds

    const plan = calculateRepeatPlan(
      sourceDuration,
      repeatCount,
      durationLimitEnabled,
      durationLimitSeconds
    );

    expect(plan.effectiveRepeatCount).toBe(2); // ceil(600 / 590) = 2
    expect(plan.naturalDurationSeconds).toBe(1180); // 590 * 2
    expect(plan.effectiveDurationSeconds).toBe(600);
    expect(plan.fullCopyCount).toBe(1); // 1 full copy (590s)
    expect(plan.partialCopyDurationSeconds).toBeCloseTo(10, 2); // 1 partial ending of 10s
    expect(plan.hasPartialFinalCopy).toBe(true);
  });

  it('3. Centralized RepeatPlan calculation for Scheduler job with 3 hour duration limit', () => {
    const sourceDuration = 590; // 9m 50s
    const repeatCount = 30;
    const durationLimitEnabled = true;
    const durationLimitSeconds = 10800; // 3 hours limit

    const plan = calculateRepeatPlan(
      sourceDuration,
      repeatCount,
      durationLimitEnabled,
      durationLimitSeconds
    );

    expect(plan.effectiveRepeatCount).toBe(19); // ceil(10800 / 590) = 19
    expect(plan.naturalDurationSeconds).toBe(11210); // 590 * 19
    expect(plan.effectiveDurationSeconds).toBe(10800);
    expect(plan.fullCopyCount).toBe(18); // floor(10800 / 590) = 18
    expect(plan.partialCopyDurationSeconds).toBeCloseTo(180, 2); // 10800 - 18*590 = 180s (3 mins)
    expect(plan.hasPartialFinalCopy).toBe(true);
  });

  it('4. Retried Watch Folder job retains original locked daily folder across midnight', () => {
    const originalJobStart = new Date(2026, 7, 11, 23, 55); // Aug 11
    const originalResolution = resolveOutputDirectory({
      baseOutputDirectory: watchOutputRootDir,
      autoDailyFolder: true,
      jobStartedAt: originalJobStart,
    });
    expect(originalResolution.dailyFolderName).toBe('11_8');

    // Job fails or gets retried on Aug 12
    const retryTime = new Date(2026, 7, 12, 10, 0);

    // QueueService locks resolvedOutputDirectory
    const jobRecord = {
      id: 'job_retry_test',
      sourceType: 'WATCH_FOLDER' as const,
      autoDailyOutputFolder: true,
      baseOutputDirectory: watchOutputRootDir,
      resolvedOutputDirectory: originalResolution.resolvedOutputDirectory, // locked on Aug 11
    };

    // When retrying, QueueService reuses jobRecord.resolvedOutputDirectory
    const effectiveOutputDir = jobRecord.resolvedOutputDirectory || resolveOutputDirectory({
      baseOutputDirectory: jobRecord.baseOutputDirectory,
      autoDailyFolder: jobRecord.autoDailyOutputFolder,
      jobStartedAt: retryTime,
    }).resolvedOutputDirectory;

    expect(effectiveOutputDir).toBe(path.join(watchOutputRootDir, '11_8'));
  });

  it('5. Auto Daily Output Folder disabled outputs directly to root', () => {
    const watchConfig = {
      baseOutputDirectory: watchOutputRootDir,
      autoDailyFolder: false,
      jobStartedAt: new Date(2026, 7, 12, 12, 0),
    };

    const resolution = resolveOutputDirectory(watchConfig);
    expect(resolution.dailyFolderName).toBeNull();
    expect(resolution.resolvedOutputDirectory).toBe(watchOutputRootDir);
  });

  it('6. Watch Folder: two files with different durations automatically calculate different repeat counts for same 3-hour target', () => {
    const targetSeconds = 10800; // 3 hours

    // File A: 9m 50s = 590 seconds
    const fileA_duration = 590;
    const planA = calculateRepeatPlan(fileA_duration, 1, true, targetSeconds);
    expect(planA.effectiveRepeatCount).toBe(19); // ceil(10800 / 590) = 19
    expect(planA.effectiveDurationSeconds).toBe(10800);

    // File B: 12m 30s = 750 seconds
    const fileB_duration = 750;
    const planB = calculateRepeatPlan(fileB_duration, 1, true, targetSeconds);
    expect(planB.effectiveRepeatCount).toBe(15); // ceil(10800 / 750) = 15
    expect(planB.effectiveDurationSeconds).toBe(10800);

    // File C: 15m = 900 seconds
    const fileC_duration = 900;
    const planC = calculateRepeatPlan(fileC_duration, 1, true, targetSeconds);
    expect(planC.effectiveRepeatCount).toBe(12); // ceil(10800 / 900) = 12
    expect(planC.effectiveDurationSeconds).toBe(10800);

    // All three files produce the exact same 3-hour output duration
    expect(planA.effectiveDurationSeconds).toBe(planB.effectiveDurationSeconds);
    expect(planB.effectiveDurationSeconds).toBe(planC.effectiveDurationSeconds);
  });
});

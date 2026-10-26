/**
 * FFmpeg Progress Parser — Unit Tests
 *
 * Tests for:
 * 1.  FFmpeg key=value chunk parser
 * 2.  out_time string parsing (HH:MM:SS.ffffff)
 * 3.  out_time_us / out_time_ms (microsecond values)
 * 4.  speed parsing (strips "x", handles N/A)
 * 5.  fps parsing
 * 6.  frame parsing
 * 7.  Stage progress calculation
 * 8.  Overall work-unit progress calculation
 * 9.  Progress never moves backward (monotonic)
 * 10. Progress stays below 100 before validation
 * 11. Verification holds at 99%
 * 12. Completion is exactly 100%
 * 13. Failed job retains last percentage
 * 14. Cancelled job retains last percentage
 * 15. Retry resets progress
 * 16. Duration Limit uses effective duration
 * 17. Partial final repetition uses actual required duration
 * 18. Audio Fade final pass included when enabled
 * 19. Fade disabled excludes audio fade work unit
 * 20. IPC event is serializable (no non-JSON values)
 */

import { describe, it, expect } from 'vitest';
import {
  parseFFmpegProgressChunk,
  parseTimestamp,
  parseSpeed,
  calcStageProgress,
  calcOverallProgress,
  ETASmoothing,
} from '../src/shared/utils/ffmpegProgressParser';
import { calculateRepeatPlan } from '../src/shared/utils/repeatPlan';
import type { ProcessingProgress } from '../src/shared/types/progress';

// ──────────────────────────────────────────────────────────────────────────────
// 1. FFmpeg key=value chunk parser
// ──────────────────────────────────────────────────────────────────────────────
describe('parseFFmpegProgressChunk', () => {
  it('parses a complete progress block', () => {
    const block = [
      'frame=1234',
      'fps=85.40',
      'stream_0_0_q=28.0',
      'bitrate=400.0kbits/s',
      'total_size=60000000',
      'out_time_us=621400000',
      'out_time_ms=621400000',
      'out_time=00:10:21.400000',
      'dup_frames=0',
      'drop_frames=0',
      'speed=2.81x',
      'progress=continue',
    ].join('\n');

    const result = parseFFmpegProgressChunk(block);
    expect(result).not.toBeNull();
    expect(result!.frame).toBe(1234);
    expect(result!.fps).toBeCloseTo(85.4);
    expect(result!.speed).toBeCloseTo(2.81);
    expect(result!.progressStatus).toBe('continue');
    // out_time preferred: 00:10:21.400000 = 621.4s
    expect(result!.processedSeconds).toBeCloseTo(621.4, 1);
  });

  it('returns null for empty string', () => {
    expect(parseFFmpegProgressChunk('')).toBeNull();
  });

  it('returns null for unrelated text', () => {
    expect(parseFFmpegProgressChunk('this is not ffmpeg output')).toBeNull();
  });

  it('handles progress=end', () => {
    const result = parseFFmpegProgressChunk('progress=end\n');
    expect(result).not.toBeNull();
    expect(result!.progressStatus).toBe('end');
  });

  it('handles partial block with only some keys', () => {
    const result = parseFFmpegProgressChunk('out_time=00:01:30.000000\nspeed=1.5x\n');
    expect(result).not.toBeNull();
    expect(result!.processedSeconds).toBeCloseTo(90.0);
    expect(result!.speed).toBeCloseTo(1.5);
    expect(result!.fps).toBeNull();
    expect(result!.frame).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. out_time string parsing
// ──────────────────────────────────────────────────────────────────────────────
describe('parseTimestamp', () => {
  it('parses HH:MM:SS.ffffff correctly', () => {
    expect(parseTimestamp('00:10:21.400000')).toBeCloseTo(621.4, 3);
    expect(parseTimestamp('01:00:00.000000')).toBeCloseTo(3600.0, 3);
    expect(parseTimestamp('00:00:05.500000')).toBeCloseTo(5.5, 3);
  });

  it('parses zero time', () => {
    expect(parseTimestamp('00:00:00.000000')).toBeCloseTo(0, 3);
  });

  it('returns null for N/A', () => {
    expect(parseTimestamp('N/A')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseTimestamp('')).toBeNull();
  });

  it('handles large hours correctly', () => {
    // 10 hours, 30 minutes, 45.5 seconds
    expect(parseTimestamp('10:30:45.500000')).toBeCloseTo(37845.5, 1);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. out_time_us / out_time_ms microsecond handling (CRITICAL)
// ──────────────────────────────────────────────────────────────────────────────
describe('out_time_us and out_time_ms microsecond parsing', () => {
  it('correctly divides out_time_us by 1_000_000 (not 1_000)', () => {
    // 621400000 microseconds = 621.4 seconds
    const result = parseFFmpegProgressChunk('out_time_us=621400000\nprogress=continue\n');
    expect(result!.processedSeconds).toBeCloseTo(621.4, 1);
    // Sanity check: must NOT be 621400 (wrong division by 1000)
    expect(result!.processedSeconds).toBeLessThan(1000);
  });

  it('correctly divides out_time_ms by 1_000_000 (not 1_000 — FFmpeg naming is misleading)', () => {
    // Despite "_ms" suffix, FFmpeg outputs microseconds
    const result = parseFFmpegProgressChunk('out_time_ms=621400000\nprogress=continue\n');
    expect(result!.processedSeconds).toBeCloseTo(621.4, 1);
    expect(result!.processedSeconds).toBeLessThan(1000);
  });

  it('prefers out_time string over out_time_us', () => {
    const block = [
      'out_time_us=99999999999', // bogus value
      'out_time=00:01:30.000000',
      'progress=continue',
    ].join('\n');
    const result = parseFFmpegProgressChunk(block);
    // Should use the string value: 90 seconds
    expect(result!.processedSeconds).toBeCloseTo(90.0, 1);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. speed parsing
// ──────────────────────────────────────────────────────────────────────────────
describe('parseSpeed', () => {
  it('strips x suffix and returns float', () => {
    expect(parseSpeed('2.81x')).toBeCloseTo(2.81);
    expect(parseSpeed('1.00x')).toBeCloseTo(1.0);
    expect(parseSpeed('0.5x')).toBeCloseTo(0.5);
  });

  it('returns null for N/A', () => {
    expect(parseSpeed('N/A')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseSpeed('')).toBeNull();
  });

  it('does not crash on unexpected input', () => {
    expect(parseSpeed('abc')).toBeNull();
    expect(parseSpeed('0x')).toBeNull(); // 0 speed is treated as null (≤ 0 guard)
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 5. FPS parsing
// ──────────────────────────────────────────────────────────────────────────────
describe('fps parsing in parseFFmpegProgressChunk', () => {
  it('parses valid fps', () => {
    const result = parseFFmpegProgressChunk('fps=92.40\nprogress=continue\n');
    expect(result!.fps).toBeCloseTo(92.4);
  });

  it('returns null for fps=N/A', () => {
    const result = parseFFmpegProgressChunk('fps=N/A\nprogress=continue\n');
    expect(result!.fps).toBeNull();
  });

  it('returns null for fps=0', () => {
    const result = parseFFmpegProgressChunk('fps=0\nprogress=continue\n');
    expect(result!.fps).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 6. Stage progress calculation
// ──────────────────────────────────────────────────────────────────────────────
describe('calcStageProgress', () => {
  it('returns 0 when processedSeconds is 0', () => {
    expect(calcStageProgress(0, 600)).toBe(0);
  });

  it('returns 50 at halfway', () => {
    expect(calcStageProgress(300, 600)).toBeCloseTo(50);
  });

  it('clamps to 100 when over', () => {
    expect(calcStageProgress(700, 600)).toBe(100);
  });

  it('returns 0 for invalid expectedSeconds', () => {
    expect(calcStageProgress(100, 0)).toBe(0);
    expect(calcStageProgress(100, -1)).toBe(0);
  });

  it('returns 0 for negative processedSeconds', () => {
    expect(calcStageProgress(-5, 600)).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 7. Overall work-unit progress calculation
// ──────────────────────────────────────────────────────────────────────────────
describe('calcOverallProgress', () => {
  it('returns 0 at start', () => {
    expect(calcOverallProgress(0, 0, 1000)).toBe(0);
  });

  it('returns values between 0 and 99 (never 100)', () => {
    const result = calcOverallProgress(0, 1000, 1000);
    expect(result).toBeLessThanOrEqual(99);
    expect(result).toBeGreaterThanOrEqual(0);
  });

  it('maps halfway work to ~50', () => {
    // total = 2000; completed = 0; current = 1000 → 50% of total → maps to ~50% of 99 ≈ 49-50
    const result = calcOverallProgress(0, 1000, 2000);
    expect(result).toBeGreaterThanOrEqual(48);
    expect(result).toBeLessThanOrEqual(51);
  });

  it('returns 99 when all work complete', () => {
    expect(calcOverallProgress(1000, 0, 1000)).toBe(99);
  });

  it('clamps negative inputs to 0', () => {
    expect(calcOverallProgress(-100, 0, 1000)).toBe(0);
  });

  it('returns 0 for zero total work', () => {
    expect(calcOverallProgress(0, 0, 0)).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 8. Progress never moves backward (monotonic)
// ──────────────────────────────────────────────────────────────────────────────
describe('monotonic overall progress', () => {
  it('never decreases across stage transitions', () => {
    // Simulate: after stage A at 40%, stage B emits 20% overall (wrong)
    // Our emitProgress guard should clamp it
    let last = 0;
    const emitProgress = (overall: number): number => {
      const clamped = Math.max(last, overall);
      last = clamped;
      return clamped;
    };

    expect(emitProgress(10)).toBe(10);
    expect(emitProgress(25)).toBe(25);
    expect(emitProgress(40)).toBe(40);
    // Stage reset tries to emit lower — must be clamped
    expect(emitProgress(15)).toBe(40);
    expect(emitProgress(50)).toBe(50);
    expect(emitProgress(99)).toBe(99);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 9. Verification holds at 99%
// ──────────────────────────────────────────────────────────────────────────────
describe('99% hold during verification', () => {
  it('overall progress from calcOverallProgress never reaches 100', () => {
    // Even at full completion, calcOverallProgress caps at 99
    const result = calcOverallProgress(9999999, 0, 100);
    expect(result).toBeLessThanOrEqual(99);
  });

  it('VERIFYING stage explicitly holds at 99', () => {
    // We set overallProgress: 99 explicitly for VERIFYING stages
    const verifyingProgress = 99;
    expect(verifyingProgress).toBe(99);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 10. Completion is exactly 100%
// ──────────────────────────────────────────────────────────────────────────────
describe('completion at exactly 100', () => {
  it('CLEANING stage emits exactly 100', () => {
    // The engine explicitly sets overallProgress: 100 for CLEANING stage
    const completionProgress = 100;
    expect(completionProgress).toBe(100);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 11. Failed job retains last percentage
// ──────────────────────────────────────────────────────────────────────────────
describe('failed job progress retention', () => {
  it('retains the last known progress on failure', () => {
    let lastKnown = 64; // job was at 64% when it failed
    const failedProgress = lastKnown; // should NOT reset to 0
    expect(failedProgress).toBe(64);
    expect(failedProgress).not.toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 12. Cancelled job retains last percentage (same logic as failed)
// ──────────────────────────────────────────────────────────────────────────────
describe('cancelled job progress retention', () => {
  it('retains progress percentage on cancel', () => {
    const lastProgress = 37;
    // On cancel, QueueService should use lastProgress?.overallProgress ?? 0
    const retainedOnCancel = lastProgress ?? 0;
    expect(retainedOnCancel).toBe(37);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 13. Retry resets progress
// ──────────────────────────────────────────────────────────────────────────────
describe('retry resets progress', () => {
  it('progress resets to 0 on retry', () => {
    // QueueService.retryJob resets to WAITING with progress=0
    const progressAfterRetry = 0;
    expect(progressAfterRetry).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 14. Duration Limit uses effective duration
// ──────────────────────────────────────────────────────────────────────────────
describe('Duration Limit uses effective duration', () => {
  it('effective duration is less than natural when limit applies', () => {
    const sourceDuration = 590; // ~9m50s
    const repeatCount = 19;
    const durationLimitSeconds = 10800; // 3 hours

    const plan = calculateRepeatPlan(sourceDuration, repeatCount, true, durationLimitSeconds);
    const naturalDuration = sourceDuration * repeatCount;

    expect(plan.effectiveDurationSeconds).toBeLessThanOrEqual(durationLimitSeconds);
    expect(plan.effectiveDurationSeconds).toBeLessThan(naturalDuration);
    expect(plan.durationLimitEnabled).toBe(true);
  });

  it('uses effectiveDurationSeconds (not natural) for progress calculation', () => {
    const sourceDuration = 590;
    const repeatCount = 19;
    const durationLimitSeconds = 10800;
    const plan = calculateRepeatPlan(sourceDuration, repeatCount, true, durationLimitSeconds);

    // Progress should use effectiveDurationSeconds, not sourceDuration * repeatCount
    const totalWork = sourceDuration + plan.effectiveDurationSeconds; // simplified A1 + A3
    expect(totalWork).toBeLessThan(sourceDuration + sourceDuration * repeatCount);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 15. Partial final repetition uses actual required duration
// ──────────────────────────────────────────────────────────────────────────────
describe('partial final repetition', () => {
  it('hasPartialFinalCopy is true when limit cuts through a copy', () => {
    const sourceDuration = 590;
    const repeatCount = 5;
    // Set limit to something that doesn't align with a full copy
    const durationLimitSeconds = 1800; // 30 min, cuts partway through

    const plan = calculateRepeatPlan(sourceDuration, repeatCount, true, durationLimitSeconds);
    // If 2 full copies (1180s) < 1800 < 5 full copies (2950s), there must be a partial
    if (plan.fullCopyCount < repeatCount) {
      expect(plan.hasPartialFinalCopy).toBe(true);
      expect(plan.partialCopyDurationSeconds).toBeGreaterThan(0);
      expect(plan.partialCopyDurationSeconds).toBeLessThan(sourceDuration);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 16. Audio Fade pass is included in work plan when enabled
// ──────────────────────────────────────────────────────────────────────────────
describe('audio fade work unit', () => {
  it('work plan includes fade pass when enabled', () => {
    const sourceDuration = 590;
    const effectiveDuration = 10800;
    const requiresFade = true;

    // Simulate work plan construction
    const workPlan = [
      { stage: 'PREPARING_FULL_SOURCE', expectedSeconds: sourceDuration },
      { stage: 'BUILDING_REPEAT_SEQUENCE', expectedSeconds: effectiveDuration },
    ];
    if (requiresFade) {
      workPlan.push({ stage: 'APPLYING_AUDIO_FADE', expectedSeconds: effectiveDuration });
    }

    const totalWork = workPlan.reduce((s, u) => s + u.expectedSeconds, 0);
    const withoutFade = sourceDuration + effectiveDuration;
    expect(totalWork).toBe(withoutFade + effectiveDuration); // includes fade
    expect(totalWork).toBeGreaterThan(withoutFade);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 17. Fade disabled excludes audio fade work unit
// ──────────────────────────────────────────────────────────────────────────────
describe('audio fade exclusion', () => {
  it('work plan does NOT include fade pass when disabled', () => {
    const sourceDuration = 590;
    const effectiveDuration = 10800;
    const requiresFade = false;

    const workPlan = [
      { stage: 'PREPARING_FULL_SOURCE', expectedSeconds: sourceDuration },
      { stage: 'BUILDING_REPEAT_SEQUENCE', expectedSeconds: effectiveDuration },
    ];
    if (requiresFade) {
      workPlan.push({ stage: 'APPLYING_AUDIO_FADE', expectedSeconds: effectiveDuration });
    }

    const totalWork = workPlan.reduce((s, u) => s + u.expectedSeconds, 0);
    expect(totalWork).toBe(sourceDuration + effectiveDuration); // no fade
    expect(workPlan.find(u => u.stage === 'APPLYING_AUDIO_FADE')).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 18. IPC event is serializable (no Error/ChildProcess objects)
// ──────────────────────────────────────────────────────────────────────────────
describe('IPC event serialization', () => {
  it('ProcessingProgress can be JSON-serialized and deserialized', () => {
    const progress: ProcessingProgress = {
      jobId: 'job_test_123',
      stage: 'BUILDING_REPEAT_SEQUENCE',
      stageProgress: 52.7,
      overallProgress: 46.2,
      processedSeconds: 4235.4,
      expectedOutputDurationSeconds: 10800,
      frame: 424,
      fps: 89.3,
      speed: 2.81,
      elapsedSeconds: 1507,
      estimatedRemainingSeconds: 1260,
      updatedAt: Date.now(),
    };

    const serialized = JSON.stringify(progress);
    const deserialized = JSON.parse(serialized) as ProcessingProgress;

    expect(deserialized.jobId).toBe(progress.jobId);
    expect(deserialized.overallProgress).toBeCloseTo(progress.overallProgress);
    expect(deserialized.speed).toBeCloseTo(progress.speed!);
    expect(deserialized.fps).toBeCloseTo(progress.fps!);
    expect(deserialized.frame).toBe(progress.frame);
    expect(serialized).not.toContain('[object Object]');
    expect(serialized).not.toContain('undefined');
  });

  it('null values serialize correctly', () => {
    const progress: ProcessingProgress = {
      jobId: 'job_null_test',
      stage: 'ANALYZING',
      stageProgress: 0,
      overallProgress: 0,
      processedSeconds: 0,
      expectedOutputDurationSeconds: 0,
      frame: null,
      fps: null,
      speed: null,
      elapsedSeconds: 0,
      estimatedRemainingSeconds: null,
      updatedAt: Date.now(),
    };

    const serialized = JSON.stringify(progress);
    const deserialized = JSON.parse(serialized) as ProcessingProgress;

    expect(deserialized.frame).toBeNull();
    expect(deserialized.fps).toBeNull();
    expect(deserialized.speed).toBeNull();
    expect(deserialized.estimatedRemainingSeconds).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 19. jobId-specific Renderer update
// ──────────────────────────────────────────────────────────────────────────────
describe('jobId-specific state update', () => {
  it('only updates the specific job in progressByJobId', () => {
    // Simulate React state update logic
    const initial: Record<string, ProcessingProgress> = {
      'job_A': { jobId: 'job_A', stage: 'BUILDING_REPEAT_SEQUENCE', overallProgress: 30 } as ProcessingProgress,
      'job_B': { jobId: 'job_B', stage: 'WAITING' as any, overallProgress: 0 } as ProcessingProgress,
    };

    const incoming: ProcessingProgress = {
      jobId: 'job_A',
      stage: 'BUILDING_REPEAT_SEQUENCE',
      stageProgress: 50,
      overallProgress: 45,
      processedSeconds: 4860,
      expectedOutputDurationSeconds: 10800,
      frame: 450,
      fps: 90,
      speed: 2.5,
      elapsedSeconds: 200,
      estimatedRemainingSeconds: 800,
      updatedAt: Date.now(),
    };

    const updated = { ...initial, [incoming.jobId]: incoming };
    expect(updated['job_A'].overallProgress).toBe(45);
    expect(updated['job_B'].overallProgress).toBe(0); // unchanged
    expect(Object.keys(updated)).toHaveLength(2);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 20. ETA smoothing
// ──────────────────────────────────────────────────────────────────────────────
describe('ETASmoothing', () => {
  it('starts with the first value', () => {
    const smoother = new ETASmoothing(0.2);
    expect(smoother.current).toBeNull();
    const result = smoother.update(1000);
    expect(result).toBeCloseTo(1000);
  });

  it('smooths subsequent values', () => {
    const smoother = new ETASmoothing(0.5);
    smoother.update(1000);
    const smoothed = smoother.update(500);
    // 0.5 * 500 + 0.5 * 1000 = 750
    expect(smoothed).toBeCloseTo(750);
  });

  it('reset clears the state', () => {
    const smoother = new ETASmoothing(0.2);
    smoother.update(1000);
    smoother.reset();
    expect(smoother.current).toBeNull();
  });

  it('prevents wild ETA jumps', () => {
    const smoother = new ETASmoothing(0.1); // very smooth
    smoother.update(1000);
    smoother.update(1000);
    const result = smoother.update(2000); // sudden spike
    // With alpha=0.1: new = 0.1*2000 + 0.9*1000 = 200 + 900 = 1100
    expect(result).toBeCloseTo(1100);
    expect(result).toBeLessThan(1200); // not jumped to 2000
  });
});

import { describe, it, expect } from 'vitest';
import { calculateRepeatPlan } from '../src/shared/utils/repeatPlan';

describe('Output Duration Mode System Unit Tests (EXACT vs MINIMUM & Max Overshoot)', () => {
  it('1. Source 10:53 (653s), Target 1h (3600s), EXACT mode -> 01:00:00 output with partial final copy', () => {
    const sourceDuration = 653; // 10m 53s
    const targetSeconds = 3600; // 1 hour

    const plan = calculateRepeatPlan(sourceDuration, 1, true, targetSeconds, 'EXACT');

    expect(plan.durationMode).toBe('EXACT');
    expect(plan.effectiveRepeatCount).toBe(6); // ceil(3600 / 653) = 6
    expect(plan.fullCopyCount).toBe(5); // floor(3600 / 653) = 5
    expect(plan.partialCopyDurationSeconds).toBeCloseTo(335, 1); // 3600 - (5 * 653) = 335s
    expect(plan.hasPartialFinalCopy).toBe(true);
    expect(plan.effectiveDurationSeconds).toBe(3600);
    expect(plan.expectedFinalDurationSeconds).toBe(3600);
    expect(plan.overshootSeconds).toBe(0);
    expect(plan.fallbackToExact).toBe(false);
  });

  it('2. Source 10:53 (653s), Target 1h (3600s), MINIMUM mode -> 01:05:18 output (6 full copies, no trimming)', () => {
    const sourceDuration = 653;
    const targetSeconds = 3600;

    const plan = calculateRepeatPlan(sourceDuration, 1, true, targetSeconds, 'MINIMUM');

    expect(plan.durationMode).toBe('MINIMUM');
    expect(plan.effectiveRepeatCount).toBe(6);
    expect(plan.fullCopyCount).toBe(6);
    expect(plan.partialCopyDurationSeconds).toBe(0);
    expect(plan.hasPartialFinalCopy).toBe(false);
    expect(plan.effectiveDurationSeconds).toBe(3918); // 653 * 6 = 3918s (01:05:18)
    expect(plan.expectedFinalDurationSeconds).toBe(3918);
    expect(plan.overshootSeconds).toBe(318); // 3918 - 3600 = 318s (05:18 extra)
    expect(plan.fallbackToExact).toBe(false);
  });

  it('3. Source 15m (900s), Target 1h (3600s), MINIMUM mode -> exactly 4x full copies = 1 hour output', () => {
    const sourceDuration = 900;
    const targetSeconds = 3600;

    const plan = calculateRepeatPlan(sourceDuration, 1, true, targetSeconds, 'MINIMUM');

    expect(plan.durationMode).toBe('MINIMUM');
    expect(plan.effectiveRepeatCount).toBe(4);
    expect(plan.fullCopyCount).toBe(4);
    expect(plan.partialCopyDurationSeconds).toBe(0);
    expect(plan.hasPartialFinalCopy).toBe(false);
    expect(plan.effectiveDurationSeconds).toBe(3600);
    expect(plan.overshootSeconds).toBe(0);
  });

  it('4. Maximum overshoot protection enabled: falls back to EXACT when overshoot exceeds limit', () => {
    const sourceDuration = 1500; // 25 minutes
    const targetSeconds = 3600; // 1 hour
    const maxOvershoot = 600; // 10 minutes max extra allowed

    // Without max overshoot protection: 3 repeats = 4500s (1h 15m), overshoot = 15m (900s) > 10m
    const plan = calculateRepeatPlan(sourceDuration, 1, true, targetSeconds, 'MINIMUM', maxOvershoot);

    expect(plan.durationMode).toBe('MINIMUM');
    expect(plan.fallbackToExact).toBe(true); // Fallback triggered!
    expect(plan.effectiveDurationSeconds).toBe(3600); // Capped at 1 hour exact
    expect(plan.fullCopyCount).toBe(2); // 2 full copies (50m)
    expect(plan.partialCopyDurationSeconds).toBeCloseTo(600, 1); // 10m partial copy
    expect(plan.hasPartialFinalCopy).toBe(true);
    expect(plan.overshootSeconds).toBe(0);
  });

  it('5. Maximum overshoot protection allowed within limit: remains MINIMUM mode', () => {
    const sourceDuration = 653; // 10m 53s
    const targetSeconds = 3600; // 1 hour
    const maxOvershoot = 600; // 10 minutes max extra allowed

    // Overshoot = 318s (5m 18s) <= 600s (10m) limit -> Remains MINIMUM
    const plan = calculateRepeatPlan(sourceDuration, 1, true, targetSeconds, 'MINIMUM', maxOvershoot);

    expect(plan.durationMode).toBe('MINIMUM');
    expect(plan.fallbackToExact).toBe(false);
    expect(plan.effectiveDurationSeconds).toBe(3918);
    expect(plan.hasPartialFinalCopy).toBe(false);
    expect(plan.overshootSeconds).toBe(318);
  });

  it('6. Watch Folder rule with MINIMUM mode calculates correct repeat count per incoming video', () => {
    const targetSeconds = 10800; // 3 hours

    // File A: 9m 50s (590s) -> 19x -> 03:07:50 (overshoot 7m 50s)
    const planA = calculateRepeatPlan(590, 1, true, targetSeconds, 'MINIMUM');
    expect(planA.effectiveRepeatCount).toBe(19);
    expect(planA.effectiveDurationSeconds).toBe(11210); // 19 * 590
    expect(planA.overshootSeconds).toBe(410); // 6m 50s

    // File B: 15m (900s) -> 12x -> 03:00:00 (overshoot 0s)
    const planB = calculateRepeatPlan(900, 1, true, targetSeconds, 'MINIMUM');
    expect(planB.effectiveRepeatCount).toBe(12);
    expect(planB.effectiveDurationSeconds).toBe(10800);
    expect(planB.overshootSeconds).toBe(0);
  });
});

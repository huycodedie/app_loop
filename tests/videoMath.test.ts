import { describe, it, expect } from 'vitest';
import { calculateRepeatPlan } from '../src/shared/utils/repeatPlan';
import { formatTime } from '../src/renderer/src/utils/formatters';

describe('calculateRepeatPlan — centralized automatic repeat calculation math', () => {

  // ── 1. Basic no-limit cases ───────────────────────────────────────

  it('1. No limit: effectiveRepeatCount = requestedRepeatCount', () => {
    const p = calculateRepeatPlan(10, 3, false, null);
    expect(p.effectiveRepeatCount).toBe(3);
    expect(p.naturalDurationSeconds).toBe(30);
    expect(p.effectiveDurationSeconds).toBe(30);
    expect(p.fullCopyCount).toBe(3);
    expect(p.partialCopyDurationSeconds).toBeCloseTo(0, 5);
    expect(p.hasPartialFinalCopy).toBe(false);
  });

  it('2. No limit: real example 9:50 × 19', () => {
    const src = 590; // 9:50
    const p = calculateRepeatPlan(src, 19, false, null);
    expect(p.effectiveRepeatCount).toBe(19);
    expect(p.naturalDurationSeconds).toBeCloseTo(src * 19, 2);
    expect(p.effectiveDurationSeconds).toBeCloseTo(src * 19, 2);
    expect(p.fullCopyCount).toBe(19);
    expect(p.hasPartialFinalCopy).toBe(false);
  });

  // ── 2. Automatic repeat calculation when Duration Limit is ON ──────

  it('3. Auto repeat: Source 10m (600s), Target 3 hours (10800s) → 18 repeats', () => {
    const src = 600; // 10 min
    const target = 10800; // 3 hours
    const p = calculateRepeatPlan(src, 1, true, target);
    expect(p.effectiveRepeatCount).toBe(18); // ceil(10800 / 600) = 18
    expect(p.fullCopyCount).toBe(18);
    expect(p.partialCopyDurationSeconds).toBe(0);
    expect(p.effectiveDurationSeconds).toBe(10800);
    expect(p.hasPartialFinalCopy).toBe(false);
  });

  it('4. Auto repeat: Source 9m50s (590s), Target 3 hours (10800s) → 19 repeats (18 full + 3m partial)', () => {
    const src = 590; // 9:50
    const target = 10800; // 3 hours
    const p = calculateRepeatPlan(src, 3, true, target); // initial manual count = 3 (ignored when limit ON)
    expect(p.effectiveRepeatCount).toBe(19); // ceil(10800 / 590) = ceil(18.305...) = 19
    expect(p.fullCopyCount).toBe(18);
    expect(p.partialCopyDurationSeconds).toBeCloseTo(180, 2); // 10800 - 18 * 590 = 180s (3m)
    expect(p.hasPartialFinalCopy).toBe(true);
    expect(p.effectiveDurationSeconds).toBe(10800);
  });

  it('5. Auto repeat: Source 15m (900s), Target 3 hours (10800s) → 12 repeats', () => {
    const src = 900; // 15 min
    const target = 10800; // 3 hours
    const p = calculateRepeatPlan(src, 5, true, target);
    expect(p.effectiveRepeatCount).toBe(12); // ceil(10800 / 900) = 12
    expect(p.fullCopyCount).toBe(12);
    expect(p.partialCopyDurationSeconds).toBe(0);
    expect(p.hasPartialFinalCopy).toBe(false);
    expect(p.effectiveDurationSeconds).toBe(10800);
  });

  it('6. Auto repeat: Source 8m (480s), Target 3 hours (10800s) → 23 repeats (22 full + 4m partial)', () => {
    const src = 480; // 8 min
    const target = 10800; // 3 hours
    const p = calculateRepeatPlan(src, 1, true, target);
    expect(p.effectiveRepeatCount).toBe(23); // ceil(10800 / 480) = ceil(22.5) = 23
    expect(p.fullCopyCount).toBe(22);
    expect(p.partialCopyDurationSeconds).toBeCloseTo(240, 2); // 10800 - 22 * 480 = 240s (4m)
    expect(p.hasPartialFinalCopy).toBe(true);
    expect(p.effectiveDurationSeconds).toBe(10800);
  });

  it('7. Target shorter than source: Source 10m (600s), Target 3m (180s) → 1 repeat, 0 full, 3m partial', () => {
    const src = 600; // 10 min
    const target = 180; // 3 min
    const p = calculateRepeatPlan(src, 1, true, target);
    expect(p.effectiveRepeatCount).toBe(1); // ceil(180 / 600) = 1
    expect(p.fullCopyCount).toBe(0);
    expect(p.partialCopyDurationSeconds).toBeCloseTo(180, 2);
    expect(p.hasPartialFinalCopy).toBe(true);
    expect(p.effectiveDurationSeconds).toBe(180);
  });

  it('8. Exact repeat boundary: Source 10m (600s), Target 30m (1800s) → 3 repeats', () => {
    const src = 600; // 10 min
    const target = 1800; // 30 min
    const p = calculateRepeatPlan(src, 10, true, target);
    expect(p.effectiveRepeatCount).toBe(3); // ceil(1800 / 600) = 3
    expect(p.fullCopyCount).toBe(3);
    expect(p.partialCopyDurationSeconds).toBeCloseTo(0, 2);
    expect(p.hasPartialFinalCopy).toBe(false);
    expect(p.effectiveDurationSeconds).toBe(1800);
  });

  it('9. Target increases: changing target 3h (19 repeats) → 6h (37 repeats)', () => {
    const src = 590; // 9:50
    const p3h = calculateRepeatPlan(src, 1, true, 10800);
    expect(p3h.effectiveRepeatCount).toBe(19);

    const p6h = calculateRepeatPlan(src, 1, true, 21600); // 6 hours
    expect(p6h.effectiveRepeatCount).toBe(37); // ceil(21600 / 590) = ceil(36.61) = 37
    expect(p6h.effectiveDurationSeconds).toBe(21600);
  });

  it('10. Limit disabled: requestedLimitSeconds value is ignored', () => {
    const p1 = calculateRepeatPlan(590, 5, false, null);
    const p2 = calculateRepeatPlan(590, 5, false, 10800); // value present but disabled
    expect(p1.effectiveRepeatCount).toBe(5);
    expect(p2.effectiveRepeatCount).toBe(5);
    expect(p1.effectiveDurationSeconds).toBe(590 * 5);
  });

  // ── 3. Separation of fade and limit ──────────────────────────────

  it('11. fadeDuration has no effect on RepeatPlan (independence guard)', () => {
    const pNoFade  = calculateRepeatPlan(590, 19, true, 10800);
    const pFakeLimit = calculateRepeatPlan(590, 19, true, 5); // 5s limit
    expect(pNoFade.effectiveDurationSeconds).not.toBe(pFakeLimit.effectiveDurationSeconds);
    expect(pNoFade.effectiveDurationSeconds).toBe(10800);
  });

  // ── 4. Duration formatting ───────────────────────────────────────

  it('12. formatTime(10800) = 03:00:00.000', () => {
    expect(formatTime(10800)).toBe('03:00:00.000');
  });

  it('13. formatTime(0) = 00:00:00.000', () => {
    expect(formatTime(0)).toBe('00:00:00.000');
  });

  it('14. formatTime(590) = 00:09:50.000', () => {
    expect(formatTime(590)).toBe('00:09:50.000');
  });

  // ── 5. Edge cases ────────────────────────────────────────────────

  it('15. Source duration 0 → fullCopyCount = 1, fallback safe', () => {
    const p = calculateRepeatPlan(0, 3, true, 10800);
    expect(p.effectiveRepeatCount).toBe(1);
    expect(p.fullCopyCount).toBe(1);
  });

  it('16. Limit > 24h is accepted (no cap)', () => {
    const p = calculateRepeatPlan(590, 1, true, 86400); // 24h
    expect(p.requestedLimitSeconds).toBe(86400);
    expect(p.effectiveRepeatCount).toBe(Math.ceil(86400 / 590)); // 147 repeats
    expect(p.effectiveDurationSeconds).toBe(86400);
  });
});

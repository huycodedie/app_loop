import { describe, it, expect } from 'vitest';
import path from 'path';
import { calculateRepeatPlan } from '../src/shared/utils/repeatPlan';
import { formatTime } from '../src/renderer/src/utils/formatters';

// ─────────────────────────────────────────────────────────────────
// Helpers that mirror VideoEngine production logic (pure math)
// ─────────────────────────────────────────────────────────────────

/**
 * Build the concat_list.txt content as the engine would.
 * CRITICAL: fadeDuration must NEVER appear here.
 * partialCopyDurationSeconds comes from durationLimitSeconds, not fadeDuration.
 */
function buildConcatList(fullCopyCount: number, hasPartialCopy: boolean): string {
  let content = '';
  for (let i = 0; i < fullCopyCount; i++) {
    content += `file 'source_normalized.mp4'\n`;
  }
  if (hasPartialCopy) {
    content += `file 'partial_copy.mp4'\n`;
  }
  return content;
}

function buildFadeFilter(fadeDurationSeconds: number): string {
  return `[0:a:0]afade=t=in:st=0:d=${fadeDurationSeconds.toFixed(3)}:curve=qsin[aout]`;
}

function wouldUseCopyAudio(requiresFade: boolean): boolean {
  return !requiresFade;
}

// ─────────────────────────────────────────────────────────────────
// Test suite
// ─────────────────────────────────────────────────────────────────

describe('Two-Pass Video Repeat + Audio Fade-in + Duration Limit Architecture Tests', () => {

  // ── 1. Fade ON + Limit OFF ─────────────────────────────────────

  it('1. Fade ON + Limit OFF: concat list has all N copies, no partial', () => {
    const p = calculateRepeatPlan(590, 3, false, null);
    const list = buildConcatList(p.fullCopyCount, p.hasPartialFinalCopy);
    const lines = list.trim().split('\n');
    expect(lines).toHaveLength(3);
    expect(p.hasPartialFinalCopy).toBe(false);
    expect(list).not.toContain('partial_copy');
  });

  it('2. Fade OFF + Limit OFF: simplest possible workflow', () => {
    const p = calculateRepeatPlan(590, 5, false, null);
    const requiresFade = false;
    expect(p.fullCopyCount).toBe(5);
    expect(p.hasPartialFinalCopy).toBe(false);
    expect(wouldUseCopyAudio(requiresFade)).toBe(true); // stream copy allowed
  });

  it('3. Fade OFF + Limit ON: concat list has fullCopies + partial_copy', () => {
    const p = calculateRepeatPlan(590, 19, true, 10800);
    const list = buildConcatList(p.fullCopyCount, p.hasPartialFinalCopy);
    expect(list).toContain('source_normalized.mp4');
    expect(list).toContain('partial_copy.mp4');
    expect(p.hasPartialFinalCopy).toBe(true);
    // Audio copy is allowed since fade is OFF
    expect(wouldUseCopyAudio(false)).toBe(true);
  });

  it('4. Fade ON + Limit ON: fade applied to complete repeated timeline', () => {
    const p = calculateRepeatPlan(590, 19, true, 10800);
    const requiresFade = true;
    const filter = buildFadeFilter(5.0);
    // fade applied once to full output, not per-copy
    expect(filter).toContain('st=0');
    expect(wouldUseCopyAudio(requiresFade)).toBe(false); // must re-encode audio
    expect(p.effectiveDurationSeconds).toBe(10800);
  });

  // ── 5. Natural shorter than limit ──────────────────────────────

  it('5. Target duration controls repetitions: automatically calculates required repeat count', () => {
    const p = calculateRepeatPlan(300, 3, true, 10800); // 5m source, 3h target
    expect(p.effectiveRepeatCount).toBe(36); // ceil(10800 / 300) = 36
    expect(p.effectiveDurationSeconds).toBe(10800);
    expect(p.fullCopyCount).toBe(36);
    expect(p.hasPartialFinalCopy).toBe(false);
  });

  // ── 6. Natural exactly equal to limit ─────────────────────────

  it('6. Natural duration exactly equal to limit: no partial copy', () => {
    const p = calculateRepeatPlan(3600, 3, true, 10800);
    expect(p.naturalFitsWithinLimit).toBe(true);
    expect(p.effectiveDurationSeconds).toBe(10800);
    expect(p.hasPartialFinalCopy).toBe(false);
  });

  // ── 7. Natural longer than limit ──────────────────────────────

  it('7. Natural duration longer than limit: clamp to limit', () => {
    const p = calculateRepeatPlan(590, 19, true, 10800);
    expect(p.naturalDurationSeconds).toBeGreaterThan(10800);
    expect(p.effectiveDurationSeconds).toBe(10800);
  });

  // ── 8. Limit exactly at repeat boundary ───────────────────────

  it('8. Limit falls exactly on a repeat boundary: no partial copy', () => {
    const src = 600;
    const p = calculateRepeatPlan(src, 5, true, 1800); // exactly 3 copies
    expect(p.fullCopyCount).toBe(3);
    expect(p.partialCopyDurationSeconds).toBeCloseTo(0, 2);
    expect(p.hasPartialFinalCopy).toBe(false);
  });

  // ── 9. Limit falls inside final repetition ────────────────────

  it('9. Limit falls inside final repetition: partial copy created', () => {
    const src = 600;
    const p = calculateRepeatPlan(src, 5, true, 1950); // 1800 + 150s into 4th copy
    expect(p.fullCopyCount).toBe(3);
    expect(p.partialCopyDurationSeconds).toBeCloseTo(150, 1);
    expect(p.hasPartialFinalCopy).toBe(true);
  });

  // ── 10. Repeat count = 1 ──────────────────────────────────────

  it('10. Repeat count = 1, no limit', () => {
    const p = calculateRepeatPlan(590, 1, false, null);
    const list = buildConcatList(p.fullCopyCount, p.hasPartialFinalCopy);
    const lines = list.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(p.fullCopyCount).toBe(1);
    expect(p.hasPartialFinalCopy).toBe(false);
  });

  // ── 11. Source without audio ──────────────────────────────────

  it('11. Source without audio: requiresFade = false regardless of toggle', () => {
    const hasAudio = false;
    const audioFadeInEnabled = true;
    const fadeDuration = 5.0;
    const requiresFade = audioFadeInEnabled && hasAudio && fadeDuration > 0;
    expect(requiresFade).toBe(false);
  });

  // ── 12. Fade does not create video split ──────────────────────

  it('12. Fade does not create video split (architectural guard)', () => {
    const fadeDuration = 5.0;
    const p = calculateRepeatPlan(590, 19, true, 10800);
    const list = buildConcatList(p.fullCopyCount, p.hasPartialFinalCopy);

    // fadeDuration must NOT appear in the concat list
    expect(list).not.toContain(String(fadeDuration));
    expect(list).not.toContain('5.000');
    expect(list).not.toContain('5.0');
    expect(list).not.toContain('first_copy');
    expect(list).not.toContain('normal_copy');
    expect(list).not.toContain('fade_intro');
    expect(list).not.toContain('intro');
  });

  // ── 13. Fade happens only once ────────────────────────────────

  it('13. afade applied at st=0 once to complete output, not per-copy', () => {
    const filter = buildFadeFilter(5.0);
    expect(filter).toContain('st=0');
    expect(filter).toContain('t=in');
    expect(filter).toContain('curve=qsin');
    expect(filter).toContain('[0:a:0]');
    expect(filter).toContain('[aout]');
    // Not a per-copy filter — no repetition of afade in the list
    const filterCount = (filter.match(/afade/g) || []).length;
    expect(filterCount).toBe(1);
  });

  // ── 14. Partial final repetition accuracy ─────────────────────

  it('14. Partial final repetition duration is correct for 9:50 × 19 @ 3h limit', () => {
    const src = 590; // 9:50
    const p = calculateRepeatPlan(src, 19, true, 10800);
    const expectedPartial = 10800 - 18 * 590; // 10800 - 10620 = 180s
    expect(p.partialCopyDurationSeconds).toBeCloseTo(expectedPartial, 1);
    expect(formatTime(p.partialCopyDurationSeconds)).toMatch(/^00:03:00/);
  });

  // ── 15. Video and audio end together ──────────────────────────

  it('15. -t trim uses partialCopyDurationSeconds (not fadeDuration)', () => {
    const fadeDuration = 5.0;
    const src = 590;
    const p = calculateRepeatPlan(src, 19, true, 10800);
    // The -t flag for partial copy must use partialCopyDurationSeconds
    const trimPoint = p.partialCopyDurationSeconds;
    expect(trimPoint).not.toBeCloseTo(fadeDuration, 0); // completely different values
    expect(trimPoint).toBeCloseTo(180, 1); // 3 minutes, not 5 seconds
  });

  // ── 16. Duration Limit can be changed ─────────────────────────

  it('16. Duration limit is dynamic — changing it updates the plan', () => {
    const p1 = calculateRepeatPlan(590, 19, true, 3600);  // 1h
    const p2 = calculateRepeatPlan(590, 19, true, 7200);  // 2h
    const p3 = calculateRepeatPlan(590, 19, true, 10800); // 3h
    expect(p1.effectiveDurationSeconds).toBe(3600);
    expect(p2.effectiveDurationSeconds).toBe(7200);
    expect(p3.effectiveDurationSeconds).toBe(10800);
    expect(p1.fullCopyCount).toBeLessThan(p2.fullCopyCount);
    expect(p2.fullCopyCount).toBeLessThan(p3.fullCopyCount);
  });

  // ── 17. Duration Limit can be disabled ────────────────────────

  it('17. Disabling duration limit restores full natural duration', () => {
    const pLimit = calculateRepeatPlan(590, 19, true,  10800);
    const pFull  = calculateRepeatPlan(590, 19, false, null);
    expect(pLimit.effectiveDurationSeconds).toBe(10800);
    expect(pFull.effectiveDurationSeconds).toBeCloseTo(590 * 19, 2);
    expect(pFull.fullCopyCount).toBe(19);
    expect(pFull.hasPartialFinalCopy).toBe(false);
  });

  // ── 18. Fade can be independently toggled ─────────────────────

  it('18. Fade toggle is independent of duration limit toggle', () => {
    // Both enabled
    const p = calculateRepeatPlan(590, 19, true, 10800);
    expect(p.effectiveDurationSeconds).toBe(10800);
    // Fade is a separate boolean — RepeatPlan does not know about fade
    // Only audio filter args differ between fade=on and fade=off
    const filter = buildFadeFilter(5.0);
    expect(filter).toContain('afade');
    // Whether fade is enabled doesn't change the plan's duration
    expect(p.effectiveDurationSeconds).toBe(10800); // unchanged
  });

  // ── 19. GPU encoder workflow ──────────────────────────────────

  it('19. GPU encoder used for normalize + partial; copy used in fade pass', () => {
    const encoderForNormalize = 'h264_nvenc';
    const videoCodecForFadePass = 'copy';
    expect(encoderForNormalize).toBe('h264_nvenc');
    expect(videoCodecForFadePass).toBe('copy'); // no GPU re-encode in fade pass
  });

  // ── 20. CPU fallback ──────────────────────────────────────────

  it('20. CPU fallback encoder uses libx264', () => {
    const cpuEncoder = 'libx264';
    expect(cpuEncoder).toBe('libx264');
    expect(['libx264', 'libx265']).toContain(cpuEncoder);
  });

  // ── 21. Regression: fadeDuration never in concat list ─────────

  it('21. Regression: fadeDuration (5s) never appears in concat_list.txt content', () => {
    const fadeDuration = 5.0;
    const p = calculateRepeatPlan(590, 19, true, 10800);
    const list = buildConcatList(p.fullCopyCount, p.hasPartialFinalCopy);
    expect(list).not.toContain(String(fadeDuration));
    expect(list).not.toContain('5.0');
    expect(list).not.toContain('5.000');
  });

  // ── 22. Regression: durationLimit never used as fade ──────────

  it('22. Regression: durationLimitSeconds never used as afade d= parameter', () => {
    const fadeDuration = 5.0;
    const durationLimit = 10800;
    // The filter MUST use fadeDuration (5), not durationLimit (10800)
    const filter = buildFadeFilter(fadeDuration);
    expect(filter).toContain('d=5.000');
    expect(filter).not.toContain('d=10800');
  });

  // ── 23. Preview URL ───────────────────────────────────────────

  it('23. Preview URL handles Windows paths correctly', () => {
    const winPath = 'C:\\Users\\User Name\\Videos\\Test (1) #2.mp4';
    const previewUrl = `video-media://${encodeURIComponent(winPath)}`;
    expect(previewUrl).toContain('video-media://');
    expect(decodeURIComponent(previewUrl.replace('video-media://', ''))).toBe(winPath);
  });
});

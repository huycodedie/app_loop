/**
 * RepeatPlan — centralized duration calculation for Video Repeat Studio.
 *
 * Supports two Duration Modes:
 *   - 'EXACT': Video output exactly matches target duration. Final copy is trimmed if necessary.
 *   - 'MINIMUM': Video output reaches or exceeds target duration without trimming final copy.
 *                Includes optional maxOvershootSeconds protection (falls back to EXACT if overshoot > maxOvershoot).
 */

export type DurationMode = 'EXACT' | 'MINIMUM';

export interface RepeatPlan {
  /** Duration of the source video in seconds. */
  sourceDurationSeconds: number;

  /** Requested target duration in seconds (null when limit is OFF). */
  targetDurationSeconds: number | null;

  /** Duration mode: 'EXACT' | 'MINIMUM' */
  durationMode: DurationMode;

  /** Manual repeat count specified by user (used when limit is OFF). */
  requestedRepeatCount: number;

  /** Authoritative calculated repeat count required. */
  repeatCount: number;
  effectiveRepeatCount: number;

  /** Maximum extra duration allowed for MINIMUM mode in seconds. */
  maxOvershootSeconds?: number | null;

  /** Number of complete source video copies to include */
  fullCopyCount: number;

  /** Duration of the partial final copy in seconds */
  partialCopyDurationSeconds: number;

  /** True when partial final copy is needed. */
  hasPartialFinalCopy: boolean;

  /** Expected final output duration in seconds. */
  expectedFinalDurationSeconds: number;
  effectiveDurationSeconds: number;

  /** Natural duration before partial trimming = sourceDuration × effectiveRepeatCount */
  naturalDurationSeconds: number;

  /** Extra overshoot duration in seconds: expectedFinalDuration - targetDuration (0 for EXACT). */
  overshootSeconds: number;

  /** True if MINIMUM mode fallback to EXACT occurred due to maxOvershootSeconds threshold. */
  fallbackToExact?: boolean;

  /** Whether target duration limit is active. */
  durationLimitEnabled: boolean;

  /** @deprecated Kept for backward compatibility */
  requestedLimitSeconds: number | null;
  /** @deprecated Kept for backward compatibility */
  naturalFitsWithinLimit: boolean;
}

const PARTIAL_THRESHOLD_SECONDS = 0.04; // ~1 frame at 25fps

export function calculateRepeatPlan(
  sourceDurationSeconds: number,
  requestedRepeatCount: number,
  durationLimitEnabled: boolean,
  requestedLimitSeconds: number | null,
  durationMode: DurationMode = 'EXACT',
  maxOvershootSeconds: number | null = null
): RepeatPlan {
  const manualCount = Math.max(1, requestedRepeatCount || 1);
  const mode: DurationMode = durationMode || 'EXACT';

  if (!durationLimitEnabled || requestedLimitSeconds === null || requestedLimitSeconds <= 0) {
    // ─── DURATION LIMIT OFF ───────────────────────────────────────────
    const effectiveRepeatCount = manualCount;
    const naturalDurationSeconds = sourceDurationSeconds * effectiveRepeatCount;
    const effectiveDurationSeconds = naturalDurationSeconds;
    const fullCopyCount = sourceDurationSeconds > 0 ? effectiveRepeatCount : manualCount;
    const partialCopyDurationSeconds = 0;
    const hasPartialFinalCopy = false;

    return {
      sourceDurationSeconds,
      targetDurationSeconds: null,
      durationMode: mode,
      requestedRepeatCount: manualCount,
      repeatCount: effectiveRepeatCount,
      effectiveRepeatCount,
      maxOvershootSeconds,
      naturalDurationSeconds,
      durationLimitEnabled: false,
      requestedLimitSeconds: null,
      effectiveDurationSeconds,
      expectedFinalDurationSeconds: effectiveDurationSeconds,
      fullCopyCount,
      partialCopyDurationSeconds,
      hasPartialFinalCopy,
      overshootSeconds: 0,
      fallbackToExact: false,
      naturalFitsWithinLimit: true,
    };
  }

  // ─── DURATION LIMIT / TARGET ON ─────────────────────────────────────
  const targetSec = requestedLimitSeconds;

  if (sourceDurationSeconds <= 0) {
    // Unknown or invalid source duration fallback
    return {
      sourceDurationSeconds: 0,
      targetDurationSeconds: targetSec,
      durationMode: mode,
      requestedRepeatCount: manualCount,
      repeatCount: 1,
      effectiveRepeatCount: 1,
      maxOvershootSeconds,
      naturalDurationSeconds: 0,
      durationLimitEnabled: true,
      requestedLimitSeconds: targetSec,
      effectiveDurationSeconds: targetSec,
      expectedFinalDurationSeconds: targetSec,
      fullCopyCount: 1,
      partialCopyDurationSeconds: 0,
      hasPartialFinalCopy: false,
      overshootSeconds: 0,
      fallbackToExact: false,
      naturalFitsWithinLimit: false,
    };
  }

  const requiredRepeats = Math.ceil(targetSec / sourceDurationSeconds);

  if (mode === 'MINIMUM') {
    const fullRepeatsDuration = requiredRepeats * sourceDurationSeconds;
    const fullOvershoot = Math.max(0, fullRepeatsDuration - targetSec);

    // Check Maximum Overshoot Protection
    if (
      maxOvershootSeconds !== null &&
      maxOvershootSeconds !== undefined &&
      maxOvershootSeconds >= 0 &&
      fullOvershoot > maxOvershootSeconds + PARTIAL_THRESHOLD_SECONDS
    ) {
      // Fallback to EXACT mode because overshoot exceeds threshold!
      const exactFullCopyCount = Math.floor(targetSec / sourceDurationSeconds);
      const rawPartial = targetSec - exactFullCopyCount * sourceDurationSeconds;
      const partialCopyDurationSeconds = Math.max(0, rawPartial);
      const hasPartialFinalCopy = partialCopyDurationSeconds > PARTIAL_THRESHOLD_SECONDS;

      return {
        sourceDurationSeconds,
        targetDurationSeconds: targetSec,
        durationMode: 'MINIMUM',
        requestedRepeatCount: manualCount,
        repeatCount: requiredRepeats,
        effectiveRepeatCount: requiredRepeats,
        maxOvershootSeconds,
        naturalDurationSeconds: sourceDurationSeconds * requiredRepeats,
        durationLimitEnabled: true,
        requestedLimitSeconds: targetSec,
        effectiveDurationSeconds: targetSec,
        expectedFinalDurationSeconds: targetSec,
        fullCopyCount: exactFullCopyCount,
        partialCopyDurationSeconds,
        hasPartialFinalCopy,
        overshootSeconds: 0,
        fallbackToExact: true,
        naturalFitsWithinLimit: true,
      };
    }

    // Standard MINIMUM mode (no trimming, complete repeats)
    return {
      sourceDurationSeconds,
      targetDurationSeconds: targetSec,
      durationMode: 'MINIMUM',
      requestedRepeatCount: manualCount,
      repeatCount: requiredRepeats,
      effectiveRepeatCount: requiredRepeats,
      maxOvershootSeconds,
      naturalDurationSeconds: fullRepeatsDuration,
      durationLimitEnabled: true,
      requestedLimitSeconds: targetSec,
      effectiveDurationSeconds: fullRepeatsDuration,
      expectedFinalDurationSeconds: fullRepeatsDuration,
      fullCopyCount: requiredRepeats,
      partialCopyDurationSeconds: 0,
      hasPartialFinalCopy: false,
      overshootSeconds: fullOvershoot,
      fallbackToExact: false,
      naturalFitsWithinLimit: fullRepeatsDuration <= targetSec,
    };
  }

  // ─── EXACT MODE ──────────────────────────────────────────────────────
  const fullCopyCount = Math.floor(targetSec / sourceDurationSeconds);
  const rawPartial = targetSec - fullCopyCount * sourceDurationSeconds;
  const partialCopyDurationSeconds = Math.max(0, rawPartial);
  const hasPartialFinalCopy = partialCopyDurationSeconds > PARTIAL_THRESHOLD_SECONDS;
  const naturalDurationSeconds = sourceDurationSeconds * requiredRepeats;

  return {
    sourceDurationSeconds,
    targetDurationSeconds: targetSec,
    durationMode: 'EXACT',
    requestedRepeatCount: manualCount,
    repeatCount: requiredRepeats,
    effectiveRepeatCount: requiredRepeats,
    maxOvershootSeconds,
    naturalDurationSeconds,
    durationLimitEnabled: true,
    requestedLimitSeconds: targetSec,
    effectiveDurationSeconds: targetSec,
    expectedFinalDurationSeconds: targetSec,
    fullCopyCount,
    partialCopyDurationSeconds,
    hasPartialFinalCopy,
    overshootSeconds: 0,
    fallbackToExact: false,
    naturalFitsWithinLimit: naturalDurationSeconds <= targetSec,
  };
}

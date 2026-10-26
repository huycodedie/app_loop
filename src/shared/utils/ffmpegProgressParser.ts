/**
 * FFmpegProgressParser
 *
 * Centralized parser for FFmpeg `-progress pipe:1 -nostats` key=value output.
 *
 * FFmpeg emits blocks like:
 *   frame=12345\n
 *   fps=85.40\n
 *   stream_0_0_q=28.0\n
 *   bitrate=  400.0kbits/s\n
 *   total_size=60000000\n
 *   out_time_us=621400000\n
 *   out_time_ms=621400\n
 *   out_time=00:10:21.400000\n
 *   dup_frames=0\n
 *   drop_frames=0\n
 *   speed=2.81x\n
 *   progress=continue\n
 *
 * Unit rules (CRITICAL — historically misunderstood):
 *   out_time_us  → MICROSECONDS  → divide by 1_000_000 to get seconds
 *   out_time_ms  → MICROSECONDS  → divide by 1_000_000 to get seconds
 *                  (Despite the "_ms" suffix, FFmpeg actually outputs microseconds here!)
 *   out_time     → HH:MM:SS.ffffff string → parse directly to seconds
 *
 * This parser always prefers `out_time` (string) first, then falls back to
 * `out_time_us`, then `out_time_ms` — all interpreted as microseconds.
 *
 * Reference: https://ffmpeg.org/ffmpeg.html#toc-Main-options (-progress)
 */

import { ParsedFFmpegProgress } from '../types/progress';

/**
 * Parse a raw chunk of FFmpeg stdout (may contain multiple key=value lines).
 * Returns null if no meaningful data can be extracted.
 */
export function parseFFmpegProgressChunk(raw: string): ParsedFFmpegProgress | null {
  if (!raw || typeof raw !== 'string') return null;

  const lines = raw.split('\n');
  const kv: Record<string, string> = {};

  for (const line of lines) {
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim();
    if (key) {
      kv[key] = value;
    }
  }

  if (Object.keys(kv).length === 0) return null;

  return {
    processedSeconds: extractProcessedSeconds(kv),
    frame: extractFrame(kv),
    fps: extractFps(kv),
    speed: extractSpeed(kv),
    progressStatus: extractProgressStatus(kv),
  };
}

/**
 * Extract processed media time in seconds.
 * Priority: out_time (string) > out_time_us > out_time_ms
 */
function extractProcessedSeconds(kv: Record<string, string>): number | null {
  // 1. Prefer human-readable timestamp: "00:10:21.400000"
  if (kv['out_time'] && kv['out_time'] !== 'N/A') {
    const parsed = parseTimestamp(kv['out_time']);
    if (parsed !== null && parsed >= 0) return parsed;
  }

  // 2. Fall back to out_time_us (microseconds despite "_us" suffix)
  if (kv['out_time_us'] && kv['out_time_us'] !== 'N/A') {
    const us = parseInt(kv['out_time_us'], 10);
    if (!isNaN(us) && us >= 0) return us / 1_000_000;
  }

  // 3. Fall back to out_time_ms (also microseconds — FFmpeg naming is misleading)
  if (kv['out_time_ms'] && kv['out_time_ms'] !== 'N/A') {
    const us = parseInt(kv['out_time_ms'], 10);
    if (!isNaN(us) && us >= 0) return us / 1_000_000;
  }

  return null;
}

/**
 * Parse FFmpeg HH:MM:SS.ffffff timestamp to seconds.
 * Returns null on parse failure.
 */
export function parseTimestamp(ts: string): number | null {
  if (!ts || typeof ts !== 'string') return null;
  const trimmed = ts.trim();
  if (trimmed === 'N/A' || trimmed === '') return null;

  // HH:MM:SS.ffffff
  const match = trimmed.match(/^(-?\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/);
  if (match) {
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    const s = parseFloat(match[3]);
    if (!isNaN(h) && !isNaN(m) && !isNaN(s)) {
      const sign = h < 0 ? -1 : 1;
      return sign * (Math.abs(h) * 3600 + m * 60 + s);
    }
  }

  // Plain numeric fallback
  const n = parseFloat(trimmed);
  return isNaN(n) ? null : n;
}

function extractFrame(kv: Record<string, string>): number | null {
  const v = kv['frame'];
  if (!v || v === 'N/A') return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

function extractFps(kv: Record<string, string>): number | null {
  const v = kv['fps'];
  if (!v || v === 'N/A') return null;
  const n = parseFloat(v);
  return isNaN(n) || n <= 0 ? null : n;
}

/**
 * Parse FFmpeg speed string like "2.81x" or "N/A".
 * Returns numeric multiplier or null.
 */
export function parseSpeed(raw: string): number | null {
  if (!raw || raw === 'N/A') return null;
  // Strip trailing "x"
  const cleaned = raw.replace(/x$/i, '').trim();
  const n = parseFloat(cleaned);
  return isNaN(n) || n <= 0 ? null : n;
}

function extractSpeed(kv: Record<string, string>): number | null {
  const v = kv['speed'];
  if (!v) return null;
  return parseSpeed(v);
}

function extractProgressStatus(kv: Record<string, string>): 'continue' | 'end' | null {
  const v = kv['progress'];
  if (v === 'continue') return 'continue';
  if (v === 'end') return 'end';
  return null;
}

/**
 * Calculate stage progress (0–100) from processedSeconds / expectedSeconds.
 * Clamps to [0, 100]. Returns 0 if inputs are invalid.
 */
export function calcStageProgress(processedSeconds: number, expectedSeconds: number): number {
  if (!expectedSeconds || expectedSeconds <= 0 || processedSeconds < 0) return 0;
  return Math.min(100, Math.max(0, (processedSeconds / expectedSeconds) * 100));
}

/**
 * Calculate overall job progress (0–99) using work-unit weighting.
 *
 * @param completedWorkSeconds  Sum of expectedSeconds for all completed stages.
 * @param currentProcessedSeconds  Processed seconds in the current stage.
 * @param totalWorkSeconds  Sum of ALL expectedSeconds across all stages.
 * @returns 0–99 (never reaches 100 — caller sets 100 only after validation)
 */
export function calcOverallProgress(
  completedWorkSeconds: number,
  currentProcessedSeconds: number,
  totalWorkSeconds: number
): number {
  if (!totalWorkSeconds || totalWorkSeconds <= 0) return 0;
  const ratio = (completedWorkSeconds + currentProcessedSeconds) / totalWorkSeconds;
  // Map 0–1 to 0–99 (reserve 100 for confirmed completion)
  return Math.min(99, Math.max(0, Math.round(ratio * 99)));
}

/**
 * Exponential Moving Average for ETA smoothing.
 * alpha controls smoothing factor (0 < alpha < 1; lower = smoother).
 */
export class ETASmoothing {
  private smoothedEta: number | null = null;
  private readonly alpha: number;

  constructor(alpha = 0.2) {
    this.alpha = alpha;
  }

  /**
   * Update with a new raw ETA estimate and return the smoothed value.
   */
  update(rawEtaSeconds: number): number {
    if (this.smoothedEta === null) {
      this.smoothedEta = rawEtaSeconds;
    } else {
      this.smoothedEta = this.alpha * rawEtaSeconds + (1 - this.alpha) * this.smoothedEta;
    }
    return this.smoothedEta;
  }

  reset(): void {
    this.smoothedEta = null;
  }

  get current(): number | null {
    return this.smoothedEta;
  }
}

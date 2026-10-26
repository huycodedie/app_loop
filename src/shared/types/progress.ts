import { JobStage } from './index';

/**
 * Full real-time progress snapshot for a single processing job.
 * Emitted by VideoEngine → QueueService → IPC → Renderer.
 *
 * Units:
 *   - All progress values: 0–100 (never 0–1).
 *   - All durations: seconds (number).
 *   - updatedAt: Unix epoch milliseconds.
 */
export interface ProcessingProgress {
  /** Job this update belongs to. Always present. */
  jobId: string;

  /** Current processing stage. */
  stage: JobStage;

  /**
   * Progress within the current stage only (0–100).
   * Resets to 0 on each stage transition.
   */
  stageProgress: number;

  /**
   * Overall job progress (0–100).
   * Monotonically non-decreasing.
   * Held at 99 during VERIFYING/FINALIZING.
   * Set to 100 only after output validation succeeds.
   */
  overallProgress: number;

  /**
   * Amount of media time processed so far in the current stage (seconds).
   */
  processedSeconds: number;

  /**
   * Expected total output duration of the final file (seconds).
   * Derived from RepeatPlan.effectiveDurationSeconds.
   */
  expectedOutputDurationSeconds: number;

  /** Video frame counter from FFmpeg (null if unavailable). */
  frame: number | null;

  /** Encoding FPS from FFmpeg (null for stream-copy or unavailable). */
  fps: number | null;

  /** Processing speed multiplier, e.g. 2.81 (null if unavailable or N/A). */
  speed: number | null;

  /** Wall-clock seconds elapsed since job started processing. */
  elapsedSeconds: number;

  /**
   * Estimated seconds remaining for the entire job (null if not calculable).
   * Smoothed with an exponential moving average.
   */
  estimatedRemainingSeconds: number | null;

  /** Unix epoch ms when this update was produced. */
  updatedAt: number;
}

/**
 * Parsed output of a single FFmpeg -progress pipe:1 key=value block.
 * All fields are optional since FFmpeg may omit keys depending on codec/mode.
 */
export interface ParsedFFmpegProgress {
  /** Processed media time in seconds. Derived from out_time > out_time_ms > out_time_us. */
  processedSeconds: number | null;
  frame: number | null;
  fps: number | null;
  /** Numeric speed multiplier. Null when "N/A". */
  speed: number | null;
  /** "continue" or "end" */
  progressStatus: 'continue' | 'end' | null;
}

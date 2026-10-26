import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { FFmpegManager } from './FFmpegManager';
import { FFprobeService } from './FFprobeService';
import { GpuManager } from '../gpu/GpuManager';
import { TempFileManager } from '../services/TempFileManager';
import { RepeatJobConfig, JobStage, MediaInfo, EncoderType } from '@shared/types';
import { ProcessingProgress } from '@shared/types/progress';
import { calculateRepeatPlan } from '@shared/utils/repeatPlan';
import {
  parseFFmpegProgressChunk,
  calcStageProgress,
  calcOverallProgress,
  ETASmoothing,
} from '@shared/utils/ffmpegProgressParser';
import { AppError } from '@shared/errors';
import { logger } from '../services/Logger';

export type ProgressCallback = (data: ProcessingProgress) => void;

/**
 * Describes the media-work a single FFmpeg stage is expected to perform.
 * Used for weighted overall progress calculation.
 */
interface StageWorkUnit {
  stage: JobStage;
  expectedSeconds: number;
}

/**
 * VideoEngine — Two-pass (+ optional partial-segment) architecture.
 *
 * ─────────────────────────────────────────────────────────────────
 * PASS A1 — PREPARING_FULL_SOURCE
 *   Normalize source once → source_normalized.mp4
 *   (selected encoder + AAC audio, NO audio filter)
 *
 * PASS A2 — BUILDING_PARTIAL_END (only when hasPartialFinalCopy)
 *   Trim source_normalized.mp4 with -t <partialDuration>
 *   → partial_copy.mp4
 *   Re-encode required for frame-accurate trim at non-keyframe boundary.
 *
 * PASS A3 — BUILDING_REPEAT_SEQUENCE
 *   Write concat_list.txt:
 *     source_normalized.mp4  × fullCopyCount
 *     partial_copy.mp4       × 0 or 1
 *   Concat with -c copy → repeated_without_fade.mp4
 *
 * PASS B — APPLYING_AUDIO_FADE (only when requiresFade)
 *   -c:v copy (video untouched)
 *   filter_complex "[0:a:0]afade=t=in:st=0:d=<N>:curve=qsin[aout]"
 *   -c:a aac → final_output.mp4
 *
 * ─────────────────────────────────────────────────────────────────
 * PROGRESS MODEL
 *   Overall progress (0–99) is weighted by expected media-seconds processed.
 *   Held at 99 during VERIFYING/FINALIZING.
 *   Set to 100 only after final output validation + file move succeed.
 *   Progress never moves backward within a job.
 * ─────────────────────────────────────────────────────────────────
 * CRITICAL INVARIANTS:
 *   - fadeDuration is NEVER a split point, trim point, or concat entry.
 *   - durationLimitSeconds only appears in calculateRepeatPlan.
 *   - partial_copy.mp4 is trimmed by -t <partialCopyDurationSeconds>,
 *     which is derived from durationLimitSeconds, NOT fadeDuration.
 *   - -c:a copy is NEVER used when an audio filter is active.
 * ─────────────────────────────────────────────────────────────────
 */
export class VideoEngine {
  private activeProcesses: Map<string, ChildProcess> = new Map();
  private activeJobs = new Set<string>();
  private cancelledJobs = new Set<string>();

  constructor(
    private ffmpegManager: FFmpegManager,
    private ffprobeService: FFprobeService,
    private gpuManager: GpuManager,
    private tempFileManager: TempFileManager
  ) {}

  public async processVideo(
    jobId: string,
    config: RepeatJobConfig,
    onProgress?: ProgressCallback
  ): Promise<string> {
    const tempDir = this.tempFileManager.createJobDirectory(jobId);
    this.activeJobs.add(jobId);
    this.cancelledJobs.delete(jobId);
    const jobStartedAt = Date.now();
    // Monotonic guard — never allow overall progress to decrease
    let lastOverallProgress = 0;
    const etaSmoothing = new ETASmoothing(0.2);

    /**
     * Emit a progress update. Enforces monotonic overall progress.
     */
    const emitProgress = (partial: Omit<ProcessingProgress, 'jobId' | 'updatedAt'>): void => {
      if (this.cancelledJobs.has(jobId)) return;
      const clamped = Math.max(lastOverallProgress, partial.overallProgress);
      lastOverallProgress = clamped;
      onProgress?.({
        ...partial,
        jobId,
        overallProgress: clamped,
        elapsedSeconds: (Date.now() - jobStartedAt) / 1000,
        updatedAt: Date.now(),
      });
    };

    try {
      // ──────────────────────────────────────────────────────────────
      // STAGE 1 — ANALYZING
      // ──────────────────────────────────────────────────────────────
      emitProgress({
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
      });

      const mediaInfo = await this.ffprobeService.probeMedia(config.inputPath);
      this.throwIfCancelled(jobId);

      // ──────────────────────────────────────────────────────────────
      // 1. FFprobe Pre-Validation (Requirement 1)
      // ──────────────────────────────────────────────────────────────
      if (!mediaInfo.videoStreams || mediaInfo.videoStreams.length === 0 || mediaInfo.duration <= 0) {
        logger.error('FFMPEG', `Pre-validation failed for "${mediaInfo.fileName}": No valid video stream or duration <= 0`);
        throw new AppError('UNSUPPORTED_MEDIA', 'File không có luồng video hợp lệ');
      }

      const vStream = mediaInfo.videoStreams[0];
      if (!vStream || vStream.width <= 0 || vStream.height <= 0) {
        logger.error('FFMPEG', `Pre-validation failed for "${mediaInfo.fileName}": Invalid resolution ${vStream?.width}x${vStream?.height}`);
        throw new AppError('UNSUPPORTED_MEDIA', 'File không có luồng video hợp lệ');
      }

      logger.info(
        'FFMPEG',
        `Job ${jobId} | Source: "${mediaInfo.fileName}" | Duration: ${mediaInfo.duration.toFixed(3)}s | Video: ${vStream.codecName} (${vStream.pixFmt}, ${vStream.width}x${vStream.height}) | hasAudio: ${mediaInfo.hasAudio}`
      );

      if (!config.durationLimitEnabled && (!config.repeatCount || config.repeatCount < 1)) {
        throw new AppError('INVALID_INPUT', 'Số lần lặp phải lớn hơn hoặc bằng 1.');
      }

      emitProgress({
        stage: 'CALCULATING_REPEAT_PLAN',
        stageProgress: 0,
        overallProgress: 1,
        processedSeconds: 0,
        expectedOutputDurationSeconds: 0,
        frame: null,
        fps: null,
        speed: null,
        elapsedSeconds: 0,
        estimatedRemainingSeconds: null,
      });

      const plan = calculateRepeatPlan(
        mediaInfo.duration,
        config.repeatCount,
        config.durationLimitEnabled ?? false,
        config.durationLimitSeconds ?? null,
        config.durationMode ?? 'EXACT',
        config.maxOvershootSeconds ?? null
      );

      logger.info(
        'FFMPEG',
        `Job ${jobId} | RepeatPlan: natural=${plan.naturalDurationSeconds.toFixed(3)}s | effective=${plan.effectiveDurationSeconds.toFixed(3)}s | fullCopies=${plan.fullCopyCount} | partial=${plan.partialCopyDurationSeconds.toFixed(3)}s`
      );

      if (plan.fullCopyCount < 1 && !plan.hasPartialFinalCopy) {
        throw new AppError(
          'INVALID_INPUT',
          'Giới hạn thời lượng quá ngắn để tạo ít nhất một khung hình đầu ra.'
        );
      }

      const requiresFade =
        config.audioFadeInEnabled &&
        mediaInfo.hasAudio &&
        (config.audioFadeInDurationSeconds ?? 0) > 0;

      if (requiresFade) {
        const fadeSec = config.audioFadeInDurationSeconds ?? 0;
        if (fadeSec < 0 || fadeSec > mediaInfo.duration) {
          throw new AppError(
            'INVALID_INPUT',
            `Thời lượng tăng âm (${fadeSec}s) phải nằm trong khoảng 0–${mediaInfo.duration.toFixed(1)}s.`
          );
        }
      }

      // ──────────────────────────────────────────────────────────────
      // Build WorkPlan — all FFmpeg stages that process media
      // Used for weighted overall progress calculation.
      // ──────────────────────────────────────────────────────────────
      const workPlan: StageWorkUnit[] = [
        { stage: 'PREPARING_FULL_SOURCE', expectedSeconds: mediaInfo.duration },
      ];
      if (plan.hasPartialFinalCopy) {
        workPlan.push({ stage: 'BUILDING_PARTIAL_END', expectedSeconds: plan.partialCopyDurationSeconds });
      }
      workPlan.push({ stage: 'BUILDING_REPEAT_SEQUENCE', expectedSeconds: plan.effectiveDurationSeconds });
      if (requiresFade) {
        workPlan.push({ stage: 'APPLYING_AUDIO_FADE', expectedSeconds: plan.effectiveDurationSeconds });
      }

      const totalWorkSeconds = workPlan.reduce((s, u) => s + u.expectedSeconds, 0);
      const effectiveDuration = plan.effectiveDurationSeconds;

      /**
       * Given the current stage and processed seconds within that stage,
       * calculate overall progress (0–99).
       */
      const calcOverall = (currentStage: JobStage, processedInStage: number): number => {
        let completedWork = 0;
        for (const unit of workPlan) {
          if (unit.stage === currentStage) break;
          completedWork += unit.expectedSeconds;
        }
        return calcOverallProgress(completedWork, processedInStage, totalWorkSeconds);
      };

      // ──────────────────────────────────────────────────────────────
      // STAGE 3 — PREPARING
      // ──────────────────────────────────────────────────────────────
      emitProgress({
        stage: 'PREPARING',
        stageProgress: 0,
        overallProgress: 2,
        processedSeconds: 0,
        expectedOutputDurationSeconds: effectiveDuration,
        frame: null,
        fps: null,
        speed: null,
        elapsedSeconds: 0,
        estimatedRemainingSeconds: null,
      });

      const selectedEncoder = await this.gpuManager.getEncoderForMode(
        config.gpuMode,
        config.encoder
      );
      this.throwIfCancelled(jobId);

      console.log(`[VideoEngine][${jobId}] Requested Encoder: ${selectedEncoder}`);

      const normalizedSourcePath = path.join(tempDir, 'source_normalized.mp4');
      const partialCopyPath      = path.join(tempDir, 'partial_copy.mp4');
      const repeatedPath         = path.join(tempDir, 'repeated_without_fade.mp4');
      const concatListPath       = path.join(tempDir, 'concat_list.txt');
      const finalTempOutput      = path.join(tempDir, 'final_output.mp4');

      // ──────────────────────────────────────────────────────────────
      // PASS A1 — PREPARING_FULL_SOURCE
      // ──────────────────────────────────────────────────────────────
      emitProgress({
        stage: 'PREPARING_FULL_SOURCE',
        stageProgress: 0,
        overallProgress: calcOverall('PREPARING_FULL_SOURCE', 0),
        processedSeconds: 0,
        expectedOutputDurationSeconds: effectiveDuration,
        frame: null,
        fps: null,
        speed: null,
        elapsedSeconds: 0,
        estimatedRemainingSeconds: null,
      });

      const normResult = await this.normalizeSource(
        jobId,
        config.inputPath,
        normalizedSourcePath,
        selectedEncoder,
        mediaInfo,
        (parsed, processedSec) => {
          const sp = calcStageProgress(processedSec, mediaInfo.duration);
          const overall = calcOverall('PREPARING_FULL_SOURCE', processedSec);
          const remainingWork = totalWorkSeconds - (processedSec);
          const eta = parsed.speed && parsed.speed > 0
            ? etaSmoothing.update(remainingWork / parsed.speed)
            : etaSmoothing.current;
          emitProgress({
            stage: 'PREPARING_FULL_SOURCE',
            stageProgress: sp,
            overallProgress: overall,
            processedSeconds: processedSec,
            expectedOutputDurationSeconds: effectiveDuration,
            frame: parsed.frame,
            fps: parsed.fps,
            speed: parsed.speed,
            elapsedSeconds: 0,
            estimatedRemainingSeconds: eta,
          });
        },
        plan.hasPartialFinalCopy
      );

      // Use the actual encoder that succeeded during normalization (NVENC or CPU)
      const effectiveEncoder = normResult.encoderUsed as EncoderType;

      // ──────────────────────────────────────────────────────────────
      // PASS A2 — BUILDING_PARTIAL_END (only if hasPartialFinalCopy)
      // ──────────────────────────────────────────────────────────────
      if (plan.hasPartialFinalCopy) {
        emitProgress({
          stage: 'BUILDING_PARTIAL_END',
          stageProgress: 0,
          overallProgress: calcOverall('BUILDING_PARTIAL_END', 0),
          processedSeconds: 0,
          expectedOutputDurationSeconds: effectiveDuration,
          frame: null,
          fps: null,
          speed: null,
          elapsedSeconds: 0,
          estimatedRemainingSeconds: null,
        });

        await this.buildPartialCopy(
          jobId,
          normalizedSourcePath,
          partialCopyPath,
          plan.partialCopyDurationSeconds,
          effectiveEncoder,
          mediaInfo,
          (parsed, processedSec) => {
            const sp = calcStageProgress(processedSec, plan.partialCopyDurationSeconds);
            const overall = calcOverall('BUILDING_PARTIAL_END', processedSec);
            emitProgress({
              stage: 'BUILDING_PARTIAL_END',
              stageProgress: sp,
              overallProgress: overall,
              processedSeconds: processedSec,
              expectedOutputDurationSeconds: effectiveDuration,
              frame: parsed.frame,
              fps: parsed.fps,
              speed: parsed.speed,
              elapsedSeconds: 0,
              estimatedRemainingSeconds: etaSmoothing.current,
            });
          }
        );
      }

      // ──────────────────────────────────────────────────────────────
      // PASS A3 — BUILDING_REPEAT_SEQUENCE
      // ──────────────────────────────────────────────────────────────
      emitProgress({
        stage: 'BUILDING_REPEAT_SEQUENCE',
        stageProgress: 0,
        overallProgress: calcOverall('BUILDING_REPEAT_SEQUENCE', 0),
        processedSeconds: 0,
        expectedOutputDurationSeconds: effectiveDuration,
        frame: null,
        fps: null,
        speed: null,
        elapsedSeconds: 0,
        estimatedRemainingSeconds: null,
      });

      let concatContent = '';
      for (let i = 0; i < plan.fullCopyCount; i++) {
        concatContent += `file 'source_normalized.mp4'\n`;
      }
      if (plan.hasPartialFinalCopy) {
        concatContent += `file 'partial_copy.mp4'\n`;
      }
      fs.writeFileSync(concatListPath, concatContent, 'utf8');

      console.log(`[VideoEngine][${jobId}] concat_list.txt:\n${concatContent}`);

      await this.concatSegments(
        jobId,
        concatListPath,
        repeatedPath,
        tempDir,
        effectiveDuration,
        (parsed, processedSec) => {
          const sp = calcStageProgress(processedSec, effectiveDuration);
          const overall = calcOverall('BUILDING_REPEAT_SEQUENCE', processedSec);
          const remainingWork = totalWorkSeconds - (workPlan
            .slice(0, workPlan.findIndex(u => u.stage === 'BUILDING_REPEAT_SEQUENCE'))
            .reduce((s, u) => s + u.expectedSeconds, 0) + processedSec);
          const eta = parsed.speed && parsed.speed > 0
            ? etaSmoothing.update(remainingWork / parsed.speed)
            : etaSmoothing.current;
          emitProgress({
            stage: 'BUILDING_REPEAT_SEQUENCE',
            stageProgress: sp,
            overallProgress: overall,
            processedSeconds: processedSec,
            expectedOutputDurationSeconds: effectiveDuration,
            frame: parsed.frame,
            fps: parsed.fps,
            speed: parsed.speed,
            elapsedSeconds: 0,
            estimatedRemainingSeconds: eta,
          });
        }
      );

      // ──────────────────────────────────────────────────────────────
      // VERIFYING_REPEAT_SEQUENCE
      // ──────────────────────────────────────────────────────────────
      emitProgress({
        stage: 'VERIFYING_REPEAT_SEQUENCE',
        stageProgress: 0,
        overallProgress: requiresFade ? calcOverall('APPLYING_AUDIO_FADE', 0) : 99,
        processedSeconds: effectiveDuration,
        expectedOutputDurationSeconds: effectiveDuration,
        frame: null,
        fps: null,
        speed: null,
        elapsedSeconds: 0,
        estimatedRemainingSeconds: null,
      });
      await this.verifyOutput(repeatedPath, effectiveDuration, mediaInfo.hasAudio);
      this.throwIfCancelled(jobId);

      // ──────────────────────────────────────────────────────────────
      // PASS B — APPLYING_AUDIO_FADE (only if requiresFade)
      // ──────────────────────────────────────────────────────────────
      if (requiresFade) {
        emitProgress({
          stage: 'APPLYING_AUDIO_FADE',
          stageProgress: 0,
          overallProgress: calcOverall('APPLYING_AUDIO_FADE', 0),
          processedSeconds: 0,
          expectedOutputDurationSeconds: effectiveDuration,
          frame: null,
          fps: null,
          speed: null,
          elapsedSeconds: 0,
          estimatedRemainingSeconds: null,
        });

        await this.applyAudioFade(
          jobId,
          repeatedPath,
          finalTempOutput,
          config.audioFadeInDurationSeconds!,
          effectiveDuration,
          (parsed, processedSec) => {
            const sp = calcStageProgress(processedSec, effectiveDuration);
            const overall = calcOverall('APPLYING_AUDIO_FADE', processedSec);
            const eta = parsed.speed && parsed.speed > 0
              ? etaSmoothing.update((effectiveDuration - processedSec) / parsed.speed)
              : etaSmoothing.current;
            emitProgress({
              stage: 'APPLYING_AUDIO_FADE',
              stageProgress: sp,
              overallProgress: overall,
              processedSeconds: processedSec,
              expectedOutputDurationSeconds: effectiveDuration,
              frame: parsed.frame,
              fps: parsed.fps,
              speed: parsed.speed,
              elapsedSeconds: 0,
              estimatedRemainingSeconds: eta,
            });
          }
        );
      } else {
        // No fade pass needed — copy repeated file directly.
        fs.copyFileSync(repeatedPath, finalTempOutput);
      }

      // ──────────────────────────────────────────────────────────────
      // VERIFYING_FINAL_OUTPUT — hold at 99%
      // ──────────────────────────────────────────────────────────────
      emitProgress({
        stage: 'VERIFYING_FINAL_OUTPUT',
        stageProgress: 0,
        overallProgress: 99,
        processedSeconds: effectiveDuration,
        expectedOutputDurationSeconds: effectiveDuration,
        frame: null,
        fps: null,
        speed: null,
        elapsedSeconds: 0,
        estimatedRemainingSeconds: null,
      });
      await this.verifyOutput(finalTempOutput, effectiveDuration, mediaInfo.hasAudio);
      this.throwIfCancelled(jobId);

      // ──────────────────────────────────────────────────────────────
      // FINALIZING — still 99%
      // ──────────────────────────────────────────────────────────────
      emitProgress({
        stage: 'FINALIZING',
        stageProgress: 0,
        overallProgress: 99,
        processedSeconds: effectiveDuration,
        expectedOutputDurationSeconds: effectiveDuration,
        frame: null,
        fps: null,
        speed: null,
        elapsedSeconds: 0,
        estimatedRemainingSeconds: 0,
      });

      const finalOutputPath = this.resolveOutputPath(config, mediaInfo.fileName, plan);
      fs.mkdirSync(path.dirname(finalOutputPath), { recursive: true });
      fs.copyFileSync(finalTempOutput, finalOutputPath);

      console.log(`[VideoEngine][${jobId}] Output → ${finalOutputPath}`);

      // ──────────────────────────────────────────────────────────────
      // CLEANING — set exactly 100% after success
      // ──────────────────────────────────────────────────────────────
      emitProgress({
        stage: 'CLEANING',
        stageProgress: 100,
        overallProgress: 100,
        processedSeconds: effectiveDuration,
        expectedOutputDurationSeconds: effectiveDuration,
        frame: null,
        fps: null,
        speed: null,
        elapsedSeconds: 0,
        estimatedRemainingSeconds: 0,
      });

      this.tempFileManager.cleanupJobDirectory(jobId);

      return finalOutputPath;
    } catch (err: any) {
      this.tempFileManager.cleanupJobDirectory(jobId);
      this.throwIfCancelled(jobId);
      if (err instanceof AppError) throw err;
      throw new AppError('UNKNOWN', `Quá trình xử lý video thất bại: ${err.message}`);
    } finally {
      this.activeProcesses.delete(jobId);
      this.activeJobs.delete(jobId);
      this.cancelledJobs.delete(jobId);
    }
  }

  public cancelProcess(jobId: string): boolean {
    const proc = this.activeProcesses.get(jobId);
    if (!proc && !this.activeJobs.has(jobId)) return false;
    this.cancelledJobs.add(jobId);
    if (proc) {
      proc.kill('SIGKILL');
    }
    // The job owns cleanup after its child exits; removing files here races FFmpeg.
    return true;
  }

  private throwIfCancelled(jobId: string): void {
    if (this.cancelledJobs.has(jobId)) {
      throw new AppError('PROCESS_CANCELLED', 'Đã hủy xử lý video.');
    }
  }

  private encoderOptions(encoder: string): string[] {
    if (encoder.endsWith('_nvenc')) return ['-preset', 'p4'];
    if (encoder.endsWith('_amf')) return ['-quality', 'balanced'];
    return ['-preset', 'medium'];
  }

  // ─────────────────────────────────────────────────────────────────
  // PASS A1 — normalizeSource (Safe 7-Step Pipeline)
  // ─────────────────────────────────────────────────────────────────
  private async normalizeSource(
    jobId: string,
    inputPath: string,
    outputPath: string,
    requestedEncoder: EncoderType,
    mediaInfo: MediaInfo,
    onProgress?: (parsed: { frame: number | null; fps: number | null; speed: number | null }, processedSec: number) => void,
    requiresPartialCopy = false
  ): Promise<{ encoderUsed: string; wasFallback: boolean; strategyName: string }> {
    const ffmpegPath = await this.ffmpegManager.getFFmpegPath();
    this.throwIfCancelled(jobId);
    const vStream = mediaInfo.videoStreams[0];
    const aStream = mediaInfo.hasAudio && mediaInfo.audioStreams.length > 0 ? mediaInfo.audioStreams[0] : null;

    // Evaluate stream compatibility
    const videoCodec = (vStream.codecName || '').toLowerCase();
    const pixFmt = (vStream.pixFmt || '').toLowerCase();
    const isVideoCompatible =
      // A re-encoded partial cannot be stream-concatenated safely with a copied
      // source (HEVC/H.264, time base and audio format may differ).
      !requiresPartialCopy &&
      ['h264', 'hevc', 'h265'].includes(videoCodec) &&
      pixFmt === 'yuv420p' &&
      vStream.width > 0 &&
      vStream.height > 0;

    const audioCodec = aStream ? (aStream.codecName || '').toLowerCase() : '';
    const isAudioCompatible =
      !mediaInfo.hasAudio ||
      (audioCodec === 'aac' && (aStream?.sampleRate === 44100 || aStream?.sampleRate === 48000));

    let strategyName: 'A_FULL_COPY' | 'B_AUDIO_ONLY' | 'C_NVENC' | 'D_CPU';
    let targetEncoder: string;

    if (isVideoCompatible && isAudioCompatible) {
      strategyName = 'A_FULL_COPY';
      targetEncoder = 'copy';
    } else if (isVideoCompatible && !isAudioCompatible) {
      strategyName = 'B_AUDIO_ONLY';
      targetEncoder = 'copy';
    } else if (requestedEncoder === 'h264_nvenc' || requestedEncoder === 'hevc_nvenc') {
      strategyName = 'C_NVENC';
      targetEncoder = requestedEncoder;
    } else {
      strategyName = 'D_CPU';
      targetEncoder = requestedEncoder === 'copy' ? 'libx264' : requestedEncoder;
    }

    const buildArgs = (enc: string, strat: string): string[] => {
      const args: string[] = ['-y', '-i', inputPath, '-map', `0:${vStream.index}`];
      if (aStream) args.push('-map', `0:${aStream.index}`);

      if (strat === 'A_FULL_COPY') {
        args.push('-c:v', 'copy');
        if (mediaInfo.hasAudio) args.push('-c:a', 'copy');
        else args.push('-an');
      } else if (strat === 'B_AUDIO_ONLY') {
        args.push('-c:v', 'copy');
        if (mediaInfo.hasAudio) args.push('-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2');
        else args.push('-an');
      } else {
        args.push('-c:v', enc, '-pix_fmt', 'yuv420p');
        args.push(...this.encoderOptions(enc));
        if (mediaInfo.hasAudio) args.push('-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2');
        else args.push('-an');
      }

      args.push('-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', outputPath);
      return args;
    };

    const runFFmpegAttempt = (args: string[]): Promise<{ success: boolean; stderr: string }> => {
      this.throwIfCancelled(jobId);
      return new Promise((resolve) => {
        console.log(`[VideoEngine][${jobId}] normalizeSource attempt: ffmpeg ${args.join(' ')}`);

        const proc = spawn(ffmpegPath, args, { windowsHide: true, shell: false });
        this.activeProcesses.set(jobId, proc);
        let stderr = '';
        let stdoutBuf = '';

        proc.stdout?.on('data', (data) => {
          stdoutBuf += data.toString();
          const blocks = stdoutBuf.split(/(?=progress=)/);
          for (let i = 0; i < blocks.length - 1; i++) {
            const parsed = parseFFmpegProgressChunk(blocks[i]);
            if (parsed && parsed.processedSeconds !== null) {
              onProgress?.(
                { frame: parsed.frame, fps: parsed.fps, speed: parsed.speed },
                parsed.processedSeconds
              );
            }
          }
          stdoutBuf = blocks[blocks.length - 1];
        });

        proc.stderr?.on('data', (d) => { stderr += d.toString(); });

        proc.on('close', (code) => {
          if (stdoutBuf) {
            const parsed = parseFFmpegProgressChunk(stdoutBuf);
            if (parsed && parsed.processedSeconds !== null) {
              onProgress?.(
                { frame: parsed.frame, fps: parsed.fps, speed: parsed.speed },
                parsed.processedSeconds
              );
            }
          }
          this.activeProcesses.delete(jobId);
          const validOutput = code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0;
          resolve({ success: validOutput, stderr });
        });

        proc.on('error', (e) => {
          this.activeProcesses.delete(jobId);
          resolve({ success: false, stderr: e.message });
        });
      });
    };

    let encoderUsed = targetEncoder;
    let wasFallback = false;

    // ── Execute Primary Attempt ──
    let primaryArgs = buildArgs(targetEncoder, strategyName);
    let result = await runFFmpegAttempt(primaryArgs);
    this.throwIfCancelled(jobId);

    // ── NVENC Fallback Check (Requirement 2 & 4) ──
    if (!result.success && /_(nvenc|qsv|amf)$/.test(targetEncoder)) {
      const stderr = result.stderr;
      logger.warn(
        'FFMPEG',
        `[Normalize Source] Hardware encoder (${targetEncoder}) failed.\n` +
        `Failed Command: ffmpeg ${primaryArgs.join(' ')}\n` +
        `Stderr Snippet: ${stderr.slice(-400)}`
      );

      // Clean up empty output file if created
      if (fs.existsSync(outputPath)) {
        try { fs.unlinkSync(outputPath); } catch {}
      }

      // Fallback to CPU encoder (libx264)
      logger.info('FFMPEG', '[Normalize Source] Automatically falling back to CPU encoder (libx264)...');
      encoderUsed = 'libx264';
      wasFallback = true;
      strategyName = 'D_CPU';

      const fallbackArgs = buildArgs('libx264', 'D_CPU');
      result = await runFFmpegAttempt(fallbackArgs);
      this.throwIfCancelled(jobId);
    }

    if (!result.success) {
      throw new AppError(
        'OUTPUT_INVALID',
        `Chuẩn hóa nguồn thất bại. Lỗi FFmpeg:\n${result.stderr.slice(-400)}`
      );
    }

    // ── Post-Normalization Validation (Requirement 6) ──
    const postInfo = await this.ffprobeService.probeMedia(outputPath);
    this.throwIfCancelled(jobId);
    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
      throw new AppError('OUTPUT_INVALID', 'File sau khi chuẩn hóa nguồn rỗng hoặc không được tạo thành công.');
    }
    if (!postInfo.videoStreams || postInfo.videoStreams.length === 0) {
      throw new AppError('OUTPUT_INVALID', 'File sau khi chuẩn hóa không chứa luồng video hợp lệ.');
    }
    if (postInfo.duration <= 0) {
      throw new AppError('OUTPUT_INVALID', 'File sau khi chuẩn hóa có thời lượng bằng 0.');
    }

    // ── Detailed Log Output (Requirement 7) ──
    const logDetails =
      `\n[Normalize Source]\n` +
      `Input: ${mediaInfo.fileName}\n` +
      `Video codec: ${vStream.codecName} (pix_fmt: ${vStream.pixFmt || 'unknown'}, ${vStream.width}x${vStream.height}, ${vStream.fps}fps)\n` +
      `Audio codec: ${aStream ? aStream.codecName : 'NONE'}\n` +
      `Resolution: ${vStream.width}x${vStream.height}\n` +
      `Selected encoder: ${encoderUsed}\n` +
      `Fallback: ${wasFallback ? 'YES' : 'NO'}\n` +
      `Output validation: PASS (${postInfo.duration.toFixed(3)}s, ${postInfo.fileSize} bytes)`;

    logger.info('FFMPEG', logDetails);
    console.log(logDetails);

    return { encoderUsed, wasFallback, strategyName };
  }

  // ─────────────────────────────────────────────────────────────────
  // PASS A2 — buildPartialCopy
  // ─────────────────────────────────────────────────────────────────
  private async buildPartialCopy(
    jobId: string,
    inputPath: string,
    outputPath: string,
    durationSeconds: number,
    encoder: EncoderType,
    mediaInfo: MediaInfo,
    onProgress?: (parsed: { frame: number | null; fps: number | null; speed: number | null }, processedSec: number) => void
  ): Promise<void> {
    const ffmpegPath = await this.ffmpegManager.getFFmpegPath();
    this.throwIfCancelled(jobId);

    return new Promise((resolve, reject) => {
      const enc = encoder === 'copy' ? 'libx264' : encoder;
      const args: string[] = [
        '-y',
        '-i', inputPath,
        '-map', '0:v:0',
        '-t', durationSeconds.toFixed(6),
        '-c:v', enc,
        '-pix_fmt', 'yuv420p',
      ];

      args.push(...this.encoderOptions(enc));

      if (mediaInfo.hasAudio) {
        args.push('-map', '0:a:0', '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2');
      } else {
        args.push('-an');
      }

      args.push('-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', outputPath);

      console.log(`[VideoEngine][${jobId}] buildPartialCopy -t ${durationSeconds.toFixed(3)}s with ${enc}`);

      const proc = spawn(ffmpegPath, args, { windowsHide: true, shell: false });
      this.activeProcesses.set(jobId, proc);
      let stderr = '';
      let stdoutBuf = '';

      proc.stdout?.on('data', (data) => {
        stdoutBuf += data.toString();
        const blocks = stdoutBuf.split(/(?=progress=)/);
        for (let i = 0; i < blocks.length - 1; i++) {
          const parsed = parseFFmpegProgressChunk(blocks[i]);
          if (parsed && parsed.processedSeconds !== null) {
            onProgress?.(
              { frame: parsed.frame, fps: parsed.fps, speed: parsed.speed },
              parsed.processedSeconds
            );
          }
        }
        stdoutBuf = blocks[blocks.length - 1];
      });

      proc.stderr?.on('data', (d) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        if (stdoutBuf) {
          const parsed = parseFFmpegProgressChunk(stdoutBuf);
          if (parsed && parsed.processedSeconds !== null) {
            onProgress?.(
              { frame: parsed.frame, fps: parsed.fps, speed: parsed.speed },
              parsed.processedSeconds
            );
          }
        }
        this.activeProcesses.delete(jobId);
        if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
          resolve();
        } else {
          reject(new AppError('OUTPUT_INVALID', `Tạo đoạn cuối bị cắt thất bại (${code}): ${stderr.slice(-400)}`));
        }
      });
      proc.on('error', (e) => {
        this.activeProcesses.delete(jobId);
        reject(new AppError('UNKNOWN', `FFmpeg process error (partial): ${e.message}`));
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // PASS A3 — concatSegments
  // ─────────────────────────────────────────────────────────────────
  private async concatSegments(
    jobId: string,
    concatListPath: string,
    outputPath: string,
    cwdDir: string,
    expectedTotalDuration: number,
    onProgress?: (parsed: { frame: number | null; fps: number | null; speed: number | null }, processedSec: number) => void
  ): Promise<void> {
    const ffmpegPath = await this.ffmpegManager.getFFmpegPath();
    this.throwIfCancelled(jobId);

    return new Promise((resolve, reject) => {
      const args: string[] = [
        '-y', '-f', 'concat', '-safe', '0', '-i', 'concat_list.txt',
        '-c', 'copy', '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats',
        outputPath,
      ];

      console.log(`[VideoEngine][${jobId}] concatSegments: ffmpeg ${args.join(' ')}`);

      const proc = spawn(ffmpegPath, args, { cwd: cwdDir, windowsHide: true, shell: false });
      this.activeProcesses.set(jobId, proc);
      let stderr = '';
      let stdoutBuf = '';

      proc.stdout?.on('data', (data) => {
        stdoutBuf += data.toString();
        const blocks = stdoutBuf.split(/(?=progress=)/);
        for (let i = 0; i < blocks.length - 1; i++) {
          const parsed = parseFFmpegProgressChunk(blocks[i]);
          if (parsed && parsed.processedSeconds !== null) {
            onProgress?.(
              { frame: parsed.frame, fps: parsed.fps, speed: parsed.speed },
              parsed.processedSeconds
            );
          }
        }
        stdoutBuf = blocks[blocks.length - 1];
      });

      proc.stderr?.on('data', (d) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        if (stdoutBuf) {
          const parsed = parseFFmpegProgressChunk(stdoutBuf);
          if (parsed && parsed.processedSeconds !== null) {
            onProgress?.(
              { frame: parsed.frame, fps: parsed.fps, speed: parsed.speed },
              parsed.processedSeconds
            );
          }
        }
        this.activeProcesses.delete(jobId);
        if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
          resolve();
        } else {
          reject(new AppError('OUTPUT_INVALID', `Ghép video thất bại (${code}): ${stderr.slice(-400)}`));
        }
      });
      proc.on('error', (e) => {
        this.activeProcesses.delete(jobId);
        reject(new AppError('UNKNOWN', `FFmpeg process error (concat): ${e.message}`));
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // PASS B — applyAudioFade
  // ─────────────────────────────────────────────────────────────────
  private async applyAudioFade(
    jobId: string,
    inputPath: string,
    outputPath: string,
    fadeDurationSeconds: number,
    totalDuration: number,
    onProgress?: (parsed: { frame: number | null; fps: number | null; speed: number | null }, processedSec: number) => void
  ): Promise<void> {
    const ffmpegPath = await this.ffmpegManager.getFFmpegPath();
    this.throwIfCancelled(jobId);

    return new Promise((resolve, reject) => {
      const fadeFilter = `[0:a:0]afade=t=in:st=0:d=${fadeDurationSeconds.toFixed(3)}:curve=qsin[aout]`;

      const args: string[] = [
        '-y',
        '-i', inputPath,
        '-filter_complex', fadeFilter,
        '-map', '0:v:0',
        '-c:v', 'copy',
        '-map', '[aout]',
        '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2',
        '-movflags', '+faststart',
        '-progress', 'pipe:1', '-nostats',
        outputPath,
      ];

      console.log(`[VideoEngine][${jobId}] applyAudioFade: filter="${fadeFilter}"`);

      const proc = spawn(ffmpegPath, args, { windowsHide: true, shell: false });
      this.activeProcesses.set(jobId, proc);
      let stderr = '';
      let stdoutBuf = '';

      proc.stdout?.on('data', (data) => {
        stdoutBuf += data.toString();
        const blocks = stdoutBuf.split(/(?=progress=)/);
        for (let i = 0; i < blocks.length - 1; i++) {
          const parsed = parseFFmpegProgressChunk(blocks[i]);
          if (parsed && parsed.processedSeconds !== null) {
            onProgress?.(
              { frame: parsed.frame, fps: parsed.fps, speed: parsed.speed },
              parsed.processedSeconds
            );
          }
        }
        stdoutBuf = blocks[blocks.length - 1];
      });

      proc.stderr?.on('data', (d) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        if (stdoutBuf) {
          const parsed = parseFFmpegProgressChunk(stdoutBuf);
          if (parsed && parsed.processedSeconds !== null) {
            onProgress?.(
              { frame: parsed.frame, fps: parsed.fps, speed: parsed.speed },
              parsed.processedSeconds
            );
          }
        }
        this.activeProcesses.delete(jobId);
        if (code === 0 && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
          resolve();
        } else {
          reject(new AppError('OUTPUT_INVALID', `Áp dụng fade âm thanh thất bại (${code}): ${stderr.slice(-400)}`));
        }
      });
      proc.on('error', (e) => {
        this.activeProcesses.delete(jobId);
        reject(new AppError('UNKNOWN', `FFmpeg process error (audio fade): ${e.message}`));
      });
    });
  }

  private async verifyOutput(
    outputPath: string,
    expectedDuration: number,
    expectAudio: boolean
  ): Promise<void> {
    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
      throw new AppError('OUTPUT_INVALID', 'Tệp video đầu ra không tồn tại hoặc dung lượng bằng 0.');
    }
    const info = await this.ffprobeService.probeMedia(outputPath);
    if (info.videoStreams.length === 0) {
      throw new AppError('OUTPUT_INVALID', 'Tệp đầu ra không chứa luồng video hợp lệ.');
    }
    if (expectAudio && !info.hasAudio) {
      throw new AppError('OUTPUT_INVALID', 'Tệp gốc có âm thanh nhưng tệp đầu ra bị mất luồng âm thanh.');
    }
    // Allow ±3 second tolerance for keyframe boundaries
    if (Math.abs(info.duration - expectedDuration) > 3.0) {
      throw new AppError(
        'OUTPUT_INVALID',
        `Thời lượng đầu ra (${info.duration.toFixed(1)}s) lệch nhiều so với mong đợi (${expectedDuration.toFixed(1)}s).`
      );
    }
  }

  private resolveOutputPath(
    config: RepeatJobConfig,
    originalFileName: string,
    plan: ReturnType<typeof calculateRepeatPlan>
  ): string {
    const ext = '.mp4';
    const baseName = path.basename(originalFileName, path.extname(originalFileName));
    let template = config.outputFilenameTemplate || '{original_name}_{repeat_count}x';

    // Append _fadein suffix when fade is active
    if (
      config.audioFadeInEnabled &&
      (config.audioFadeInDurationSeconds ?? 0) > 0 &&
      !template.includes('{fadein}') &&
      !template.includes('_fadein')
    ) {
      template = `${template}_fadein`;
    }

    // Append duration limit suffix when active
    if (plan.durationLimitEnabled && !plan.naturalFitsWithinLimit) {
      const hrs  = Math.floor(plan.effectiveDurationSeconds / 3600);
      const mins = Math.floor((plan.effectiveDurationSeconds % 3600) / 60);
      template = `${template}_${hrs}h${String(mins).padStart(2, '0')}m`;
    }

    template = template
      .replace(/{original_name}/g, baseName)
      .replace(/{repeat_count}/g, String(plan.effectiveRepeatCount))
      .replace(/{fadein}/g, 'fadein')
      .replace(/{date}/g, new Date().toISOString().slice(0, 10));

    let finalName = `${template}${ext}`.replace(/[\\/:*?"<>|]/g, '_');

    const outFolder = config.outputFolder || path.dirname(config.inputPath);
    let fullPath = path.join(outFolder, finalName);

    let counter = 1;
    while (fs.existsSync(fullPath)) {
      const name = `${template}_(${counter})${ext}`.replace(/[\\/:*?"<>|]/g, '_');
      fullPath = path.join(outFolder, name);
      counter++;
    }

    return fullPath;
  }
}

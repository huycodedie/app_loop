# Video Engine Documentation - Video Repeat Studio

## 1. Overview
`VideoEngine` handles full video repetition ($N$ times or automatic target output duration calculation) and optional audio fade-in at the very beginning of the final output file, using a **two-pass + partial-segment + safe normalization architecture** that guarantees zero freeze-frame, no stream packet loss, and robust encoder fallback.

## 2. Safe 7-Step Source Normalization Pipeline (`PREPARING_FULL_SOURCE`)

1. **Pre-Validation (`ffprobe`)**:
   - Checks that video stream exists, `width > 0`, `height > 0`, and `duration > 0`.
   - If invalid or no video stream, throws a clear Vietnamese error: `"File không có luồng video hợp lệ"`.
2. **Stream Analysis & Strategy Selection**:
   - **Strategy A (`A_FULL_COPY`)**: Source video is H.264/HEVC `yuv420p` AND audio is AAC $\rightarrow$ `-c:v copy -c:a copy`.
   - **Strategy B (`B_AUDIO_ONLY`)**: Source video is H.264/HEVC `yuv420p` BUT audio is non-AAC $\rightarrow$ `-c:v copy -c:a aac -b:a 192k -ar 44100 -ac 2`.
   - **Strategy C (`C_NVENC`)**: Source video requires re-encoding AND GPU mode is NVENC $\rightarrow$ `-c:v h264_nvenc -preset p4 -pix_fmt yuv420p` + AAC audio.
   - **Strategy D (`D_CPU`)**: Source video requires re-encoding AND (GPU mode is CPU OR NVENC failed) $\rightarrow$ `-c:v libx264 -preset medium -pix_fmt yuv420p` + AAC audio.
3. **NVENC Automatic CPU Fallback**:
   - If `h264_nvenc` fails (exit code $\neq 0$ or stderr contains `Error while opening encoder`, `Invalid argument`, `No packets received`, etc.), VideoEngine logs the failed command and stderr snippet, cleans up the empty output file, and automatically falls back to `-c:v libx264 -preset medium -pix_fmt yuv420p` without terminating the job.
4. **Post-Normalization Validation**:
   - Probes `source_normalized.mp4` with `ffprobe` to verify video stream presence, `duration > 0`, and `fileSize > 0`.
5. **Detailed Structured Logging**:
   - Logs input filename, video/audio codecs, resolution, selected encoder, fallback status (`YES`/`NO`), and output validation (`PASS`/`FAIL`).

## 3. Automatic Target Output Duration Architecture

When Duration Limit / Target is active:
- **Centralized Math (`calculateRepeatPlan`)**:
  - `effectiveRepeatCount = Math.ceil(targetDuration / sourceDuration)`
  - `fullCopyCount = Math.floor(targetDuration / sourceDuration)`
  - `partialCopyDurationSeconds = targetDuration - (fullCopyCount * sourceDuration)`
- **Partial Segment Generation (`BUILDING_PARTIAL_END`)**:
  - If `hasPartialFinalCopy` is true (partial segment > 0.04s):
    - Trims `source_normalized.mp4` with `-t <partialCopyDurationSeconds>` starting from time 0 → `partial_copy.mp4`.
    - Uses the effective encoder from normalization (`-preset p4` for NVENC, `-preset medium` for CPU).
  - Concat list (`concat_list.txt`):
    - `source_normalized.mp4` listed `fullCopyCount` times.
    - `partial_copy.mp4` listed 1 time if partial segment present.
  - Final concatenated output is trimmed to exact target duration (e.g. 03:00:00.000).

## 4. Two-Pass Architecture

### Pass A — Build the Repeated Video (no audio filter)
1. **PREPARING_FULL_SOURCE**: Run safe 7-step source normalization → `source_normalized.mp4`.
2. **BUILDING_PARTIAL_END** (only when `hasPartialFinalCopy`): Trim `source_normalized.mp4` with `-t <partialCopyDurationSeconds>` → `partial_copy.mp4`.
3. **BUILDING_REPEAT_SEQUENCE**: Write `concat_list.txt` with `source_normalized.mp4` × `fullCopyCount` and `partial_copy.mp4` × (0 or 1). Concat with `-c copy` → `repeated_without_fade.mp4`.
4. **VERIFYING_REPEAT_SEQUENCE**: Probe the intermediate file.

### Pass B — Audio Fade (applied once to the complete timeline)
5. **APPLYING_AUDIO_FADE** (only if `requiresFade`):
   ```
   ffmpeg -i repeated_without_fade.mp4
     -filter_complex "[0:a:0]afade=t=in:st=0:d=<N>:curve=qsin[aout]"
     -map 0:v:0   -c:v copy        ← video stream copied untouched
     -map [aout]  -c:a aac -b:a 192k -ar 44100 -ac 2
     -movflags +faststart
     final_output.mp4
   ```
6. **VERIFYING_FINAL_OUTPUT**: Probe final file for duration and stream validity.
7. **FINALIZING / CLEANING**: Move output file to destination directory and clean temp files.

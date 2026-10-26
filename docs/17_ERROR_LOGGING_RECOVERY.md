# Error Logging & Recovery Documentation - Video Repeat Studio

## 1. Overview
All errors in Video Repeat Studio inherit from typed `AppError`. Structured error codes prevent unhandled exceptions from breaking the user interface. Additionally, source file error tracking and startup crash recovery ensure files are never lost or left in an ambiguous state.

## 2. Source File Error Tracking (`source_file_errors`)
When a Watch Folder job fails, `SourceFileStatusService` records error details in SQLite table `source_file_errors`:
- `id`: Unique error record ID
- `job_id`: Associated queue job ID
- `source_path`: Renamed source file path (e.g. `rain_ERROR.mp4`)
- `original_filename`: Original filename (e.g. `rain.mp4`)
- `current_filename`: Current status filename
- `error_status`: `'FAILED'`
- `error_message`: FFmpeg or system error message
- `failed_stage`: Stage during which the failure occurred (e.g., `PREPARING_FULL_SOURCE`, `APPLYING_AUDIO_FADE`)
- `failed_at`: ISO timestamp

## 3. Startup Crash Recovery (`recoverProcessingFiles`)
If Video Repeat Studio is unexpectedly terminated while files are in `_PROCESSING.mp4` state:
- Upon startup, `WatchFolderService` calls `SourceFileStatusService.recoverProcessingFiles()`.
- Leftover `*_PROCESSING.mp4` files are safely restored to `_WAITING` state (`rain.mp4`) or marked as `_ERROR` based on the `crashRecoveryAction` setting (`RESET_TO_WAITING` by default).

## 4. Error Code Taxonomy
- `FFPROBE_MISSING`: Executable `ffprobe.exe` missing or invalid.
- `FFMPEG_MISSING`: Executable `ffmpeg.exe` missing or invalid.
- `INVALID_INPUT`: File path or timestamp parameter invalid.
- `UNSUPPORTED_MEDIA`: Unreadable or corrupt source video container.
- `OUTPUT_INVALID`: Generated output fails duration validation or size check.
- `PERMISSION_DENIED`: Target output folder not writeable.

# Phase 12: Watch Folder Service

## Status
COMPLETED

## Objective
Automatically monitor configured file system directories for new video files, queue them into Video Repeat Studio with custom repetition rules, audio fade-in, output duration limits, automatic per-file target duration repeat calculations, automatic date-based output subfolders, automatic source file status renaming, and live runtime rule configuration editing.

## Architecture & Features
- **Main Process Ownership**: WatchFolderService runs exclusively in the Main Process. It operates continuously regardless of whether the BrowserWindow is visible, minimized, hidden to System Tray, or destroyed.
- **File System Monitoring**: Built on `chokidar` with configurable stability debouncing (`stabilityThresholdMs`: default 3000ms).
- **Runtime Configuration Updates (`updateWatchFolderConfiguration`)**:
  - Allows editing existing Watch Folder rules without requiring application restart or interrupting active FFmpeg jobs.
  - Preloads all current rule settings when opening the Edit Modal in UI (`WatchFolderPage.tsx`).
  - Selective Watcher Restarts:
    - If `folderPath` or `enabled` toggles: stops affected watcher and restarts new watcher for updated path.
    - If non-path settings change (`outputFolder`, `repeatCount`, `audioFadeInDurationSeconds`, `durationLimitSeconds`, etc.): updates database and in-memory config without restarting filesystem watchers unnecessarily.
  - Paused State Preservation: Editing a paused rule preserves its paused state until explicitly resumed.
- **Card Stats & Item Actions**:
  - Item Actions: `▶ Bật` / `⏸ Tạm dừng`, `✏ Chỉnh sửa`, `🗑 Xóa`.
  - Displays monitored source folder, output folder, status badge, count processed today, and last processed filename.
- **Source File Status Management (`SourceFileStatusService`)**:
  - Automatically renames input source files monitored by Watch Folder:
    - Before Queue creation: `rain.mp4` $\rightarrow$ `rain_PROCESSING.mp4`.
    - After successful completion: `rain_PROCESSING.mp4` $\rightarrow$ `rain_DONE.mp4`.
    - After failure: `rain_PROCESSING.mp4` $\rightarrow$ `rain_ERROR.mp4` (or `rain_ERROR_FFMPEG.mp4` in advanced mode).
  - Suffix deduplication: Files with `_PROCESSING`, `_DONE`, `_ERROR`, `_SKIPPED` are ignored during scanning.
  - Safe collision handling: Generates `rain_DONE_001.mp4` if target file exists.
  - Windows file system safety: If rename fails due to file locks or permissions, logs warning without failing output video generation.
  - Startup crash recovery: `recoverProcessingFiles()` scans for leftover `_PROCESSING.mp4` files and resets them to `_WAITING` (`rain.mp4`).
- **Duplicate Watcher Safeguard**: `startWatcher` automatically closes existing watchers for rule IDs before creating new instances, preventing duplicate detection on UI remounts or tray restores.
- **Tray Pause & Resume**: `pauseAll()` suspends watching without deleting DB rules; `resumeAll()` restores watchers and rescans input directories to enqueue eligible unprocessed files.
- **Duration Limit & Auto Repeat Support**: Each watch folder rule supports `durationLimitEnabled` and `durationLimitSeconds`. Incoming files undergo individual probing (`MediaInfo`) and automatic repeat count calculation ($\text{ceil}(\text{target} / \text{source})$).
- **Automatic Daily Output Subfolders**:
  - `autoDailyOutputFolder: boolean` (default: ON for new rules).
  - Daily folder format: `DAY_MONTH` using computer's **LOCAL date** (e.g., `28_8` for August 28).

## Database Schema (Migrations 006 & 007)
Table `watch_folders`:
- `id TEXT PRIMARY KEY`
- `name TEXT`
- `folder_path TEXT NOT NULL`
- `output_folder TEXT NOT NULL`
- `repeat_count INTEGER NOT NULL DEFAULT 3`
- `audio_fade_in_enabled INTEGER DEFAULT 1`
- `audio_fade_in_duration_seconds REAL DEFAULT 5.0`
- `duration_limit_enabled INTEGER DEFAULT 0`
- `duration_limit_seconds INTEGER`
- `auto_daily_output_folder INTEGER DEFAULT 1`
- `daily_folder_format TEXT DEFAULT 'DAY_MONTH'`
- `rename_source_files INTEGER DEFAULT 1`
- `error_naming_mode TEXT DEFAULT 'SIMPLE'`
- `gpu_mode TEXT DEFAULT 'AUTO'`
- `encoder TEXT DEFAULT 'libx264'`
- `stability_threshold_ms INTEGER DEFAULT 3000`
- `enabled INTEGER NOT NULL DEFAULT 1`
- `created_at TEXT NOT NULL`
- `updated_at TEXT`

## Key Files
- `src/main/services/WatchFolderService.ts`
- `src/main/repositories/WatchFolderRepository.ts`
- `src/main/database/db.ts`
- `src/renderer/src/pages/WatchFolderPage.tsx`
- `tests/watchFolderEdit.test.ts`

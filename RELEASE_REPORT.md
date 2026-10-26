# Release Report — Video Repeat Studio v1.0.0 Production Release

## Executive Summary
Video Repeat Studio v1.0.0 is a production-grade, state-of-the-art Windows x64 desktop application designed for seamless video repetition, concatenation, automatic target duration calculation, audio fade processing, automated watch folders, background tray operation, and source status file management.

This release features standalone distribution packages (**NSIS Setup Installer** + **Portable Executable**), bundled high-performance FFmpeg/FFprobe binaries, automatic hardware GPU detection with CPU fallback, real-time live FFmpeg progress tracking, daily structured file logging, local-date output subfolders, dual output duration modes (`EXACT` vs `MINIMUM` + Max Overshoot Protection), and robust SQLite database migrations.

---

## Key Modules & Automatic Architecture Discovery

### 1. Main Process & Lifecycle Management (`src/main/index.ts`)
- **UserData Boundary**: Guarantees all write operations target `%APPDATA%\Video Repeat Studio\`.
- **Directory Bootstrapping**: Auto-creates `logs/`, `temp/`, `exports/`, `settings/`, `cache/`, `database/`.
- **System Tray & Background Architecture**: When users click `X`, the main window hides to the Windows System Tray while keeping Electron Main, Watch Folder, Queue processing, FFmpeg rendering, and Scheduler alive. Application exits only via explicit "Thoát Video Repeat Studio" action.
- **Global Crash Handling**: Intercepts `uncaughtException`, `unhandledRejection`, and renderer process crashes with human-friendly notifications and daily log entries.

### 2. Startup Health & Runtime Validator (`src/main/services/RuntimeValidator.ts`)
- **FFmpeg & FFprobe Verification**: Verifies executable existence and functionality on app boot in dev, bundled resources (`process.resourcesPath`), and portable modes.
- **SQLite Database Check**: Validates schema integrity and auto-executes database migrations (Migrations 001–008).
- **Write Permissions**: Ensures local storage paths have full write access.
- **Hardware Acceleration**: Probes NVIDIA NVENC (`h264_nvenc`), Intel QuickSync (`h264_qsv`), and AMD AMF (`h264_amf`) encoders with safe CPU fallback (`libx264`).

### 3. Output Duration Mode System & Centralized Math (`src/shared/utils/repeatPlan.ts`)
- **Dual Output Duration Modes**:
  - **`EXACT` Mode**: Caps video duration exactly at target duration by trimming final copy (`hasPartialFinalCopy = true`).
  - **`MINIMUM` Mode**: Guarantees complete repetitions without trimming (`hasPartialFinalCopy = false`), producing an output duration $\ge$ target duration.
- **Maximum Overshoot Protection (`maxOvershootSeconds`)**: If MINIMUM mode overshoot duration exceeds `maxOvershootSeconds`, the system automatically falls back to `EXACT` mode to avoid excessive file length.
- **Centralized Service**: Single source of truth used across Video Processing, Watch Folder, Scheduler, Profiles, Queue, and History.

### 4. Source File Status Management System (`SourceFileStatusService.ts`)
- **Source Status Renaming**: Automatically renames input source files monitored by Watch Folder:
  `rain.mp4` $\rightarrow$ `rain_PROCESSING.mp4` $\rightarrow$ `rain_DONE.mp4` or `rain_ERROR.mp4` (or `rain_ERROR_FFMPEG.mp4` in advanced error mode).
- **Collision Safety**: Automatically appends `_001`, `_002` if target filename exists on disk.
- **SQLite Error Log**: Records detailed error history in table `source_file_errors`.
- **Startup Crash Recovery**: Auto-scans for leftover `*_PROCESSING.mp4` files and restores them to `_WAITING` state (`rain.mp4`).

### 5. Watch Folder Editing & Statistics (`WatchFolderService.ts` & `WatchFolderPage.tsx`)
- **Edit Watch Folder Modal**: Preloads existing configuration without presenting a blank form.
- **Selective Watcher Restarts**: Restarts `chokidar` filesystem watchers only when `folderPath` or `enabled` toggles; updates non-path settings in database seamlessly.
- **Live Statistics**: Displays count processed today (`countToday`) and last processed filename (`lastProcessedFile`) per rule card.

### 6. Queue Service & Real-Time Progress Pipeline (`QueueService.ts` & `ffmpegProgressParser.ts`)
- **Live Progress Tracking**: Parses machine-readable `-progress pipe:1` logs from FFmpeg with EMA smoothing, emitting IPC progress events and updating Windows Taskbar progress (`setProgressBar`).
- **Auto-Recovery**: Auto-recovers interrupted jobs on startup.
- **Date Subfolders**: Resolves `DAY_MONTH` subfolders (e.g. `28_8`) at job start time based on local computer time.

### 7. Logging Infrastructure (`src/main/services/Logger.ts`)
- Appends structured logs to `%APPDATA%\Video Repeat Studio\logs\video_repeat_studio_YYYY-MM-DD.log`.
- Categorized logs: `STARTUP`, `FFMPEG`, `DATABASE`, `SCHEDULER`, `QUEUE`, `WATCH_FOLDER`, `TRAY`, `CRASH`, `UPDATER`.

---

## Release Verification Summary
- **TypeScript Typecheck**: Passed with 0 errors (`npm run typecheck`).
- **Unit & Integration Tests**: 146/146 tests passed across 12 test suites (`npm run test`).
- **Target OS Support**: Windows 10 x64, Windows 11 x64.
- **Bundled Executables**: `ffmpeg.exe` and `ffprobe.exe` bundled inside `extraResources`.
- **Packaging Artifacts**:
  - NSIS Installer: `release/Video Repeat Studio Setup.exe`
  - Portable Version: `release/Video Repeat Studio Portable.exe`
  - Unpacked Distribution: `release/win-unpacked/`

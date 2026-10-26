# Production Release Quality Checklist — Video Repeat Studio

## Pre-Build Checklist
- [x] All TypeScript code compiles with 0 errors (`npm run typecheck`).
- [x] All 146 unit & integration tests pass cleanly (`npm run test`).
- [x] Pre-bundled `ffmpeg.exe` and `ffprobe.exe` verified in `resources/ffmpeg/`.
- [x] `electron-builder.json` targets NSIS (`Setup.exe`) and Portable (`Portable.exe`).
- [x] AppData directory creation (`database`, `logs`, `exports`, `temp`, `settings`, `cache`) verified in `index.ts`.
- [x] Database migrations 001 through 008 verified in `db.ts`.

## Quality Assurance & Verification
- [x] **Clean Installation Test**: Installer runs standalone without Node.js, npm, or system FFmpeg installed.
- [x] **Portable Test**: Portable executable runs from USB or arbitrary directories.
- [x] **FFmpeg & Hardware GPU Acceleration**: Resolves bundled executables and detects NVIDIA NVENC (`h264_nvenc`), Intel QuickSync, AMD AMF, and CPU fallback (`libx264`).
- [x] **Real-Time Progress Pipeline**: Machine-readable FFmpeg progress parser emits live progress to Queue UI and Windows Taskbar (`setProgressBar`).
- [x] **Background Application & System Tray**: Closing window with `X` minimizes to khay hệ thống (System Tray). Pause/resume watchers and background completion notifications active.
- [x] **Source File Status Management**: Automatically renames input files (`_PROCESSING`, `_DONE`, `_ERROR`), collision handling (`_DONE_001`), database error tracking (`source_file_errors`), and startup crash recovery (`recoverProcessingFiles`).
- [x] **Edit Watch Folder Configuration**: Preloads configuration in Edit Modal, handles input path changes by selectively restarting `chokidar` watchers, and displays live statistics (`countToday`, `lastProcessedFile`).
- [x] **Output Duration Mode System**: Supports `EXACT` mode (trimmed final copy) vs `MINIMUM` mode (complete repeats without trimming, output duration $\ge$ target duration) and Max Overshoot Protection fallback.
- [x] **Daily Output Subfolders**: Date-based subfolders (`DAY_MONTH`) resolved at job processing start time using local computer time.

## Deliverables Verification
- [x] `release/Video Repeat Studio Setup.exe`
- [x] `release/Video Repeat Studio Portable.exe`
- [x] `release/latest.yml`
- [x] `release/builder-effective-config.yaml`
- [x] `release/win-unpacked/`

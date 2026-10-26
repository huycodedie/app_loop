# Video Repeat Studio - AI Context & State Specification

## Project Information
- **Project Name**: Video Repeat Studio
- **Stack**: Electron 34, React 18, TypeScript 5.7, Vite 6, SQLite (`better-sqlite3`), FFmpeg / FFprobe, Electron Builder
- **Target OS**: Windows 10 x64 / Windows 11 x64
- **Language/UI**: Vietnamese (Tiếng Việt) • Refactored Dark Desktop Design System (Tailwind CSS v4 + PostCSS + Lucide SVG)
- **Workflow Specification**: Entire Video Repeat N Times + Optional Audio Fade-in + Automatic Target Output Duration Calculation + System Tray Background Architecture.
- **Workflow Status**: Fully Verified Background Application & System Tray Architecture (Main window X button hides window to Tray, Watch Folder & Queue continue operating independently in Main Process, Windows desktop completion notifications, safe quit confirmation).

---

## Current Status
- **Current Phase**: `21_BACKGROUND_TRAY` (System Tray & Main Process Background Architecture)
- **Completed Phases**:
  - `00_PROJECT_SPECIFICATION` (Completed)
  - `01_SYSTEM_RULES` (Completed)
  - `02_PROJECT_SETUP` (Completed)
  - `03_ARCHITECTURE` (Completed)
  - `04_DATABASE` (Completed - Migrations 002, 003, 004, 005 executed)
  - `05_IPC` (Completed)
  - `06_UI` (Completed - Vietnamese labels updated, Duration Limit / Target controls)
  - `07_VIDEO_PLAYER` (Completed - Fade In preview ramp added)
  - `08_FFMPEG_MANAGER` (Completed)
  - `09_VIDEO_ENGINE` (Completed - Automatic repeat calculation, full copies + partial copy)
  - `10_GPU_MANAGER` (Completed - NVENC / CPU support)
  - `11_QUEUE_SYSTEM` (Completed - Real-time machine-readable progress)
  - `12_WATCH_FOLDER` (Completed - Main Process ownership, per-file auto repeat & date subfolders)
  - `13_PERFORMANCE_MONITOR` (Completed)
  - `14_SCHEDULER` (Completed - Main Process runtime execution)
  - `15_HISTORY` (Completed - Effective & manual repeat count recording)
  - `16_PROFILES_AND_SETTINGS` (Completed - Background processing & tray settings)
  - `17_ERROR_LOGGING_RECOVERY` (Completed)
  - `18_TESTING` (Completed - 119 unit & integration tests passed)
  - `19_BUILD_RELEASE` (Completed)
  - `20_FINAL_AUDIT` (Completed)
  - `21_BACKGROUND_TRAY` (Completed)

---

## Background & System Tray Architecture
- **Window X Close**: Hides main window to Windows System Tray (`mainWindow.hide()`), keeping Electron Main Process, Watch Folder, Queue, and Scheduler active.
- **Explicit Quit**: Accessible via System Tray context menu ("Thoát Video Repeat Studio"). Safe exit pipeline prompts confirmation if a job is currently processing.
- **Main Process Ownership**: WatchFolderService, QueueService, SchedulerService, and VideoEngine run independently of BrowserWindow existence or visibility.
- **System Tray Context Menu**:
  - `Mở Video Repeat Studio` (Restores & focuses main window)
  - Status display: `Watch Folder: [Đang hoạt động / Tạm dừng / Có lỗi]`
  - `Tạm dừng Thư mục theo dõi` / `Tiếp tục Thư mục theo dõi`
  - Status display: `Hàng chờ: [Đang xử lý: X · Y% | Đang chờ: Z]`
  - `Mở thư mục đầu ra`
  - `Khởi động cùng Windows` (Checkbox, `app.setLoginItemSettings`)
  - `Thoát Video Repeat Studio`
- **Windows Desktop Notifications**: Native `Notification` alerts on job completion/error when UI is hidden or background notifications are enabled.

---

## Database Schema (`src/main/database/db.ts`)
- `settings`: Key-value configuration store for application options (`runInBackground`, `closeBehavior`, `launchAtStartup`, `startMinimized`, `showCloseToTrayNotification`, `backgroundCompletionNotifications`).
- `jobs`: Queue tracking table.
- `history`: Processed jobs database.
- `watch_folders`: Directory watcher configuration.

---

## Verification Results
- **TypeScript strict mode**: `npm run typecheck` passed (0 errors).
- **Automated Tests**: `npm run test` passed (119/119 unit & integration tests passed).

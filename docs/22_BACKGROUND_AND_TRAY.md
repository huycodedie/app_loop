# Background Application & System Tray Architecture — Video Repeat Studio

## 1. Executive Summary
Video Repeat Studio provides a complete background application architecture allowing **Watch Folder**, **Queue Service**, **Scheduler**, and **FFmpeg processing** to run continuously in the Windows System Tray even when the user closes the main application window.

---

## 2. Core Concepts & Distinctions

| Action | User Trigger | Behavior | Application State |
|---|---|---|---|
| **Minimize** | Windows Minimize button (—) | Standard Windows minimize to taskbar | Visible in taskbar, services active |
| **Close Window** | Window X button | Hides main window to System Tray (`mainWindow.hide()`) | Hidden to Tray, Main Process & all background services active |
| **Explicit Quit** | "Thoát Video Repeat Studio" in System Tray | Controlled exit pipeline, safe job prompt, closes watchers, destroys Tray | Completely terminated (`app.quit()`) |

---

## 3. System Tray Menu Specification

- **Tray Tooltip**: `Video Repeat Studio` (with live status summary)
- **ContextMenu Structure**:
  1. `Mở Video Repeat Studio` → Restores and focuses main window.
  2. `Watch Folder: [Đang hoạt động / Tạm dừng / Có lỗi]` → Live status indicator.
  3. `Tạm dừng Thư mục theo dõi` / `Tiếp tục Thư mục theo dõi` → Toggle watch folder state.
  4. `Hàng chờ: [Đang xử lý: rain01.mp4 (68%) / 2 đang chờ]` → Live queue indicator.
  5. `Mở thư mục đầu ra` → Opens default output folder in File Explorer.
  6. `Khởi động cùng Windows` → Checkbox toggles `app.setLoginItemSettings`.
  7. `Thoát Video Repeat Studio` → Triggers exit workflow.

---

## 4. Controlled Exit Policy (Quit while Processing)

When explicit quit is triggered while a job is in state `PROCESSING`:
A native dialog presents 4 options:
1. `[Tiếp tục chạy nền]` (Default): Hides main window if open, keeps background job running.
2. `[Thoát sau khi hoàn thành]`: Pauses Watch Folder and Scheduler from taking new jobs, allows active job to complete, then quits.
3. `[Dừng xử lý và thoát]`: Cancels active FFmpeg process, marks job `INTERRUPTED`, cleans temp files, and quits.
4. `[Hủy]`: Dismisses dialog.

---

## 5. Main Process Service Ownership

All continuous services are owned exclusively by the Main Process:
- `WatchFolderService`: Holds `chokidar` watchers, deduplication registry, and file stability checks.
- `QueueService`: Manages priority queue, auto-start, FFmpeg process lifecycle, and progress parsing.
- `SchedulerService`: Executes cron tasks with runtime source probing.
- `TrayService`: Handles system tray icon, context menu, and click events.

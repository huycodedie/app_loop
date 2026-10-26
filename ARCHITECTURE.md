# Video Repeat Studio - System Architecture Specification

## Process Isolation & Background Architecture

Video Repeat Studio strictly follows Electron security isolation guidelines and a robust **Main Process Ownership Architecture**:

```
+-------------------------------------------------------------------------+
|                           RENDERER PROCESS                              |
|   React 18 + UI Components + Video Player + Tailwind CSS + Lucide Icons  |
|                                                                         |
|  * contextIsolation: true                                               |
|  * nodeIntegration: false                                               |
|  * Interacts ONLY via window.electronAPI                                |
|  * Pure Presentation Layer — Closing/Hiding UI does NOT stop processing |
+------------------------------------+------------------------------------+
                                     |
                                     |  IPC Channels (ipcRenderer.invoke / send)
                                     v
+-------------------------------------------------------------------------+
|                            PRELOAD BRIDGE                               |
|   src/preload/index.ts (Exposes strictly typed APIs to Renderer)       |
+------------------------------------+------------------------------------+
                                     |
                                     |  Main IPC Handlers (ipcMain.handle)
                                     v
+-------------------------------------------------------------------------+
|                            MAIN PROCESS                                 |
|   Electron Main + Node.js runtime + Core Application Services          |
|                                                                         |
|  +---------------------+  +---------------------+  +-----------------+  |
|  | DatabaseService     |  | FFmpegManager       |  | VideoEngine     |  |
|  | (better-sqlite3)    |  | (Central Resolver)  |  | & ConcatBuilder |  |
|  +---------------------+  +---------------------+  +-----------------+  |
|  | GpuManager          |  | QueueService        |  | WatchService    |  |
|  | (NVENC/QSV/AMF)     |  | (Job Worker Pool)   |  | (Chokidar)      |  |
|  +---------------------+  +---------------------+  +-----------------+  |
|  | SchedulerService    |  | PerformanceMonitor  |  | HistoryService  |  |
|  | (Cron tasks)        |  | (OS Telemetry)      |  | (SQLite Audit)  |  |
|  +---------------------+  +---------------------+  +-----------------+  |
|  | TrayService         |  | AutoUpdateService   |  | Logger          |  |
|  | (System Tray & Menu)|  | (electron-updater)  |  | (Daily Log)     |  |
|  +---------------------+  +---------------------+  +-----------------+  |
+-------------------------------------------------------------------------+
```

---

## Close vs. Quit Semantics

- **CLOSE WINDOW (X Button)**:
  - If `closeBehavior === 'TRAY'` (or `runInBackground === true`): Intercepts `close` event, calls `mainWindow.hide()`, keeps Main Process, Tray, WatchFolderService, QueueService, and SchedulerService running in background.
- **EXPLICIT QUIT ("Thoát Video Repeat Studio")**:
  - Triggers controlled exit sequence.
  - If a job is currently PROCESSING: prompts user options (`[Tiếp tục chạy nền]`, `[Thoát sau khi hoàn thành]`, `[Dừng xử lý và thoát]`, `[Hủy]`).
  - Safe shutdown closes chokidar watchers, flushes database, destroys Tray icon, and calls `app.quit()`.

---

## Data Schema & Storage Architecture

Database file is located at `app.getPath('userData')/video_repeat_studio.sqlite`.

### Core Database Tables:
1. `settings`: Application configuration preferences (`runInBackground`, `closeBehavior`, `launchAtStartup`, `startMinimized`, `showCloseToTrayNotification`, `backgroundCompletionNotifications`).
2. `jobs`: Processing queue jobs and execution statuses (`audio_fade_in_enabled`, `audio_fade_in_duration_seconds`, `repeat_count`, `effective_repeat_count`, `manual_repeat_count`, `duration_limit_enabled`, `duration_limit_seconds`, `source_type`, `resolved_output_directory`).
3. `history`: Completed job audit records and metrics.
4. `watch_folders`: Directory watcher configuration and auto daily folder flags (`auto_daily_output_folder`, `daily_folder_format`).
5. `processed_files`: Hash registry for watched folder deduplication.
6. `profiles`: Encoding preset templates.
7. `schedules`: Recurring automation schedule configurations.

---

## Video Processing Flow — Automatic Repeat & Partial Copy Architecture

### Pass A — Build Repeated Intermediate
1. **ANALYZING**: Probe source file duration, streams, codecs, audio presence.
2. **CALCULATING_REPEAT_PLAN**:
   - `calculateRepeatPlan(sourceDuration, manualRepeatCount, durationLimitEnabled, targetDuration)`
   - When Target ON: `effectiveRepeatCount = ceil(target / source)`, `fullCopyCount = floor(target / source)`, `partialCopyDurationSeconds = target - (fullCopyCount * source)`.
3. **PREPARING_FULL_SOURCE**: Encode full source once → `source_normalized.mp4` (chosen encoder + AAC). No audio filter applied.
4. **BUILDING_PARTIAL_END** (only when `hasPartialFinalCopy`): Trim `source_normalized.mp4` with `-t <partialCopyDurationSeconds>` → `partial_copy.mp4`.
5. **BUILDING_REPEAT_SEQUENCE**: Write `concat_list.txt`:
   - `source_normalized.mp4` × `fullCopyCount`
   - `partial_copy.mp4` × 1 (if partial segment present)
   Concat with `-c copy` → `repeated_without_fade.mp4`.
6. **VERIFYING_REPEAT_SEQUENCE**: Probe intermediate file for duration and stream validity.

### Pass B — Audio Fade (applied once to complete timeline)
7. **APPLYING_AUDIO_FADE** (only if `audioFadeInEnabled && hasAudio && fadeDuration > 0`):
   - `-c:v copy` — video stream is copied untouched.
   - `filter_complex "[0:a:0]afade=t=in:st=0:d=<N>:curve=qsin[aout]"` — audio filter on complete timeline.
   - `-c:a aac` — audio re-encoded.
   - Result: `final_output.mp4`.
8. **VERIFYING_FINAL_OUTPUT**: Probe final file.
9. **FINALIZING** / **CLEANING**: Move output to destination (including date-based subfolders), remove temp files, save `history` record.

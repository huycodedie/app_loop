# Video Repeat Studio

> A high-performance, professional Windows desktop application for frame-accurate video intro splitting, custom segment repeating, and seamless joining.

---

## Key Features

- **Frame-Accurate Video Splitting**: Precise timestamp selection for splitting intro from main body.
- **Smart Copy & Re-encode Dual Engine**: Hardware-accelerated GPU stream copy (`-c copy`) when timestamp aligns with keyframes, with fallback GPU/CPU encoding.
- **Batch Processing Queue**: Drag-and-drop batch video processing queue with pause, resume, cancel, and persistent crash recovery.
- **Watch Folder Automation**: Automated monitoring of local folders via Chokidar with automatic video queuing and deduplication.
- **Task Scheduler**: Cron-based and time-based automated repeat workflow scheduler.
- **Hardware Telemetry HUD**: Real-time monitoring of CPU, RAM, GPU load, rendering FPS, and ETA calculations.
- **Preset Profiles & Settings**: Customizable output presets, containers (MP4, MKV, MOV), codecs, quality settings, and target directories.
- **Processing History Log**: Full transactional audit history of processed videos with search, filter, and CSV/JSON export capabilities.

---

## Tech Stack

- **Framework**: Electron + React 18 + TypeScript + Vite
- **Database**: SQLite (`better-sqlite3`) with WAL mode
- **Media Processing**: FFmpeg & FFprobe static binaries
- **Styling**: Modern dark mode with Tailwind CSS and Lucide React icons
- **Packaging**: Electron Builder (NSIS Installer & Portable x64)

---

## Project Phase Documentation

All phase specifications and status documents are located in the [`docs/`](docs/) directory:

- [Phase 00: Project Specification](docs/00_PROJECT_SPECIFICATION.md)
- [Phase 01: System Rules](docs/01_SYSTEM_RULES.md)
- [Phase 02: Project Setup](docs/02_PROJECT_SETUP.md)
- [Phase 03: Architecture](docs/03_ARCHITECTURE.md)
- [Phase 04: Database](docs/04_DATABASE.md)
- [Phase 05: IPC](docs/05_IPC.md)
- [Phase 06: UI](docs/06_UI.md)
- [Phase 07: Video Player](docs/07_VIDEO_PLAYER.md)
- [Phase 08: FFmpeg Manager](docs/08_FFMPEG_MANAGER.md)
- [Phase 09: Video Engine](docs/09_VIDEO_ENGINE.md)
- [Phase 10: GPU Manager](docs/10_GPU_MANAGER.md)
- [Phase 11: Queue System](docs/11_QUEUE_SYSTEM.md)
- [Phase 12: Watch Folder](docs/12_WATCH_FOLDER.md)
- [Phase 13: Performance Monitor](docs/13_PERFORMANCE_MONITOR.md)
- [Phase 14: Scheduler](docs/14_SCHEDULER.md)
- [Phase 15: History](docs/15_HISTORY.md)
- [Phase 16: Profiles & Settings](docs/16_PROFILES_AND_SETTINGS.md)
- [Phase 17: Error Logging & Recovery](docs/17_ERROR_LOGGING_RECOVERY.md)
- [Phase 18: Testing](docs/18_TESTING.md)
- [Phase 19: Build & Release](docs/19_BUILD_RELEASE.md)
- [Phase 20: Final Audit](docs/20_FINAL_AUDIT.md)

---

## Development Setup

```bash
# Install dependencies
npm install

# Run development app
npm run dev

# Run unit tests
npm test

# Build production bundle & executable
npm run build
npm run package
```

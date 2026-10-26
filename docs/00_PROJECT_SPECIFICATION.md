# Phase 00: Project Specification

## Status
COMPLETED

## Objective
Define the comprehensive product specification, system requirements, architecture overview, operational constraints, and technical roadmap for Video Repeat Studio.

---

## Product Vision
Video Repeat Studio is a native, offline Windows desktop application engineered for content creators, video editors, performance artists, and educators who need to separate an intro segment of a video from its main body, repeat the body segment a customizable number of times ($N$), and seamlessly concatenate the segments back into a single high-quality video file.

---

## Core Features & Workflows

### 1. Single File Repeat Studio
- **File Ingestion**: Interactive drag-and-drop or file selector supporting MP4, MKV, MOV, AVI, WEBM, and TS files.
- **Interactive Player**: HTML5/Canvas video player with frame-accurate step forward/backward, time scrubbing, and speed adjustment.
- **Visual Marker Selection**:
  - `Intro Start` fixed at `00:00.000`.
  - `Intro End` timestamp selection via timeline click, scrub bar, or precise timestamp input.
  - Interactive preview of Intro vs Body loop sections.
- **Repeat Configuration**: Counter selector for repeat count $N$ ($1 \le N \le 999$).
- **Smart Render Strategy**:
  - Automatically checks if `Intro End` falls on a keyframe (I-frame).
  - Uses Stream Copy (`-c copy`) for near-instant rendering without quality loss when keyframe-aligned.
  - Automatically falls back to GPU/CPU encoding for sub-keyframe frame accuracy.

### 2. Batch Processing Queue
- Queue manager accepting multiple video processing jobs.
- Prioritization, pause, resume, retry, and cancellation controls.
- Real-time progress percentage, current stage (Probe, Split, Repeat, Concat, Cleanup), rendering FPS, and ETA calculations.
- Persistent SQLite state storage (`jobs` table) ensuring queue survives application crashes or restarts cleanly.

### 3. Watch Folder Automation
- Monitors local directories continuously using `chokidar`.
- File size stability checks to ensure incoming file copies/downloads finish before processing begins.
- Automatic hash-based deduplication (`processed_files` table).
- Configurable rules per watched folder (Intro length, repeat count, target export directory).

### 4. Automated Task Scheduler
- Cron and time-based recurring batch execution service.
- Enable/disable schedule toggles and execution log tracking.

### 5. System Telemetry & Performance HUD
- Real-time HUD displaying CPU %, RAM usage (MB), GPU engine load (NVIDIA NVENC / Intel QSV / AMD AMF), and disk write speed.

### 6. Processing History & Presets
- Full audit history log searchable by file name, date, encoder, and result.
- One-click export to CSV/JSON.
- Custom encoding preset profiles (Containers: MP4/MKV/MOV; Encoders: Copy, NVENC, QSV, AMF, x264, x265).

---

## Technical Stack & Architecture

- **Shell & Runtime**: Electron + Node.js (Main Process)
- **Frontend Framework**: React 18 + TypeScript + Vite (Renderer Process)
- **Styling**: Modern dark mode with Tailwind CSS and Lucide icons
- **Database**: SQLite (`better-sqlite3`) with WAL (Write-Ahead Logging) enabled
- **Media Engine**: Static FFmpeg and FFprobe binaries
- **Packaging**: Electron Builder (NSIS Installer & Portable Executable)

---

## System Requirements
- **OS**: Windows 10 x64 / Windows 11 x64
- **RAM**: 4 GB minimum (8 GB recommended)
- **GPU Acceleration**: NVIDIA GeForce (NVENC), Intel HD/UHD/Arc (QSV), AMD Radeon (AMF)
- **Disk Space**: 500 MB for app installation + workspace disk space for video outputs

---

## Validation & Verification
- [x] All 21 phase files created in `docs/` with standard template structure.
- [x] Core project files (`README.md`, `ARCHITECTURE.md`, `AI_CONTEXT.md`) initialized.
- [x] Complete product specification approved and locked.

---

## Completion Criteria
- Comprehensive product specification documented and verified.
- Phase 00 status updated to `COMPLETED` in `docs/00_PROJECT_SPECIFICATION.md` and `AI_CONTEXT.md`.

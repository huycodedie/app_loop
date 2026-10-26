# Video Repeat Studio — Build & Packaging Guide

## Overview
This document provides complete instructions for compiling, testing, and packaging **Video Repeat Studio** for production distribution on Windows 10 & 11 (x64).

## Prerequisites
- Node.js (v20+ recommended)
- npm (v10+ recommended)
- Windows 10/11 x64 environment
- Pre-bundled FFmpeg & FFprobe executables in `resources/ffmpeg/` (`ffmpeg.exe`, `ffprobe.exe`)

---

## Build Commands

### 1. TypeScript Strict Typecheck
```powershell
npm run typecheck
```
Verifies that all TypeScript code compiles with 0 errors under strict type checking.

### 2. Automated Vitest Unit & Integration Test Suite
```powershell
npm run test
```
Runs all 146 unit and integration tests across 12 test suites:
- `tests/formatters.test.ts`
- `tests/videoMath.test.ts`
- `tests/outputDirectoryResolver.test.ts`
- `tests/videoWorkflow.test.ts`
- `tests/watchFolderAndSchedulerIntegration.test.ts`
- `tests/ffmpegProgressParser.test.ts`
- `tests/ffmpegResolver.test.ts`
- `tests/sourceNormalization.test.ts`
- `tests/backgroundAndTray.test.ts`
- `tests/sourceFileStatus.test.ts`
- `tests/watchFolderEdit.test.ts`
- `tests/durationMode.test.ts`

### 3. Production Compilation & Packaging
```powershell
npm run package
```
Executes:
1. `tsc --noEmit`
2. `vite build --config vite.main.config.ts`
3. `vite build --config vite.preload.config.ts`
4. `vite build`
5. `electron-builder --win --x64`

---

## Deliverables & Output Directory

All build artifacts are generated inside the `release/` directory:

```
release/
├── Video Repeat Studio Setup.exe       (NSIS Production Installer)
├── Video Repeat Studio Portable.exe    (Standalone Portable Build)
├── latest.yml                          (Auto-Updater Config)
├── builder-effective-config.yaml
└── win-unpacked/                       (Unpacked distribution directory)
    ├── Video Repeat Studio.exe
    ├── resources/
    │   ├── app.asar
    │   └── resources/
    │       └── ffmpeg/
    │           ├── ffmpeg.exe
    │           └── ffprobe.exe
    └── ...
```

---

## Packaging Configurations (`electron-builder.json`)

- **Asar Packaging**: Enabled (`"asar": true`).
- **Native Dependencies**: Unpacked (`better-sqlite3` native module unpacked automatically).
- **FFmpeg Distribution**: Bundled automatically via `extraResources` from `resources/` directory.
- **Target OS**: Windows 10 x64, Windows 11 x64.
- **AppData Storage Boundary**: All writable runtime data stored in `%APPDATA%\Video Repeat Studio\`.

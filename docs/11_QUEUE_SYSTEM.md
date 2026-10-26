# Phase 11: Queue System

## Status
COMPLETED

## Objective
Implement a multi-job batch queue processing engine with priority ordering, pause/resume/cancel controls, persistent queue state recovery across application restarts, real-time machine-readable FFmpeg progress updates, and source provenance tracking.

## Architecture & Features
- **Queue State Machine**: `WAITING`, `READY`, `PROCESSING`, `PAUSED`, `COMPLETED`, `FAILED`, `CANCELLED`, `INTERRUPTED`.
- **Source Provenance**: Every job tracks `sourceType` (`MANUAL`, `WATCH_FOLDER`, `SCHEDULER`), `autoDailyOutputFolder`, `baseOutputDirectory`, and `resolvedOutputDirectory`.
- **Daily Subfolder Resolution**: For Watch Folder jobs with auto daily folder enabled, `QueueService` resolves the daily folder at job processing start time (`Date.now()`) using the computer's local date.
- **Retry Folder Lock**: Retried jobs retain their previously locked `resolvedOutputDirectory` even across midnight.
- **Machine-Readable Progress**: Real-time progress pipeline with 500ms IPC throttle, 1500ms SQLite persist throttle, 99% verification hold, and 100% completion on confirmed output.

## Key Files
- `src/main/services/QueueService.ts`
- `src/main/repositories/JobsRepository.ts`
- `src/renderer/src/pages/QueuePage.tsx`
- `src/renderer/src/components/JobProgressBar.tsx`

## Validation
- 114 vitest tests passing.

# Phase 15: History Repository & Provenance

## Status
COMPLETED

## Objective
Maintain a comprehensive SQLite history record of all processed video repeat jobs, including performance metrics, repeat calculations, source file status naming, and source provenance.

## Tracked Attributes
- Job Identification: `id`, `jobId`, `inputFile`, `outputFile`
- Source File Naming (`SourceFileStatusService`):
  - `originalFilename`: Clean original filename (e.g., `rain.mp4`)
  - `currentFilename`: Status-renamed filename (e.g., `rain_DONE.mp4` or `rain_ERROR.mp4`)
- Datetimes: `createdTime`, `startedTime`, `completedTime`
- Repeat Calculations (`calculateRepeatPlan`):
  - `originalDuration`: Source video duration in seconds
  - `repeatCount`: Requested repetition multiplier
  - `naturalDuration`: `originalDuration × repeatCount`
  - `durationLimitEnabled`, `requestedDurationLimit`
  - `finalDuration`: Effective output file duration
  - `fullCopyCount`: Number of complete source copies
  - `partialCopyDurationSeconds`: Partial ending copy duration
- Audio Fade-in: `audioFadeInEnabled`, `audioFadeInDurationSeconds`
- Source Provenance:
  - `jobSourceType`: `MANUAL` | `WATCH_FOLDER` | `SCHEDULER`
  - `autoDailyOutputFolder`: boolean
  - `dailyFolderName`: Subfolder string e.g. `28_8`
  - `resolvedOutputDirectory`: Full output path used
- Performance & Output: `encoder`, `gpu`, `status`, `processingTimeMs`, `outputSizeBytes`, `failureReason`

## Key Files
- `src/main/repositories/HistoryRepository.ts`
- `src/main/services/SourceFileStatusService.ts`
- `src/renderer/src/pages/HistoryPage.tsx`

# Phase 14: Automated Scheduler Service

## Status
COMPLETED

## Objective
Schedule automated video repeat processing tasks using standard Cron expressions, with full support for Audio Fade-in and Output Duration Limits.

## Architecture & Features
- **Cron Engine**: Periodic timer checking active schedules against current datetime.
- **Duration Limit Support**: Scheduler tasks store full `RepeatJobConfig` snapshots inside `jobConfigJson` (including `durationLimitEnabled` and `durationLimitSeconds`).
- **Shared Semantics**: Uses the exact same `calculateRepeatPlan()` math as manual Video Processing and Watch Folder workflows.
- **Snapshot Execution**: When a schedule fires, it creates a standalone queue job with `sourceType: 'SCHEDULER'`. Subsequent changes to the schedule configuration do not affect already queued jobs.
- **UI List Summary**: Shows repeat count and duration limit (e.g. `Lặp: 30x • Giới hạn: 03:00:00.000`) directly on schedule list items.

## Key Files
- `src/main/services/SchedulerService.ts`
- `src/main/repositories/SchedulesRepository.ts`
- `src/renderer/src/pages/SchedulerPage.tsx`
- `src/renderer/src/components/DurationLimitControl.tsx`

# Phase 16: Profiles & Global Settings

## Status
COMPLETED

## Objective
Manage application settings, processing profiles, hardware encoding defaults, background processing behavior, and System Tray configurations.

## Configuration Tokens & Defaults
- `outputFolder`: Root default output path
- `repeatCount`: Default 3x
- `audioFadeInEnabled`: Default true
- `audioFadeInDurationSeconds`: Default 5.0s
- `durationLimitEnabled`: Default false
- `durationLimitSeconds`: Default 10800s (3 hours)
- `autoStartQueue`: Default true

### Background Processing & System Tray Settings (CHẠY NỀN)
- `runInBackground`: Default `true` (keeps Main Process and background watchers running on window close)
- `closeBehavior`: `'TRAY'` (default) or `'QUIT'`
- `launchAtStartup`: Default `false` (toggles Windows auto-start via `app.setLoginItemSettings`)
- `startMinimized`: Default `false` (launches application hidden to System Tray)
- `showCloseToTrayNotification`: Default `true` (displays first-close Windows notification)
- `backgroundCompletionNotifications`: Default `true` (displays Windows OS notifications when background jobs complete or fail)

## Key Files
- `src/main/repositories/SettingsRepository.ts`
- `src/main/repositories/ProfilesRepository.ts`
- `src/main/services/TrayService.ts`
- `src/renderer/src/pages/SettingsPage.tsx`

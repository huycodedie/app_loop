# Phase 23: Output Duration Mode System

## Status
COMPLETED

## Objective
Provide a unified, centralized Output Duration Mode system allowing users to calculate video repetition by target duration using two distinct modes:
1. **EXACT Mode (`Chính xác thời lượng`)**: Caps output at exact target duration by trimming the final video repetition.
2. **MINIMUM Mode (`Đủ thời lượng`)**: Guarantees output duration meets or exceeds target duration without trimming any repetition.

## Architecture & Mode Specifications

### 1. EXACT Duration Mode (`EXACT`)
- **Formula**: `repeatCount = ceil(targetDuration / sourceDuration)`
- **Behavior**:
  - `fullCopyCount = floor(targetDuration / sourceDuration)`
  - `partialCopyDurationSeconds = targetDuration - (fullCopyCount * sourceDuration)`
  - `hasPartialFinalCopy = true` (when partial > 0.04s)
- **Output**: Exactly `targetDuration` (e.g. 01:00:00).

### 2. MINIMUM Duration Mode (`MINIMUM`)
- **Formula**: `repeatCount = ceil(targetDuration / sourceDuration)`
- **Behavior**:
  - `fullCopyCount = repeatCount`
  - `partialCopyDurationSeconds = 0`
  - `hasPartialFinalCopy = false`
  - `expectedFinalDuration = sourceDuration × repeatCount`
  - `overshootSeconds = expectedFinalDuration - targetDuration`
- **Output**: Full repeats without trimming (e.g., 10:53 × 6 = 01:05:18, overshoot = 05:18).

### 3. Maximum Overshoot Protection (`maxOvershootSeconds`)
- Optional threshold setting in MINIMUM mode.
- If `overshootSeconds > maxOvershootSeconds`, the system automatically falls back to **EXACT** mode (`fallbackToExact = true`), trimming the final repetition so output does not exceed the target + overshoot limit.

## System Integration
Unified `calculateRepeatPlan` service is reused across:
- **Video Processing Page**
- **Watch Folder Service**
- **Scheduler Service**
- **Profiles Repository**
- **Queue Service**
- **History Repository**

## Key Files
- `src/shared/utils/repeatPlan.ts`
- `src/renderer/src/components/DurationLimitControl.tsx`
- `src/main/database/db.ts` (Migration 008)
- `tests/durationMode.test.ts`

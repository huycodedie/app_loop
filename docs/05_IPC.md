# Phase 05: IPC

## Status
PENDING

## Objective
Establish secure, type-safe Inter-Process Communication (IPC) bridges between the Electron Main process and Renderer UI.

## Scope
- Preload script context bridge bindings (`window.electronAPI`).
- Main process IPC channel handlers (`ipcMain.handle` / `ipcMain.on`).
- Renderer IPC client utilities (`src/renderer/ipc/`).

## Required Files
- `src/preload/index.ts`
- `src/main/ipc/index.ts`
- `src/shared/ipc/channels.ts`
- `src/renderer/ipc/client.ts`

## Implementation Decisions
- Strict channel mapping using string enums to prevent channel typos.
- Structured response wrapper `{ success: boolean, data?: T, error?: string }`.

## Validation
- IPC ping/pong test passes cleanly.
- Full type safety verified across Main and Renderer process calls.

## Completion Criteria
- IPC contract implemented for all video, queue, settings, history, GPU, watcher, and scheduler operations.

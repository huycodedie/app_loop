# Phase 01: System Rules

## Status
PENDING

## Objective
Establish mandatory coding standards, security constraints, safety patterns, and repository rules for Video Repeat Studio.

## Scope
- Security model: Strict IPC isolation, `contextIsolation: true`, `nodeIntegration: false`.
- Error handling patterns: Structured error objects, graceful degradation, and retry mechanics.
- File system safety: Atomic writes, temp file cleanup, path sanitization.
- Threading & Performance: Main thread non-blocking guidelines, worker pool management for FFmpeg and SQLite.

## Required Files
- `docs/01_SYSTEM_RULES.md`
- `src/main/index.ts`
- `src/preload/index.ts`

## Implementation Decisions
- No direct Node.js module access or direct database access permitted in the Renderer process.
- All OS and background operations must pass through strictly typed IPC handlers.
- IPC payloads must validate types at runtime boundaries.

## Validation
- [ ] Codebase linting and formatting rules enforced via ESLint/TypeScript settings.
- [ ] Electron security settings verified in main window configuration.

## Completion Criteria
- Security rules, file safety guidelines, and architectural boundaries clearly documented and enforced.

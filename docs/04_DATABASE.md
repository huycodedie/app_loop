# Phase 04: Database

## Status
PENDING

## Objective
Design and implement the SQLite database schema, migration runner, entity repositories, and transactional operations using `better-sqlite3`.

## Scope
- Schema migrations (`settings`, `jobs`, `history`, `watch_folders`, `processed_files`, `profiles`, `schedules`).
- Database initialization and connection management.
- Data access objects / repositories for entity CRUD operations.

## Required Files
- `src/main/database/index.ts`
- `src/main/database/migrations.ts`
- `src/main/database/repositories/jobs.repository.ts`
- `src/main/database/repositories/settings.repository.ts`
- `src/main/database/repositories/history.repository.ts`

## Implementation Decisions
- WAL (Write-Ahead Logging) mode enabled for high-performance concurrent read/write access.
- Synchronous auto-migrations on application boot.

## Validation
- Unit tests for database creation, table migrations, and repository queries.
- Clean handling of database locks and corruption recovery.

## Completion Criteria
- SQLite schema implemented and verified.
- All repository interfaces operational with transaction support.

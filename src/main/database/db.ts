import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { logger } from '../services/Logger';

let dbInstance: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }

  try {
    const baseDir = app ? app.getPath('appData') : (process.env.APPDATA || process.cwd());
    const userDataPath = path.join(baseDir, 'Video Repeat Studio');
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }

    const dbPath = path.join(userDataPath, 'video_repeat_studio.sqlite');
    logger.info('DATABASE', `Connecting to SQLite database at: ${dbPath}`);

    dbInstance = new Database(dbPath);
    dbInstance.pragma('journal_mode = WAL');
    dbInstance.pragma('foreign_keys = ON');

    runMigrations(dbInstance);
    logger.info('DATABASE', 'SQLite database initialized and migrations verified.');

    return dbInstance;
  } catch (err: any) {
    dbInstance?.close();
    dbInstance = null;
    logger.error('DATABASE', 'Failed to initialize SQLite database', err);
    throw err;
  }
}

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const initialMigrationName = '001_initial_schema';
  const initialRow = db.prepare('SELECT id FROM migrations WHERE name = ?').get(initialMigrationName);

  if (!initialRow) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS jobs (
          id TEXT PRIMARY KEY,
          input_path TEXT NOT NULL,
          output_path TEXT NOT NULL,
          intro_end REAL DEFAULT 0,
          repeat_count INTEGER NOT NULL,
          audio_fade_in_enabled INTEGER NOT NULL DEFAULT 1,
          audio_fade_in_duration_seconds REAL NOT NULL DEFAULT 5.0,
          status TEXT NOT NULL,
          stage TEXT NOT NULL DEFAULT 'IDLE',
          progress REAL NOT NULL DEFAULT 0,
          priority INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          started_at TEXT,
          completed_at TEXT,
          error TEXT
        );

        CREATE TABLE IF NOT EXISTS history (
          id TEXT PRIMARY KEY,
          job_id TEXT NOT NULL,
          input_file TEXT NOT NULL,
          output_file TEXT NOT NULL,
          created_time TEXT NOT NULL,
          started_time TEXT,
          completed_time TEXT,
          original_duration REAL NOT NULL,
          intro_duration REAL DEFAULT 0,
          repeat_duration REAL DEFAULT 0,
          repeat_count INTEGER NOT NULL,
          audio_fade_in_enabled INTEGER NOT NULL DEFAULT 1,
          audio_fade_in_duration_seconds REAL NOT NULL DEFAULT 5.0,
          final_duration REAL NOT NULL,
          encoder TEXT NOT NULL,
          gpu TEXT NOT NULL,
          status TEXT NOT NULL,
          processing_time_ms INTEGER NOT NULL,
          output_size_bytes INTEGER NOT NULL,
          failure_reason TEXT
        );

        CREATE TABLE IF NOT EXISTS watch_folders (
          id TEXT PRIMARY KEY,
          folder_path TEXT NOT NULL UNIQUE,
          output_folder TEXT NOT NULL,
          repeat_count INTEGER NOT NULL,
          intro_end REAL DEFAULT 0,
          audio_fade_in_enabled INTEGER NOT NULL DEFAULT 1,
          audio_fade_in_duration_seconds REAL NOT NULL DEFAULT 5.0,
          enabled INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS processed_files (
          id TEXT PRIMARY KEY,
          watch_folder_id TEXT NOT NULL,
          file_path TEXT NOT NULL UNIQUE,
          file_hash TEXT,
          processed_at TEXT NOT NULL,
          FOREIGN KEY (watch_folder_id) REFERENCES watch_folders(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS profiles (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          encoder TEXT NOT NULL,
          gpu_mode TEXT NOT NULL,
          preset TEXT NOT NULL,
          crf INTEGER NOT NULL,
          output_folder TEXT NOT NULL,
          container TEXT NOT NULL,
          audio_bitrate TEXT NOT NULL,
          filename_template TEXT NOT NULL,
          default_repeat_count INTEGER NOT NULL DEFAULT 3,
          audio_fade_in_enabled INTEGER NOT NULL DEFAULT 1,
          default_audio_fade_in_duration REAL NOT NULL DEFAULT 5.0,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS schedules (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          job_config_json TEXT NOT NULL,
          cron_expression TEXT NOT NULL,
          next_run TEXT,
          last_run TEXT,
          enabled INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL
        );
      `);

      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(initialMigrationName);
      logger.info('DATABASE', `Executed migration: ${initialMigrationName}`);
    })();
  }

  // Migration 002: Add audio fade-in columns to existing databases safely
  const v2MigrationName = '002_audio_fade_in_workflow';
  const v2Row = db.prepare('SELECT id FROM migrations WHERE name = ?').get(v2MigrationName);

  if (!v2Row) {
    db.transaction(() => {
      const addColumnSafely = (tableName: string, colDef: string) => {
        try {
          db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${colDef}`);
        } catch {
          // Column may already exist
        }
      };

      addColumnSafely('jobs', 'audio_fade_in_enabled INTEGER NOT NULL DEFAULT 1');
      addColumnSafely('jobs', 'audio_fade_in_duration_seconds REAL NOT NULL DEFAULT 5.0');

      addColumnSafely('history', 'audio_fade_in_enabled INTEGER NOT NULL DEFAULT 1');
      addColumnSafely('history', 'audio_fade_in_duration_seconds REAL NOT NULL DEFAULT 5.0');

      addColumnSafely('watch_folders', 'audio_fade_in_enabled INTEGER NOT NULL DEFAULT 1');
      addColumnSafely('watch_folders', 'audio_fade_in_duration_seconds REAL NOT NULL DEFAULT 5.0');

      addColumnSafely('profiles', 'default_repeat_count INTEGER NOT NULL DEFAULT 3');
      addColumnSafely('profiles', 'audio_fade_in_enabled INTEGER NOT NULL DEFAULT 1');
      addColumnSafely('profiles', 'default_audio_fade_in_duration REAL NOT NULL DEFAULT 5.0');

      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(v2MigrationName);
      logger.info('DATABASE', `Executed migration: ${v2MigrationName}`);
    })();
  }

  // Migration 003: Add output duration limit columns
  const v3MigrationName = '003_duration_limit';
  const v3Row = db.prepare('SELECT id FROM migrations WHERE name = ?').get(v3MigrationName);

  if (!v3Row) {
    db.transaction(() => {
      const addColSafe = (tableName: string, colDef: string) => {
        try {
          db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${colDef}`);
        } catch {
          // Column may already exist
        }
      };

      addColSafe('jobs', 'duration_limit_enabled INTEGER NOT NULL DEFAULT 0');
      addColSafe('jobs', 'duration_limit_seconds REAL');

      addColSafe('history', 'natural_duration REAL');
      addColSafe('history', 'duration_limit_enabled INTEGER NOT NULL DEFAULT 0');
      addColSafe('history', 'requested_duration_limit REAL');
      addColSafe('history', 'full_copy_count INTEGER');
      addColSafe('history', 'partial_copy_duration_seconds REAL NOT NULL DEFAULT 0');

      addColSafe('watch_folders', 'duration_limit_enabled INTEGER NOT NULL DEFAULT 0');
      addColSafe('watch_folders', 'duration_limit_seconds REAL');

      addColSafe('profiles', 'duration_limit_enabled INTEGER NOT NULL DEFAULT 0');
      addColSafe('profiles', 'default_duration_limit_seconds REAL NOT NULL DEFAULT 10800');

      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(v3MigrationName);
      logger.info('DATABASE', `Executed migration: ${v3MigrationName}`);
    })();
  }

  // Migration 004: Auto daily output folders, job source tracking
  const v4MigrationName = '004_watch_folder_daily_folders';
  const v4Row = db.prepare('SELECT id FROM migrations WHERE name = ?').get(v4MigrationName);

  if (!v4Row) {
    db.transaction(() => {
      const addColSafe = (tableName: string, colDef: string) => {
        try {
          db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${colDef}`);
        } catch {
          // Column may already exist
        }
      };

      // Watch Folders: auto daily folder support
      addColSafe('watch_folders', 'auto_daily_output_folder INTEGER NOT NULL DEFAULT 0');
      addColSafe('watch_folders', 'daily_folder_format TEXT DEFAULT \'DAY_MONTH\'');

      // Jobs: source tracking + resolved output
      addColSafe('jobs', 'source_type TEXT DEFAULT \'MANUAL\'');
      addColSafe('jobs', 'resolved_output_directory TEXT');
      addColSafe('jobs', 'auto_daily_output_folder INTEGER DEFAULT 0');
      addColSafe('jobs', 'base_output_directory TEXT');

      // History: provenance fields
      addColSafe('history', 'job_source_type TEXT DEFAULT \'MANUAL\'');
      addColSafe('history', 'auto_daily_output_folder INTEGER DEFAULT 0');
      addColSafe('history', 'daily_folder_name TEXT');
      addColSafe('history', 'resolved_output_directory TEXT');

      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(v4MigrationName);
      logger.info('DATABASE', `Executed migration: ${v4MigrationName}`);
    })();
  }

  // Migration 005: Auto calculated repeat count fields
  const v5MigrationName = '005_auto_calculated_repeat_count';
  const v5Row = db.prepare('SELECT id FROM migrations WHERE name = ?').get(v5MigrationName);

  if (!v5Row) {
    db.transaction(() => {
      const addColSafe = (tableName: string, colDef: string) => {
        try {
          db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${colDef}`);
        } catch {
          // Column may already exist
        }
      };

      addColSafe('jobs', 'effective_repeat_count INTEGER');
      addColSafe('jobs', 'manual_repeat_count INTEGER');

      addColSafe('history', 'effective_repeat_count INTEGER');
      addColSafe('history', 'manual_repeat_count INTEGER');

      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(v5MigrationName);
      logger.info('DATABASE', `Executed migration: ${v5MigrationName}`);
    })();
  }

  // Migration 006: Source File Status Management & Errors Tracking
  const v6MigrationName = '006_source_file_status_management';
  const v6Row = db.prepare('SELECT id FROM migrations WHERE name = ?').get(v6MigrationName);

  if (!v6Row) {
    db.transaction(() => {
      const addColSafe = (tableName: string, colDef: string) => {
        try {
          db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${colDef}`);
        } catch {
          // Column may already exist
        }
      };

      db.exec(`
        CREATE TABLE IF NOT EXISTS source_file_errors (
          id TEXT PRIMARY KEY,
          job_id TEXT,
          source_path TEXT NOT NULL,
          original_filename TEXT NOT NULL,
          current_filename TEXT NOT NULL,
          error_status TEXT NOT NULL,
          error_message TEXT NOT NULL,
          failed_stage TEXT,
          failed_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
      `);

      addColSafe('jobs', 'original_filename TEXT');
      addColSafe('jobs', 'current_filename TEXT');

      addColSafe('history', 'original_filename TEXT');
      addColSafe('history', 'current_filename TEXT');

      addColSafe('watch_folders', 'rename_source_files INTEGER NOT NULL DEFAULT 1');
      addColSafe('watch_folders', 'error_naming_mode TEXT DEFAULT \'SIMPLE\'');

      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(v6MigrationName);
      logger.info('DATABASE', `Executed migration: ${v6MigrationName}`);
    })();
  }

  // Migration 007: Watch Folder Edit Fields & Stats
  const v7MigrationName = '007_watch_folder_edit_fields';
  const v7Row = db.prepare('SELECT id FROM migrations WHERE name = ?').get(v7MigrationName);

  if (!v7Row) {
    db.transaction(() => {
      const addColSafe = (tableName: string, colDef: string) => {
        try {
          db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${colDef}`);
        } catch {
          // Column may already exist
        }
      };

      addColSafe('watch_folders', 'name TEXT');
      addColSafe('watch_folders', 'gpu_mode TEXT DEFAULT \'AUTO\'');
      addColSafe('watch_folders', 'encoder TEXT DEFAULT \'libx264\'');
      addColSafe('watch_folders', 'stability_threshold_ms INTEGER DEFAULT 3000');
      addColSafe('watch_folders', 'updated_at TEXT');

      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(v7MigrationName);
      logger.info('DATABASE', `Executed migration: ${v7MigrationName}`);
    })();
  }

  // Migration 008: Output Duration Mode (EXACT vs MINIMUM + Max Overshoot)
  const v8MigrationName = '008_output_duration_mode';
  const v8Row = db.prepare('SELECT id FROM migrations WHERE name = ?').get(v8MigrationName);

  if (!v8Row) {
    db.transaction(() => {
      const addColSafe = (tableName: string, colDef: string) => {
        try {
          db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${colDef}`);
        } catch {
          // Column may already exist
        }
      };

      addColSafe('watch_folders', 'duration_mode TEXT DEFAULT \'EXACT\'');
      addColSafe('watch_folders', 'max_overshoot_seconds INTEGER');

      addColSafe('jobs', 'duration_mode TEXT DEFAULT \'EXACT\'');
      addColSafe('jobs', 'max_overshoot_seconds INTEGER');
      addColSafe('jobs', 'expected_final_duration REAL');
      addColSafe('jobs', 'overshoot_seconds REAL');

      addColSafe('history', 'duration_mode TEXT DEFAULT \'EXACT\'');
      addColSafe('history', 'max_overshoot_seconds INTEGER');
      addColSafe('history', 'actual_output_duration REAL');
      addColSafe('history', 'overshoot_seconds REAL');
      addColSafe('history', 'partial_final_copy INTEGER DEFAULT 0');

      addColSafe('schedules', 'duration_mode TEXT DEFAULT \'EXACT\'');
      addColSafe('schedules', 'max_overshoot_seconds INTEGER');

      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(v8MigrationName);
      logger.info('DATABASE', `Executed migration: ${v8MigrationName}`);
    })();
  }
  const v9MigrationName = '009_queued_job_settings';
  if (!db.prepare('SELECT id FROM migrations WHERE name = ?').get(v9MigrationName)) {
    db.transaction(() => {
      db.exec('ALTER TABLE jobs ADD COLUMN job_config_json TEXT');
      db.exec('ALTER TABLE jobs ADD COLUMN rename_source_files INTEGER');
      db.exec('ALTER TABLE jobs ADD COLUMN error_naming_mode TEXT');
      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(v9MigrationName);
    })();
  }
  const v10MigrationName = '010_watch_job_provenance';
  if (!db.prepare('SELECT id FROM migrations WHERE name = ?').get(v10MigrationName)) {
    db.transaction(() => {
      db.exec('ALTER TABLE jobs ADD COLUMN watch_folder_id TEXT');
      db.exec('ALTER TABLE jobs ADD COLUMN watch_folder_name TEXT');
      db.exec('ALTER TABLE jobs ADD COLUMN source_duration_seconds REAL');

      // An input directory alone cannot distinguish a manual job or an old rule.
      // Recover provenance only from an exact recorded enqueue path, including
      // a saved pre-status-rename input path when available.
      const processed = db.prepare(`
        SELECT p.file_path, p.processed_at, w.id, w.name, w.folder_path, w.created_at AS rule_created_at
        FROM processed_files p JOIN watch_folders w ON w.id = p.watch_folder_id
      `).all() as Array<{ file_path: string; processed_at: string; id: string; name: string | null; folder_path: string; rule_created_at: string }>;
      const paths = new Map<string, Array<typeof processed[number]>>();
      const pathKey = (value: string) => path.resolve(value).toLowerCase();
      for (const record of processed) {
        const key = pathKey(record.file_path);
        if (!paths.has(key)) paths.set(key, []);
        paths.get(key)!.push(record);
      }
      const legacyJobs = db.prepare(`
        SELECT id, input_path, job_config_json, created_at FROM jobs
        WHERE source_type = 'WATCH_FOLDER' AND watch_folder_id IS NULL
      `).all() as Array<{ id: string; input_path: string; job_config_json: string | null; created_at: string }>;
      const assign = db.prepare('UPDATE jobs SET watch_folder_id = ?, watch_folder_name = ? WHERE id = ?');
      for (const job of legacyJobs) {
        const createdAt = Date.parse(job.created_at);
        if (!Number.isFinite(createdAt)) continue;
        const candidates = new Map<string, typeof processed[number]>();
        const inputPaths = [job.input_path];
        if (job.job_config_json) {
          try {
            const snapshot = JSON.parse(job.job_config_json);
            if (typeof snapshot.inputPath === 'string') inputPaths.push(snapshot.inputPath);
          } catch { /* A corrupt legacy snapshot must not prevent schema migration. */ }
        }
        for (const inputPath of inputPaths) {
          for (const record of paths.get(pathKey(inputPath)) ?? []) {
            const processedAt = Date.parse(record.processed_at);
            const ruleCreatedAt = Date.parse(record.rule_created_at);
            // The enqueue receipt is written immediately after addJob returns.
            // Reject paths reused later, rules created after the old job, and
            // records whose timestamps cannot establish this enqueue relation.
            if (!Number.isFinite(processedAt) || !Number.isFinite(ruleCreatedAt)
              || ruleCreatedAt > createdAt || processedAt < createdAt || processedAt - createdAt > 10_000) continue;
            candidates.set(record.id, record);
          }
        }
        if (candidates.size === 1) {
          const record = candidates.values().next().value!;
          assign.run(record.id, record.name?.trim() || path.basename(record.folder_path) || record.id, job.id);
        }
      }
      db.exec('CREATE INDEX IF NOT EXISTS jobs_watch_folder_pending ON jobs(watch_folder_id, status)');
      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(v10MigrationName);
    })();
  }
}

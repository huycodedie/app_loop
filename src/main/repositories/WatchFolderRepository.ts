import { getDatabase } from '../database/db';
import { WatchFolderConfig } from '@shared/types';

export class WatchFolderRepository {
  public getAllWatchFolders(): WatchFolderConfig[] {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM watch_folders ORDER BY created_at DESC').all() as any[];
    return rows.map(this.mapRowToConfig);
  }

  public addWatchFolder(config: WatchFolderConfig): WatchFolderConfig {
    const db = getDatabase();
    db.prepare(`
      INSERT INTO watch_folders (
        id, name, folder_path, output_folder, repeat_count, audio_fade_in_enabled,
        audio_fade_in_duration_seconds, duration_limit_enabled, duration_limit_seconds,
        duration_mode, max_overshoot_seconds,
        auto_daily_output_folder, daily_folder_format, rename_source_files, error_naming_mode,
        gpu_mode, encoder, stability_threshold_ms, intro_end, enabled, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      config.id,
      config.name || null,
      config.folderPath,
      config.outputFolder,
      config.repeatCount,
      config.audioFadeInEnabled ? 1 : 0,
      config.audioFadeInDurationSeconds ?? 5.0,
      config.durationLimitEnabled ? 1 : 0,
      config.durationLimitSeconds ?? null,
      config.durationMode ?? 'EXACT',
      config.maxOvershootSeconds ?? null,
      config.autoDailyOutputFolder ? 1 : 0,
      config.dailyFolderFormat ?? 'DAY_MONTH',
      config.renameSourceFiles ?? 1 ? 1 : 0,
      config.errorNamingMode ?? 'SIMPLE',
      config.gpuMode ?? 'AUTO',
      config.encoder ?? 'libx264',
      config.stabilityThresholdMs ?? 3000,
      config.introEnd ?? 0,
      config.enabled ? 1 : 0,
      config.createdAt,
      config.updatedAt || config.createdAt
    );
    return config;
  }

  public getWatchFolderById(id: string): WatchFolderConfig | null {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM watch_folders WHERE id = ?').get(id) as any;
    return row ? this.mapRowToConfig(row) : null;
  }

  public updateWatchFolder(id: string, updates: Partial<WatchFolderConfig>): WatchFolderConfig {
    const db = getDatabase();
    const existing = this.getWatchFolderById(id);
    if (!existing) {
      throw new Error(`Watch Folder with ID ${id} not found.`);
    }

    const merged: WatchFolderConfig = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    db.prepare(`
      UPDATE watch_folders SET
        name = ?,
        folder_path = ?,
        output_folder = ?,
        repeat_count = ?,
        audio_fade_in_enabled = ?,
        audio_fade_in_duration_seconds = ?,
        duration_limit_enabled = ?,
        duration_limit_seconds = ?,
        duration_mode = ?,
        max_overshoot_seconds = ?,
        auto_daily_output_folder = ?,
        daily_folder_format = ?,
        rename_source_files = ?,
        error_naming_mode = ?,
        gpu_mode = ?,
        encoder = ?,
        stability_threshold_ms = ?,
        enabled = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      merged.name || null,
      merged.folderPath,
      merged.outputFolder,
      merged.repeatCount,
      merged.audioFadeInEnabled ? 1 : 0,
      merged.audioFadeInDurationSeconds ?? 5.0,
      merged.durationLimitEnabled ? 1 : 0,
      merged.durationLimitSeconds ?? null,
      merged.durationMode ?? 'EXACT',
      merged.maxOvershootSeconds ?? null,
      merged.autoDailyOutputFolder ? 1 : 0,
      merged.dailyFolderFormat ?? 'DAY_MONTH',
      merged.renameSourceFiles ?? true ? 1 : 0,
      merged.errorNamingMode ?? 'SIMPLE',
      merged.gpuMode ?? 'AUTO',
      merged.encoder ?? 'libx264',
      merged.stabilityThresholdMs ?? 3000,
      merged.enabled ? 1 : 0,
      merged.updatedAt,
      id
    );

    return merged;
  }

  public removeWatchFolder(id: string): void {
    const db = getDatabase();
    db.prepare('DELETE FROM watch_folders WHERE id = ?').run(id);
  }

  public toggleWatchFolder(id: string, enabled: boolean): void {
    const db = getDatabase();
    db.prepare('UPDATE watch_folders SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);
  }

  public isFileProcessed(watchFolderId: string, filePath: string): boolean {
    const db = getDatabase();
    const row = db.prepare('SELECT id FROM processed_files WHERE watch_folder_id = ? AND file_path = ?').get(watchFolderId, filePath);
    return !!row;
  }

  public recordProcessedFile(id: string, watchFolderId: string, filePath: string, fileHash?: string): void {
    const db = getDatabase();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO processed_files (id, watch_folder_id, file_path, file_hash, processed_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, watchFolderId, filePath, fileHash || null, now);
  }

  public getLastProcessedFile(watchFolderId: string): { filePath: string; processedAt: string } | null {
    const db = getDatabase();
    const row = db.prepare('SELECT file_path, processed_at FROM processed_files WHERE watch_folder_id = ? ORDER BY processed_at DESC LIMIT 1').get(watchFolderId) as any;
    return row ? { filePath: row.file_path, processedAt: row.processed_at } : null;
  }

  public getProcessedCountToday(watchFolderId: string): number {
    const db = getDatabase();
    const todayPrefix = new Date().toISOString().slice(0, 10);
    const row = db.prepare('SELECT COUNT(*) as cnt FROM processed_files WHERE watch_folder_id = ? AND processed_at LIKE ?').get(watchFolderId, `${todayPrefix}%`) as any;
    return row ? row.cnt : 0;
  }

  private mapRowToConfig(row: any): WatchFolderConfig {
    return {
      id: row.id,
      name: row.name ?? undefined,
      folderPath: row.folder_path,
      outputFolder: row.output_folder,
      repeatCount: row.repeat_count,
      audioFadeInEnabled: Boolean(row.audio_fade_in_enabled ?? 1),
      audioFadeInDurationSeconds: row.audio_fade_in_duration_seconds ?? 5.0,
      durationLimitEnabled: Boolean(row.duration_limit_enabled ?? 0),
      durationLimitSeconds: row.duration_limit_seconds ?? null,
      durationMode: row.duration_mode ?? 'EXACT',
      maxOvershootSeconds: row.max_overshoot_seconds ?? null,
      autoDailyOutputFolder: Boolean(row.auto_daily_output_folder ?? 0),
      dailyFolderFormat: row.daily_folder_format ?? 'DAY_MONTH',
      renameSourceFiles: Boolean(row.rename_source_files ?? 1),
      errorNamingMode: row.error_naming_mode ?? 'SIMPLE',
      gpuMode: row.gpu_mode ?? 'AUTO',
      encoder: row.encoder ?? 'libx264',
      stabilityThresholdMs: row.stability_threshold_ms ?? 3000,
      introEnd: row.intro_end ?? undefined,
      enabled: Boolean(row.enabled),
      createdAt: row.created_at,
      updatedAt: row.updated_at ?? undefined,
    };
  }
}

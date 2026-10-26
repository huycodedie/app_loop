import { getDatabase } from '../database/db';
import { JobRecord, JobStatus, JobStage, JobSourceType } from '@shared/types';

export class JobsRepository {
  public getAllJobs(): JobRecord[] {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM jobs ORDER BY priority DESC, created_at ASC').all() as any[];
    return rows.map(this.mapRowToJob);
  }

  public getJobById(id: string): JobRecord | null {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as any;
    return row ? this.mapRowToJob(row) : null;
  }

  public createJob(job: JobRecord): JobRecord {
    const db = getDatabase();
    db.prepare(`
      INSERT INTO jobs (
        id, input_path, output_path, repeat_count,
        effective_repeat_count, manual_repeat_count,
        audio_fade_in_enabled, audio_fade_in_duration_seconds,
        duration_limit_enabled, duration_limit_seconds,
        duration_mode, max_overshoot_seconds, expected_final_duration, overshoot_seconds,
        source_type, resolved_output_directory, auto_daily_output_folder, base_output_directory,
        original_filename, current_filename,
        intro_end, status, stage, progress, priority,
        created_at, started_at, completed_at, error,
        job_config_json, rename_source_files, error_naming_mode,
        watch_folder_id, watch_folder_name, source_duration_seconds
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      job.id,
      job.inputPath,
      job.outputPath,
      job.repeatCount,
      job.effectiveRepeatCount ?? job.repeatCount,
      job.manualRepeatCount ?? job.repeatCount,
      job.audioFadeInEnabled ? 1 : 0,
      job.audioFadeInDurationSeconds ?? 5.0,
      job.durationLimitEnabled ? 1 : 0,
      job.durationLimitSeconds ?? null,
      job.durationMode ?? 'EXACT',
      job.maxOvershootSeconds ?? null,
      job.expectedFinalDuration ?? null,
      job.overshootSeconds ?? 0,
      job.sourceType ?? 'MANUAL',
      job.resolvedOutputDirectory ?? null,
      job.autoDailyOutputFolder ? 1 : 0,
      job.baseOutputDirectory ?? null,
      job.originalFilename ?? null,
      job.currentFilename ?? null,
      job.introEnd ?? 0,
      job.status,
      job.stage,
      job.progress,
      job.priority,
      job.createdAt,
      job.startedAt || null,
      job.completedAt || null,
      job.error || null,
      job.configSnapshot ? JSON.stringify(job.configSnapshot) : null,
      job.renameSourceFiles === undefined ? null : Number(job.renameSourceFiles),
      job.errorNamingMode ?? null,
      job.watchFolderId ?? null,
      job.watchFolderName ?? null,
      job.sourceDurationSeconds ?? null
    );
    return job;
  }

  public updateJobStatus(id: string, status: JobStatus, stage?: JobStage, progress?: number, error?: string): void {
    const db = getDatabase();
    const now = new Date().toISOString();
    
    let query = 'UPDATE jobs SET status = ?';
    const params: any[] = [status];

    if (stage) {
      query += ', stage = ?';
      params.push(stage);
    }
    if (progress !== undefined) {
      query += ', progress = ?';
      params.push(progress);
    }
    if (error !== undefined) {
      query += ', error = ?';
      params.push(error);
    }
    if (status === 'PROCESSING') {
      query += ', started_at = COALESCE(started_at, ?)';
      params.push(now);
    } else if (status === 'WAITING') {
      query += ', started_at = NULL, completed_at = NULL, error = NULL';
    } else if (status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELLED') {
      query += ', completed_at = ?';
      params.push(now);
    }

    query += ' WHERE id = ?';
    params.push(id);

    db.prepare(query).run(...params);
  }

  public deleteJob(id: string): void {
    const db = getDatabase();
    db.prepare('DELETE FROM jobs WHERE id = ?').run(id);
  }

  public updateJobPaths(id: string, updates: Partial<Pick<JobRecord, 'inputPath' | 'outputPath' | 'resolvedOutputDirectory' | 'originalFilename' | 'currentFilename'>>): void {
    const columns = {
      inputPath: 'input_path', outputPath: 'output_path', resolvedOutputDirectory: 'resolved_output_directory',
      originalFilename: 'original_filename', currentFilename: 'current_filename',
    };
    const entries = Object.entries(updates) as Array<[keyof typeof columns, string]>;
    if (entries.length === 0) return;
    getDatabase().prepare(`UPDATE jobs SET ${entries.map(([key]) => `${columns[key]} = ?`).join(', ')} WHERE id = ?`)
      .run(...entries.map(([, value]) => value), id);
  }

  public recoverInterruptedJobs(): void {
    const db = getDatabase();
    db.prepare(`
      UPDATE jobs SET status = 'INTERRUPTED', stage = 'IDLE', error = 'Application closed unexpectedly during processing'
      WHERE status = 'PROCESSING'
    `).run();
  }

  /** Update only a pending job from the identified rule; active/history rows stay immutable. */
  public updatePendingWatchFolderJob(job: JobRecord): boolean {
    const result = getDatabase().prepare(`
      UPDATE jobs SET
        watch_folder_name = ?, job_config_json = ?, output_path = ?,
        base_output_directory = ?, auto_daily_output_folder = ?, resolved_output_directory = ?,
        repeat_count = ?, effective_repeat_count = ?, manual_repeat_count = ?,
        audio_fade_in_enabled = ?, audio_fade_in_duration_seconds = ?,
        duration_limit_enabled = ?, duration_limit_seconds = ?, duration_mode = ?, max_overshoot_seconds = ?,
        expected_final_duration = ?, overshoot_seconds = ?, rename_source_files = ?, error_naming_mode = ?
      WHERE id = ? AND watch_folder_id = ? AND source_type = 'WATCH_FOLDER' AND status IN ('WAITING', 'READY')
    `).run(
      job.watchFolderName ?? null, job.configSnapshot ? JSON.stringify(job.configSnapshot) : null, job.outputPath,
      job.baseOutputDirectory ?? null, Number(job.autoDailyOutputFolder ?? false), job.resolvedOutputDirectory ?? null,
      job.repeatCount, job.effectiveRepeatCount ?? job.repeatCount, job.manualRepeatCount ?? job.repeatCount,
      Number(job.audioFadeInEnabled), job.audioFadeInDurationSeconds,
      Number(job.durationLimitEnabled), job.durationLimitSeconds, job.durationMode ?? 'EXACT', job.maxOvershootSeconds ?? null,
      job.expectedFinalDuration ?? null, job.overshootSeconds ?? 0,
      job.renameSourceFiles === undefined ? null : Number(job.renameSourceFiles), job.errorNamingMode ?? null,
      job.id, job.watchFolderId ?? null
    );
    return result.changes > 0;
  }

  public updateJobPlan(id: string, updates: Pick<JobRecord, 'sourceDurationSeconds' | 'repeatCount' | 'effectiveRepeatCount' | 'expectedFinalDuration' | 'overshootSeconds'>): void {
    getDatabase().prepare(`
      UPDATE jobs SET source_duration_seconds = ?, repeat_count = ?, effective_repeat_count = ?,
        expected_final_duration = ?, overshoot_seconds = ? WHERE id = ?
    `).run(updates.sourceDurationSeconds ?? null, updates.repeatCount, updates.effectiveRepeatCount ?? updates.repeatCount,
      updates.expectedFinalDuration ?? null, updates.overshootSeconds ?? 0, id);
  }

  private mapRowToJob(row: any): JobRecord {
    return {
      configSnapshot: row.job_config_json ? JSON.parse(row.job_config_json) : undefined,
      sourceDurationSeconds: row.source_duration_seconds ?? undefined,
      renameSourceFiles: row.rename_source_files == null ? undefined : Boolean(row.rename_source_files),
      errorNamingMode: row.error_naming_mode ?? undefined,
      id: row.id,
      inputPath: row.input_path,
      outputPath: row.output_path,
      repeatCount: row.repeat_count,
      effectiveRepeatCount: row.effective_repeat_count ?? row.repeat_count,
      manualRepeatCount: row.manual_repeat_count ?? row.repeat_count,
      audioFadeInEnabled: Boolean(row.audio_fade_in_enabled ?? 1),
      audioFadeInDurationSeconds: row.audio_fade_in_duration_seconds ?? 5.0,
      durationLimitEnabled: Boolean(row.duration_limit_enabled ?? 0),
      durationLimitSeconds: row.duration_limit_seconds ?? null,
      durationMode: row.duration_mode ?? 'EXACT',
      maxOvershootSeconds: row.max_overshoot_seconds ?? null,
      expectedFinalDuration: row.expected_final_duration ?? undefined,
      overshootSeconds: row.overshoot_seconds ?? 0,
      introEnd: row.intro_end ?? undefined,
      status: row.status as JobStatus,
      stage: row.stage as JobStage,
      progress: row.progress,
      priority: row.priority,
      createdAt: row.created_at,
      startedAt: row.started_at || undefined,
      completedAt: row.completed_at || undefined,
      error: row.error || undefined,
      sourceType: (row.source_type as JobSourceType) ?? 'MANUAL',
      watchFolderId: row.watch_folder_id ?? undefined,
      watchFolderName: row.watch_folder_name ?? undefined,
      resolvedOutputDirectory: row.resolved_output_directory ?? undefined,
      autoDailyOutputFolder: Boolean(row.auto_daily_output_folder ?? 0),
      baseOutputDirectory: row.base_output_directory ?? undefined,
      originalFilename: row.original_filename ?? undefined,
      currentFilename: row.current_filename ?? undefined,
    };
  }
}

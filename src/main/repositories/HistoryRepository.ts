import { getDatabase } from '../database/db';
import { HistoryRecord, JobStatus, JobSourceType } from '@shared/types';

export class HistoryRepository {
  public getAllHistory(): HistoryRecord[] {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM history ORDER BY created_time DESC').all() as any[];
    return rows.map(this.mapRowToHistory);
  }

  public addHistory(record: HistoryRecord): HistoryRecord {
    const db = getDatabase();
    db.prepare(`
      INSERT INTO history (
        id, job_id, input_file, output_file, created_time, started_time, completed_time,
        original_duration, intro_duration, repeat_duration, repeat_count,
        effective_repeat_count, manual_repeat_count,
        audio_fade_in_enabled, audio_fade_in_duration_seconds,
        natural_duration, duration_limit_enabled, requested_duration_limit,
        duration_mode, max_overshoot_seconds, actual_output_duration, overshoot_seconds, partial_final_copy,
        full_copy_count, partial_copy_duration_seconds,
        job_source_type, auto_daily_output_folder, daily_folder_name, resolved_output_directory,
        original_filename, current_filename,
        final_duration, encoder, gpu, status, processing_time_ms,
        output_size_bytes, failure_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.jobId,
      record.inputFile,
      record.outputFile,
      record.createdTime,
      record.startedTime || null,
      record.completedTime || null,
      record.originalDuration,
      record.introDuration ?? 0,
      record.repeatDuration ?? record.originalDuration,
      record.repeatCount,
      record.effectiveRepeatCount ?? record.repeatCount,
      record.manualRepeatCount ?? record.repeatCount,
      record.audioFadeInEnabled ? 1 : 0,
      record.audioFadeInDurationSeconds ?? 5.0,
      record.naturalDuration ?? record.originalDuration * record.repeatCount,
      record.durationLimitEnabled ? 1 : 0,
      record.requestedDurationLimit ?? null,
      record.durationMode ?? 'EXACT',
      record.maxOvershootSeconds ?? null,
      record.actualOutputDuration ?? record.finalDuration,
      record.overshootSeconds ?? 0,
      record.partialFinalCopy ? 1 : 0,
      record.fullCopyCount ?? record.repeatCount,
      record.partialCopyDurationSeconds ?? 0,
      record.jobSourceType ?? 'MANUAL',
      record.autoDailyOutputFolder ? 1 : 0,
      record.dailyFolderName ?? null,
      record.resolvedOutputDirectory ?? null,
      record.originalFilename ?? null,
      record.currentFilename ?? null,
      record.finalDuration,
      record.encoder,
      record.gpu,
      record.status,
      record.processingTimeMs,
      record.outputSizeBytes,
      record.failureReason || null
    );
    return record;
  }

  public deleteHistory(id: string): void {
    const db = getDatabase();
    db.prepare('DELETE FROM history WHERE id = ?').run(id);
  }

  public clearHistory(): void {
    const db = getDatabase();
    db.prepare('DELETE FROM history').run();
  }

  private mapRowToHistory(row: any): HistoryRecord {
    return {
      id: row.id,
      jobId: row.job_id,
      inputFile: row.input_file,
      outputFile: row.output_file,
      createdTime: row.created_time,
      startedTime: row.started_time || undefined,
      completedTime: row.completed_time || undefined,
      originalDuration: row.original_duration,
      repeatCount: row.repeat_count,
      effectiveRepeatCount: row.effective_repeat_count ?? row.repeat_count,
      manualRepeatCount: row.manual_repeat_count ?? row.repeat_count,
      audioFadeInEnabled: Boolean(row.audio_fade_in_enabled ?? 1),
      audioFadeInDurationSeconds: row.audio_fade_in_duration_seconds ?? 5.0,
      naturalDuration: row.natural_duration ?? (row.original_duration * row.repeat_count),
      durationLimitEnabled: Boolean(row.duration_limit_enabled ?? 0),
      requestedDurationLimit: row.requested_duration_limit ?? null,
      durationMode: row.duration_mode ?? 'EXACT',
      maxOvershootSeconds: row.max_overshoot_seconds ?? null,
      actualOutputDuration: row.actual_output_duration ?? row.final_duration,
      overshootSeconds: row.overshoot_seconds ?? 0,
      partialFinalCopy: Boolean(row.partial_final_copy ?? 0),
      finalDuration: row.final_duration,
      fullCopyCount: row.full_copy_count ?? row.repeat_count,
      partialCopyDurationSeconds: row.partial_copy_duration_seconds ?? 0,
      encoder: row.encoder,
      gpu: row.gpu,
      status: row.status as JobStatus,
      processingTimeMs: row.processing_time_ms,
      outputSizeBytes: row.output_size_bytes,
      failureReason: row.failure_reason || undefined,
      jobSourceType: (row.job_source_type as JobSourceType) ?? 'MANUAL',
      autoDailyOutputFolder: Boolean(row.auto_daily_output_folder ?? 0),
      dailyFolderName: row.daily_folder_name ?? undefined,
      resolvedOutputDirectory: row.resolved_output_directory ?? undefined,
      originalFilename: row.original_filename ?? undefined,
      currentFilename: row.current_filename ?? undefined,
      introDuration: row.intro_duration ?? undefined,
      repeatDuration: row.repeat_duration ?? undefined,
    };
  }
}

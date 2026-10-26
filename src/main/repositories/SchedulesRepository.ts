import { getDatabase } from '../database/db';
import { ScheduleConfig } from '@shared/types';
import { getNextScheduledRun } from '@shared/utils/cronSchedule';

export class SchedulesRepository {
  public getAllSchedules(): ScheduleConfig[] {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM schedules ORDER BY created_at DESC').all() as any[];
    return rows.map(this.mapRowToSchedule);
  }

  public createSchedule(schedule: ScheduleConfig): ScheduleConfig {
    const calculatedNextRun = getNextScheduledRun(schedule.cronExpression).toISOString();
    schedule = { ...schedule, nextRun: schedule.nextRun || calculatedNextRun };
    const db = getDatabase();
    db.prepare(`
      INSERT INTO schedules (id, name, job_config_json, cron_expression, duration_mode, max_overshoot_seconds, next_run, last_run, enabled, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      schedule.id,
      schedule.name,
      schedule.jobConfigJson,
      schedule.cronExpression,
      schedule.durationMode ?? 'EXACT',
      schedule.maxOvershootSeconds ?? null,
      schedule.nextRun || null,
      schedule.lastRun || null,
      schedule.enabled ? 1 : 0,
      schedule.createdAt
    );
    return schedule;
  }

  public updateScheduleRun(id: string, lastRun: string, nextRun?: string): void {
    const db = getDatabase();
    db.prepare('UPDATE schedules SET last_run = ?, next_run = ? WHERE id = ?').run(lastRun, nextRun || null, id);
  }

  public deleteSchedule(id: string): void {
    const db = getDatabase();
    db.prepare('DELETE FROM schedules WHERE id = ?').run(id);
  }

  private mapRowToSchedule(row: any): ScheduleConfig {
    return {
      id: row.id,
      name: row.name,
      jobConfigJson: row.job_config_json,
      cronExpression: row.cron_expression,
      durationMode: row.duration_mode ?? 'EXACT',
      maxOvershootSeconds: row.max_overshoot_seconds ?? null,
      nextRun: row.next_run || undefined,
      lastRun: row.last_run || undefined,
      enabled: Boolean(row.enabled),
      createdAt: row.created_at,
    };
  }
}

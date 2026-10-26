import { SchedulesRepository } from '../repositories/SchedulesRepository';
import { QueueService } from './QueueService';
import { getNextScheduledRun } from '@shared/utils/cronSchedule';
import { logger } from './Logger';

export class SchedulerService {
  private intervalTimer: NodeJS.Timeout | null = null;
  private isChecking = false;

  constructor(
    private scheduleRepo: SchedulesRepository,
    private queueService: QueueService
  ) {}

  public start(): void {
    if (this.intervalTimer) return;
    void this.checkSchedules();
    this.intervalTimer = setInterval(() => {
      void this.checkSchedules();
    }, 60000); // Check every minute
  }

  public stop(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }

  private async checkSchedules(): Promise<void> {
    if (this.isChecking) return;
    this.isChecking = true;
    try {
      const schedules = this.scheduleRepo.getAllSchedules();
      const now = new Date();

      for (const schedule of schedules) {
        if (!schedule.enabled) continue;

        try {
          if (!schedule.nextRun) {
            this.scheduleRepo.updateScheduleRun(schedule.id, schedule.lastRun ?? '', getNextScheduledRun(schedule.cronExpression, now).toISOString());
            continue;
          }
          if (new Date(schedule.nextRun) > now) continue;
          const config = JSON.parse(schedule.jobConfigJson);
          await this.queueService.addJob({
            ...config,
            durationMode: config.durationMode ?? schedule.durationMode ?? 'EXACT',
            maxOvershootSeconds: config.maxOvershootSeconds ?? schedule.maxOvershootSeconds ?? null,
          }, { sourceType: 'SCHEDULER' });
          this.scheduleRepo.updateScheduleRun(schedule.id, now.toISOString(), getNextScheduledRun(schedule.cronExpression, new Date()).toISOString());
        } catch (err) {
          logger.error('SCHEDULER', `Không thể chạy lịch trình: ${schedule.name}`, err);
        }
      }
    } catch (err) {
      logger.error('SCHEDULER', 'Không thể đọc lịch trình.', err);
    } finally {
      this.isChecking = false;
    }
  }
}

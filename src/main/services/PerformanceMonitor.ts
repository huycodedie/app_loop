import { EventEmitter } from 'events';
import si from 'systeminformation';
import { PerformanceMetrics, JobStage } from '@shared/types';

export class PerformanceMonitor extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;
  private currentStage: JobStage = 'IDLE';

  public startMonitoring(): void {
    if (this.timer) return;
    this.timer = setInterval(async () => {
      await this.collectMetrics();
    }, 1000);
  }

  public stopMonitoring(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public setStage(stage: JobStage): void {
    this.currentStage = stage;
  }

  private async collectMetrics(): Promise<void> {
    try {
      const [cpu, mem, fsSize] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.fsSize(),
      ]);

      const diskFreeGb = fsSize.length > 0 ? Math.round((fsSize[0].available / (1024 * 1024 * 1024)) * 10) / 10 : 0;
      const ramUsageMb = Math.round((mem.active / (1024 * 1024)));

      const metrics: PerformanceMetrics = {
        fps: 0,
        speed: 1.0,
        elapsedTimeMs: 0,
        etaSeconds: 0,
        currentFrame: 0,
        cpuUsage: Math.round(cpu.currentLoad * 10) / 10,
        ramUsageMb,
        gpuUsage: 0,
        gpuMemoryMb: 0,
        diskFreeGb,
        stage: this.currentStage,
      };

      this.emit('metrics', metrics);
    } catch {
      // Safe fallback
    }
  }
}

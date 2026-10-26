import React from 'react';
import { Cpu, HardDrive, Zap, Clock } from 'lucide-react';
import { PerformanceMetrics } from '@shared/types';

interface MetricsDisplayProps {
  metrics: PerformanceMetrics | null;
}

export const MetricsDisplay: React.FC<MetricsDisplayProps> = ({ metrics }) => {
  if (!metrics) return null;

  return (
    <div className="surface-card p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-primary/15 text-primary rounded-control">
          <Cpu size={18} />
        </div>
        <div>
          <div className="text-xs text-text-muted">Sử dụng CPU</div>
          <div className="text-sm font-bold font-mono text-text-main">{metrics.cpuUsage}%</div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-purple-500/15 text-purple-400 rounded-control">
          <Zap size={18} />
        </div>
        <div>
          <div className="text-xs text-text-muted">Sử dụng RAM</div>
          <div className="text-sm font-bold font-mono text-text-main">{metrics.ramUsageMb} MB</div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-success/15 text-success rounded-control">
          <HardDrive size={18} />
        </div>
        <div>
          <div className="text-xs text-text-muted">Đĩa trống</div>
          <div className="text-sm font-bold font-mono text-text-main">{metrics.diskFreeGb} GB</div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-warning/15 text-warning rounded-control">
          <Clock size={18} />
        </div>
        <div>
          <div className="text-xs text-text-muted">Giai đoạn xử lý</div>
          <div className="text-sm font-bold font-mono text-primary">{metrics.stage || 'RẢNH'}</div>
        </div>
      </div>
    </div>
  );
};

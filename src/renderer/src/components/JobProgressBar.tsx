import React from 'react';
import { ProcessingProgress } from '@shared/types/progress';
import { JobStage } from '@shared/types';

/** Maps JobStage to a user-friendly Vietnamese label */
const STAGE_LABELS: Record<JobStage, string> = {
  IDLE: 'Đang chờ',
  ANALYZING: 'Đang phân tích',
  CALCULATING_REPEAT_PLAN: 'Đang tính toán',
  PREPARING: 'Đang chuẩn bị',
  PREPARING_FULL_SOURCE: 'Đang chuẩn hóa nguồn',
  BUILDING_PARTIAL_END: 'Đang tạo đoạn cuối',
  BUILDING_REPEAT_SEQUENCE: 'Đang tạo chuỗi lặp',
  VERIFYING_REPEAT_SEQUENCE: 'Đang kiểm tra chuỗi',
  APPLYING_AUDIO_FADE: 'Đang tăng dần âm thanh',
  ENCODING: 'Đang mã hóa',
  CONCATENATING: 'Đang ghép video',
  VERIFYING: 'Đang xác minh',
  VERIFYING_FINAL_OUTPUT: 'Đang xác minh đầu ra',
  FINALIZING: 'Đang hoàn thiện',
  CLEANING: 'Đang dọn dẹp',
  COMPLETED: 'Hoàn thành',
};

interface Props {
  /** Live progress snapshot from IPC */
  progress: ProcessingProgress;
  /** Show compact single-line variant */
  compact?: boolean;
}

function formatSec(s: number): string {
  if (!isFinite(s) || s < 0) return '00:00:00';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

function formatEta(secs: number | null): string {
  if (secs === null || !isFinite(secs) || secs < 0) return 'Đang tính...';
  if (secs < 60) return `~${Math.round(secs)}s`;
  if (secs < 3600) return `~${Math.round(secs / 60)} phút`;
  const h = Math.floor(secs / 3600);
  const m = Math.round((secs % 3600) / 60);
  return `~${h}h${String(m).padStart(2, '0')}p`;
}

export const JobProgressBar: React.FC<Props> = ({ progress, compact = false }) => {
  const pct = Math.min(100, Math.max(0, Math.round(progress.overallProgress)));
  const stageLabel = STAGE_LABELS[progress.stage] ?? progress.stage;
  const processedStr = formatSec(progress.processedSeconds);
  const totalStr = formatSec(progress.expectedOutputDurationSeconds);
  const etaStr = formatEta(progress.estimatedRemainingSeconds);
  const speedStr = progress.speed !== null ? `${progress.speed.toFixed(1)}x` : null;
  const fpsStr = progress.fps !== null ? `${Math.round(progress.fps)} fps` : null;

  if (compact) {
    return (
      <div className="flex flex-col gap-1 w-full">
        {/* Header row: stage + pct */}
        <div className="flex justify-between items-center text-[10px] font-mono text-text-muted">
          <span className="truncate max-w-[110px]">{stageLabel}</span>
          <span className="text-primary font-bold ml-1">{pct}%</span>
        </div>

        {/* Progress bar */}
        <div className="w-full h-2 bg-surface-raised rounded-full overflow-hidden border border-border">
          <div
            className="h-full bg-gradient-to-r from-primary to-primary/80 rounded-full"
            style={{
              width: `${pct}%`,
              transition: 'width 300ms ease-out',
            }}
          />
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-2 text-[9px] font-mono text-text-muted">
          <span>{processedStr} / {totalStr}</span>
          {speedStr && <span className="text-primary">{speedStr}</span>}
          {fpsStr && <span>{fpsStr}</span>}
          <span className="ml-auto text-warning/80">{etaStr}</span>
        </div>
      </div>
    );
  }

  // Full variant
  return (
    <div className="flex flex-col gap-2 w-full">
      {/* Stage + percentage header */}
      <div className="flex justify-between items-center">
        <span className="text-xs text-text-secondary font-medium">{stageLabel}</span>
        <span className="text-sm font-bold text-primary tabular-nums">{pct}%</span>
      </div>

      {/* Main progress bar */}
      <div className="w-full h-3 bg-surface-raised rounded-full overflow-hidden border border-border">
        <div
          className="h-full bg-gradient-to-r from-primary via-primary/90 to-primary/70 rounded-full relative"
          style={{
            width: `${pct}%`,
            transition: 'width 350ms ease-out',
          }}
        >
          {/* Shimmer animation while processing */}
          {pct < 100 && pct > 0 && (
            <div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent rounded-full animate-pulse"
              style={{ backgroundSize: '200% 100%' }}
            />
          )}
        </div>
      </div>

      {/* Detailed stats grid */}
      <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-[10px] font-mono">
        <div>
          <span className="text-text-muted">Đã xử lý</span>
          <div className="text-text-main font-semibold">{processedStr}</div>
        </div>
        <div>
          <span className="text-text-muted">Tổng thời lượng</span>
          <div className="text-text-main font-semibold">{totalStr}</div>
        </div>
        <div>
          <span className="text-text-muted">Còn lại</span>
          <div className="text-warning font-semibold">{etaStr}</div>
        </div>
        {speedStr && (
          <div>
            <span className="text-text-muted">Tốc độ</span>
            <div className="text-primary font-semibold">{speedStr}</div>
          </div>
        )}
        {fpsStr && (
          <div>
            <span className="text-text-muted">FPS</span>
            <div className="text-text-main font-semibold">{fpsStr}</div>
          </div>
        )}
        {progress.elapsedSeconds > 0 && (
          <div>
            <span className="text-text-muted">Đã chạy</span>
            <div className="text-text-secondary font-semibold">{formatSec(progress.elapsedSeconds)}</div>
          </div>
        )}
      </div>
    </div>
  );
};

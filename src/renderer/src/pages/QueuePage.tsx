import React from 'react';
import { Play, Pause, Trash2, RotateCcw, CheckCircle2, Plus, ListVideo } from 'lucide-react';
import { JobRecord, JobStatus } from '@shared/types';
import { ProcessingProgress } from '@shared/types/progress';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';
import { JobProgressBar } from '../components/JobProgressBar';
import { formatTime } from '../utils/formatters';
import { newestJobsFirst, watchRuleLabel, formatJobDateTime } from '../utils/queuePresentation';

interface QueuePageProps {
  queue: JobRecord[];
  progressByJobId: Record<string, ProcessingProgress>;
  onPause: () => void;
  onResume: () => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onClearCompleted: () => void;
  onNavigateToProcessing: () => void;
}

/** Translate status to a Vietnamese summary when job is not processing */
function statusSummary(status: JobStatus, retainedProgress?: number): string {
  switch (status) {
    case 'WAITING': return 'Đang chờ';
    case 'READY': return 'Sẵn sàng';
    case 'PAUSED': return 'Tạm dừng';
    case 'COMPLETED': return 'Hoàn thành ✓';
    case 'FAILED':
      return retainedProgress !== undefined && retainedProgress > 0
        ? `Thất bại ở ${retainedProgress}%`
        : 'Thất bại';
    case 'CANCELLED':
      return retainedProgress !== undefined && retainedProgress > 0
        ? `Đã hủy ở ${retainedProgress}%`
        : 'Đã hủy';
    case 'INTERRUPTED': return 'Bị gián đoạn';
    default: return status;
  }
}

export const QueuePage: React.FC<QueuePageProps> = ({
  queue,
  progressByJobId,
  onPause,
  onResume,
  onRemove,
  onRetry,
  onClearCompleted,
  onNavigateToProcessing,
}) => {
  // Count summary stats
  const processingCount = queue.filter(j => j.status === 'PROCESSING').length;
  const waitingCount = queue.filter(j => j.status === 'WAITING' || j.status === 'READY').length;
  const completedCount = queue.filter(j => j.status === 'COMPLETED').length;
  const activeJob = queue.find(j => j.status === 'PROCESSING');
  const activeProgress = activeJob ? progressByJobId[activeJob.id] : null;
  const displayQueue = newestJobsFirst(queue);

  return (
    <div className="flex flex-col gap-6 max-w-[1440px] mx-auto w-full">
      {/* Page Header & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-text-main">Hàng chờ xử lý</h2>
          <p className="text-xs text-text-secondary mt-1">
            Quản lý và theo dõi tiến độ các tác vụ lặp video theo thời gian thực. Tác vụ mới nhất hiển thị trên cùng.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={onResume} className="btn-primary text-xs">
            <Play size={14} /> Tiếp tục hàng chờ
          </button>
          <button onClick={onPause} className="btn-secondary text-xs">
            <Pause size={14} /> Tạm dừng hàng chờ
          </button>
          <button onClick={onClearCompleted} className="btn-secondary text-xs text-text-muted">
            <CheckCircle2 size={14} /> Xóa tác vụ hoàn thành
          </button>
          <button onClick={onNavigateToProcessing} className="btn-secondary text-xs text-primary">
            <Plus size={14} /> Thêm video mới
          </button>
        </div>
      </div>

      {/* Live Summary Header (shows when jobs exist) */}
      {queue.length > 0 && (
        <div className="surface-card p-4">
          <div className="flex flex-wrap gap-6 items-center">
            {/* Status counts */}
            <div className="flex gap-4 text-xs font-mono">
              {processingCount > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  <span className="text-text-muted">Đang xử lý:</span>
                  <span className="text-primary font-bold">{processingCount}</span>
                </span>
              )}
              {waitingCount > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-text-muted" />
                  <span className="text-text-muted">Đang chờ:</span>
                  <span className="font-bold">{waitingCount}</span>
                </span>
              )}
              {completedCount > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-success" />
                  <span className="text-text-muted">Hoàn thành:</span>
                  <span className="text-success font-bold">{completedCount}</span>
                </span>
              )}
            </div>

            {/* Active job mini info */}
            {activeJob && activeProgress && (
              <div className="flex-1 min-w-0 border-l border-border pl-4">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-text-muted truncate">
                    {activeJob.inputPath.split(/[/\\]/).pop()}
                  </span>
                  <span className="text-primary font-bold font-mono flex-shrink-0">
                    {Math.round(activeProgress.overallProgress)}%
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Queue Table Container */}
      <div className="surface-card p-5">
        {queue.length === 0 ? (
          <EmptyState
            icon={<ListVideo size={36} />}
            title="Hàng chờ xử lý hiện đang trống"
            description="Không có video nào trong hàng chờ. Bạn có thể chọn và cấu hình video mới để bắt đầu."
            actionLabel="Thêm video mới vào hàng chờ"
            onAction={onNavigateToProcessing}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border text-text-muted font-mono text-[11px] uppercase">
                  <th className="pb-3 pr-2 font-medium w-12">ƯU TIÊN</th>
                  <th className="pb-3 pr-4 font-medium">NGUỒN</th>
                  <th className="pb-3 pr-4 font-medium">QUY TẮC</th>
                  <th className="pb-3 pr-4 font-medium">TỆP NGUỒN</th>
                  <th className="pb-3 pr-4 font-medium min-w-[180px]">NGÀY GIỜ</th>
                  <th className="pb-3 pr-4 font-medium">FADE IN</th>
                  <th className="pb-3 pr-4 font-medium">GIỚI HẠN</th>
                  <th className="pb-3 pr-4 font-medium">SỐ LẦN LẶP</th>
                  <th className="pb-3 pr-4 font-medium min-w-[220px]">TIẾN ĐỘ</th>
                  <th className="pb-3 pr-4 font-medium">TRẠNG THÁI</th>
                  <th className="pb-3 font-medium text-right">THAO TÁC</th>
                </tr>
              </thead>
              <tbody>
                {displayQueue.map((job) => {
                  // Prefer live progress snapshot over stale DB value
                  const liveProgress = progressByJobId[job.id];
                  const displayPct = liveProgress?.overallProgress ?? job.progress ?? 0;

                  const getSourceBadge = () => {
                    switch (job.sourceType) {
                      case 'WATCH_FOLDER':
                        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-primary/15 text-primary border border-primary/30">Watch Folder</span>;
                      case 'SCHEDULER':
                        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-warning/15 text-warning border border-warning/30">Lịch trình</span>;
                      case 'MANUAL':
                      default:
                        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-surface-raised text-text-muted border border-border">Thủ công</span>;
                    }
                  };

                  return (
                    <tr
                      key={job.id}
                      className="border-b border-border/50 hover:bg-surface-raised/50 transition-colors"
                    >
                      <td className="py-4 pr-2 font-mono text-text-muted">{job.priority || 0}</td>

                      <td className="py-4 pr-4 font-mono">{getSourceBadge()}</td>

                      <td className="py-4 pr-4 max-w-[180px]">
                        <span className="block truncate font-semibold" title={watchRuleLabel(job)}>
                          {watchRuleLabel(job)}
                        </span>
                      </td>

                      <td className="py-4 pr-4 max-w-xs truncate">
                        <span className="font-semibold text-text-main block truncate">
                          {job.inputPath.split(/[/\\]/).pop() ?? job.inputPath}
                        </span>
                        {job.resolvedOutputDirectory ? (
                          <span className="text-[10px] text-primary font-mono truncate block" title={job.resolvedOutputDirectory}>
                            Đích: {job.resolvedOutputDirectory}
                          </span>
                        ) : (
                          <span className="text-[10px] text-text-muted font-mono truncate block">
                            ID: {job.id}
                          </span>
                        )}
                      </td>

                      <td className="py-4 pr-4 font-mono whitespace-nowrap">
                        <div><span className="text-text-muted">Thêm: </span>{formatJobDateTime(job.createdAt)}</div>
                        {job.startedAt && <div className="text-[10px] text-text-secondary">Bắt đầu: {formatJobDateTime(job.startedAt)}</div>}
                        {job.completedAt && <div className="text-[10px] text-text-secondary">Hoàn tất: {formatJobDateTime(job.completedAt)}</div>}
                      </td>

                      <td className="py-4 pr-4 font-mono text-primary font-semibold">
                        {job.audioFadeInEnabled && job.audioFadeInDurationSeconds > 0
                          ? formatTime(job.audioFadeInDurationSeconds)
                          : <span className="text-text-muted">Tắt</span>}
                      </td>

                      <td className="py-4 pr-4 font-mono">
                        {job.durationLimitEnabled && job.durationLimitSeconds ? (
                          <div>
                            <span className="text-warning font-semibold block">{formatTime(job.durationLimitSeconds)}</span>
                            <span className="text-[10px] text-primary font-normal block font-sans">
                              {job.durationMode === 'MINIMUM' ? 'Đủ thời lượng' : 'Chính xác'}
                            </span>
                          </div>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>

                      <td className="py-4 pr-4 font-mono">
                        <span className="text-warning font-semibold block">{job.repeatCount}x</span>
                        {job.durationLimitEnabled && (
                          <span className="text-[10px] text-text-muted font-normal block font-sans">
                            {job.overshootSeconds && job.overshootSeconds > 0
                              ? `Dư +${formatTime(job.overshootSeconds)}`
                              : 'Tự động'}
                          </span>
                        )}
                      </td>

                      {/* Progress cell */}
                      <td className="py-4 pr-4 min-w-[220px]">
                        {job.status === 'PROCESSING' ? (
                          liveProgress ? (
                            // Rich live progress bar
                            <JobProgressBar progress={liveProgress} compact />
                          ) : (
                            // Fallback: show DB value while waiting for first event
                            <div className="flex flex-col gap-1">
                              <div className="flex justify-between text-[10px] font-mono text-text-muted">
                                <span className="truncate max-w-[110px]">{job.stage}</span>
                                <span className="text-primary font-bold">{displayPct}%</span>
                              </div>
                              <div className="w-full h-2 bg-surface-raised rounded-full overflow-hidden border border-border">
                                <div
                                  className="h-full bg-primary transition-all duration-300"
                                  style={{ width: `${displayPct}%` }}
                                />
                              </div>
                            </div>
                          )
                        ) : job.status === 'COMPLETED' ? (
                          <div className="flex flex-col gap-1">
                            <div className="flex justify-between text-[10px] font-mono text-text-muted">
                              <span>Hoàn thành</span>
                              <span className="text-success font-bold">100%</span>
                            </div>
                            <div className="w-full h-2 bg-surface-raised rounded-full overflow-hidden border border-border">
                              <div className="h-full bg-success" style={{ width: '100%' }} />
                            </div>
                          </div>
                        ) : job.status === 'FAILED' || job.status === 'CANCELLED' ? (
                          <div className="flex flex-col gap-1">
                            <div className="flex justify-between text-[10px] font-mono text-text-muted">
                              <span className="text-danger/80">{statusSummary(job.status, displayPct)}</span>
                              {displayPct > 0 && <span className="text-danger font-bold">{displayPct}%</span>}
                            </div>
                            {displayPct > 0 && (
                              <div className="w-full h-2 bg-surface-raised rounded-full overflow-hidden border border-border">
                                <div
                                  className="h-full bg-danger/60"
                                  style={{ width: `${displayPct}%` }}
                                />
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-text-muted font-mono text-[11px]">—</span>
                        )}
                      </td>

                      <td className="py-4 pr-4">
                        <StatusBadge status={job.status} />
                      </td>

                      <td className="py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {(job.status === 'FAILED' || job.status === 'INTERRUPTED') && (
                            <button
                              onClick={() => onRetry(job.id)}
                              className="p-1.5 text-text-secondary hover:text-primary hover:bg-surface-raised rounded-control transition-colors"
                              title="Thử lại tác vụ"
                            >
                              <RotateCcw size={15} />
                            </button>
                          )}
                          <button
                            onClick={() => onRemove(job.id)}
                            className="p-1.5 text-text-secondary hover:text-danger hover:bg-surface-raised rounded-control transition-colors"
                            title="Xóa tác vụ"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

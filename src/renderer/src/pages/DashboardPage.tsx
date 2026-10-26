import React from 'react';
import {
  ListVideo,
  CheckCircle2,
  History,
  AlertCircle,
  Clapperboard,
  Folder,
  ArrowRight,
  Cpu,
  Film,
  HardDrive,
} from 'lucide-react';
import { JobRecord, HistoryRecord, GpuCapabilities } from '@shared/types';
import { StatCard } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';
import { formatTime } from '../utils/formatters';

interface DashboardPageProps {
  queue: JobRecord[];
  history: HistoryRecord[];
  gpuCaps: GpuCapabilities | null;
  ffmpegInstalled: boolean;
  ffmpegVersion: string;
  onNavigate: (tab: any) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  queue,
  history,
  gpuCaps,
  ffmpegInstalled,
  ffmpegVersion,
  onNavigate,
}) => {
  const pendingJobs = queue.filter((j) => j.status === 'WAITING' || j.status === 'READY' || j.status === 'PROCESSING').length;
  const completedCount = history.filter((h) => h.status === 'COMPLETED').length;
  const failedCount = history.filter((h) => h.status === 'FAILED').length + queue.filter((j) => j.status === 'FAILED').length;
  const totalProcessed = history.length;

  return (
    <div className="flex flex-col gap-6 max-w-[1440px] mx-auto w-full">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-text-main">Bảng điều khiển tổng quan</h2>
          <p className="text-xs text-text-secondary mt-1">
            Theo dõi hàng chờ, trạng thái hệ thống và bắt đầu xử lý video mới.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => onNavigate('processing')} className="btn-primary text-xs">
            <Clapperboard size={16} /> Xử lý video mới
          </button>
          <button onClick={() => onNavigate('history')} className="btn-secondary text-xs">
            <History size={16} /> Xem lịch sử
          </button>
        </div>
      </div>

      {/* Summary Cards Responsive Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Tác vụ đang chờ"
          value={pendingJobs}
          icon={<ListVideo size={20} />}
          description="Đang trong hàng chờ xử lý"
          variant="primary"
        />
        <StatCard
          title="Video đã hoàn thành"
          value={completedCount}
          icon={<CheckCircle2 size={20} />}
          description="Đã ghép đoạn lặp thành công"
          variant="success"
        />
        <StatCard
          title="Tổng số video đã xử lý"
          value={totalProcessed}
          icon={<History size={20} />}
          description="Tính cả toàn bộ lịch sử"
          variant="default"
        />
        <StatCard
          title="Tác vụ thất bại"
          value={failedCount}
          icon={<AlertCircle size={20} />}
          description="Cần kiểm tra hoặc thử lại"
          variant={failedCount > 0 ? 'danger' : 'default'}
        />
      </div>

      {/* Quick Start Card Banner */}
      <div className="surface-raised p-6 rounded-panel border border-primary/30 bg-gradient-to-r from-primary/10 via-surface-raised to-surface flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg">
        <div className="flex flex-col gap-1 max-w-2xl">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/20 text-primary uppercase">
              Bắt đầu nhanh
            </span>
            <h3 className="text-base font-bold text-text-main">Bắt đầu lặp đoạn video</h3>
          </div>
          <p className="text-xs text-text-secondary leading-relaxed mt-1">
            Chọn video nguồn, cấu hình tăng âm ở đầu video và số lần lặp để tạo video mới với sự đồng bộ âm thanh & hình ảnh chính xác.
          </p>
        </div>
        <button onClick={() => onNavigate('processing')} className="btn-primary text-xs shrink-0 self-start md:self-auto py-2.5 px-5">
          Bắt đầu xử lý <ArrowRight size={16} />
        </button>
      </div>

      {/* System Status Section */}
      <div className="surface-card p-5 flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-text-main flex items-center gap-2">
          <Cpu size={16} className="text-primary" /> Trạng thái hệ thống
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
          <div className="p-3 bg-surface-raised rounded-control border border-border flex items-center justify-between">
            <span className="text-text-muted flex items-center gap-2">
              <Film size={14} /> FFmpeg Engine
            </span>
            <span className={ffmpegInstalled ? 'text-success font-semibold' : 'text-danger font-semibold'}>
              {ffmpegInstalled ? ffmpegVersion : 'Không có dữ liệu'}
            </span>
          </div>

          <div className="p-3 bg-surface-raised rounded-control border border-border flex items-center justify-between">
            <span className="text-text-muted flex items-center gap-2">
              <Cpu size={14} /> Chế độ GPU
            </span>
            <span className="text-primary font-semibold truncate max-w-[120px]">
              {gpuCaps?.gpuVendor || 'Không có dữ liệu'}
            </span>
          </div>

          <div className="p-3 bg-surface-raised rounded-control border border-border flex items-center justify-between">
            <span className="text-text-muted flex items-center gap-2">
              <Film size={14} /> Bộ mã hóa
            </span>
            <span className="text-text-main font-semibold">
              {gpuCaps?.selectedEncoder || 'libx264'}
            </span>
          </div>

          <div className="p-3 bg-surface-raised rounded-control border border-border flex items-center justify-between">
            <span className="text-text-muted flex items-center gap-2">
              <HardDrive size={14} /> Lưu trữ tạm
            </span>
            <span className="text-text-main font-semibold">Tự động xóa</span>
          </div>
        </div>
      </div>

      {/* Recent Activity Section */}
      <div className="surface-card p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-main">Hoạt động gần đây</h3>
          {history.length > 0 && (
            <button onClick={() => onNavigate('history')} className="text-xs text-primary hover:underline font-medium">
              Xem tất cả ({history.length})
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <EmptyState
            icon={<History size={32} />}
            title="Chưa có video nào được xử lý"
            description="Hãy bắt đầu tạo tác vụ xử lý lặp đoạn video đầu tiên của bạn ngay bây giờ."
            actionLabel="Bắt đầu xử lý video"
            onAction={() => onNavigate('processing')}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border text-text-muted font-mono text-[11px]">
                  <th className="pb-2 font-medium">VIDEO NGUỒN</th>
                  <th className="pb-2 font-medium">SỐ LẦN LẶP</th>
                  <th className="pb-2 font-medium">THỜI LƯỢNG CUỐI</th>
                  <th className="pb-2 font-medium">TRẠNG THÁI</th>
                  <th className="pb-2 font-medium">THỜI GIAN</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 5).map((item) => (
                  <tr key={item.id} className="border-b border-border/50 hover:bg-surface-raised/50 transition-colors">
                    <td className="py-3 pr-4 max-w-md truncate">
                      <span className="font-medium text-text-main block truncate">{item.inputFile}</span>
                      <span className="text-[10px] text-text-muted font-mono truncate block">{item.outputFile}</span>
                    </td>
                    <td className="py-3 pr-4 font-mono text-warning font-semibold">{item.repeatCount}x</td>
                    <td className="py-3 pr-4 font-mono text-primary font-semibold">{formatTime(item.finalDuration)}</td>
                    <td className="py-3 pr-4">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="py-3 font-mono text-text-muted text-[11px]">
                      {new Date(item.createdTime).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

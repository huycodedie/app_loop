import React from 'react';
import { Film, Cpu, CheckCircle2, AlertCircle } from 'lucide-react';
import { GpuCapabilities } from '@shared/types';

interface TopHeaderProps {
  pageTitle: string;
  ffmpegInstalled: boolean;
  ffmpegVersion: string;
  gpuCaps: GpuCapabilities | null;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  pageTitle,
  ffmpegInstalled,
  ffmpegVersion,
  gpuCaps,
}) => {
  return (
    <header className="h-16 bg-sidebar border-b border-border px-6 flex items-center justify-between text-xs text-text-secondary select-none">
      {/* Left Title & Breadcrumb */}
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold text-text-main tracking-tight">{pageTitle}</h1>
      </div>

      {/* Right System Status Indicators */}
      <div className="flex items-center gap-5">
        {/* FFmpeg Status Badge */}
        <div className="flex items-center gap-2 bg-surface px-3 py-1.5 rounded-control border border-border">
          <Film size={14} className="text-text-muted" />
          <span className="text-text-muted">FFmpeg:</span>
          {ffmpegInstalled ? (
            <span className="inline-flex items-center gap-1.5 text-success font-semibold font-mono text-[11px]">
              <CheckCircle2 size={13} /> Sẵn sàng ({ffmpegVersion})
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-danger font-semibold font-mono text-[11px]">
              <AlertCircle size={13} /> Chưa cài đặt
            </span>
          )}
        </div>

        {/* GPU & Encoder Status */}
        <div className="flex items-center gap-2 bg-surface px-3 py-1.5 rounded-control border border-border">
          <Cpu size={14} className="text-primary" />
          <span className="text-text-muted">GPU:</span>
          <span className="font-mono text-text-main font-semibold">
            {gpuCaps?.gpuName || 'Đang kiểm tra...'}
          </span>
          <span className="text-text-muted mx-1">•</span>
          <span className="font-mono text-primary font-semibold">
            {gpuCaps?.selectedEncoder || 'libx264'}
          </span>
        </div>
      </div>
    </header>
  );
};

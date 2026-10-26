import React from 'react';
import { Cpu, HardDrive, CheckCircle2 } from 'lucide-react';
import { GpuCapabilities } from '@shared/types';

interface HeaderProps {
  ffmpegInstalled: boolean;
  ffmpegVersion: string;
  gpuCaps: GpuCapabilities | null;
}

export const Header: React.FC<HeaderProps> = ({ ffmpegInstalled, ffmpegVersion, gpuCaps }) => {
  return (
    <header className="h-14 bg-slate-900/60 border-b border-slate-800 px-6 flex items-center justify-between text-xs text-slate-300">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={14} className={ffmpegInstalled ? 'text-emerald-400' : 'text-rose-400'} />
          <span className="text-slate-400">FFmpeg:</span>
          <span className="font-mono text-slate-200">{ffmpegInstalled ? ffmpegVersion : 'Chưa cài đặt'}</span>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Cpu size={14} className="text-cyan-400" />
          <span className="text-slate-400">GPU:</span>
          <span className="font-mono text-cyan-300">{gpuCaps?.gpuName || 'Đang kiểm tra...'}</span>
        </div>
        <div className="flex items-center gap-2">
          <HardDrive size={14} className="text-purple-400" />
          <span className="text-slate-400">Bộ mã hóa:</span>
          <span className="font-mono text-purple-300">{gpuCaps?.selectedEncoder || 'libx264'}</span>
        </div>
      </div>
    </header>
  );
};

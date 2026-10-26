import React, { useState, useEffect } from 'react';
import { Save, Folder, Film, Cpu, Sliders, CheckCircle2, RotateCcw, AlertCircle, FileCheck } from 'lucide-react';
import { AppSettings, GpuMode, EncoderType, ExecutableResolution } from '@shared/types';

export const SettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [ffmpegStatus, setFfmpegStatus] = useState<{
    installed: boolean;
    version: string;
    path: string;
    probePath: string;
    resolution?: ExecutableResolution;
  } | null>(null);
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [ffmpegError, setFfmpegError] = useState<string | null>(null);

  const loadSettings = async () => {
    const s = await window.api.getSettings();
    const ff = await window.api.getFFmpegStatus();
    setSettings(s);
    setFfmpegStatus(ff);
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSave = async () => {
    if (!settings) return;
    setFfmpegError(null);
    try {
      const updated = await window.api.updateSettings(settings);
      setSettings(updated);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2500);
    } catch (err: any) {
      setFfmpegError(err.message || 'Không thể lưu cài đặt ứng dụng.');
    }
  };

  const handleSelectFFmpegFolder = async () => {
    setFfmpegError(null);
    const folder = await window.api.selectFolder();
    if (folder) {
      try {
        await window.api.setFFmpegFolder(folder);
        await loadSettings();
      } catch (err: any) {
        setFfmpegError(err.message || 'Thư mục đã chọn không chứa FFmpeg & FFprobe hợp lệ.');
      }
    }
  };

  const handleCheckFFmpeg = async () => {
    setFfmpegError(null);
    await loadSettings();
  };

  if (!settings)
    return (
      <div className="p-8 text-xs text-text-muted font-mono">Đang tải cài đặt ứng dụng...</div>
    );

  const sourceLabels: Record<string, string> = {
    USER_CONFIGURED: 'Thư mục cấu hình thủ công',
    BUNDLED: 'Tệp đính kèm trong ứng dụng (Bundled)',
    DEVELOPMENT_RESOURCES: 'Tài nguyên thư mục dự án (Development)',
    SYSTEM_PATH: 'Biến môi trường hệ thống (PATH)',
    NOT_FOUND: 'Chưa phát hiện',
  };

  return (
    <div className="flex flex-col gap-6 max-w-[1440px] mx-auto w-full">
      {/* Page Header & Save Action */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-text-main">Cài đặt ứng dụng</h2>
          <p className="text-xs text-text-secondary mt-1">
            Cấu hình các tùy chọn mặc định, tăng tốc phần cứng GPU và quản lý môi trường FFmpeg.
          </p>
        </div>

        <button onClick={handleSave} className="btn-primary text-xs px-5 py-2.5">
          <Save size={16} /> {isSaved ? 'Đã lưu thành công!' : 'Lưu cài đặt'}
        </button>
      </div>

      {isSaved && (
        <div className="p-3 bg-success/15 border border-success/30 rounded-control text-success text-xs flex items-center gap-2 font-medium animate-fadeIn">
          <CheckCircle2 size={16} />
          <span>Cài đặt hệ thống đã được cập nhật thành công!</span>
        </div>
      )}

      {ffmpegError && (
        <div className="p-3 bg-danger/15 border border-danger/30 rounded-control text-danger text-xs flex items-center gap-2 font-medium animate-fadeIn">
          <AlertCircle size={16} />
          <span>{ffmpegError}</span>
        </div>
      )}

      {/* 1. FFmpeg & FFprobe Environment Manager Section */}
      <div className="surface-card p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
            <Film size={16} /> Môi trường FFmpeg & FFprobe
          </h3>

          <div className="flex items-center gap-2">
            <button onClick={handleSelectFFmpegFolder} className="btn-secondary text-xs">
              <Folder size={14} /> Chọn thư mục FFmpeg
            </button>
            <button onClick={handleCheckFFmpeg} className="btn-secondary text-xs">
              <RotateCcw size={14} /> Kiểm tra lại
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
          <div className="p-3.5 bg-surface-raised rounded-control border border-border flex flex-col gap-1">
            <span className="text-text-muted font-sans">Trạng thái phát hiện:</span>
            <span className={ffmpegStatus?.installed ? 'text-success font-semibold text-sm' : 'text-danger font-semibold text-sm'}>
              {ffmpegStatus?.installed ? `Sẵn sàng (${ffmpegStatus.version})` : 'Thiếu FFmpeg / FFprobe'}
            </span>
          </div>

          <div className="p-3.5 bg-surface-raised rounded-control border border-border flex flex-col gap-1">
            <span className="text-text-muted font-sans">Nguồn phát hiện:</span>
            <span className="text-primary font-semibold font-sans text-xs">
              {sourceLabels[ffmpegStatus?.resolution?.source || 'NOT_FOUND']}
            </span>
          </div>

          <div className="p-3.5 bg-surface-raised rounded-control border border-border flex flex-col gap-1 truncate">
            <span className="text-text-muted font-sans">Thư mục chứa executable:</span>
            <span className="text-text-main font-mono text-xs truncate" title={ffmpegStatus?.resolution?.resolvedFolder || ffmpegStatus?.path}>
              {ffmpegStatus?.resolution?.resolvedFolder || ffmpegStatus?.path || 'Chưa chọn'}
            </span>
          </div>
        </div>

        <div className="p-3 bg-surface-raised/50 rounded-control border border-border/60 flex flex-col gap-1 text-xs font-mono">
          <div className="text-text-muted">
            • FFmpeg path: <span className="text-text-main">{ffmpegStatus?.path || 'Chưa định vị'}</span>
          </div>
          <div className="text-text-muted">
            • FFprobe path: <span className="text-text-main">{ffmpegStatus?.probePath || 'Chưa định vị'}</span>
          </div>
        </div>
      </div>

      {/* 2. Processing & Encoding Section */}
      <div className="surface-card p-5 flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-text-main flex items-center gap-2 border-b border-border pb-2">
          <Sliders size={16} className="text-primary" /> Tùy chọn xử lý mặc định
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-text-secondary font-medium">Chế độ GPU</label>
            <select
              value={settings.gpuMode}
              onChange={(e) => setSettings({ ...settings, gpuMode: e.target.value as GpuMode })}
              className="glass-input text-xs"
            >
              <option value="AUTO">Tự động (Khuyên dùng)</option>
              <option value="NVIDIA">NVIDIA NVENC</option>
              <option value="INTEL">Intel QuickSync</option>
              <option value="AMD">AMD AMF</option>
              <option value="CPU">Chỉ dùng CPU</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-text-secondary font-medium">Codec mặc định</label>
            <select
              value={settings.encoder}
              onChange={(e) => setSettings({ ...settings, encoder: e.target.value as EncoderType })}
              className="glass-input text-xs"
            >
              <option value="libx264">x264 (H.264 CPU)</option>
              <option value="libx265">x265 (HEVC CPU)</option>
              <option value="h264_nvenc">h264_nvenc (NVIDIA)</option>
              <option value="hevc_nvenc">hevc_nvenc (NVIDIA)</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-text-secondary font-medium">Số lần lặp mặc định</label>
            <input
              type="number"
              min="1"
              max="1000"
              value={settings.repeatCount}
              onChange={(e) => setSettings({ ...settings, repeatCount: parseInt(e.target.value) || 1 })}
              className="glass-input text-xs font-mono"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-text-secondary font-medium">Mẫu tên file xuất ra</label>
          <input
            type="text"
            value={settings.outputFilenameTemplate}
            onChange={(e) => setSettings({ ...settings, outputFilenameTemplate: e.target.value })}
            className="glass-input text-xs font-mono"
          />
          <span className="text-[10px] text-text-muted">
            Biến hỗ trợ: {"{original_name}"}, {"{repeat_count}"}, {"{date}"}
          </span>
        </div>
      </div>

      {/* 3. Output Directory Section */}
      <div className="surface-card p-5 flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-text-main flex items-center gap-2 border-b border-border pb-2">
          <Folder size={16} className="text-primary" /> Thư mục mặc định
        </h3>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-text-secondary font-medium">Thư mục xuất video mặc định</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={settings.outputFolder}
              placeholder="Để trống để mặc định cùng thư mục với video gốc"
              onChange={(e) => setSettings({ ...settings, outputFolder: e.target.value })}
              className="glass-input text-xs flex-1"
            />
            <button
              onClick={async () => {
                const f = await window.api.selectFolder();
                if (f) setSettings({ ...settings, outputFolder: f });
              }}
              className="btn-secondary text-xs"
            >
              <Folder size={14} /> Chọn thư mục
            </button>
          </div>
        </div>
      </div>

      {/* 4. Background Processing & System Tray Section */}
      <div className="surface-card p-5 flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-text-main flex items-center gap-2 border-b border-border pb-2">
          <Sliders size={16} className="text-primary" /> Chạy nền & Khay hệ thống (System Tray)
        </h3>

        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4 p-3 bg-surface-raised/40 rounded-control border border-border/50">
            <div>
              <div className="text-xs font-semibold text-text-main">Tiếp tục chạy khi đóng cửa sổ</div>
              <div className="text-[11px] text-text-muted mt-0.5">
                Khi đóng cửa sổ (nhấn nút X), Video Repeat Studio vẫn chạy trong khay hệ thống để Thư mục theo dõi và Hàng chờ tiếp tục hoạt động.
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.runInBackground ?? true}
              onChange={(e) => setSettings({ ...settings, runInBackground: e.target.checked, closeBehavior: e.target.checked ? 'TRAY' : 'QUIT' })}
              className="w-4 h-4 rounded accent-primary cursor-pointer mt-1"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-text-secondary font-medium">Hành động khi nhấn nút X đóng cửa sổ</label>
              <select
                value={settings.closeBehavior ?? 'TRAY'}
                onChange={(e) => {
                  const val = e.target.value as 'TRAY' | 'QUIT';
                  setSettings({ ...settings, closeBehavior: val, runInBackground: val === 'TRAY' });
                }}
                className="glass-input text-xs"
              >
                <option value="TRAY">Thu nhỏ xuống khay hệ thống (Khuyên dùng)</option>
                <option value="QUIT">Thoát ứng dụng hoàn toàn</option>
              </select>
            </div>

            <div className="flex flex-col gap-3">
              <label className="flex items-center justify-between text-xs text-text-secondary font-medium cursor-pointer">
                <span>Khởi động cùng Windows</span>
                <input
                  type="checkbox"
                  checked={settings.launchAtStartup ?? false}
                  onChange={(e) => setSettings({ ...settings, launchAtStartup: e.target.checked })}
                  className="w-4 h-4 rounded accent-primary cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between text-xs text-text-secondary font-medium cursor-pointer">
                <span>Khởi động thu nhỏ trong khay hệ thống</span>
                <input
                  type="checkbox"
                  checked={settings.startMinimized ?? false}
                  onChange={(e) => setSettings({ ...settings, startMinimized: e.target.checked })}
                  className="w-4 h-4 rounded accent-primary cursor-pointer"
                />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border-t border-border/40 pt-3">
            <label className="flex items-center justify-between text-xs text-text-secondary font-medium cursor-pointer">
              <span>Thông báo Windows khi hoàn tất / gặp lỗi</span>
              <input
                type="checkbox"
                checked={settings.backgroundCompletionNotifications ?? true}
                onChange={(e) => setSettings({ ...settings, backgroundCompletionNotifications: e.target.checked })}
                className="w-4 h-4 rounded accent-primary cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between text-xs text-text-secondary font-medium cursor-pointer">
              <span>Hiển thị hướng dẫn khay hệ thống lần đầu đóng</span>
              <input
                type="checkbox"
                checked={settings.showCloseToTrayNotification ?? true}
                onChange={(e) => setSettings({ ...settings, showCloseToTrayNotification: e.target.checked })}
                className="w-4 h-4 rounded accent-primary cursor-pointer"
              />
            </label>
          </div>
        </div>
      </div>

      {/* 5. Source File Status Management Section */}
      <div className="surface-card p-5 flex flex-col gap-4">
        <h3 className="text-sm font-semibold text-text-main flex items-center gap-2 border-b border-border pb-2">
          <FileCheck size={16} className="text-primary" /> Quản lý file nguồn (Watch Folder)
        </h3>

        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4 p-3 bg-surface-raised/40 rounded-control border border-border/50">
            <div>
              <div className="text-xs font-semibold text-text-main">Tự động đánh dấu file sau khi xử lý</div>
              <div className="text-[11px] text-text-muted mt-0.5">
                Tự động đổi tên file nguồn khi Thư mục theo dõi xử lý: video.mp4 → video_PROCESSING.mp4 → video_DONE.mp4 (hoặc video_ERROR.mp4).
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.renameSourceFiles ?? true}
              onChange={(e) => setSettings({ ...settings, renameSourceFiles: e.target.checked })}
              className="w-4 h-4 rounded accent-primary cursor-pointer mt-1"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-text-secondary font-medium">Định dạng tên file khi gặp lỗi</label>
              <select
                value={settings.errorNamingMode ?? 'SIMPLE'}
                onChange={(e) => setSettings({ ...settings, errorNamingMode: e.target.value as 'SIMPLE' | 'ADVANCED' })}
                className="glass-input text-xs"
              >
                <option value="SIMPLE">Đơn giản (_ERROR)</option>
                <option value="ADVANCED">Chi tiết theo phân loại (_ERROR_FFMPEG, _ERROR_AUDIO...)</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-text-secondary font-medium">Khôi phục file dở dang khi ứng dụng khởi động lại</label>
              <select
                value={settings.crashRecoveryAction ?? 'RESET_TO_WAITING'}
                onChange={(e) => setSettings({ ...settings, crashRecoveryAction: e.target.value as 'RESET_TO_WAITING' | 'MARK_ERROR' })}
                className="glass-input text-xs"
              >
                <option value="RESET_TO_WAITING">Đưa file về trạng thái chờ xử lý (Xóa đuôi _PROCESSING)</option>
                <option value="MARK_ERROR">Đánh dấu file bị lỗi (_ERROR)</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

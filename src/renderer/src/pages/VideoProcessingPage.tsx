import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Play,
  Folder,
  Sparkles,
  AlertCircle,
  Film,
  RotateCcw,
  Sliders,
  FileVideo,
  CheckCircle2,
  ExternalLink,
  FolderOpen,
  Plus,
  Volume2,
  VolumeX,
  Timer,
  Info,
} from 'lucide-react';
import { MediaInfo, GpuCapabilities, GpuMode, EncoderType, JobRecord } from '@shared/types';
import { VideoPlayer } from '../components/VideoPlayer';
import { DurationLimitControl } from '../components/DurationLimitControl';
import { formatTime, parseTimeToSeconds, formatBytes } from '../utils/formatters';
import { calculateRepeatPlan } from '@shared/utils/repeatPlan';

interface VideoProcessingPageProps {
  gpuCaps: GpuCapabilities | null;
  onNavigateToQueue: () => void;
}

// ─── Duration preset buttons ───────────────────────────────────────
const DURATION_PRESETS: { label: string; seconds: number }[] = [
  { label: '30 phút', seconds: 1800 },
  { label: '1 giờ',   seconds: 3600 },
  { label: '2 giờ',   seconds: 7200 },
  { label: '3 giờ',   seconds: 10800 },
  { label: '6 giờ',   seconds: 21600 },
  { label: '8 giờ',   seconds: 28800 },
  { label: '12 giờ',  seconds: 43200 },
];

export const VideoProcessingPage: React.FC<VideoProcessingPageProps> = ({
  gpuCaps,
  onNavigateToQueue,
}) => {
  const [videoPath, setVideoPath] = useState<string>('');
  const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);
  const [isSelectingVideo, setIsSelectingVideo] = useState(false);
  const selectionRequest = useRef(0);

  useEffect(() => () => { selectionRequest.current += 1; }, []);

  // Section A — Repeat count
  const [repeatCount, setRepeatCount] = useState<number>(3);

  // Section B — Audio Fade-in
  const [audioFadeInEnabled, setAudioFadeInEnabled] = useState<boolean>(true);
  const [fadeDuration, setFadeDuration] = useState<number>(5.0);
  const [fadeDurationInput, setFadeDurationInput] = useState<string>('00:00:05.000');

  // Section C — Duration Limit
  const [durationLimitEnabled, setDurationLimitEnabled] = useState<boolean>(false);
  const [durationLimitSeconds, setDurationLimitSeconds] = useState<number>(10800);
  const [durationLimitInput, setDurationLimitInput] = useState<string>('03:00:00.000');
  const [durationMode, setDurationMode] = useState<'EXACT' | 'MINIMUM'>('EXACT');
  const [maxOvershootSeconds, setMaxOvershootSeconds] = useState<number | null>(null);

  // Processing options
  const [gpuMode, setGpuMode] = useState<GpuMode>('AUTO');
  const [encoder, setEncoder] = useState<EncoderType>('libx264');
  const [outputFolder, setOutputFolder] = useState<string>('');
  const [filenameTemplate, setFilenameTemplate] = useState<string>('{original_name}_{repeat_count}x');

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [completedResult, setCompletedResult] = useState<{
    outputPath: string;
    outputSize: number;
    finalDuration: number;
    processingTimeMs: number;
  } | null>(null);

  // ─── Derived plan (live calculation, zero-cost) ────────────────────
  const sourceDuration = mediaInfo?.duration || 0;
  const parsedFadeDuration = parseTimeToSeconds(fadeDurationInput);
  const parsedDurationLimit = parseTimeToSeconds(durationLimitInput);
  const validFadeInput = parsedFadeDuration !== null && parsedFadeDuration <= sourceDuration;
  const validDurationInput = parsedDurationLimit !== null && parsedDurationLimit > 0;
  const plan = calculateRepeatPlan(
    sourceDuration,
    repeatCount,
    durationLimitEnabled,
    durationLimitEnabled ? durationLimitSeconds : null,
    durationMode,
    maxOvershootSeconds
  );

  // ─── Handlers ─────────────────────────────────────────────────────

  const handleSelectVideo = async () => {
    if (isSelectingVideo) return;
    const request = ++selectionRequest.current;
    setIsSelectingVideo(true);
    setErrorMsg(null);
    setCompletedResult(null);
    try {
      const filePath = await window.api.selectVideoFile();
      if (!filePath || request !== selectionRequest.current) return;
      setVideoPath(filePath);
      setMediaInfo(null);
      const info = await window.api.probeVideo(filePath);
      if (request !== selectionRequest.current) return;
      setMediaInfo(info);
      const defaultFade = Math.min(5.0, info.duration);
      setFadeDuration(defaultFade);
      setFadeDurationInput(formatTime(defaultFade));
    } catch (err: any) {
      if (request === selectionRequest.current) {
        setErrorMsg(err.message || 'Không thể kiểm tra thông tin tệp video.');
      }
    } finally {
      if (request === selectionRequest.current) setIsSelectingVideo(false);
    }
  };

  const handleReset = () => {
    selectionRequest.current += 1;
    setIsSelectingVideo(false);
    setVideoPath('');
    setMediaInfo(null);
    setRepeatCount(3);
    setAudioFadeInEnabled(true);
    setFadeDuration(5.0);
    setFadeDurationInput('00:00:05.000');
    setDurationLimitEnabled(false);
    setDurationLimitSeconds(10800);
    setDurationLimitInput('03:00:00.000');
    setDurationMode('EXACT');
    setMaxOvershootSeconds(null);
    setErrorMsg(null);
    setCompletedResult(null);
  };

  const handleFadeInputChange = (val: string) => {
    setFadeDurationInput(val);
    const parsed = parseTimeToSeconds(val);
    if (parsed !== null && mediaInfo && parsed >= 0 && parsed <= mediaInfo.duration) {
      setFadeDuration(parsed);
      setErrorMsg(null);
    } else if (mediaInfo && (parsed === null || parsed < 0 || parsed > mediaInfo.duration)) {
      setErrorMsg(
        `Thời lượng tăng âm đầu video phải từ 0 đến thời lượng video gốc (${formatTime(mediaInfo.duration)}).`
      );
    }
  };

  const handleDurationLimitInputChange = (val: string) => {
    setDurationLimitInput(val);
    const parsed = parseTimeToSeconds(val);
    if (parsed !== null && parsed > 0) {
      setDurationLimitSeconds(parsed);
      setErrorMsg(null);
    } else {
      setErrorMsg('Nhập thời lượng lớn hơn 0 theo dạng HH:MM:SS.mmm hoặc số giây.');
    }
  };

  const handlePresetDuration = (seconds: number) => {
    setDurationLimitSeconds(seconds);
    setDurationLimitInput(formatTime(seconds));
    setErrorMsg(null);
  };

  const handleSelectOutputFolder = async () => {
    const folder = await window.api.selectFolder();
    if (folder) setOutputFolder(folder);
  };

  const handleStartProcessing = async () => {
    if (isSelectingVideo || !videoPath || !mediaInfo) {
      setErrorMsg('Vui lòng chọn một tệp video nguồn hợp lệ trước khi bắt đầu.');
      return;
    }
    if (repeatCount < 1) {
      setErrorMsg('Số lần lặp phải ít nhất là 1.');
      return;
    }
    if (audioFadeInEnabled && mediaInfo.hasAudio && !validFadeInput) {
      setErrorMsg(
        `Thời lượng tăng âm đầu video phải nằm trong khoảng từ 0 đến ${formatTime(mediaInfo.duration)}.`
      );
      return;
    }
    if (durationLimitEnabled && !validDurationInput) {
      setErrorMsg('Nhập thời lượng lớn hơn 0 theo dạng HH:MM:SS.mmm hoặc số giây.');
      return;
    }
    if (plan.fullCopyCount < 1 && !plan.hasPartialFinalCopy) {
      setErrorMsg('Giới hạn thời lượng quá ngắn. Hãy tăng giới hạn hoặc giảm Repeat Count.');
      return;
    }

    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      await window.api.processVideo({
        inputPath: videoPath,
        outputFolder: outputFolder || '',
        outputFilenameTemplate: filenameTemplate,
        repeatCount,
        audioFadeInEnabled,
        audioFadeInDurationSeconds: audioFadeInEnabled ? fadeDuration : 0,
        durationLimitEnabled,
        durationLimitSeconds: durationLimitEnabled ? durationLimitSeconds : null,
        durationMode,
        maxOvershootSeconds: durationMode === 'MINIMUM' ? maxOvershootSeconds : null,
        gpuMode,
        encoder,
      });
      onNavigateToQueue();
    } catch (err: any) {
      setErrorMsg(err.message || 'Không thể thêm tác vụ xử lý video vào hàng chờ.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isValidToSubmit =
    !isSelectingVideo &&
    !!mediaInfo &&
    repeatCount >= 1 &&
    (!audioFadeInEnabled || !mediaInfo.hasAudio || validFadeInput) &&
    (!durationLimitEnabled || validDurationInput) &&
    (plan.fullCopyCount >= 1 || plan.hasPartialFinalCopy);

  return (
    <div className="flex flex-col gap-6 max-w-[1440px] mx-auto w-full">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-text-main">Xử lý video</h2>
          <p className="text-xs text-text-secondary mt-1">
            Lặp toàn bộ video — tuỳ chỉnh giới hạn thời lượng xuất và tăng dần âm thanh đầu video.
          </p>
        </div>
        {mediaInfo && (
          <button onClick={handleReset} className="btn-secondary text-xs">
            <RotateCcw size={14} /> Đặt lại
          </button>
        )}
      </div>

      {errorMsg && (
        <div className="p-3.5 bg-danger/15 border border-danger/30 rounded-control text-danger text-xs flex items-center gap-2 font-medium animate-fadeIn">
          <AlertCircle size={16} className="shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* No Audio Warning */}
      {mediaInfo && !mediaInfo.hasAudio && (
        <div className="p-3.5 bg-warning/15 border border-warning/30 rounded-control text-warning text-xs flex items-center gap-2 font-medium animate-fadeIn">
          <VolumeX size={16} className="shrink-0" />
          <span>Tệp nguồn không có âm thanh. Hiệu ứng tăng âm sẽ được bỏ qua.</span>
        </div>
      )}

      {/* Natural-fits-within-limit hint */}
      {durationLimitEnabled && plan.naturalFitsWithinLimit && mediaInfo && (
        <div className="p-3.5 bg-primary/10 border border-primary/25 rounded-control text-primary text-xs flex items-center gap-2 animate-fadeIn">
          <Info size={16} className="shrink-0" />
          <span>
            Số lần lặp hiện tại chỉ tạo được {formatTime(plan.naturalDurationSeconds)},
            ngắn hơn giới hạn đã đặt ({formatTime(durationLimitSeconds)}). Toàn bộ {repeatCount} lần lặp sẽ được xuất.
          </span>
        </div>
      )}

      {/* Success Result */}
      {completedResult && (
        <div className="surface-card p-6 border-success/40 bg-success/10 flex flex-col gap-4 animate-fadeIn">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-success/20 text-success rounded-full">
              <CheckCircle2 size={24} />
            </div>
            <div>
              <h3 className="text-base font-bold text-text-main">Xử lý hoàn tất thành công!</h3>
              <p className="text-xs text-text-muted mt-0.5">Tệp video lặp mới đã được tạo và kiểm tra tính toàn vẹn.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-surface-raised p-4 rounded-control border border-border text-xs font-mono">
            <div>
              <span className="text-text-muted block font-sans text-[10px]">THỜI LƯỢNG CUỐI</span>
              <span className="text-success font-bold">{formatTime(completedResult.finalDuration)}</span>
            </div>
            <div>
              <span className="text-text-muted block font-sans text-[10px]">DUNG LƯỢNG FILE</span>
              <span className="text-text-main font-bold">{formatBytes(completedResult.outputSize)}</span>
            </div>
            <div>
              <span className="text-text-muted block font-sans text-[10px]">THỜI GIAN XỬ LÝ</span>
              <span className="text-primary font-bold">{Math.round(completedResult.processingTimeMs / 1000)}s</span>
            </div>
            <div>
              <span className="text-text-muted block font-sans text-[10px]">BỘ MÃ HÓA</span>
              <span className="text-warning font-bold">{encoder}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button onClick={() => window.api.openFile(completedResult.outputPath)} className="btn-primary text-xs">
              <ExternalLink size={14} /> Mở video
            </button>
            <button onClick={() => window.api.openFolder(completedResult.outputPath)} className="btn-secondary text-xs">
              <FolderOpen size={14} /> Mở thư mục
            </button>
            <button onClick={handleReset} className="btn-secondary text-xs text-primary">
              <Plus size={14} /> Xử lý video khác
            </button>
          </div>
        </div>
      )}

      {/* Main Grid */}
      {!mediaInfo ? (
        <div
          onClick={handleSelectVideo}
          className="surface-card p-16 flex flex-col items-center justify-center border-2 border-dashed border-border hover:border-primary cursor-pointer transition-all gap-4 text-center my-4 group"
        >
          <div className="p-5 bg-primary/10 text-primary rounded-full group-hover:scale-110 transition-transform">
            <Upload size={36} />
          </div>
          <div>
            <h3 className="text-base font-bold text-text-main">{isSelectingVideo ? 'Đang kiểm tra video nguồn...' : 'Nhấn để chọn tệp video nguồn'}</h3>
            <p className="text-xs text-text-muted mt-1 max-w-md">
              Hỗ trợ MP4, MOV, MKV, AVI, M4V, WMV — lên đến 4K.
            </p>
          </div>
          <button disabled={isSelectingVideo} className="btn-primary text-xs mt-2 px-5 py-2.5">
            <FileVideo size={16} /> Chọn tệp từ máy tính
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Video Preview */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <VideoPlayer
              filePath={videoPath}
              fadeDuration={fadeDuration}
              audioFadeInEnabled={audioFadeInEnabled}
            />

            {/* Source Info Card */}
            <div className="surface-card p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <span className="text-xs font-semibold text-text-main flex items-center gap-2 truncate max-w-md">
                  <Film size={15} className="text-primary" /> {mediaInfo.fileName}
                </span>
                <button disabled={isSelectingVideo} onClick={handleSelectVideo} className="text-xs text-primary hover:underline font-medium">
                  Đổi video khác
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                <div>
                  <span className="text-text-muted block text-[10px] uppercase font-sans">Độ phân giải</span>
                  <span className="text-text-main font-semibold">
                    {mediaInfo.videoStreams[0]?.width || 0} × {mediaInfo.videoStreams[0]?.height || 0}
                  </span>
                </div>
                <div>
                  <span className="text-text-muted block text-[10px] uppercase font-sans">FPS</span>
                  <span className="text-text-main font-semibold">{mediaInfo.videoStreams[0]?.fps || 0}</span>
                </div>
                <div>
                  <span className="text-text-muted block text-[10px] uppercase font-sans">Dung lượng</span>
                  <span className="text-text-main font-semibold">{formatBytes(mediaInfo.fileSize)}</span>
                </div>
                <div>
                  <span className="text-text-muted block text-[10px] uppercase font-sans">Âm thanh</span>
                  <span className={mediaInfo.hasAudio ? 'text-success font-semibold font-sans' : 'text-text-muted font-sans'}>
                    {mediaInfo.hasAudio ? 'Có âm thanh' : 'Không có'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Config Panel */}
          <div className="lg:col-span-5 flex flex-col gap-4">

            {/* ─── PANEL: LẶP VIDEO & ÂM THANH ĐẦU ───────────────── */}
            <div className="surface-card p-5 flex flex-col gap-5">
              <h3 className="text-sm font-semibold text-primary flex items-center gap-2 border-b border-border pb-2">
                <Sparkles size={16} /> Lặp video &amp; Âm thanh đầu
              </h3>

              {/* SECTION A — Repeat Count */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-text-secondary font-semibold uppercase tracking-wide flex items-center justify-between">
                  <span>A — Số lần lặp toàn bộ video</span>
                  {durationLimitEnabled && (
                    <span className="text-[11px] text-warning font-mono font-normal">
                      [ {plan.effectiveRepeatCount}x ] Tự động
                    </span>
                  )}
                </label>
                <input
                  id="repeat-count-input"
                  type="number"
                  min="1"
                  max="9999"
                  disabled={durationLimitEnabled}
                  value={durationLimitEnabled ? plan.effectiveRepeatCount : repeatCount}
                  onChange={(e) => setRepeatCount(Math.max(1, parseInt(e.target.value) || 1))}
                  className={`glass-input font-mono text-sm ${durationLimitEnabled ? 'opacity-50 pointer-events-none' : ''}`}
                />
                {durationLimitEnabled && (
                  <p className="text-[11px] text-text-muted">
                    Số lần lặp được tự động tính dựa trên thời lượng video gốc và thời lượng xuất mong muốn.
                  </p>
                )}
              </div>

              {/* SECTION B — Audio Fade-in */}
              <div className="flex flex-col gap-2">
                <label className="text-xs text-text-secondary font-semibold uppercase tracking-wide">
                  B — Tăng dần âm thanh đầu video
                </label>

                <div className="flex items-center justify-between p-3 bg-surface-raised rounded-control border border-border">
                  <div className="flex items-center gap-2.5">
                    <Volume2 size={16} className={audioFadeInEnabled ? 'text-primary' : 'text-text-muted'} />
                    <span className="text-xs font-medium text-text-main">Tăng dần âm thanh đầu video</span>
                  </div>
                  <input
                    id="audio-fade-toggle"
                    type="checkbox"
                    checked={audioFadeInEnabled}
                    onChange={(e) => setAudioFadeInEnabled(e.target.checked)}
                    className="w-4 h-4 accent-primary cursor-pointer"
                  />
                </div>

                <div className={`flex flex-col gap-1.5 transition-opacity ${audioFadeInEnabled && mediaInfo.hasAudio ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                  <label className="text-xs text-text-secondary font-medium">
                    Thời lượng Fade In (HH:MM:SS.mmm)
                  </label>
                  <input
                    id="fade-duration-input"
                    type="text"
                    value={fadeDurationInput}
                    disabled={!audioFadeInEnabled || !mediaInfo.hasAudio}
                    onChange={(e) => handleFadeInputChange(e.target.value)}
                    placeholder="00:00:05.000"
                    className="glass-input font-mono text-sm"
                  />
                  <p className="text-[11px] text-text-muted">
                    Âm thanh chỉ tăng dần một lần ở đầu file xuất. Video không bị cắt tại mốc này.
                  </p>
                </div>
              </div>

              {/* SECTION C — Duration Limit */}
              <DurationLimitControl
                labelPrefix="C"
                durationLimitEnabled={durationLimitEnabled}
                onDurationLimitEnabledChange={setDurationLimitEnabled}
                durationLimitSeconds={durationLimitSeconds}
                onDurationLimitSecondsChange={setDurationLimitSeconds}
                durationLimitInput={durationLimitInput}
                onDurationLimitInputChange={setDurationLimitInput}
                durationMode={durationMode}
                onDurationModeChange={setDurationMode}
                maxOvershootSeconds={maxOvershootSeconds}
                onMaxOvershootSecondsChange={setMaxOvershootSeconds}
                sourceDurationSeconds={sourceDuration}
              />

              {/* ─── LIVE SUMMARY PANEL ──────────────────────────── */}
              <div className="bg-surface-raised p-4 rounded-control border border-border flex flex-col gap-2 font-mono text-xs">
                <div className="flex justify-between text-text-muted">
                  <span>Video gốc:</span>
                  <span className="text-text-main font-semibold">{formatTime(sourceDuration)}</span>
                </div>
                <div className="flex justify-between text-text-muted">
                  <span>Số lần lặp cần thiết:</span>
                  <span className="text-warning font-semibold">
                    {plan.effectiveRepeatCount}x {durationLimitEnabled ? '(Tự động)' : ''}
                  </span>
                </div>
                <div className="flex justify-between text-text-muted">
                  <span>Vòng đầy đủ:</span>
                  <span className="text-text-main">{plan.fullCopyCount}</span>
                </div>
                <div className="flex justify-between text-text-muted">
                  <span>Đoạn vòng cuối:</span>
                  <span className={plan.hasPartialFinalCopy ? 'text-warning font-semibold' : 'text-text-muted'}>
                    {plan.hasPartialFinalCopy
                      ? formatTime(plan.partialCopyDurationSeconds)
                      : 'Không cần cắt'}
                  </span>
                </div>
                <div className="flex justify-between text-text-muted">
                  <span>Fade In âm thanh:</span>
                  <span className={audioFadeInEnabled && mediaInfo?.hasAudio ? 'text-purple-400 font-semibold' : 'text-text-muted'}>
                    {audioFadeInEnabled && mediaInfo?.hasAudio ? formatTime(fadeDuration) : 'Tắt / Không có âm thanh'}
                  </span>
                </div>
                <div className="flex justify-between font-bold text-sm pt-2 border-t border-border text-success">
                  <span>Thời lượng xuất thực tế:</span>
                  <span>{formatTime(plan.effectiveDurationSeconds)}</span>
                </div>
              </div>
            </div>

            {/* ─── PANEL: Encoder & Output ──────────────────────── */}
            <div className="surface-card p-5 flex flex-col gap-4">
              <h3 className="text-sm font-semibold text-text-main flex items-center gap-2 border-b border-border pb-2">
                <Sliders size={16} className="text-primary" /> Phương thức xử lý &amp; Xuất file
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-text-muted">Chế độ GPU</label>
                  <select
                    value={gpuMode}
                    onChange={(e) => setGpuMode(e.target.value as GpuMode)}
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
                  <label className="text-xs text-text-muted">Bộ mã hóa (Codec)</label>
                  <select
                    value={encoder}
                    onChange={(e) => setEncoder(e.target.value as EncoderType)}
                    className="glass-input text-xs"
                  >
                    <option value="libx264">x264 (H.264 CPU)</option>
                    <option value="libx265">x265 (HEVC CPU)</option>
                    <option value="h264_nvenc">h264_nvenc (NVIDIA)</option>
                    <option value="hevc_nvenc">hevc_nvenc (NVIDIA)</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-text-muted">Thư mục đầu ra</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={outputFolder}
                    placeholder="Mặc định cùng thư mục tệp gốc"
                    onChange={(e) => setOutputFolder(e.target.value)}
                    className="glass-input text-xs flex-1"
                  />
                  <button onClick={handleSelectOutputFolder} className="btn-secondary text-xs">
                    <Folder size={14} /> Chọn
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  id="start-processing-btn"
                  onClick={handleStartProcessing}
                  disabled={!isValidToSubmit || isSubmitting}
                  className="btn-primary flex-1 justify-center py-3 text-sm font-semibold"
                >
                  <Play size={16} /> {isSubmitting ? 'Đang thêm...' : 'Bắt đầu xử lý'}
                </button>
                <button onClick={handleReset} className="btn-secondary py-3 text-xs">
                  Đặt lại
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

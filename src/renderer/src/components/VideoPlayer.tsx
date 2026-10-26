import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Sparkles, AlertCircle, RotateCcw } from 'lucide-react';
import { formatTime } from '../utils/formatters';

interface VideoPlayerProps {
  filePath: string;
  fadeDuration: number;
  audioFadeInEnabled: boolean;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  filePath,
  fadeDuration,
  audioFadeInEnabled,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [hasPreviewError, setHasPreviewError] = useState(false);
  const [isPreviewingFade, setIsPreviewingFade] = useState(false);

  const previewUrl = window.api ? window.api.getPreviewUrl(filePath) : filePath;

  useEffect(() => {
    // Reset preview state when file changes
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setHasPreviewError(false);
    setIsPreviewingFade(false);
  }, [filePath]);

  useEffect(() => {
    if (videoRef.current && !isPreviewingFade) {
      videoRef.current.volume = volume;
    }
  }, [isPreviewingFade, volume]);

  useEffect(() => {
    if (!audioFadeInEnabled || fadeDuration <= 0) setIsPreviewingFade(false);
  }, [audioFadeInEnabled, fadeDuration]);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play().catch(() => setHasPreviewError(true));
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const now = videoRef.current.currentTime;
      setCurrentTime(now);

      // Handle Fade In Preview volume ramp
      if (isPreviewingFade && audioFadeInEnabled && fadeDuration > 0) {
        if (now < fadeDuration) {
          const rampVolume = Math.min(1, Math.max(0, now / fadeDuration));
          videoRef.current.volume = volume * rampVolume;
        } else {
          videoRef.current.volume = volume;
          setIsPreviewingFade(false);
        }
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      videoRef.current.volume = volume;
      setHasPreviewError(false);
    }
  };

  const handleVideoError = () => {
    setHasPreviewError(true);
    console.warn('[VideoPlayer] Browser HTML5 preview unavailable for codec/format:', filePath);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (videoRef.current) {
      videoRef.current.currentTime = val;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    setIsPreviewingFade(false);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handlePreviewFadeIn = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.volume = 0;
      setIsPreviewingFade(true);
      videoRef.current.play().catch(() => setHasPreviewError(true));
      setIsPlaying(true);
    }
  };

  const handleRestart = () => {
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      if (isPlaying) {
        videoRef.current.play().catch(() => setHasPreviewError(true));
      }
    }
  };

  return (
    <div className="surface-card p-4 flex flex-col gap-3">
      {/* Video Viewport Container */}
      <div className="relative aspect-video bg-black rounded-control overflow-hidden flex items-center justify-center border border-border">
        {hasPreviewError ? (
          <div className="p-6 text-center flex flex-col items-center gap-2 text-warning max-w-sm">
            <AlertCircle size={28} />
            <span className="font-semibold text-xs text-text-main">
              Không thể phát bản xem trước bằng trình phát tích hợp.
            </span>
            <p className="text-[11px] text-text-muted">
              Định dạng video/codec này không hỗ trợ xem trước trực tiếp trong trình duyệt, nhưng video vẫn có thể được xử lý bình thường bằng FFmpeg.
            </p>
          </div>
        ) : (
          <video
            ref={videoRef}
            src={previewUrl}
            muted={isMuted}
            className="w-full h-full object-contain"
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onError={handleVideoError}
            onEnded={() => {
              setIsPlaying(false);
              setIsPreviewingFade(false);
            }}
          />
        )}

        {/* Fade-in Region Visual Overlay Indicator */}
        {!hasPreviewError && duration > 0 && audioFadeInEnabled && fadeDuration > 0 && (
          <div
            className="absolute top-0 bottom-0 left-0 bg-primary/10 border-r-2 border-primary pointer-events-none transition-all"
            style={{ width: `${Math.min(100, (fadeDuration / duration) * 100)}%` }}
          >
            <span className="absolute top-2 left-2 text-[10px] font-mono font-semibold text-primary bg-background/80 px-1.5 py-0.5 rounded border border-primary/40 shadow-sm">
              Fade In ({fadeDuration}s)
            </span>
          </div>
        )}

        {/* Active Fade Preview Toast Indicator */}
        {isPreviewingFade && (
          <div className="absolute bottom-3 left-3 bg-primary text-white text-[11px] font-medium px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-lg animate-pulse z-20">
            <Sparkles size={13} /> Đang nghe thử Fade In...
          </div>
        )}
      </div>

      {/* Timeline Controls */}
      <div className="flex flex-col gap-1.5 px-1">
        <div className="relative flex items-center">
          <input
            type="range"
            min="0"
            max={duration || 100}
            step="0.001"
            value={currentTime}
            onChange={handleSeek}
            disabled={hasPreviewError}
            className="w-full accent-primary h-2 bg-surface-raised rounded-lg cursor-pointer"
          />
        </div>

        <div className="flex items-center justify-between text-xs font-mono text-text-muted">
          <span>{formatTime(currentTime)}</span>
          <span className="text-primary font-semibold">
            {audioFadeInEnabled && fadeDuration > 0
              ? `Thời lượng Fade In: ${formatTime(fadeDuration)}`
              : 'Âm thanh nguồn bình thường'}
          </span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Control Actions Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-border">
        <div className="flex items-center gap-2">
          <button onClick={togglePlay} disabled={hasPreviewError} className="btn-secondary text-xs">
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            {isPlaying ? 'Tạm dừng' : 'Phát'}
          </button>

          <button onClick={handleRestart} disabled={hasPreviewError} className="btn-secondary text-xs">
            <RotateCcw size={14} /> Xem từ đầu
          </button>

          <div className="flex items-center gap-1.5 bg-surface-raised px-2.5 py-1 rounded-control border border-border">
            <button onClick={toggleMute} disabled={hasPreviewError} className="text-text-muted hover:text-text-main p-0.5">
              {isMuted || volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              disabled={hasPreviewError}
              className="w-16 accent-primary h-1 bg-surface rounded cursor-pointer"
            />
          </div>
        </div>

        {/* Audio Fade-in Preview Button */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePreviewFadeIn}
            disabled={hasPreviewError || !audioFadeInEnabled || fadeDuration <= 0}
            className="btn-primary text-xs py-1.5 px-3"
            title="Nghe thử hiệu ứng tăng dần âm thanh ở đầu video"
          >
            <Sparkles size={14} /> Nghe thử Fade In
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useId } from 'react';
import { Timer, Info, AlertTriangle } from 'lucide-react';
import { DurationMode, calculateRepeatPlan } from '@shared/utils/repeatPlan';
import { formatTime, parseTimeToSeconds } from '../utils/formatters';

export const DURATION_PRESETS: { label: string; seconds: number }[] = [
  { label: '30 phút', seconds: 1800 },
  { label: '1 giờ',   seconds: 3600 },
  { label: '2 giờ',   seconds: 7200 },
  { label: '3 giờ',   seconds: 10800 },
  { label: '6 giờ',   seconds: 21600 },
  { label: '8 giờ',   seconds: 28800 },
  { label: '10 giờ',  seconds: 36000 },
  { label: '12 giờ',  seconds: 43200 },
];

export interface DurationLimitControlProps {
  durationLimitEnabled: boolean;
  onDurationLimitEnabledChange: (enabled: boolean) => void;
  durationLimitSeconds: number;
  onDurationLimitSecondsChange: (seconds: number) => void;
  durationLimitInput: string;
  onDurationLimitInputChange: (input: string) => void;
  durationMode?: DurationMode;
  onDurationModeChange?: (mode: DurationMode) => void;
  maxOvershootSeconds?: number | null;
  onMaxOvershootSecondsChange?: (seconds: number | null) => void;
  sourceDurationSeconds?: number;
  labelPrefix?: string;
}

export const DurationLimitControl: React.FC<DurationLimitControlProps> = ({
  durationLimitEnabled,
  onDurationLimitEnabledChange,
  durationLimitSeconds,
  onDurationLimitSecondsChange,
  durationLimitInput,
  onDurationLimitInputChange,
  durationMode = 'EXACT',
  onDurationModeChange,
  maxOvershootSeconds = null,
  onMaxOvershootSecondsChange,
  sourceDurationSeconds,
  labelPrefix,
}) => {
  // The create form and edit modal can be mounted together. Keep their radio
  // groups independent so selecting one cannot uncheck the other form.
  const controlId = useId();
  const modeGroupName = `${controlId}-duration-mode`;
  const parsedDuration = parseTimeToSeconds(durationLimitInput);
  const invalidDuration = durationLimitEnabled && (parsedDuration === null || parsedDuration <= 0);

  const handleInputChange = (val: string) => {
    onDurationLimitInputChange(val);
    const secs = parseTimeToSeconds(val);
    if (secs !== null && secs > 0) {
      onDurationLimitSecondsChange(secs);
    }
  };

  const handlePresetSelect = (seconds: number) => {
    onDurationLimitSecondsChange(seconds);
    onDurationLimitInputChange(formatTime(seconds));
  };

  const plan = sourceDurationSeconds && sourceDurationSeconds > 0 && durationLimitEnabled
    ? calculateRepeatPlan(sourceDurationSeconds, 1, true, durationLimitSeconds, durationMode, maxOvershootSeconds)
    : null;

  return (
    <div className="flex flex-col gap-3">
      <label className="text-xs text-text-secondary font-semibold uppercase tracking-wide">
        {labelPrefix ? `${labelPrefix} — ` : ''}Thời lượng video xuất mong muốn
      </label>

      {/* Main Toggle */}
      <div className="flex items-center justify-between p-3 bg-surface-raised rounded-control border border-border">
        <div className="flex items-center gap-2.5">
          <Timer size={16} className={durationLimitEnabled ? 'text-warning' : 'text-text-muted'} />
          <span className="text-xs font-medium text-text-main">Giới hạn / Mục tiêu thời lượng xuất</span>
        </div>
        <input
          id={`${controlId}-toggle`}
          aria-label="Giới hạn / Mục tiêu thời lượng xuất"
          type="checkbox"
          checked={durationLimitEnabled}
          onChange={(e) => onDurationLimitEnabledChange(e.target.checked)}
          className="w-4 h-4 accent-primary cursor-pointer"
        />
      </div>

      <div
        className={`flex flex-col gap-3 transition-opacity ${
          durationLimitEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'
        }`}
      >
        {/* Duration Input & Presets */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${controlId}-input`} className="text-xs text-text-secondary font-medium">
            Thời lượng xuất mong muốn (HH:MM:SS.mmm)
          </label>
          <input
            id={`${controlId}-input`}
            type="text"
            value={durationLimitInput}
            disabled={!durationLimitEnabled}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder="03:00:00.000"
            aria-invalid={invalidDuration}
            className="glass-input font-mono text-sm"
          />
          {invalidDuration && (
            <p className="text-[11px] text-danger" role="alert">
              Nhập thời lượng lớn hơn 0 theo dạng HH:MM:SS.mmm hoặc số giây.
            </p>
          )}

          <div className="flex flex-wrap gap-1.5 mt-1">
            {DURATION_PRESETS.map((p) => (
              <button
                key={p.seconds}
                type="button"
                disabled={!durationLimitEnabled}
                onClick={() => handlePresetSelect(p.seconds)}
                className={`text-[11px] px-2.5 py-1 rounded border transition-colors font-mono ${
                  durationLimitSeconds === p.seconds
                    ? 'bg-warning/20 border-warning/60 text-warning font-semibold'
                    : 'bg-surface-raised border-border text-text-muted hover:border-warning/40 hover:text-warning'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Chế độ thời lượng Options (Requirement 6) */}
        {onDurationModeChange && (
          <div className="flex flex-col gap-2 p-3 bg-surface-raised/60 rounded-control border border-border/80">
            <span className="text-xs font-semibold text-text-main">Chế độ thời lượng:</span>

            <div className="flex flex-col gap-2.5">
              {/* EXACT Mode Option */}
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name={modeGroupName}
                  disabled={!durationLimitEnabled}
                  checked={durationMode === 'EXACT'}
                  onChange={() => onDurationModeChange('EXACT')}
                  className="mt-0.5 accent-primary cursor-pointer"
                />
                <div>
                  <div className="text-xs font-semibold text-text-main">Chính xác thời lượng</div>
                  <div className="text-[11px] text-text-muted">
                    Video xuất đúng thời gian đã chọn. Vòng cuối có thể được cắt.
                  </div>
                </div>
              </label>

              {/* MINIMUM Mode Option */}
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name={modeGroupName}
                  disabled={!durationLimitEnabled}
                  checked={durationMode === 'MINIMUM'}
                  onChange={() => onDurationModeChange('MINIMUM')}
                  className="mt-0.5 accent-primary cursor-pointer"
                />
                <div>
                  <div className="text-xs font-semibold text-text-main">Đủ thời lượng</div>
                  <div className="text-[11px] text-text-muted">
                    Video được lặp đủ số vòng. Không cắt video. Có thể dài hơn thời gian mục tiêu.
                  </div>
                </div>
              </label>
            </div>

            {/* Maximum Overshoot Protection (Requirement 5) */}
            {durationMode === 'MINIMUM' && onMaxOvershootSecondsChange && (
              <div className="mt-2 pt-2.5 border-t border-border/50 flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-secondary font-medium">Giới hạn thời lượng dư tối đa (Phút)</span>
                  <label className="flex items-center gap-1.5 text-xs text-text-muted cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!durationLimitEnabled}
                      checked={maxOvershootSeconds !== null && maxOvershootSeconds !== undefined}
                      onChange={(e) => onMaxOvershootSecondsChange(e.target.checked ? 600 : null)}
                      className="accent-primary"
                    />
                    Giới hạn dư
                  </label>
                </div>

                {maxOvershootSeconds !== null && maxOvershootSeconds !== undefined && (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      disabled={!durationLimitEnabled}
                      min="1"
                      step="1"
                      value={Math.round((maxOvershootSeconds || 600) / 60)}
                      onChange={(e) => onMaxOvershootSecondsChange((parseInt(e.target.value) || 10) * 60)}
                      className="glass-input text-xs font-mono w-28"
                    />
                    <span className="text-xs text-text-muted font-mono">phút</span>
                    <span className="text-[11px] text-text-muted">
                      (Tự chuyển về Chính xác nếu dư vượt quá ngưỡng này)
                    </span>
                  </div>
                )}
                {maxOvershootSeconds !== null && maxOvershootSeconds !== undefined && !plan && (
                  <p className="text-[11px] text-warning flex items-start gap-1.5" role="note">
                    <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                    <span>Nếu phần dư vượt {maxOvershootSeconds / 60} phút, ứng dụng sẽ chuyển sang Chính xác và cắt vòng cuối. Tắt Giới hạn dư để luôn giữ trọn vòng lặp.</span>
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Live Calculation Preview Box (Requirement 7) */}
        {plan && sourceDurationSeconds && sourceDurationSeconds > 0 && (
          <div className="p-3 bg-primary/10 border border-primary/20 rounded-control flex flex-col gap-1.5 text-xs font-mono text-text-main">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-primary flex items-center gap-1.5">
                <Info size={14} /> Xem trước tính toán:
              </span>
              <span className="text-[11px] font-normal text-text-muted">
                Gốc: {formatTime(sourceDurationSeconds)}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              <div>
                <span className="text-[10px] text-text-muted block">Số lần lặp:</span>
                <strong className="text-primary">{plan.effectiveRepeatCount}x</strong>
              </div>
              <div>
                <span className="text-[10px] text-text-muted block">Thời lượng thực tế:</span>
                <strong className="text-success">{formatTime(plan.expectedFinalDurationSeconds)}</strong>
              </div>
              <div>
                <span className="text-[10px] text-text-muted block">Mục tiêu:</span>
                <strong className="text-warning">{formatTime(durationLimitSeconds)}</strong>
              </div>
              <div>
                <span className="text-[10px] text-text-muted block">Dư (Extra):</span>
                <strong className={plan.overshootSeconds > 0 ? 'text-warning font-bold' : 'text-text-muted'}>
                  {plan.overshootSeconds > 0 ? `+${formatTime(plan.overshootSeconds)}` : '00:00'}
                </strong>
              </div>
            </div>

            {plan.fallbackToExact && (
              <div className="mt-1 text-[11px] text-warning flex items-center gap-1 font-sans">
                <AlertTriangle size={13} className="shrink-0" />
                <span>Thời lượng dư (+{formatTime((plan.effectiveRepeatCount * sourceDurationSeconds) - durationLimitSeconds)}) vượt quá giới hạn dư. Đã tự động chuyển về <strong>Chính xác thời lượng</strong>.</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

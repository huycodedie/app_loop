import React, { useState, useEffect } from 'react';
import { CalendarClock, Trash2, Plus } from 'lucide-react';
import { ScheduleConfig } from '@shared/types';
import { EmptyState } from '../components/EmptyState';
import { Modal } from '../components/Modal';
import { DurationLimitControl } from '../components/DurationLimitControl';
import { formatTime, parseTimeToSeconds } from '../utils/formatters';

export const SchedulerPage: React.FC = () => {
  const [schedules, setSchedules] = useState<ScheduleConfig[]>([]);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Form State
  const [name, setName] = useState<string>('');
  const [cron, setCron] = useState<string>('0 0 * * *');
  const [inputPath, setInputPath] = useState<string>('');
  const [audioFadeInEnabled, setAudioFadeInEnabled] = useState<boolean>(true);
  const [audioFadeInDuration, setAudioFadeInDuration] = useState<number>(5.0);
  const [repeatCount, setRepeatCount] = useState<number>(3);

  // Duration Limit State
  const [durationLimitEnabled, setDurationLimitEnabled] = useState<boolean>(false);
  const [durationLimitSeconds, setDurationLimitSeconds] = useState<number>(10800);
  const [durationLimitInput, setDurationLimitInput] = useState<string>('03:00:00.000');
  const parsedDuration = parseTimeToSeconds(durationLimitInput);
  const validDuration = !durationLimitEnabled || (parsedDuration !== null && parsedDuration > 0);

  const loadSchedules = async () => {
    const list = await window.api.getSchedules();
    setSchedules(list);
  };

  useEffect(() => {
    loadSchedules();
  }, []);

  const handleCreateSchedule = async () => {
    if (!name || !inputPath || !validDuration || isCreating) return;
    setErrorMessage(null);
    setIsCreating(true);
    try {
      await window.api.createSchedule({
        name,
        jobConfigJson: JSON.stringify({
          inputPath,
          outputFolder: '',
          outputFilenameTemplate: '{original_name}_sched_repeat_{repeat_count}x',
          repeatCount,
          audioFadeInEnabled,
          audioFadeInDurationSeconds: audioFadeInDuration,
          durationLimitEnabled,
          durationLimitSeconds: durationLimitEnabled ? durationLimitSeconds : null,
          gpuMode: 'AUTO',
        }),
        cronExpression: cron,
        enabled: true,
      });

      setName('');
      setInputPath('');
      setDurationLimitEnabled(false);
      setDurationLimitSeconds(10800);
      setDurationLimitInput('03:00:00.000');
      setIsModalOpen(false);
      await loadSchedules();
    } catch (err: any) {
      setErrorMessage(err.message || 'Không thể tạo lịch trình.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    await window.api.deleteSchedule(id);
    loadSchedules();
  };

  const getScheduleSummary = (s: ScheduleConfig) => {
    try {
      const cfg = JSON.parse(s.jobConfigJson);
      const limitStr = cfg.durationLimitEnabled && cfg.durationLimitSeconds
        ? `Giới hạn: ${formatTime(cfg.durationLimitSeconds)}`
        : 'Không giới hạn';
      const repeatStr = cfg.durationLimitEnabled ? 'Lặp: Tự động' : `Lặp: ${cfg.repeatCount || 3}x`;
      return `${repeatStr} • ${limitStr}`;
    } catch {
      return '';
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-[1440px] mx-auto w-full">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-text-main">Lịch trình tự động</h2>
          <p className="text-xs text-text-secondary mt-1">
            Lên lịch chạy các tác vụ lặp video định kỳ hoặc theo mốc thời gian cụ thể.
          </p>
        </div>

        <button onClick={() => setIsModalOpen(true)} className="btn-primary text-xs">
          <Plus size={16} /> Tạo lịch trình mới
        </button>
      </div>

      {/* Schedule List Container */}
      <div className="surface-card p-5">
        <h3 className="text-sm font-semibold text-text-main border-b border-border pb-2 mb-3">
          Danh sách lịch trình đã lưu
        </h3>

        {schedules.length === 0 ? (
          <EmptyState
            icon={<CalendarClock size={36} />}
            title="Chưa có lịch trình nào"
            description="Tạo lịch trình định kỳ để tự động chạy các bài xử lý video lặp lại."
            actionLabel="Tạo lịch trình đầu tiên"
            onAction={() => setIsModalOpen(true)}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {schedules.map((s) => (
              <div
                key={s.id}
                className="p-4 bg-surface-raised rounded-control border border-border flex items-center justify-between text-xs"
              >
                <div className="flex flex-col gap-1">
                  <div className="font-semibold text-text-main text-sm flex items-center gap-2">
                    <span>{s.name}</span>
                    <span className="text-[11px] font-normal text-text-muted font-mono">
                      ({getScheduleSummary(s)})
                    </span>
                  </div>
                  <div className="text-xs text-text-muted font-mono">
                    Biểu thức Cron: <span className="text-primary">{s.cronExpression}</span> • Lần chạy tiếp:{' '}
                    <span className="text-text-main">{s.nextRun || 'Đang chờ'}</span>
                  </div>
                </div>

                <button
                  onClick={() => handleDelete(s.id)}
                  className="p-1.5 text-text-muted hover:text-danger hover:bg-surface rounded-control transition-colors"
                  title="Xóa lịch trình"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Form Create Schedule */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Tạo lịch trình mới">
        <div className="flex flex-col gap-4 text-xs">
          {errorMessage && (
            <div className="p-3 bg-danger/15 border border-danger/30 rounded-control text-danger" role="alert">
              {errorMessage}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label className="text-text-secondary font-medium">Tên lịch trình</label>
            <input
              type="text"
              value={name}
              placeholder="Ví dụ: Lặp video quảng cáo đêm"
              onChange={(e) => setName(e.target.value)}
              className="glass-input text-xs"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-text-secondary font-medium">Đường dẫn tệp video nguồn</label>
            <input
              type="text"
              value={inputPath}
              placeholder="C:/Videos/source.mp4"
              onChange={(e) => setInputPath(e.target.value)}
              className="glass-input text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-text-secondary font-medium">Fade In Âm thanh (Giây)</label>
              <input
                type="number"
                step="0.5"
                value={audioFadeInDuration}
                onChange={(e) => setAudioFadeInDuration(parseFloat(e.target.value) || 5.0)}
                className="glass-input text-xs font-mono"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-text-secondary font-medium flex items-center justify-between">
                <span>Số lần lặp</span>
                {durationLimitEnabled && (
                  <span className="text-[10px] text-warning font-mono">Tự động</span>
                )}
              </label>
              <input
                type="number"
                disabled={durationLimitEnabled}
                value={repeatCount}
                onChange={(e) => setRepeatCount(parseInt(e.target.value) || 3)}
                className={`glass-input text-xs font-mono ${durationLimitEnabled ? 'opacity-50 pointer-events-none' : ''}`}
              />
              {durationLimitEnabled && (
                <span className="text-[10px] text-text-muted">Tự động tính khi chạy lịch trình</span>
              )}
            </div>
          </div>

          {/* Duration Limit Section */}
          <DurationLimitControl
            durationLimitEnabled={durationLimitEnabled}
            onDurationLimitEnabledChange={setDurationLimitEnabled}
            durationLimitSeconds={durationLimitSeconds}
            onDurationLimitSecondsChange={setDurationLimitSeconds}
            durationLimitInput={durationLimitInput}
            onDurationLimitInputChange={setDurationLimitInput}
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-text-secondary font-medium">Biểu thức Cron (Thời gian)</label>
            <input
              type="text"
              value={cron}
              placeholder="0 0 * * *"
              onChange={(e) => setCron(e.target.value)}
              className="glass-input text-xs font-mono"
            />
            <span className="text-[10px] text-text-muted">VD: "0 0 * * *" chạy lúc 00:00 hàng ngày</span>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border mt-2">
            <button onClick={() => setIsModalOpen(false)} className="btn-secondary text-xs">
              Hủy
            </button>
            <button
              onClick={handleCreateSchedule}
              disabled={!name || !inputPath || !validDuration || isCreating}
              className="btn-primary text-xs"
            >
              Tạo lịch trình
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

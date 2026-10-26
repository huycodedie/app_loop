import React, { useState, useEffect } from 'react';
import { Plus, Trash2, FolderSearch, Folder, CheckCircle2, Calendar, FolderTree, Pencil, Play, Pause, FileCheck, Check, AlertCircle } from 'lucide-react';
import { WatchFolderConfig, GpuMode, EncoderType, ErrorNamingMode, DurationMode } from '@shared/types';
import { EmptyState } from '../components/EmptyState';
import { DurationLimitControl } from '../components/DurationLimitControl';
import { Modal } from '../components/Modal';
import { getDailyFolderName } from '@shared/utils/outputDirectoryResolver';
import { formatTime, parseTimeToSeconds } from '../utils/formatters';
import { serializeWatchFolderForm } from '../utils/watchFolderForm';

interface FolderStats {
  lastProcessedFile: string | null;
  countToday: number;
}

export const WatchFolderPage: React.FC = () => {
  const [folders, setFolders] = useState<WatchFolderConfig[]>([]);
  const [statsMap, setStatsMap] = useState<Record<string, FolderStats>>({});
  
  // Add Form State
  const [name, setName] = useState<string>('');
  const [inputFolder, setInputFolder] = useState<string>('');
  const [outputFolder, setOutputFolder] = useState<string>('');
  const [audioFadeInEnabled, setAudioFadeInEnabled] = useState<boolean>(true);
  const [audioFadeInDuration, setAudioFadeInDuration] = useState<number>(5.0);
  const [repeatCount, setRepeatCount] = useState<number>(3);
  const [durationLimitEnabled, setDurationLimitEnabled] = useState<boolean>(false);
  const [durationLimitSeconds, setDurationLimitSeconds] = useState<number>(10800);
  const [durationLimitInput, setDurationLimitInput] = useState<string>('03:00:00.000');
  const [durationMode, setDurationMode] = useState<DurationMode>('EXACT');
  const [maxOvershootSeconds, setMaxOvershootSeconds] = useState<number | null>(null);
  const [autoDailyOutputFolder, setAutoDailyOutputFolder] = useState<boolean>(true);

  // Edit Modal State
  const [editingFolder, setEditingFolder] = useState<WatchFolderConfig | null>(null);
  const [editDurationLimitInput, setEditDurationLimitInput] = useState<string>('03:00:00.000');

  // UI Toast State
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const parsedDuration = parseTimeToSeconds(durationLimitInput);
  const validDuration = !durationLimitEnabled || (parsedDuration !== null && parsedDuration > 0);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const loadWatchFolders = async () => {
    const list = await window.api.getWatchFolders();
    setFolders(list);

    // Fetch stats for each folder
    const stats: Record<string, FolderStats> = {};
    for (const f of list) {
      try {
        const s = await window.api.getWatchFolderStats(f.id);
        stats[f.id] = s;
      } catch {
        stats[f.id] = { lastProcessedFile: null, countToday: 0 };
      }
    }
    setStatsMap(stats);
  };

  useEffect(() => {
    loadWatchFolders();

    const interval = setInterval(() => {
      setCurrentDate(new Date());
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const handleAddFolder = async () => {
    if (!inputFolder || isAdding || !validDuration) return;
    const finalOutDir = outputFolder || inputFolder;
    setErrorMessage(null);
    setIsAdding(true);
    try {
      await window.api.addWatchFolder(serializeWatchFolderForm({
        name: name.trim() || undefined,
        folderPath: inputFolder,
        outputFolder: finalOutDir,
        repeatCount,
        audioFadeInEnabled,
        audioFadeInDurationSeconds: audioFadeInDuration,
        durationLimitEnabled,
        durationLimitSeconds: durationLimitEnabled ? durationLimitSeconds : null,
        durationMode,
        maxOvershootSeconds: durationMode === 'MINIMUM' ? maxOvershootSeconds : null,
        autoDailyOutputFolder,
        dailyFolderFormat: 'DAY_MONTH',
        enabled: true,
      }, durationLimitInput));

      setName('');
      setInputFolder('');
      showToast('Đã thêm thư mục theo dõi thành công');
      await loadWatchFolders();
    } catch (err: any) {
      setErrorMessage(err.message || 'Không thể thêm thư mục theo dõi.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemove = async (id: string) => {
    await window.api.removeWatchFolder(id);
    showToast('Đã xóa thư mục theo dõi');
    loadWatchFolders();
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    await window.api.toggleWatchFolder(id, !enabled);
    loadWatchFolders();
  };

  const handleOpenEdit = (f: WatchFolderConfig) => {
    setEditingFolder({ ...f });
    setEditDurationLimitInput(
      f.durationLimitSeconds ? formatTime(f.durationLimitSeconds) : '03:00:00.000'
    );
  };

  const updateEditingFolder = (changes: Partial<WatchFolderConfig>, folderId = editingFolder?.id) => {
    setEditingFolder(current => current && current.id === folderId ? { ...current, ...changes } : current);
  };

  const handleSaveEdit = async () => {
    if (!editingFolder || isSaving) return;
    if (!editingFolder.folderPath) {
      alert('Vui lòng nhập đường dẫn thư mục nguồn.');
      return;
    }
    const editDuration = parseTimeToSeconds(editDurationLimitInput);
    if (editingFolder.durationLimitEnabled && (editDuration === null || editDuration <= 0)) {
      return;
    }

    setIsSaving(true);
    try {
      const updatedFolder = serializeWatchFolderForm(editingFolder, editDurationLimitInput);
      await window.api.updateWatchFolder(editingFolder.id, updatedFolder);
      showToast('Đã cập nhật thư mục theo dõi');
      setEditingFolder(current => current?.id === editingFolder.id ? null : current);
      loadWatchFolders();
    } catch (err: any) {
      alert(`Lỗi cập nhật thư mục theo dõi: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const dailyFolderName = getDailyFolderName(currentDate);
  const effectiveOutputFolder = outputFolder || inputFolder;
  const todayPreviewPath = effectiveOutputFolder
    ? `${effectiveOutputFolder}\\${dailyFolderName}`
    : '';

  return (
    <div className="flex flex-col gap-6 max-w-[1440px] mx-auto w-full relative">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-6 right-6 z-50 bg-success text-white px-4 py-2.5 rounded-control shadow-xl text-xs font-semibold flex items-center gap-2 animate-fadeIn">
          <Check size={16} /> {toastMessage}
        </div>
      )}

      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-bold text-text-main">Thư mục theo dõi tự động</h2>
        <p className="text-xs text-text-secondary mt-1">
          Tự động phát hiện video mới trong thư mục được cấu hình và đưa vào hàng chờ xử lý lặp.
        </p>
      </div>

      {/* Add New Watcher Form Card */}
      {errorMessage && (
        <div className="p-3 bg-danger/15 border border-danger/30 rounded-control text-danger text-xs" role="alert">
          {errorMessage}
        </div>
      )}
      <div className="surface-card p-5 flex flex-col gap-5">
        <h3 className="text-sm font-semibold text-primary flex items-center gap-2 border-b border-border pb-2">
          <FolderSearch size={16} /> Thêm thư mục theo dõi mới
        </h3>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-text-secondary font-medium">Tên gợi nhớ (Tùy chọn)</label>
          <input
            type="text"
            value={name}
            placeholder="Ví dụ: Kênh Rain Studio 1"
            onChange={(e) => setName(e.target.value)}
            className="glass-input text-xs"
          />
        </div>

        {/* Folders Selection */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-text-secondary font-medium">THƯ MỤC NGUỒN (Theo dõi)</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={inputFolder}
                placeholder="Ví dụ: D:\Incoming_Rain"
                onChange={(e) => setInputFolder(e.target.value)}
                className="glass-input text-xs flex-1"
              />
              <button
                type="button"
                onClick={async () => {
                  const f = await window.api.selectFolder();
                  if (f) setInputFolder(f);
                }}
                className="btn-secondary text-xs"
              >
                <Folder size={14} /> Chọn
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-text-secondary font-medium">THƯ MỤC ĐÍCH (Xuất video)</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={outputFolder}
                placeholder="Ví dụ: D:\Finished_Rain"
                onChange={(e) => setOutputFolder(e.target.value)}
                className="glass-input text-xs flex-1"
              />
              <button
                type="button"
                onClick={async () => {
                  const f = await window.api.selectFolder();
                  if (f) setOutputFolder(f);
                }}
                className="btn-secondary text-xs"
              >
                <Folder size={14} /> Chọn
              </button>
            </div>
          </div>
        </div>

        {/* Auto Daily Output Folder Option */}
        <div className="flex flex-col gap-2 p-3 bg-surface-raised rounded-control border border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <FolderTree size={16} className={autoDailyOutputFolder ? 'text-primary' : 'text-text-muted'} />
              <div>
                <span className="text-xs font-semibold text-text-main">Tự tạo thư mục theo ngày</span>
                <p className="text-[11px] text-text-muted">
                  Tự động phân loại video xuất vào thư mục con dạng NGÀY_THÁNG (VD: {dailyFolderName}) dựa trên ngày xử lý.
                </p>
              </div>
            </div>
            <input
              id="auto-daily-toggle"
              type="checkbox"
              checked={autoDailyOutputFolder}
              onChange={(e) => setAutoDailyOutputFolder(e.target.checked)}
              className="w-4 h-4 accent-primary cursor-pointer"
            />
          </div>

          {/* Live Daily Folder Preview */}
          {autoDailyOutputFolder && effectiveOutputFolder && (
            <div className="mt-1 p-2.5 bg-primary/10 border border-primary/20 rounded text-xs font-mono text-primary flex items-center gap-2">
              <Calendar size={14} className="shrink-0" />
              <span>
                Video hôm nay sẽ được lưu tại: <strong>{todayPreviewPath}</strong>
              </span>
            </div>
          )}
        </div>

        {/* Repeat Count & Audio Fade */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-border pt-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-text-secondary font-medium flex items-center justify-between">
              <span>SỐ LẦN LẶP MẶC ĐỊNH</span>
              {durationLimitEnabled && (
                <span className="text-[11px] text-warning font-mono font-normal">
                  Tự động theo thời lượng gốc
                </span>
              )}
            </label>
            <input
              type="number"
              min="1"
              disabled={durationLimitEnabled}
              value={repeatCount}
              onChange={(e) => setRepeatCount(parseInt(e.target.value) || 3)}
              className={`glass-input text-xs font-mono ${durationLimitEnabled ? 'opacity-50 pointer-events-none' : ''}`}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-text-secondary font-medium">TĂNG DẦN ÂM THANH ĐẦU VIDEO (Giây)</label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-text-main">
                <input
                  type="checkbox"
                  checked={audioFadeInEnabled}
                  onChange={(e) => setAudioFadeInEnabled(e.target.checked)}
                  className="accent-primary"
                />
                Bật
              </label>
              <input
                type="number"
                step="0.5"
                disabled={!audioFadeInEnabled}
                value={audioFadeInDuration}
                onChange={(e) => setAudioFadeInDuration(parseFloat(e.target.value) || 5.0)}
                className="glass-input text-xs font-mono flex-1 disabled:opacity-40"
              />
            </div>
          </div>
        </div>

        {/* Duration Limit Control */}
        <div className="border-t border-border pt-4">
          <DurationLimitControl
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
          />
        </div>

        <button onClick={handleAddFolder} disabled={!inputFolder || !validDuration || isAdding} className="btn-primary text-xs justify-center py-2.5 mt-2">
          <Plus size={16} /> Thêm thư mục theo dõi
        </button>
      </div>

      {/* Watch Folders List Card */}
      <div className="surface-card p-5 flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-text-main border-b border-border pb-2">
          Danh sách thư mục đang theo dõi ({folders.length})
        </h3>

        {folders.length === 0 ? (
          <EmptyState
            icon={<FolderSearch size={32} />}
            title="Chưa có thư mục theo dõi nào"
            description="Hãy thêm thư mục cần theo dõi để tự động bắt video mới thả vào thư mục."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {folders.map((f) => {
              const itemDailyName = getDailyFolderName(currentDate);
              const displayDest = f.autoDailyOutputFolder
                ? `${f.outputFolder}\\{ngày}`
                : f.outputFolder;
              const todayPath = f.autoDailyOutputFolder
                ? `${f.outputFolder}\\${itemDailyName}`
                : f.outputFolder;
              const limitText = f.durationLimitEnabled && f.durationLimitSeconds
                ? formatTime(f.durationLimitSeconds)
                : 'Không';
              const stats = statsMap[f.id] || { lastProcessedFile: null, countToday: 0 };

              return (
                <div
                  key={f.id}
                  className="p-4 bg-surface-raised rounded-control border border-border flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-xs"
                >
                  <div className="flex flex-col gap-1.5 truncate flex-1">
                    <div className="font-semibold text-text-main text-sm flex items-center gap-2 truncate">
                      {f.name && <span className="text-primary font-bold">[{f.name}]</span>}
                      <span className="truncate" title={f.folderPath}>{f.folderPath}</span>
                      <span className="text-[11px] font-mono text-text-muted font-normal">
                        → {displayDest}
                      </span>
                    </div>

                    <div className="text-[11px] text-text-muted font-mono flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span>Lặp: <strong className="text-text-main">{f.durationLimitEnabled ? 'Tự động theo thời lượng' : `${f.repeatCount}x`}</strong></span>
                      <span>Fade In: <strong className="text-text-main">{f.audioFadeInEnabled ? `${f.audioFadeInDurationSeconds}s` : 'Tắt'}</strong></span>
                      <span>Giới hạn: <strong className="text-warning">{limitText}</strong></span>
                      {f.durationLimitEnabled && <span>Chế độ: <strong className="text-primary">{f.durationMode === 'MINIMUM' ? 'Đủ thời lượng' : 'Chính xác'}</strong></span>}
                      <span>Theo ngày: <strong className={f.autoDailyOutputFolder ? 'text-success' : 'text-text-muted'}>{f.autoDailyOutputFolder ? 'Bật' : 'Tắt'}</strong></span>
                      <span>Đánh dấu file: <strong className={f.renameSourceFiles ?? true ? 'text-success' : 'text-text-muted'}>{f.renameSourceFiles ?? true ? 'Bật' : 'Tắt'}</strong></span>
                    </div>

                    <div className="text-[11px] text-text-secondary font-mono flex flex-wrap items-center gap-3 mt-0.5">
                      <span>Đã xử lý hôm nay: <strong className="text-primary">{stats.countToday} file</strong></span>
                      <span>File gần nhất: <strong className="text-text-main">{stats.lastProcessedFile || 'Chưa có'}</strong></span>
                    </div>

                    {f.autoDailyOutputFolder && (
                      <div className="text-[11px] text-primary font-mono flex items-center gap-1">
                        <Calendar size={12} />
                        <span>Hôm nay: {todayPath}</span>
                      </div>
                    )}
                  </div>

                  {/* Item Actions (Requirement 12: Bật / Tạm dừng, Chỉnh sửa, Xóa) */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleToggle(f.id, f.enabled)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-control text-xs font-semibold border transition-colors ${
                        f.enabled
                          ? 'bg-success/15 text-success border-success/30 hover:bg-success/25'
                          : 'bg-surface text-text-muted border-border hover:bg-surface-raised'
                      }`}
                      title={f.enabled ? 'Tạm dừng quy tắc theo dõi' : 'Bật quy tắc theo dõi'}
                    >
                      {f.enabled ? <Pause size={14} /> : <Play size={14} />}
                      {f.enabled ? 'Tạm dừng' : 'Bật'}
                    </button>

                    <button
                      onClick={() => handleOpenEdit(f)}
                      className="btn-secondary text-xs px-3 py-1.5"
                      title="Chỉnh sửa cấu hình thư mục theo dõi"
                    >
                      <Pencil size={14} /> Chỉnh sửa
                    </button>

                    <button
                      onClick={() => handleRemove(f.id)}
                      className="p-1.5 text-text-muted hover:text-danger hover:bg-surface rounded-control transition-colors"
                      title="Xóa thư mục theo dõi"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit Watch Folder Modal */}
      {editingFolder && (
        <Modal
          isOpen={Boolean(editingFolder)}
          onClose={() => setEditingFolder(null)}
          title="Chỉnh sửa cấu hình Thư mục theo dõi"
        >
          <div className="flex flex-col gap-4 max-h-[80vh] overflow-y-auto pr-1">
            <p className="text-[11px] text-text-secondary">
              Thay đổi áp dụng cho video đang chờ và video mới của quy tắc này. Video đang xử lý tiếp tục dùng cấu hình đã bắt đầu.
            </p>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-text-secondary font-medium">Tên gợi nhớ (Tùy chọn)</label>
              <input
                type="text"
                value={editingFolder.name || ''}
                placeholder="Ví dụ: Kênh Rain Studio 1"
                onChange={(e) => updateEditingFolder({ name: e.target.value })}
                className="glass-input text-xs"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-text-secondary font-medium">Thư mục nguồn (Monitored)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editingFolder.folderPath}
                    onChange={(e) => updateEditingFolder({ folderPath: e.target.value })}
                    className="glass-input text-xs flex-1"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const f = await window.api.selectFolder();
                      if (f) updateEditingFolder({ folderPath: f });
                    }}
                    className="btn-secondary text-xs"
                  >
                    <Folder size={14} />
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-text-secondary font-medium">Thư mục đầu ra (Output)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editingFolder.outputFolder}
                    onChange={(e) => updateEditingFolder({ outputFolder: e.target.value })}
                    className="glass-input text-xs flex-1"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const f = await window.api.selectFolder();
                      if (f) updateEditingFolder({ outputFolder: f });
                    }}
                    className="btn-secondary text-xs"
                  >
                    <Folder size={14} />
                  </button>
                </div>
              </div>
            </div>

            {/* Daily Folder Option */}
            <div className="flex items-center justify-between p-3 bg-surface-raised rounded-control border border-border">
              <div className="flex items-center gap-2">
                <FolderTree size={16} className={editingFolder.autoDailyOutputFolder ? 'text-primary' : 'text-text-muted'} />
                <div>
                  <span className="text-xs font-semibold text-text-main">Tự tạo thư mục theo ngày (DAY_MONTH)</span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={editingFolder.autoDailyOutputFolder}
                onChange={(e) => updateEditingFolder({ autoDailyOutputFolder: e.target.checked })}
                className="w-4 h-4 accent-primary cursor-pointer"
              />
            </div>

            {/* Source Status Marking Option */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-surface-raised rounded-control border border-border">
              <label className="flex items-center justify-between text-xs text-text-secondary font-medium cursor-pointer">
                <span>Đánh dấu file nguồn (_PROCESSING, _DONE, _ERROR)</span>
                <input
                  type="checkbox"
                  checked={editingFolder.renameSourceFiles ?? true}
                  onChange={(e) => updateEditingFolder({ renameSourceFiles: e.target.checked })}
                  className="w-4 h-4 accent-primary cursor-pointer"
                />
              </label>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-text-muted font-medium">Định dạng file lỗi</label>
                <select
                  value={editingFolder.errorNamingMode ?? 'SIMPLE'}
                  onChange={(e) => updateEditingFolder({ errorNamingMode: e.target.value as ErrorNamingMode })}
                  className="glass-input text-xs"
                >
                  <option value="SIMPLE">Đơn giản (_ERROR)</option>
                  <option value="ADVANCED">Chi tiết theo loại (_ERROR_FFMPEG...)</option>
                </select>
              </div>
            </div>

            {/* Repeat & Fade Settings */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border-t border-border pt-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-text-secondary font-medium">Số lần lặp</label>
                <input
                  type="number"
                  min="1"
                  disabled={editingFolder.durationLimitEnabled}
                  value={editingFolder.repeatCount}
                  onChange={(e) => updateEditingFolder({ repeatCount: parseInt(e.target.value) || 1 })}
                  className={`glass-input text-xs font-mono ${editingFolder.durationLimitEnabled ? 'opacity-50 pointer-events-none' : ''}`}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-text-secondary font-medium">Tăng âm lượng đầu video (Giây)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editingFolder.audioFadeInEnabled}
                    onChange={(e) => updateEditingFolder({ audioFadeInEnabled: e.target.checked })}
                    className="accent-primary"
                  />
                  <input
                    type="number"
                    step="0.5"
                    disabled={!editingFolder.audioFadeInEnabled}
                    value={editingFolder.audioFadeInDurationSeconds}
                    onChange={(e) => updateEditingFolder({ audioFadeInDurationSeconds: parseFloat(e.target.value) || 5.0 })}
                    className="glass-input text-xs font-mono flex-1 disabled:opacity-40"
                  />
                </div>
              </div>
            </div>

            {/* Duration Limit Control */}
            <div className="border-t border-border pt-3">
              <DurationLimitControl
                durationLimitEnabled={editingFolder.durationLimitEnabled}
                onDurationLimitEnabledChange={(val) => updateEditingFolder({ durationLimitEnabled: val })}
                durationLimitSeconds={editingFolder.durationLimitSeconds ?? 10800}
                onDurationLimitSecondsChange={(val) => updateEditingFolder({ durationLimitSeconds: val })}
                durationLimitInput={editDurationLimitInput}
                onDurationLimitInputChange={setEditDurationLimitInput}
                durationMode={editingFolder.durationMode ?? 'EXACT'}
                onDurationModeChange={(mode) => updateEditingFolder({ durationMode: mode })}
                maxOvershootSeconds={editingFolder.maxOvershootSeconds ?? null}
                onMaxOvershootSecondsChange={(sec) => updateEditingFolder({ maxOvershootSeconds: sec })}
              />
            </div>

            {/* Hardware & Stability Controls */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 border-t border-border pt-3">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-text-muted font-medium">Chế độ GPU</label>
                <select
                  value={editingFolder.gpuMode ?? 'AUTO'}
                  onChange={(e) => updateEditingFolder({ gpuMode: e.target.value as GpuMode })}
                  className="glass-input text-xs"
                >
                  <option value="AUTO">Tự động (AUTO)</option>
                  <option value="NVIDIA">NVIDIA NVENC</option>
                  <option value="CPU">Chỉ dùng CPU</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-text-muted font-medium">Codec mặc định</label>
                <select
                  value={editingFolder.encoder ?? 'libx264'}
                  onChange={(e) => updateEditingFolder({ encoder: e.target.value as EncoderType })}
                  className="glass-input text-xs"
                >
                  <option value="libx264">x264 (CPU)</option>
                  <option value="h264_nvenc">h264_nvenc (NVIDIA)</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-text-muted font-medium">Thời gian chờ tệp ổn định (ms)</label>
                <input
                  type="number"
                  step="500"
                  min="1000"
                  value={editingFolder.stabilityThresholdMs ?? 3000}
                  onChange={(e) => updateEditingFolder({ stabilityThresholdMs: parseInt(e.target.value) || 3000 })}
                  className="glass-input text-xs font-mono"
                />
              </div>
            </div>

            {/* Save & Cancel Actions */}
            <div className="flex justify-end gap-2 border-t border-border pt-4 mt-2">
              <button
                type="button"
                onClick={() => setEditingFolder(null)}
                className="btn-secondary text-xs px-4"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={isSaving || (editingFolder.durationLimitEnabled && (parseTimeToSeconds(editDurationLimitInput) ?? 0) <= 0)}
                className="btn-primary text-xs px-5 justify-center"
              >
                Lưu thay đổi
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

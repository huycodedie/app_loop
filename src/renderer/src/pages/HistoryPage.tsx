import React, { useState, useEffect } from 'react';
import { Download, Trash2, Search, History, FolderOpen } from 'lucide-react';
import { HistoryRecord } from '@shared/types';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';
import { formatTime, formatBytes } from '../utils/formatters';

export const HistoryPage: React.FC = () => {
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const loadHistory = async () => {
    const data = await window.api.getHistory();
    setHistory(data);
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const handleDelete = async (id: string) => {
    await window.api.deleteHistory(id);
    loadHistory();
  };

  const handleExport = async (format: 'csv' | 'json') => {
    await window.api.exportHistory(format);
  };

  const filteredHistory = history.filter((h) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      h.inputFile.toLowerCase().includes(term) ||
      h.outputFile.toLowerCase().includes(term) ||
      (h.originalFilename && h.originalFilename.toLowerCase().includes(term)) ||
      (h.currentFilename && h.currentFilename.toLowerCase().includes(term));

    let matchesStatus = true;
    if (statusFilter === 'COMPLETED') matchesStatus = h.status === 'COMPLETED';
    else if (statusFilter === 'FAILED') matchesStatus = h.status === 'FAILED';
    else if (statusFilter === 'DONE_SOURCE') matchesStatus = h.inputFile.includes('_DONE');
    else if (statusFilter === 'ERROR_SOURCE') matchesStatus = h.inputFile.includes('_ERROR');
    else if (statusFilter === 'PROCESSING_SOURCE') matchesStatus = h.inputFile.includes('_PROCESSING');

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="flex flex-col gap-6 max-w-[1440px] mx-auto w-full">
      {/* Page Header & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-text-main">Lịch sử xử lý</h2>
          <p className="text-xs text-text-secondary mt-1">
            Nhật ký tìm kiếm danh sách toàn bộ các video đã hoàn thành hoặc thất bại.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => handleExport('csv')} className="btn-secondary text-xs">
            <Download size={14} /> Xuất CSV
          </button>
          <button onClick={() => handleExport('json')} className="btn-secondary text-xs">
            <Download size={14} /> Xuất JSON
          </button>
        </div>
      </div>

      {/* Filters Toolbar & History Table */}
      <div className="surface-card p-5 flex flex-col gap-4">
        {/* Filters Bar */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search size={16} className="absolute left-3 top-2.5 text-text-muted" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm kiếm theo tên tệp hoặc đường dẫn..."
              className="glass-input pl-9 text-xs w-full"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <label className="text-xs text-text-muted font-medium shrink-0">Trạng thái:</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="glass-input text-xs w-full sm:w-48"
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="COMPLETED">Hoàn thành</option>
              <option value="FAILED">Thất bại</option>
              <option value="DONE_SOURCE">Nguồn _DONE</option>
              <option value="ERROR_SOURCE">Nguồn _ERROR</option>
              <option value="PROCESSING_SOURCE">Nguồn _PROCESSING</option>
            </select>
          </div>
        </div>

        {/* History Table */}
        {filteredHistory.length === 0 ? (
          <EmptyState
            icon={<History size={36} />}
            title="Không tìm thấy lịch sử xử lý"
            description="Chưa có nhật ký video nào khớp với từ khóa hoặc bộ lọc tìm kiếm của bạn."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border text-text-muted font-mono text-[11px] uppercase">
                  <th className="pb-3 pr-4 font-medium">VIDEO NGUỒN / XUẤT</th>
                  <th className="pb-3 pr-4 font-medium">FADE IN</th>
                  <th className="pb-3 pr-4 font-medium">GIỚI HẠN</th>
                  <th className="pb-3 pr-4 font-medium">LẶP</th>
                  <th className="pb-3 pr-4 font-medium">THỚI LƯỢNG XUẤT</th>
                  <th className="pb-3 pr-4 font-medium">DUNG LƯỢNG</th>
                  <th className="pb-3 pr-4 font-medium">THỚI GIAN</th>
                  <th className="pb-3 pr-4 font-medium">TRẠNG THÁI</th>
                  <th className="pb-3 font-medium text-right">THAO TÁC</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-border/50 hover:bg-surface-raised/50 transition-colors"
                  >
                    <td className="py-3.5 pr-4 max-w-xs truncate">
                      <span className="font-semibold text-text-main block truncate">{item.inputFile}</span>
                      <span className="text-[10px] text-text-muted font-mono truncate block" title={item.outputFile}>
                        {item.outputFile}
                      </span>
                    </td>
                    <td className="py-3.5 pr-4 font-mono text-text-main">
                      {item.audioFadeInEnabled && item.audioFadeInDurationSeconds > 0
                        ? formatTime(item.audioFadeInDurationSeconds)
                        : <span className="text-text-muted">Tắt</span>}
                    </td>
                    <td className="py-3.5 pr-4 font-mono">
                      {item.durationLimitEnabled && item.requestedDurationLimit ? (
                        <div>
                          <span className="text-warning font-semibold block">{formatTime(item.requestedDurationLimit)}</span>
                          <span className="text-[10px] text-primary font-normal block font-sans">
                            {item.durationMode === 'MINIMUM' ? 'Đủ thời lượng' : 'Chính xác'}
                          </span>
                        </div>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="py-3.5 pr-4 font-mono text-warning font-semibold">{item.repeatCount}x</td>
                    <td className="py-3.5 pr-4 font-mono">
                      <span className="text-success font-semibold block">{formatTime(item.actualOutputDuration || item.finalDuration)}</span>
                      {item.overshootSeconds && item.overshootSeconds > 0 ? (
                        <span className="text-[10px] text-warning block">Dư +{formatTime(item.overshootSeconds)}</span>
                      ) : item.partialFinalCopy ? (
                        <span className="text-[10px] text-text-muted block">Cắt vòng cuối</span>
                      ) : null}
                    </td>
                    <td className="py-3.5 pr-4 font-mono text-text-muted">{formatBytes(item.outputSizeBytes)}</td>
                    <td className="py-3.5 pr-4 font-mono text-text-muted text-[11px]">
                      {Math.round(item.processingTimeMs / 1000)}s
                    </td>
                    <td className="py-3.5 pr-4">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="p-1.5 text-text-muted hover:text-danger hover:bg-surface rounded-control transition-colors"
                          title="Xóa mục lịch sử"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
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

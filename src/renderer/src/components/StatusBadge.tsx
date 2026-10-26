import React from 'react';
import { JobStatus } from '@shared/types';

interface StatusBadgeProps {
  status: JobStatus;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const badgeMap: Record<JobStatus, { label: string; className: string }> = {
    WAITING: {
      label: 'Đang chờ',
      className: 'bg-surface-raised text-text-secondary border-border',
    },
    READY: {
      label: 'Sẵn sàng',
      className: 'bg-primary/15 text-primary border-primary/30',
    },
    PROCESSING: {
      label: 'Đang xử lý',
      className: 'bg-primary/20 text-primary border-primary/40 animate-pulse',
    },
    PAUSED: {
      label: 'Tạm dừng',
      className: 'bg-warning/15 text-warning border-warning/30',
    },
    COMPLETED: {
      label: 'Hoàn thành',
      className: 'bg-success/15 text-success border-success/30',
    },
    FAILED: {
      label: 'Thất bại',
      className: 'bg-danger/15 text-danger border-danger/30',
    },
    CANCELLED: {
      label: 'Đã hủy',
      className: 'bg-surface-raised text-text-muted border-border',
    },
    INTERRUPTED: {
      label: 'Bị ngắt câu',
      className: 'bg-warning/20 text-warning border-warning/40',
    },
  };

  const conf = badgeMap[status] || {
    label: status,
    className: 'bg-surface-raised text-text-secondary border-border',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${conf.className}`}>
      {conf.label}
    </span>
  );
};

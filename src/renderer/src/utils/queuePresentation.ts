import { JobRecord } from '@shared/types';

/** Presentation order only; keep the worker's queue and priority order intact. */
export function newestJobsFirst(queue: JobRecord[]): JobRecord[] {
  const timestamp = (value: string) => {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : -Infinity;
  };
  return [...queue].sort((a, b) => {
    const aTime = timestamp(a.createdAt);
    const bTime = timestamp(b.createdAt);
    return aTime === bTime ? 0 : aTime > bTime ? -1 : 1;
  });
}

export function watchRuleLabel(job: JobRecord): string {
  if (job.watchFolderName?.trim()) return job.watchFolderName;
  if (job.watchFolderId) {
    const parts = job.inputPath.split(/[/\\]/).filter(Boolean);
    return parts.length > 1 ? parts[parts.length - 2] : 'Watch Folder';
  }
  return 'Thủ công';
}

export function formatJobDateTime(timestamp?: string): string {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(date);
}

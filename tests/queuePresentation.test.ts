import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { JobRecord } from '../src/shared/types';
import { QueuePage } from '../src/renderer/src/pages/QueuePage';
import { newestJobsFirst, watchRuleLabel, formatJobDateTime } from '../src/renderer/src/utils/queuePresentation';

function job(id: string, createdAt: string, fields: Partial<JobRecord> = {}): JobRecord {
  return {
    id, createdAt, inputPath: `C:\\Incoming\\${id}.mp4`, outputPath: '',
    repeatCount: 3, audioFadeInEnabled: false, audioFadeInDurationSeconds: 5,
    durationLimitEnabled: false, durationLimitSeconds: null,
    status: 'WAITING', stage: 'IDLE', progress: 0, priority: 0,
    ...fields,
  };
}

function renderQueue(queue: JobRecord[]): string {
  const noop = () => {};
  return renderToStaticMarkup(React.createElement(QueuePage, {
    queue, progressByJobId: {}, onPause: noop, onResume: noop, onRemove: noop,
    onRetry: noop, onClearCompleted: noop, onNavigateToProcessing: noop,
  }));
}

describe('queue presentation', () => {
  it('shows newest videos first without changing the worker queue or prioritizing status', () => {
    const queue = [
      job('old-active', '2026-10-09T09:00:00Z', { status: 'PROCESSING', priority: 10 }),
      job('new', '2026-10-10T10:00:00Z'),
      job('middle', '2026-10-10T09:00:00Z', { status: 'COMPLETED' }),
    ];
    const html = renderQueue(queue);
    const table = html.slice(html.indexOf('<tbody>'));
    expect(table.indexOf('new.mp4')).toBeLessThan(table.indexOf('middle.mp4'));
    expect(table.indexOf('middle.mp4')).toBeLessThan(table.indexOf('old-active.mp4'));
    expect(queue.map(item => item.id)).toEqual(['old-active', 'new', 'middle']);
  });

  it('keeps equal timestamps stable and places missing legacy dates last', () => {
    const queue = [job('unknown', ''), job('first', '2026-10-10T09:00:00Z'), job('second', '2026-10-10T09:00:00Z')];
    expect(newestJobsFirst(queue).map(item => item.id)).toEqual(['first', 'second', 'unknown']);
  });

  it('renders the exact associated rule name and labels unassociated videos Thủ công', () => {
    const watched = job('watched', '2026-10-10T09:00:00Z', {
      sourceType: 'WATCH_FOLDER', watchFolderId: 'rule-1', watchFolderName: 'Kênh Mưa Đêm',
    });
    const manual = job('manual', '2026-10-10T09:00:00Z', { sourceType: 'MANUAL' });
    expect(watchRuleLabel(watched)).toBe('Kênh Mưa Đêm');
    expect(watchRuleLabel(manual)).toBe('Thủ công');
    expect(watchRuleLabel({ ...watched, watchFolderId: undefined, watchFolderName: undefined })).toBe('Thủ công');
    expect(watchRuleLabel({ ...watched, watchFolderName: undefined })).toBe('Incoming');
    const html = renderQueue([watched, manual]);
    expect(html).toContain('QUY TẮC');
    expect(html).toContain('Kênh Mưa Đêm');
    expect(html).toContain('Thủ công');
  });

  it('shows local date and time for enqueue, start, and completion', () => {
    const item = job('done', '2026-10-10T09:10:11Z', {
      startedAt: '2026-10-10T09:11:12Z', completedAt: '2026-10-10T09:12:13Z', status: 'COMPLETED',
    });
    const html = renderQueue([item]);
    for (const timestamp of [item.createdAt, item.startedAt, item.completedAt]) {
      expect(html).toContain(formatJobDateTime(timestamp));
    }
    expect(html).toContain('NGÀY GIỜ');
    expect(html).toContain('Thêm:');
    expect(html).toContain('Bắt đầu:');
    expect(html).toContain('Hoàn tất:');
    expect(formatJobDateTime(item.createdAt)).toMatch(/10\/10\/2026/);
    expect(formatJobDateTime(item.createdAt)).toMatch(/\d{2}:10:11/);
    expect(formatJobDateTime('invalid')).toBe('—');
  });
});

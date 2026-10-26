import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { WatchFolderConfig } from '../src/shared/types';
import { serializeWatchFolderForm } from '../src/renderer/src/utils/watchFolderForm';
import { DurationLimitControl } from '../src/renderer/src/components/DurationLimitControl';

function rule(fields: Partial<WatchFolderConfig> = {}): WatchFolderConfig {
  return {
    id: 'rule-1', name: 'Kênh Mưa', folderPath: 'C:\\Incoming', outputFolder: 'D:\\Old',
    repeatCount: 3, audioFadeInEnabled: false, audioFadeInDurationSeconds: 5,
    durationLimitEnabled: true, durationLimitSeconds: 10800, durationMode: 'MINIMUM',
    maxOvershootSeconds: null, autoDailyOutputFolder: true, enabled: true,
    createdAt: '2026-10-10T09:00:00Z', ...fields,
  };
}

describe('watch folder form save', () => {
  it('saves MINIMUM, the newly edited output path, and the visible duration together', () => {
    const original = rule();
    const payload = serializeWatchFolderForm({ ...original, outputFolder: ' E:\\New Output ' }, '01:30:00.000');
    expect(payload).toMatchObject({
      outputFolder: 'E:\\New Output', durationMode: 'MINIMUM', durationLimitSeconds: 5400,
      maxOvershootSeconds: null, name: 'Kênh Mưa', autoDailyOutputFolder: true,
    });
    expect(original.outputFolder).toBe('D:\\Old');
  });

  it('keeps an explicit overshoot safeguard for MINIMUM and clears it for EXACT', () => {
    const minimum = serializeWatchFolderForm(rule({ maxOvershootSeconds: 600 }), '10800');
    expect(minimum.maxOvershootSeconds).toBe(600);
    const exact = serializeWatchFolderForm({ ...minimum, durationMode: 'EXACT' }, '10800');
    expect(exact.maxOvershootSeconds).toBeNull();
  });

  it('clears disabled duration and falls back to source when output is blank', () => {
    const payload = serializeWatchFolderForm(rule({ durationLimitEnabled: false, outputFolder: ' ' }), 'invalid');
    expect(payload.durationLimitSeconds).toBeNull();
    expect(payload.outputFolder).toBe('C:\\Incoming');
    expect(() => serializeWatchFolderForm(rule(), 'invalid')).toThrow('thời lượng');
  });
});

describe('watch duration controls', () => {
  const noop = () => {};
  const props = {
    durationLimitEnabled: true, onDurationLimitEnabledChange: noop,
    durationLimitSeconds: 10800, onDurationLimitSecondsChange: noop,
    durationLimitInput: '03:00:00.000', onDurationLimitInputChange: noop,
    onDurationModeChange: noop, onMaxOvershootSecondsChange: noop,
  };

  it('gives add and edit forms independent radio groups and input IDs', () => {
    const html = renderToStaticMarkup(React.createElement(React.Fragment, null,
      React.createElement(DurationLimitControl, { ...props, durationMode: 'EXACT' }),
      React.createElement(DurationLimitControl, { ...props, durationMode: 'MINIMUM' }),
    ));
    const groupNames = [...html.matchAll(/name="([^"]+-duration-mode)"/g)].map(match => match[1]);
    expect(groupNames).toHaveLength(4);
    expect(groupNames[0]).toBe(groupNames[1]);
    expect(groupNames[2]).toBe(groupNames[3]);
    expect(groupNames[0]).not.toBe(groupNames[2]);
    const inputIds = [...html.matchAll(/id="([^"]+-input)"/g)].map(match => match[1]);
    expect(inputIds).toHaveLength(2);
    expect(inputIds[0]).not.toBe(inputIds[1]);
  });

  it('warns about an enabled exact fallback even before the watch video is probed', () => {
    const html = renderToStaticMarkup(React.createElement(DurationLimitControl, {
      ...props, durationMode: 'MINIMUM', maxOvershootSeconds: 600,
    }));
    expect(html).toContain('Nếu phần dư vượt 10 phút');
    expect(html).toContain('Tắt Giới hạn dư để luôn giữ trọn vòng lặp');
  });
});

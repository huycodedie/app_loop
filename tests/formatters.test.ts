import { describe, it, expect } from 'vitest';
import { formatTime, parseTimeToSeconds, formatBytes } from '../src/renderer/src/utils/formatters';

describe('Formatters Unit Tests', () => {
  it('should format seconds into HH:MM:SS.mmm accurately', () => {
    expect(formatTime(0)).toBe('00:00:00.000');
    expect(formatTime(10.5)).toBe('00:00:10.500');
    expect(formatTime(3661.123)).toBe('01:01:01.123');
  });

  it('should parse HH:MM:SS format into total seconds', () => {
    expect(parseTimeToSeconds('00:00:10.500')).toBeCloseTo(10.5, 3);
    expect(parseTimeToSeconds('01:01:01')).toBe(3661);
    expect(parseTimeToSeconds('invalid')).toBeNull();
  });

  it('rejects incomplete, non-finite, and out-of-range duration input', () => {
    for (const input of ['10abc', '00:00:10oops', '01:02', '00:60:00', '00:00:60', '-1', 'Infinity', '1e309', '  ']) {
      expect(parseTimeToSeconds(input)).toBeNull();
    }
    expect(parseTimeToSeconds(' 10.125 ')).toBe(10.125);
    expect(parseTimeToSeconds('100:00:00')).toBe(360000);
  });

  it('preserves millisecond precision and carries rounded values into the next second', () => {
    expect(formatTime(1.001)).toBe('00:00:01.001');
    expect(formatTime(59.9999)).toBe('00:01:00.000');
    expect(formatTime(Infinity)).toBe('00:00:00.000');
  });

  it('should format byte sizes nicely', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1048576)).toBe('1 MB');
    expect(formatBytes(1073741824)).toBe('1 GB');
  });
});

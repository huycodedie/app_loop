import { AppError } from '../errors';

interface CronField { values: Set<number>; wildcard: boolean }

function parseField(text: string, min: number, max: number, sunday = false): CronField {
  const values = new Set<number>();
  for (const part of text.split(',')) {
    const match = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part);
    if (!match) throw new AppError('INVALID_INPUT', `Biểu thức Cron không hợp lệ: ${text}`);
    const step = Number(match[2] ?? 1);
    if (!Number.isInteger(step) || step < 1) throw new AppError('INVALID_INPUT', 'Bước Cron phải lớn hơn 0.');
    const range = match[1] === '*' ? [min, max] : match[1].split('-').map(Number);
    const start = range[0];
    const end = range[1] ?? (match[2] ? max : start);
    if (start < min || end > max || start > end) throw new AppError('INVALID_INPUT', `Giá trị Cron ngoài phạm vi: ${text}`);
    for (let value = start; value <= end; value += step) values.add(sunday && value === 7 ? 0 : value);
  }
  return { values, wildcard: text.startsWith('*') };
}

/** Standard five-field numeric cron, interpreted in the computer's local time. */
export function getNextScheduledRun(expression: string, after: Date = new Date()): Date {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5 || !Number.isFinite(after.getTime())) {
    throw new AppError('INVALID_INPUT', 'Cron cần 5 trường: phút giờ ngày tháng thứ.');
  }
  const [minute, hour, day, month, weekday] = [
    parseField(fields[0], 0, 59), parseField(fields[1], 0, 23), parseField(fields[2], 1, 31),
    parseField(fields[3], 1, 12), parseField(fields[4], 0, 7, true),
  ];
  const next = new Date(after);
  next.setSeconds(0, 0);
  next.setTime(next.getTime() + 60_000);
  // Five years covers the longest valid gap, including leap-day schedules.
  const end = new Date(after);
  end.setFullYear(end.getFullYear() + 5);
  while (next <= end) {
    const dayMatches = day.values.has(next.getDate());
    const weekdayMatches = weekday.values.has(next.getDay());
    const calendarMatches = day.wildcard || weekday.wildcard ? dayMatches && weekdayMatches : dayMatches || weekdayMatches;
    if (month.values.has(next.getMonth() + 1) && calendarMatches && hour.values.has(next.getHours()) && minute.values.has(next.getMinutes())) return next;
    next.setTime(next.getTime() + 60_000);
  }
  throw new AppError('INVALID_INPUT', 'Biểu thức Cron không có thời điểm chạy hợp lệ trong 5 năm tới.');
}

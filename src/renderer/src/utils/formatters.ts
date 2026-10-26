export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00:00.000';
  const totalMs = Math.round(seconds * 1000);
  const hrs = Math.floor(totalMs / 3600000);
  const mins = Math.floor((totalMs % 3600000) / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;

  const pad = (n: number, z = 2) => String(n).padStart(z, '0');
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}.${pad(ms, 3)}`;
}

export function parseTimeToSeconds(timeStr: string): number | null {
  const input = timeStr.trim();
  if (!input) return null;
  const clockMatch = /^(\d+):([0-5]?\d):([0-5]?\d(?:\.\d+)?)$/.exec(input);
  if (clockMatch) {
    const seconds = Number(clockMatch[1]) * 3600 + Number(clockMatch[2]) * 60 + Number(clockMatch[3]);
    return Number.isFinite(seconds) ? seconds : null;
  }
  if (!/^\d+(?:\.\d+)?$/.test(input)) return null;
  const seconds = Number(input);
  return Number.isFinite(seconds) ? seconds : null;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

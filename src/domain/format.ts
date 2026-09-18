import { format } from 'date-fns';

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0:00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatClock(instant: number): string {
  return format(instant, 'HH:mm');
}

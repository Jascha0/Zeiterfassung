import { format } from 'date-fns';
import { de } from 'date-fns/locale';

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

export function formatHoursMinutes(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0:00';
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}`;
}

export function formatMonthYear(instant: number): string {
  return format(instant, 'LLLL yyyy', { locale: de });
}

export function formatLongDate(instant: number): string {
  return format(instant, 'EEEE, d. MMMM yyyy', { locale: de });
}

export function formatShortDate(instant: number): string {
  return format(instant, 'dd.MM.yyyy');
}

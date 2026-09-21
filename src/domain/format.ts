import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import type { Entry, EntryType } from './types';

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

export function formatLongDate(instant: number): string {
  return format(instant, 'd. MMMM yyyy', { locale: de });
}

export function formatShortDate(instant: number): string {
  return format(instant, 'dd.MM.yyyy');
}

export function formatMonthTitle(monthStart: number): string {
  return format(monthStart, 'LLLL yyyy', { locale: de });
}

export function formatHoursMinutes(ms: number): string {
  const safe = Number.isFinite(ms) && ms > 0 ? ms : 0;
  const totalMinutes = Math.floor(safe / 60000);
  return `${Math.floor(totalMinutes / 60)} Std. ${totalMinutes % 60} Min.`;
}

export function entryTypeLabel(type: EntryType): string {
  return type === 'work' ? 'Arbeit' : 'Pause';
}

export function formatEntryLabel(entry: Pick<Entry, 'type' | 'start' | 'end'>): string {
  const end = entry.end === null ? 'läuft' : formatClock(entry.end);
  return `${entryTypeLabel(entry.type)} ${formatClock(entry.start)}–${end}`;
}

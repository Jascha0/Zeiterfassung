import { format, startOfDay } from 'date-fns';
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

/** Hundredths of an hour, half-up: Math.round(ms / 36_000); formatted 'H,MM' with decimal comma.
 *  26_999_000 → '7,50'; 450_000 → '0,13'; 27_000_000 → '7,50'; 0 → '0,00'. Non-finite or negative → '0,00'. */
export function formatDecimalHours(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0,00';
  const h = Math.round(ms / 36_000);
  return `${Math.floor(h / 100)},${String(h % 100).padStart(2, '0')}`;
}

/** 'HH:mm' of end; 'dd.MM.yyyy HH:mm' if end's local day is after start's local day (startOfDay comparison). */
export function formatEndTime(start: number, end: number): string {
  return startOfDay(end).getTime() > startOfDay(start).getTime() ? formatShortDateTime(end) : formatClock(end);
}

/** format(instant, 'EEEEEE dd.MM.yyyy', { locale: de }) → 'Di 06.10.2026'. */
export function formatWeekdayDate(instant: number): string {
  return format(instant, 'EEEEEE dd.MM.yyyy', { locale: de });
}

/** format(instant, 'dd.MM.yyyy HH:mm') → '17.10.2026 14:05'. */
export function formatShortDateTime(instant: number): string {
  return format(instant, 'dd.MM.yyyy HH:mm');
}

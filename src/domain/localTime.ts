import { format } from 'date-fns';

export type LocalTimeError = 'invalidFormat' | 'nonexistentTime';
export type LocalTimeResult = { ok: true; instant: number } | { ok: false; error: LocalTimeError };

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_VALUE = /^(\d{2}):(\d{2})$/;

/**
 * dateKey 'YYYY-MM-DD' + time 'HH:MM' (24 h) in device-local time → epoch ms.
 * - dateKey not matching /^(\d{4})-(\d{2})-(\d{2})$/ or not a real calendar date
 *   (checked via new Date(y, m - 1, d, 12) and comparing year/month/date) → invalidFormat.
 * - time not matching /^(\d{2}):(\d{2})$/ or hours > 23 or minutes > 59 → invalidFormat.
 * - instant = new Date(y, m - 1, d, hh, mm, 0, 0); if its local year/month/date/hours/minutes
 *   differ from the typed ones → nonexistentTime (spring-forward gap, 0025).
 * - Ambiguous fall-back times resolve to the first occurrence (JS Date default, 0025).
 */
export function localDateTimeToInstant(dateKey: string, time: string): LocalTimeResult {
  const dateMatch = DATE_KEY.exec(dateKey);
  const timeMatch = TIME_VALUE.exec(time);
  if (dateMatch === null || timeMatch === null) return { ok: false, error: 'invalidFormat' };
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);
  if (hours > 23 || minutes > 59) return { ok: false, error: 'invalidFormat' };
  const noon = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (noon.getFullYear() !== year || noon.getMonth() !== month - 1 || noon.getDate() !== day) {
    return { ok: false, error: 'invalidFormat' };
  }
  const result = new Date(year, month - 1, day, hours, minutes, 0, 0);
  if (
    result.getFullYear() !== year ||
    result.getMonth() !== month - 1 ||
    result.getDate() !== day ||
    result.getHours() !== hours ||
    result.getMinutes() !== minutes
  ) {
    return { ok: false, error: 'nonexistentTime' };
  }
  return { ok: true, instant: result.getTime() };
}

/** 'yyyy-MM-dd' of the instant in local time. */
export function toDateKey(instant: number): string {
  return format(instant, 'yyyy-MM-dd');
}

/** 'HH:mm' of the instant in local time (seconds dropped). */
export function toTimeValue(instant: number): string {
  return format(instant, 'HH:mm');
}

/** 'YYYY-MM-DD' → 'DD.MM.YYYY' by string slicing (no Date involved). Returns the input unchanged if it does not match the pattern. */
export function formatDateKey(dateKey: string): string {
  const match = DATE_KEY.exec(dateKey);
  if (match === null) return dateKey;
  return `${match[3]}.${match[2]}.${match[1]}`;
}

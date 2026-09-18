import { addDays, startOfDay } from 'date-fns';
import type { Entry, TimeRange } from './types';
import type { TimerStatus } from './timer';

export function dayRange(instant: number): TimeRange {
  const start = startOfDay(instant);
  return { start: start.getTime(), end: addDays(start, 1).getTime() };
}

export function entryDurationMs(entry: Entry, now: number): number {
  return Math.max(0, (entry.end ?? now) - entry.start);
}

export interface DailyTotals {
  workMs: number;
  breakMs: number;
}

export function dailyTotals(entries: readonly Entry[], day: number, now: number): DailyTotals {
  const range = dayRange(day);
  const totals: DailyTotals = { workMs: 0, breakMs: 0 };
  for (const entry of entries) {
    if (entry.start < range.start || entry.start >= range.end) continue;
    const duration = entryDurationMs(entry, now);
    if (entry.type === 'work') totals.workMs += duration;
    else totals.breakMs += duration;
  }
  return totals;
}

export function currentBreakMs(status: TimerStatus, now: number): number {
  if (status.state !== 'onBreak' || status.activeEntry === null) return 0;
  return entryDurationMs(status.activeEntry, now);
}

import { addDays, addMonths, endOfMonth, endOfWeek, startOfDay, startOfMonth, startOfWeek } from 'date-fns';
import { dailyTotals } from './totals';
import type { Entry, TimeRange } from './types';

export interface CalendarDay {
  dayStart: number;
  inMonth: boolean;
}

export interface MonthTotals {
  byDay: Map<number, number>;
  totalMs: number;
}

function byStartThenId(a: Entry, b: Entry): number {
  if (a.start !== b.start) return a.start - b.start;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

export function monthStartOf(instant: number): number {
  return startOfMonth(instant).getTime();
}

export function shiftMonth(monthStart: number, delta: number): number {
  return startOfMonth(addMonths(monthStart, delta)).getTime();
}

export function shiftDay(dayStart: number, delta: number): number {
  return startOfDay(addDays(dayStart, delta)).getTime();
}

export function monthRange(monthStart: number): TimeRange {
  const start = startOfMonth(monthStart);
  return { start: start.getTime(), end: startOfMonth(addMonths(start, 1)).getTime() };
}

export function monthGrid(monthStart: number): CalendarDay[][] {
  const range = monthRange(monthStart);
  const first = startOfWeek(range.start, { weekStartsOn: 1 }).getTime();
  const last = startOfDay(endOfWeek(endOfMonth(range.start), { weekStartsOn: 1 })).getTime();
  const weeks: CalendarDay[][] = [];
  let week: CalendarDay[] = [];
  for (let day = first; day <= last; day = shiftDay(day, 1)) {
    week.push({ dayStart: day, inMonth: day >= range.start && day < range.end });
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  return weeks;
}

export function monthWorkTotals(entries: readonly Entry[], monthStart: number, now: number): MonthTotals {
  const range = monthRange(monthStart);
  const byDay = new Map<number, number>();
  let totalMs = 0;
  for (let day = range.start; day < range.end; day = shiftDay(day, 1)) {
    const workMs = dailyTotals(entries, day, now).workMs;
    byDay.set(day, workMs);
    totalMs += workMs;
  }
  return { byDay, totalMs };
}

export function mergeEntries(base: readonly Entry[], overrides: readonly Entry[]): Entry[] {
  const byId = new Map<string, Entry>();
  for (const entry of base) byId.set(entry.id, entry);
  for (const entry of overrides) byId.set(entry.id, entry);
  return [...byId.values()].sort(byStartThenId);
}

export function entriesStartingIn(entries: readonly Entry[], range: TimeRange): Entry[] {
  return entries.filter((entry) => entry.start >= range.start && entry.start < range.end).sort(byStartThenId);
}

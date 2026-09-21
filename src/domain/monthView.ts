import { addDays, eachDayOfInterval, endOfMonth, startOfDay, startOfMonth } from 'date-fns';
import type { Entry, TimeRange } from './types';
import { dailyTotals, dayRange } from './totals';
import { entriesOverlap, isLongEntry } from './entryEditing';
import { formatHoursMinutes, formatLongDate } from './format';
import { toDateKey } from './routing';

export interface DayMarkers {
  open: boolean;
  longRunning: boolean;
  overlap: boolean;
}

export interface MonthDay {
  dayStart: number;
  dateKey: string;
  workMs: number;
  hasEntries: boolean;
  markers: DayMarkers;
}

export interface MonthSummary {
  monthStart: number;
  days: MonthDay[];
  totalWorkMs: number;
}

export function monthRange(monthStart: number): TimeRange {
  const first = startOfMonth(monthStart);
  const last = endOfMonth(monthStart);
  return {
    start: startOfDay(addDays(first, -1)).getTime(),
    end: startOfDay(addDays(last, 2)).getTime(),
  };
}

export function entriesOfDay(entries: readonly Entry[], dayStart: number): Entry[] {
  const range = dayRange(dayStart);
  return entries
    .filter((entry) => entry.start >= range.start && entry.start < range.end)
    .sort((a, b) => a.start - b.start);
}

export function comparisonEntriesForDay(entries: readonly Entry[], dayStart: number): Entry[] {
  const start = startOfDay(addDays(dayStart, -1)).getTime();
  const end = startOfDay(addDays(dayStart, 2)).getTime();
  return entries
    .filter((entry) => entry.start >= start && entry.start < end)
    .sort((a, b) => a.start - b.start);
}

export function dayMarkers(
  loadedEntries: readonly Entry[],
  dayStart: number,
  now: number,
): DayMarkers {
  const ofDay = entriesOfDay(loadedEntries, dayStart);
  const comparison = comparisonEntriesForDay(loadedEntries, dayStart);
  return {
    open: ofDay.some((entry) => entry.end === null),
    longRunning: ofDay.some((entry) => isLongEntry(entry, now)),
    overlap: ofDay.some((entry) =>
      comparison.some((other) => other.id !== entry.id && entriesOverlap(entry, other, now)),
    ),
  };
}

export function buildMonthSummary(
  monthStart: number,
  loadedEntries: readonly Entry[],
  now: number,
): MonthSummary {
  const days: MonthDay[] = eachDayOfInterval({
    start: startOfMonth(monthStart),
    end: endOfMonth(monthStart),
  }).map((day) => {
    const dayStart = startOfDay(day).getTime();
    return {
      dayStart,
      dateKey: toDateKey(dayStart),
      workMs: dailyTotals(loadedEntries, dayStart, now).workMs,
      hasEntries: entriesOfDay(loadedEntries, dayStart).length > 0,
      markers: dayMarkers(loadedEntries, dayStart, now),
    };
  });
  return {
    monthStart: startOfMonth(monthStart).getTime(),
    days,
    totalWorkMs: days.reduce((sum, day) => sum + day.workMs, 0),
  };
}

export function formatDayCellLabel(day: MonthDay): string {
  const amount = day.hasEntries ? formatHoursMinutes(day.workMs) : 'keine Einträge';
  let label = `${formatLongDate(day.dayStart)}, ${amount}`;
  if (day.markers.open) label += ', Hinweis: offener Eintrag';
  if (day.markers.longRunning) label += ', Hinweis: mehr als 12 Stunden';
  if (day.markers.overlap) label += ', Hinweis: Überschneidung';
  return label;
}

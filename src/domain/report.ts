import { format } from 'date-fns';
import { entriesStartingIn, monthRange, shiftDay } from './calendar';
import { projectDayTotals, projectRangeTotals } from './projectTotals';
import type { ProjectTotal } from './projectTotals';
import { dailyTotals, dayRange } from './totals';
import type { Entry, Project } from './types';

export interface ReportDay {
  dayStart: number;
  workMs: number;
  breakMs: number;
  groups: ProjectTotal[];
}

export interface MonthReport {
  monthStart: number;
  entries: Entry[];
  excludedRunningCount: number;
  days: ReportDay[];
  totals: { workMs: number; breakMs: number; groups: ProjectTotal[] };
}

/** Pure. Only closed entries (end !== null) starting in the local month are kept (0009, 0042);
 *  running ones are dropped before any total, because the totals helpers count them up to `now`.
 *  Invariants: totals.workMs === monthWorkTotals(report.entries, monthStart, 0).totalMs;
 *  each day: sum(groups.workMs) === day.workMs; totals.workMs === sum(days.workMs); same for breakMs. */
export function buildMonthReport(
  entries: readonly Entry[],
  projectsById: ReadonlyMap<string, Project>,
  monthStart: number,
): MonthReport {
  const range = monthRange(monthStart);
  const inMonth = entriesStartingIn(entries, range);
  const closed = inMonth.filter((entry) => entry.end !== null);
  const days: ReportDay[] = [];
  let workMs = 0;
  let breakMs = 0;
  for (let day = range.start; day < range.end; day = shiftDay(day, 1)) {
    const { start, end } = dayRange(day);
    if (!closed.some((entry) => entry.start >= start && entry.start < end)) continue;
    const totals = dailyTotals(closed, day, 0);
    days.push({
      dayStart: day,
      workMs: totals.workMs,
      breakMs: totals.breakMs,
      groups: projectDayTotals(closed, day, projectsById, 0),
    });
    workMs += totals.workMs;
    breakMs += totals.breakMs;
  }
  return {
    monthStart: range.start,
    entries: closed,
    excludedRunningCount: inMonth.length - closed.length,
    days,
    totals: { workMs, breakMs, groups: projectRangeTotals(closed, range, projectsById, 0) },
  };
}

/** `zeiterfassung-${format(monthStart, 'yyyy-MM')}.${extension}` → 'zeiterfassung-2026-09.csv'. */
export function exportFileName(monthStart: number, extension: 'csv' | 'pdf'): string {
  return `zeiterfassung-${format(monthStart, 'yyyy-MM')}.${extension}`;
}

import { describe, expect, it } from 'vitest';
import { monthWorkTotals } from './calendar';
import { projectsById } from './projects';
import type { ProjectTotal } from './projectTotals';
import { buildMonthReport, exportFileName } from './report';
import type { Entry, Project } from './types';

const HOUR = 60 * 60 * 1000;
const OCTOBER = new Date(2026, 9, 1).getTime();

function local(y: number, m: number, d: number, h = 0, min = 0): number {
  return new Date(y, m - 1, d, h, min).getTime();
}

function project(id: string, name: string, archived = false): Project {
  return { id, name, color: 'blue', archived, createdAt: 0, updatedAt: 0 };
}

function sumWork(groups: readonly ProjectTotal[]): number {
  return groups.reduce((sum, group) => sum + group.workMs, 0);
}

function entry(overrides: Partial<Entry> & { id: string }): Entry {
  return { type: 'work', start: 0, end: null, createdAt: 0, updatedAt: 0, ...overrides };
}

describe('buildMonthReport', () => {
  it('keeps closed in-month entries, counts running ones, and builds day rows', () => {
    const a = entry({ id: 'a', start: local(2026, 10, 6, 8), end: local(2026, 10, 6, 8) });
    const b = entry({ id: 'b', start: local(2026, 10, 6, 8), end: local(2026, 10, 6, 12) });
    const c = entry({ id: 'c', type: 'break', start: local(2026, 10, 6, 12), end: local(2026, 10, 6, 12, 30) });
    const d = entry({ id: 'd', start: local(2026, 10, 31, 22), end: local(2026, 11, 1, 2) });
    const x = entry({ id: 'x', start: local(2026, 9, 30, 23), end: local(2026, 10, 1, 1) });
    const r = entry({ id: 'r', start: local(2026, 10, 16, 14), end: null });

    const report = buildMonthReport([d, r, c, b, x, a], projectsById([]), OCTOBER);

    expect(report.entries.map((e) => e.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(report.excludedRunningCount).toBe(1);
    expect(report.days.map((day) => day.dayStart)).toEqual([local(2026, 10, 6), local(2026, 10, 31)]);
    expect(report.days[0].workMs).toBe(4 * HOUR);
    expect(report.days[0].breakMs).toBe(0.5 * HOUR);
    expect(report.totals.workMs).toBe(monthWorkTotals(report.entries, OCTOBER, 0).totalMs);
  });

  it('returns an empty report for a month without entries', () => {
    const report = buildMonthReport([], projectsById([]), OCTOBER);
    expect(report).toEqual({
      monthStart: OCTOBER,
      entries: [],
      excludedRunningCount: 0,
      days: [],
      totals: { workMs: 0, breakMs: 0, groups: [] },
    });
  });

  it('keeps an entry crossing into November in October only', () => {
    const d = entry({ id: 'd', start: local(2026, 10, 31, 22), end: local(2026, 11, 1, 2) });
    const october = buildMonthReport([d], projectsById([]), OCTOBER);
    const november = buildMonthReport([d], projectsById([]), local(2026, 11, 1));
    expect(october.entries.map((e) => e.id)).toEqual(['d']);
    expect(october.days).toEqual([
      { dayStart: local(2026, 10, 31), workMs: 4 * HOUR, breakMs: 0, groups: [{ kind: 'none', workMs: 4 * HOUR }] },
    ]);
    expect(november.entries).toEqual([]);
    expect(november.days).toEqual([]);
    expect(november.totals.workMs).toBe(0);
  });

  it('keeps an entry crossing from September into October in September only', () => {
    const x = entry({ id: 'x', start: local(2026, 9, 30, 23), end: local(2026, 10, 1, 1) });
    expect(buildMonthReport([x], projectsById([]), OCTOBER).entries).toEqual([]);
    expect(buildMonthReport([x], projectsById([]), local(2026, 9, 1)).entries.map((e) => e.id)).toEqual(['x']);
  });

  it('excludes running entries from every total and counts only those in the month', () => {
    const closed = entry({ id: 'w', start: local(2026, 10, 16, 8), end: local(2026, 10, 16, 9) });
    const running = entry({ id: 'r', start: local(2026, 10, 16, 14), end: null, projectId: 'pA' });
    const runningBreak = entry({ id: 'rb', type: 'break', start: local(2026, 10, 17, 10), end: null });
    const runningOutside = entry({ id: 'ro', start: local(2026, 11, 2, 10), end: null });
    const report = buildMonthReport(
      [running, closed, runningBreak, runningOutside],
      projectsById([project('pA', 'A')]),
      OCTOBER,
    );
    expect(report.excludedRunningCount).toBe(2);
    expect(report.entries.map((e) => e.id)).toEqual(['w']);
    expect(report.days.map((day) => day.dayStart)).toEqual([local(2026, 10, 16)]);
    expect(report.totals).toEqual({ workMs: HOUR, breakMs: 0, groups: [{ kind: 'none', workMs: HOUR }] });
  });

  it('builds a day with only a break as workMs 0 and no groups', () => {
    const pause = entry({ id: 'p', type: 'break', start: local(2026, 10, 8, 12), end: local(2026, 10, 8, 12, 45) });
    const report = buildMonthReport([pause], projectsById([]), OCTOBER);
    expect(report.days).toEqual([{ dayStart: local(2026, 10, 8), workMs: 0, breakMs: 0.75 * HOUR, groups: [] }]);
    expect(report.totals).toEqual({ workMs: 0, breakMs: 0.75 * HOUR, groups: [] });
  });

  it('sums groups to day work and day rows to the totals, with groups in projectDayTotals order', () => {
    const pA = project('pA', 'Kunde A');
    const pB = project('pB', 'Alt', true);
    const entries: Entry[] = [
      entry({ id: 'e1', start: local(2026, 10, 6, 8), end: local(2026, 10, 6, 11), projectId: 'pA' }),
      entry({ id: 'e2', start: local(2026, 10, 6, 11, 30), end: local(2026, 10, 6, 12), projectId: 'ghost' }),
      entry({ id: 'e3', type: 'break', start: local(2026, 10, 6, 11), end: local(2026, 10, 6, 11, 30) }),
      entry({ id: 'e4', start: local(2026, 10, 7, 9), end: local(2026, 10, 7, 10) }),
      entry({ id: 'e5', start: local(2026, 10, 7, 10), end: local(2026, 10, 7, 12), projectId: 'pB' }),
      entry({ id: 'e6', type: 'break', start: local(2026, 10, 7, 12), end: local(2026, 10, 7, 12, 20) }),
      entry({ id: 'e7', start: local(2026, 10, 9, 9), end: local(2026, 10, 9, 9, 10), projectId: 'pA' }),
    ];
    const report = buildMonthReport(entries, projectsById([pA, pB]), OCTOBER);
    for (const day of report.days) expect(sumWork(day.groups)).toBe(day.workMs);
    expect(report.totals.workMs).toBe(report.days.reduce((sum, day) => sum + day.workMs, 0));
    expect(report.totals.breakMs).toBe(report.days.reduce((sum, day) => sum + day.breakMs, 0));
    expect(report.totals.breakMs).toBe(50 * 60 * 1000);
    expect(sumWork(report.totals.groups)).toBe(report.totals.workMs);
    expect(report.days[0].groups).toEqual([
      { kind: 'project', project: pA, workMs: 3 * HOUR },
      { kind: 'unknown', workMs: 0.5 * HOUR },
    ]);
    expect(report.totals.groups).toEqual([
      { kind: 'project', project: pA, workMs: 3 * HOUR + 10 * 60 * 1000 },
      { kind: 'project', project: pB, workMs: 2 * HOUR },
      { kind: 'none', workMs: HOUR },
      { kind: 'unknown', workMs: 0.5 * HOUR },
    ]);
  });

  it('handles the October DST change with local-midnight day rows', () => {
    const entries: Entry[] = [
      entry({ id: 'dst', start: local(2026, 10, 25, 1), end: local(2026, 10, 25, 4) }),
      entry({ id: 'next', start: local(2026, 10, 26, 9), end: local(2026, 10, 26, 10) }),
    ];
    const report = buildMonthReport(entries, projectsById([]), OCTOBER);
    expect(report.days.map((day) => day.dayStart)).toEqual([
      new Date(2026, 9, 25).getTime(),
      new Date(2026, 9, 26).getTime(),
    ]);
    expect(report.days[0].workMs).toBe(4 * HOUR);
    expect(report.days[1].workMs).toBe(HOUR);
    expect(report.totals.workMs).toBe(5 * HOUR);
  });

  it('handles the March DST change', () => {
    const march = entry({ id: 'm', start: local(2026, 3, 29, 1), end: local(2026, 3, 29, 4) });
    const report = buildMonthReport([march], projectsById([]), local(2026, 3, 1));
    expect(report.days.map((day) => day.dayStart)).toEqual([new Date(2026, 2, 29).getTime()]);
    expect(report.days[0].workMs).toBe(2 * HOUR);
  });

  it('normalises monthStart given as any instant inside the month', () => {
    const e = entry({ id: 'e', start: local(2026, 10, 6, 8), end: local(2026, 10, 6, 9) });
    const report = buildMonthReport([e], projectsById([]), local(2026, 10, 17, 13, 45));
    expect(report.monthStart).toBe(OCTOBER);
    expect(report.entries.map((x) => x.id)).toEqual(['e']);
  });
});

describe('exportFileName', () => {
  it('builds the file name from the local month', () => {
    expect(exportFileName(new Date(2026, 8, 15).getTime(), 'csv')).toBe('zeiterfassung-2026-09.csv');
    expect(exportFileName(new Date(2026, 8, 15).getTime(), 'pdf')).toBe('zeiterfassung-2026-09.pdf');
    expect(exportFileName(new Date(2027, 0, 1).getTime(), 'pdf')).toBe('zeiterfassung-2027-01.pdf');
  });
});

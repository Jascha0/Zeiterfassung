import { describe, expect, it } from 'vitest';
import { projectDayTotals } from './projectTotals';
import { dailyTotals } from './totals';
import { projectsById } from './projects';
import type { Entry, Project } from './types';

const HOUR = 60 * 60 * 1000;

function local(y: number, m: number, d: number, h = 0, min = 0): number {
  return new Date(y, m - 1, d, h, min).getTime();
}

function entry(overrides: Partial<Entry> & { id: string }): Entry {
  return { type: 'work', start: 0, end: null, createdAt: 0, updatedAt: 0, ...overrides };
}

function project(id: string, name: string, archived = false): Project {
  return { id, name, color: 'blue', archived, createdAt: 0, updatedAt: 0 };
}

const day = local(2026, 6, 15, 12);
const now = local(2026, 6, 15, 20);

describe('projectDayTotals', () => {
  it('groups sum to dailyTotals workMs', () => {
    const pA = project('pA', 'Kunde A');
    const entries: Entry[] = [
      entry({ id: 'e1', start: local(2026, 6, 15, 8), end: local(2026, 6, 15, 11), projectId: 'pA' }),
      entry({ id: 'e2', type: 'break', start: local(2026, 6, 15, 11), end: local(2026, 6, 15, 11, 30) }),
      entry({ id: 'e3', start: local(2026, 6, 15, 11, 30), end: local(2026, 6, 15, 12, 30) }),
      entry({ id: 'e4', start: local(2026, 6, 15, 13), end: local(2026, 6, 15, 14), projectId: 'ghost' }),
    ];
    const totals = projectDayTotals(entries, day, projectsById([pA]), now);
    expect(totals).toEqual([
      { kind: 'project', project: pA, workMs: 3 * HOUR },
      { kind: 'none', workMs: HOUR },
      { kind: 'unknown', workMs: HOUR },
    ]);
    const sum = totals.reduce((acc, t) => acc + t.workMs, 0);
    expect(sum).toBe(dailyTotals(entries, day, now).workMs);
  });

  it('keeps an archived project as a project group', () => {
    const old = project('pOld', 'Alt', true);
    const entries = [entry({ id: 'e1', start: local(2026, 6, 15, 8), end: local(2026, 6, 15, 9), projectId: 'pOld' })];
    expect(projectDayTotals(entries, day, projectsById([old]), now)).toEqual([
      { kind: 'project', project: old, workMs: HOUR },
    ]);
  });

  it('counts a running block up to now', () => {
    const pA = project('pA', 'Kunde A');
    const entries = [entry({ id: 'e1', start: local(2026, 6, 15, 18), end: null, projectId: 'pA' })];
    expect(projectDayTotals(entries, day, projectsById([pA]), now)).toEqual([
      { kind: 'project', project: pA, workMs: 2 * HOUR },
    ]);
  });

  it('creates a group for a running block of 0 ms', () => {
    const entries = [entry({ id: 'e1', start: now, end: null })];
    expect(projectDayTotals(entries, day, new Map(), now)).toEqual([{ kind: 'none', workMs: 0 }]);
  });

  it('excludes an entry that started the day before', () => {
    const entries = [entry({ id: 'e1', start: local(2026, 6, 14, 23), end: local(2026, 6, 15, 1) })];
    expect(projectDayTotals(entries, day, new Map(), now)).toEqual([]);
  });

  it('fully counts an entry starting today and ending tomorrow', () => {
    const entries = [entry({ id: 'e1', start: local(2026, 6, 15, 23), end: local(2026, 6, 16, 1) })];
    const later = local(2026, 6, 16, 2);
    expect(projectDayTotals(entries, day, new Map(), later)).toEqual([{ kind: 'none', workMs: 2 * HOUR }]);
    expect(dailyTotals(entries, day, later).workMs).toBe(2 * HOUR);
  });

  it('returns [] for a day with only breaks', () => {
    const entries = [
      entry({ id: 'b1', type: 'break', start: local(2026, 6, 15, 10), end: local(2026, 6, 15, 11), projectId: 'pA' }),
    ];
    expect(projectDayTotals(entries, day, projectsById([project('pA', 'Kunde A')]), now)).toEqual([]);
  });

  it('returns [] for a day without entries', () => {
    expect(projectDayTotals([], day, new Map(), now)).toEqual([]);
  });

  it('sorts by workMs descending', () => {
    const pA = project('pA', 'A');
    const pB = project('pB', 'B');
    const entries = [
      entry({ id: 'e1', start: local(2026, 6, 15, 8), end: local(2026, 6, 15, 9), projectId: 'pA' }),
      entry({ id: 'e2', start: local(2026, 6, 15, 9), end: local(2026, 6, 15, 11), projectId: 'pB' }),
      entry({ id: 'e3', start: local(2026, 6, 15, 11), end: local(2026, 6, 15, 14) }),
    ];
    const totals = projectDayTotals(entries, day, projectsById([pA, pB]), now);
    expect(totals.map((t) => t.kind === 'project' ? t.project.id : t.kind)).toEqual(['none', 'pB', 'pA']);
  });

  it('breaks ties: projects by name, then none, then unknown', () => {
    const pa = project('p2', 'a');
    const pB = project('p1', 'B');
    const entries = [
      entry({ id: 'e1', start: local(2026, 6, 15, 8), end: local(2026, 6, 15, 9), projectId: 'ghost' }),
      entry({ id: 'e2', start: local(2026, 6, 15, 9), end: local(2026, 6, 15, 10) }),
      entry({ id: 'e3', start: local(2026, 6, 15, 10), end: local(2026, 6, 15, 11), projectId: 'p1' }),
      entry({ id: 'e4', start: local(2026, 6, 15, 11), end: local(2026, 6, 15, 12), projectId: 'p2' }),
    ];
    const totals = projectDayTotals(entries, day, projectsById([pa, pB]), now);
    expect(totals.map((t) => t.kind === 'project' ? t.project.name : t.kind)).toEqual(['a', 'B', 'none', 'unknown']);
  });

  it('breaks equal names by id', () => {
    const x2 = project('x2', 'Kunde A');
    const x1 = project('x1', 'Kunde A');
    const entries = [
      entry({ id: 'e1', start: local(2026, 6, 15, 8), end: local(2026, 6, 15, 9), projectId: 'x2' }),
      entry({ id: 'e2', start: local(2026, 6, 15, 9), end: local(2026, 6, 15, 10), projectId: 'x1' }),
    ];
    const totals = projectDayTotals(entries, day, projectsById([x2, x1]), now);
    expect(totals.map((t) => (t.kind === 'project' ? t.project.id : t.kind))).toEqual(['x1', 'x2']);
  });

  it('puts all unknown project ids into one shared group', () => {
    const entries = [
      entry({ id: 'e1', start: local(2026, 6, 15, 8), end: local(2026, 6, 15, 9), projectId: 'ghost1' }),
      entry({ id: 'e2', start: local(2026, 6, 15, 9), end: local(2026, 6, 15, 10), projectId: 'ghost2' }),
    ];
    expect(projectDayTotals(entries, day, new Map(), now)).toEqual([{ kind: 'unknown', workMs: 2 * HOUR }]);
  });
});

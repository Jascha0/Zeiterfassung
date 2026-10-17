import { describe, expect, it } from 'vitest';
import { monthRange } from './calendar';
import { projectRangeTotals } from './projectTotals';
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

describe('projectRangeTotals', () => {
  it('groups a whole month and sums to the work of all days', () => {
    const pA = project('pA', 'Kunde A');
    const entries: Entry[] = [
      entry({ id: 'e1', start: local(2026, 10, 6, 8), end: local(2026, 10, 6, 11), projectId: 'pA' }),
      entry({ id: 'e2', start: local(2026, 10, 7, 9), end: local(2026, 10, 7, 10) }),
      entry({ id: 'e3', start: local(2026, 10, 8, 9), end: local(2026, 10, 8, 10, 30), projectId: 'ghost' }),
      entry({ id: 'e4', type: 'break', start: local(2026, 10, 6, 11), end: local(2026, 10, 6, 11, 30) }),
      entry({ id: 'e5', start: local(2026, 9, 30, 9), end: local(2026, 9, 30, 17), projectId: 'pA' }),
    ];
    const totals = projectRangeTotals(entries, monthRange(new Date(2026, 9, 1).getTime()), projectsById([pA]), 0);
    expect(totals).toEqual([
      { kind: 'project', project: pA, workMs: 3 * HOUR },
      { kind: 'unknown', workMs: 1.5 * HOUR },
      { kind: 'none', workMs: HOUR },
    ]);
  });
});

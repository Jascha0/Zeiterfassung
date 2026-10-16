import { describe, expect, it } from 'vitest';
import {
  entriesStartingIn,
  mergeEntries,
  monthGrid,
  monthRange,
  monthStartOf,
  monthWorkTotals,
  shiftDay,
  shiftMonth,
} from './calendar';
import type { Entry } from './types';

function entry(overrides: Partial<Entry> & { id: string }): Entry {
  return {
    type: 'work',
    start: 0,
    end: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function local(y: number, m: number, d: number, h = 0, min = 0, s = 0): number {
  return new Date(y, m - 1, d, h, min, s).getTime();
}

describe('monthStartOf / shiftMonth / shiftDay / monthRange', () => {
  it('monthStartOf returns startOfMonth', () => {
    expect(monthStartOf(local(2026, 10, 16, 15, 0))).toBe(local(2026, 10, 1));
  });

  it('shiftMonth moves by whole months, landing on startOfMonth', () => {
    expect(shiftMonth(new Date(2026, 0, 1).getTime(), -1)).toBe(new Date(2025, 11, 1).getTime());
  });

  it('shiftDay is DST-safe local midnight arithmetic', () => {
    expect(shiftDay(new Date(2026, 2, 28).getTime(), 1)).toBe(new Date(2026, 2, 29).getTime());
  });

  it('monthRange is [startOfMonth, startOfNextMonth)', () => {
    const range = monthRange(local(2026, 10, 16));
    expect(range.start).toBe(local(2026, 10, 1));
    expect(range.end).toBe(local(2026, 11, 1));
  });
});

describe('monthGrid', () => {
  it('builds 6 Monday-first weeks for March 2026 (starts Sunday)', () => {
    const grid = monthGrid(new Date(2026, 2, 1).getTime());
    expect(grid.length).toBe(6);
    expect(grid[0][0].dayStart).toBe(local(2026, 2, 23));
    expect(grid[0][0].inMonth).toBe(false);
    expect(grid[0][6].dayStart).toBe(local(2026, 3, 1));
    expect(grid[0][6].inMonth).toBe(true);
    const lastWeek = grid[grid.length - 1];
    expect(lastWeek[6].dayStart).toBe(local(2026, 4, 5));
    expect(lastWeek[6].inMonth).toBe(false);
    for (const week of grid) {
      expect(week.length).toBe(7);
      for (const day of week) {
        expect(new Date(day.dayStart).getHours()).toBe(0);
      }
    }
  });

  it('builds exactly 4 weeks for Feb 2027 (starts Monday, 28 days)', () => {
    const grid = monthGrid(new Date(2027, 1, 1).getTime());
    expect(grid.length).toBe(4);
    for (const week of grid) {
      for (const day of week) {
        expect(day.inMonth).toBe(true);
      }
    }
  });

  it('builds 5 weeks for October 2026', () => {
    const grid = monthGrid(new Date(2026, 9, 1).getTime());
    expect(grid.length).toBe(5);
    expect(grid[0][0].dayStart).toBe(local(2026, 9, 28));
    const lastWeek = grid[grid.length - 1];
    expect(lastWeek[6].dayStart).toBe(local(2026, 11, 1));
  });
});

describe('monthWorkTotals', () => {
  it('attributes a midnight-crossing work entry fully to its start day (0009)', () => {
    const entries: Entry[] = [
      entry({ id: 'w1', start: local(2026, 10, 15, 22), end: local(2026, 10, 16, 2) }),
    ];
    const totals = monthWorkTotals(entries, local(2026, 10, 1), local(2026, 10, 16, 3));
    expect(totals.byDay.get(local(2026, 10, 15))).toBe(4 * 3_600_000);
    expect(totals.byDay.get(local(2026, 10, 16))).toBe(0);
  });

  it('computes 2h across the spring-forward DST day 2026-03-29', () => {
    const entries: Entry[] = [entry({ id: 'w1', start: local(2026, 3, 29, 1), end: local(2026, 3, 29, 4) })];
    const totals = monthWorkTotals(entries, local(2026, 3, 1), local(2026, 3, 29, 4));
    expect(totals.byDay.get(local(2026, 3, 29))).toBe(2 * 3_600_000);
  });

  it('computes 4h across the fall-back DST day 2026-10-25', () => {
    const start = Date.UTC(2026, 9, 24, 23);
    const end = Date.UTC(2026, 9, 25, 3);
    const entries: Entry[] = [entry({ id: 'w1', start, end })];
    const totals = monthWorkTotals(entries, local(2026, 10, 1), end);
    expect(totals.byDay.get(local(2026, 10, 25))).toBe(4 * 3_600_000);
  });

  it('never counts break entries', () => {
    const entries: Entry[] = [
      entry({ id: 'b1', type: 'break', start: local(2026, 10, 15, 10), end: local(2026, 10, 15, 11) }),
    ];
    const totals = monthWorkTotals(entries, local(2026, 10, 1), local(2026, 10, 16));
    expect(totals.byDay.get(local(2026, 10, 15))).toBe(0);
    expect(totals.totalMs).toBe(0);
  });

  it('counts an open work entry up to now', () => {
    const now = local(2026, 10, 15, 10);
    const entries: Entry[] = [entry({ id: 'w1', start: local(2026, 10, 15, 9), end: null })];
    const totals = monthWorkTotals(entries, local(2026, 10, 1), now);
    expect(totals.byDay.get(local(2026, 10, 15))).toBe(1 * 3_600_000);
  });

  it('excludes entries starting in an adjacent month from byDay and totalMs', () => {
    const entries: Entry[] = [
      entry({ id: 'w1', start: local(2026, 9, 30, 10), end: local(2026, 9, 30, 12) }),
    ];
    const totals = monthWorkTotals(entries, local(2026, 10, 1), local(2026, 10, 16));
    expect(totals.byDay.has(local(2026, 9, 30))).toBe(false);
    expect(totals.totalMs).toBe(0);
  });

  it('byDay has one entry per day of the month and totalMs is the sum of byDay', () => {
    const entries: Entry[] = [
      entry({ id: 'w1', start: local(2026, 10, 15, 9), end: local(2026, 10, 15, 11) }),
      entry({ id: 'w2', start: local(2026, 10, 20, 9), end: local(2026, 10, 20, 10) }),
    ];
    const totals = monthWorkTotals(entries, local(2026, 10, 1), local(2026, 10, 25));
    expect(totals.byDay.size).toBe(31);
    let sum = 0;
    for (const value of totals.byDay.values()) sum += value;
    expect(totals.totalMs).toBe(sum);
    expect(totals.totalMs).toBe(3 * 3_600_000);
  });
});

describe('mergeEntries', () => {
  it('dedupes by id, override wins, sorted by start then id', () => {
    const base: Entry[] = [
      entry({ id: 'a', start: 2000 }),
      entry({ id: 'b', start: 1000 }),
    ];
    const overrides: Entry[] = [entry({ id: 'a', start: 500, type: 'break' })];
    const merged = mergeEntries(base, overrides);
    expect(merged.map((e) => e.id)).toEqual(['a', 'b']);
    expect(merged[0].type).toBe('break');
    expect(merged[0].start).toBe(500);
  });

  it('sorts by id when starts are equal', () => {
    const base: Entry[] = [entry({ id: 'z', start: 100 }), entry({ id: 'a', start: 100 })];
    const merged = mergeEntries(base, []);
    expect(merged.map((e) => e.id)).toEqual(['a', 'z']);
  });
});

describe('entriesStartingIn', () => {
  it('filters half-open on start and sorts by start then id', () => {
    const entries: Entry[] = [
      entry({ id: 'a', start: 1000 }),
      entry({ id: 'b', start: 2000 }),
      entry({ id: 'c', start: 3000 }),
    ];
    const result = entriesStartingIn(entries, { start: 1000, end: 3000 });
    expect(result.map((e) => e.id)).toEqual(['a', 'b']);
  });
});

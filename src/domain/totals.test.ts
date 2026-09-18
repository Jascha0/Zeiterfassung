import { describe, expect, it } from 'vitest';
import { currentBreakMs, dailyTotals, dayRange, entryDurationMs } from './totals';
import type { Entry } from './types';
import type { TimerStatus } from './timer';

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

// Local time helper (TZ = Europe/Berlin, set in src/test/setup.ts)
function local(y: number, m: number, d: number, h = 0, min = 0, s = 0): number {
  return new Date(y, m - 1, d, h, min, s).getTime();
}

describe('dayRange', () => {
  it('returns [startOfDay, startOfDay+1day) for a normal day', () => {
    const range = dayRange(local(2026, 6, 15, 12, 30));
    expect(range.start).toBe(local(2026, 6, 15, 0, 0, 0));
    expect(range.end).toBe(local(2026, 6, 16, 0, 0, 0));
  });

  it('is 23 hours on the spring-forward DST day 2026-03-29 (Europe/Berlin)', () => {
    const range = dayRange(local(2026, 3, 29, 10, 0));
    expect(range.end - range.start).toBe(23 * 60 * 60 * 1000);
  });

  it('is 25 hours on the fall-back DST day 2026-10-25 (Europe/Berlin)', () => {
    const range = dayRange(local(2026, 10, 25, 10, 0));
    expect(range.end - range.start).toBe(25 * 60 * 60 * 1000);
  });
});

describe('entryDurationMs', () => {
  it('is end - start for a closed entry', () => {
    const e = entry({ id: 'a', start: 1000, end: 5000 });
    expect(entryDurationMs(e, 999_999)).toBe(4000);
  });

  it('uses now for an open entry', () => {
    const e = entry({ id: 'a', start: 1000, end: null });
    expect(entryDurationMs(e, 4000)).toBe(3000);
  });

  it('clamps to >= 0 under clock skew (edge case 26)', () => {
    const e = entry({ id: 'a', start: 10_000, end: null });
    expect(entryDurationMs(e, 5_000)).toBe(0);
  });
});

describe('dailyTotals', () => {
  it('sums work and break durations separately for a multi-break day', () => {
    const day = local(2026, 6, 15);
    const entries: Entry[] = [
      entry({ id: 'w1', type: 'work', start: local(2026, 6, 15, 8), end: local(2026, 6, 15, 10) }), // 2h
      entry({ id: 'b1', type: 'break', start: local(2026, 6, 15, 10), end: local(2026, 6, 15, 10, 30) }), // 0.5h
      entry({ id: 'w2', type: 'work', start: local(2026, 6, 15, 10, 30), end: local(2026, 6, 15, 13) }), // 2.5h
      entry({ id: 'b2', type: 'break', start: local(2026, 6, 15, 13), end: local(2026, 6, 15, 13, 15) }), // 0.25h
      entry({ id: 'w3', type: 'work', start: local(2026, 6, 15, 13, 15), end: local(2026, 6, 15, 17) }), // 3.75h
    ];
    const totals = dailyTotals(entries, day, local(2026, 6, 15, 20));
    expect(totals.workMs).toBe((2 + 2.5 + 3.75) * 60 * 60 * 1000);
    expect(totals.breakMs).toBe((0.5 + 0.25) * 60 * 60 * 1000);
  });

  it('attributes an entry crossing midnight to its start day (D9 / edge case 27)', () => {
    const yesterday = local(2026, 6, 14);
    const today = local(2026, 6, 15);
    const crossing = entry({
      id: 'w1',
      type: 'work',
      start: local(2026, 6, 14, 23, 0),
      end: local(2026, 6, 15, 1, 0),
    });
    const now = local(2026, 6, 15, 5);
    expect(dailyTotals([crossing], yesterday, now).workMs).toBe(2 * 60 * 60 * 1000);
    expect(dailyTotals([crossing], today, now).workMs).toBe(0);
  });

  it('counts an open entry up to now', () => {
    const day = local(2026, 6, 15);
    const openWork = entry({ id: 'w1', type: 'work', start: local(2026, 6, 15, 8), end: null });
    const now = local(2026, 6, 15, 9);
    expect(dailyTotals([openWork], day, now).workMs).toBe(60 * 60 * 1000);
  });

  it('excludes entries starting outside the day range', () => {
    const day = local(2026, 6, 15);
    const other = entry({ id: 'w1', type: 'work', start: local(2026, 6, 16, 1), end: local(2026, 6, 16, 2) });
    expect(dailyTotals([other], day, local(2026, 6, 16, 3)).workMs).toBe(0);
  });

  it('computes correct duration across the DST spring-forward day using absolute ms (edge case 29)', () => {
    // 01:30 -> 03:30 local wall clock on 2026-03-29 spans the missing hour: absolute duration 1h.
    const start = local(2026, 3, 29, 1, 30);
    const end = local(2026, 3, 29, 3, 30);
    const e = entry({ id: 'w1', type: 'work', start, end });
    const day = dayRange(start).start;
    const totals = dailyTotals([e], day, end);
    expect(totals.workMs).toBe(1 * 60 * 60 * 1000);
  });

  it('computes correct duration across the DST fall-back day using absolute ms (edge case 29)', () => {
    // 01:30 -> 03:30 local wall clock on 2026-10-25 repeats an hour: absolute duration 3h.
    const start = local(2026, 10, 25, 1, 30);
    const end = local(2026, 10, 25, 3, 30);
    const e = entry({ id: 'w1', type: 'work', start, end });
    const day = dayRange(start).start;
    const totals = dailyTotals([e], day, end);
    expect(totals.workMs).toBe(3 * 60 * 60 * 1000);
  });
});

describe('currentBreakMs', () => {
  it('is the break duration while onBreak', () => {
    const activeEntry = entry({ id: 'b1', type: 'break', start: 1000 });
    const status: TimerStatus = { state: 'onBreak', activeEntry, openEntries: [activeEntry] };
    expect(currentBreakMs(status, 4000)).toBe(3000);
  });

  it('is 0 when not onBreak', () => {
    const activeEntry = entry({ id: 'w1', type: 'work', start: 1000 });
    const status: TimerStatus = { state: 'working', activeEntry, openEntries: [activeEntry] };
    expect(currentBreakMs(status, 4000)).toBe(0);
  });

  it('is 0 when idle (no active entry)', () => {
    const status: TimerStatus = { state: 'idle', activeEntry: null, openEntries: [] };
    expect(currentBreakMs(status, 4000)).toBe(0);
  });
});

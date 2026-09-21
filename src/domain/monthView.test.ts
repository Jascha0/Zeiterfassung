import { describe, expect, it } from 'vitest';
import { buildMonthSummary, monthRange } from './monthView';
import type { Entry } from './types';

describe('buildMonthSummary', () => {
  it('excludes the loaded neighbouring days from the month total and marks an overlap on the 1st', () => {
    const monthStart = new Date(2026, 8, 1).getTime();
    const entry = (id: string, start: Date, end: Date | null): Entry => ({
      id, type: 'work', start: start.getTime(), end: end === null ? null : end.getTime(),
      createdAt: 1, updatedAt: 1,
    });
    const loaded = [
      entry('prev', new Date(2026, 7, 31, 22, 0), new Date(2026, 8, 1, 2, 0)), // starts 31 Aug
      entry('first', new Date(2026, 8, 1, 1, 0), new Date(2026, 8, 1, 3, 0)),  // overlaps 'prev'
      entry('next', new Date(2026, 9, 1, 9, 0), new Date(2026, 9, 1, 10, 0)),  // starts 1 Oct
    ];
    const now = new Date(2026, 9, 5, 12, 0).getTime();
    const summary = buildMonthSummary(monthStart, loaded, now);
    expect(summary.days).toHaveLength(30);
    expect(summary.totalWorkMs).toBe(2 * 60 * 60 * 1000); // only 'first' counts
    expect(summary.days[0].markers.overlap).toBe(true);
    expect(monthRange(monthStart)).toEqual({
      start: new Date(2026, 7, 31).getTime(),
      end: new Date(2026, 9, 2).getTime(),
    });
  });
});

import { describe, expect, it } from 'vitest';
import { buildCalendarWeeks } from './calendarGrid';

describe('buildCalendarWeeks', () => {
  it('builds September 2026 as 5 Monday-first weeks starting Mon 31 Aug', () => {
    const weeks = buildCalendarWeeks(new Date(2026, 8, 1).getTime());
    expect(weeks).toHaveLength(5);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks[0][0]).toMatchObject({ dateKey: '2026-08-31', dayOfMonth: 31, inMonth: false });
    expect(weeks[0][1]).toMatchObject({ dateKey: '2026-09-01', dayOfMonth: 1, inMonth: true });
    expect(weeks[4][6]).toMatchObject({ dateKey: '2026-10-04', inMonth: false });
    expect(weeks.flat().filter((cell) => cell.inMonth)).toHaveLength(30);
  });
});

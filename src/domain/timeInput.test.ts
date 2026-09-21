import { describe, expect, it } from 'vitest';
import { resolveEndForStart, resolveEntryInstants } from './timeInput';

describe('resolveEntryInstants', () => {
  it('a 22:00–02:00 entry on 2026-09-18 spans 4 hours into the next day', () => {
    const dayStart = new Date(2026, 8, 18).getTime();
    const { start, end } = resolveEntryInstants(dayStart, { hours: 22, minutes: 0 }, { hours: 2, minutes: 0 });
    expect(end).not.toBeNull();
    expect((end as number) - start).toBe(4 * 60 * 60 * 1000);
    expect(new Date(end as number).getDate()).toBe(19);
  });

  it('keeps an end equal to the start on the same day so it can be rejected', () => {
    const dayStart = new Date(2026, 8, 18).getTime();
    const { start, end } = resolveEntryInstants(dayStart, { hours: 9, minutes: 0 }, { hours: 9, minutes: 0 });
    expect(end).toBe(start);
    expect(resolveEndForStart(start, { hours: 9, minutes: 0 })).toBe(start);
  });
});

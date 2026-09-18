import { describe, expect, it } from 'vitest';
import { formatClock, formatDuration } from './format';

describe('formatDuration', () => {
  it('formats 0 as 0:00:00', () => {
    expect(formatDuration(0)).toBe('0:00:00');
  });

  it('formats 3723000 ms as 1:02:03', () => {
    expect(formatDuration(3_723_000)).toBe('1:02:03');
  });

  it('formats 45296000 ms as 12:34:56 (hours unpadded and unbounded)', () => {
    expect(formatDuration(45_296_000)).toBe('12:34:56');
  });

  it('floors to whole seconds', () => {
    expect(formatDuration(1999)).toBe('0:00:01');
  });

  it('formats negative durations as 0:00:00 (edge case 26)', () => {
    expect(formatDuration(-1)).toBe('0:00:00');
  });

  it('formats NaN as 0:00:00 (edge case 26)', () => {
    expect(formatDuration(NaN)).toBe('0:00:00');
  });

  it('formats hours beyond 99 without truncation', () => {
    expect(formatDuration(100 * 60 * 60 * 1000)).toBe('100:00:00');
  });
});

describe('formatClock', () => {
  it('formats local time as 24h HH:mm', () => {
    const instant = new Date(2026, 5, 15, 9, 5, 30).getTime();
    expect(formatClock(instant)).toBe('09:05');
  });

  it('pads single-digit hours and minutes', () => {
    const instant = new Date(2026, 5, 15, 0, 0).getTime();
    expect(formatClock(instant)).toBe('00:00');
  });

  it('formats afternoon/evening hours in 24h notation', () => {
    const instant = new Date(2026, 5, 15, 23, 59).getTime();
    expect(formatClock(instant)).toBe('23:59');
  });
});

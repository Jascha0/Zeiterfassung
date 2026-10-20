import { describe, expect, it } from 'vitest';
import { formatDecimalHours, formatEndTime, formatShortDateTime, formatWeekdayDate } from './format';

const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();

describe('formatDecimalHours', () => {
  it('rounds hundredths of an hour half-up with a decimal comma', () => {
    expect(formatDecimalHours(26_999_000)).toBe('7,50');
    expect(formatDecimalHours(450_000)).toBe('0,13');
    expect(formatDecimalHours(449_999)).toBe('0,12');
    expect(formatDecimalHours(27_000_000)).toBe('7,50');
    expect(formatDecimalHours(0)).toBe('0,00');
    expect(formatDecimalHours(36_000_000)).toBe('10,00');
  });

  it('returns 0,00 for negative or non-finite input', () => {
    expect(formatDecimalHours(-1)).toBe('0,00');
    expect(formatDecimalHours(Number.NaN)).toBe('0,00');
    expect(formatDecimalHours(Number.POSITIVE_INFINITY)).toBe('0,00');
  });
});

describe('formatEndTime', () => {
  it('shows only the time on the same day', () => {
    expect(formatEndTime(at(2026, 10, 6, 8), at(2026, 10, 6, 15, 30))).toBe('15:30');
  });

  it('shows the date when the end is on a later day', () => {
    expect(formatEndTime(at(2026, 10, 31, 22), at(2026, 11, 1, 2))).toBe('01.11.2026 02:00');
  });

  it('shows the date for exactly midnight of the next day', () => {
    expect(formatEndTime(at(2026, 10, 6, 23), at(2026, 10, 7, 0))).toBe('07.10.2026 00:00');
  });
});

describe('formatWeekdayDate', () => {
  it('uses the two-letter German weekday without a dot', () => {
    expect(formatWeekdayDate(at(2026, 10, 6))).toBe('Di 06.10.2026');
    expect(formatWeekdayDate(at(2026, 10, 5))).toBe('Mo 05.10.2026');
    expect(formatWeekdayDate(at(2026, 10, 11))).toBe('So 11.10.2026');
  });
});

describe('formatShortDateTime', () => {
  it('formats date and time', () => {
    expect(formatShortDateTime(at(2026, 10, 17, 14, 5))).toBe('17.10.2026 14:05');
  });
});

import { describe, expect, it } from 'vitest';
import { formatDateKey, localDateTimeToInstant, toDateKey, toTimeValue } from './localTime';

describe('localDateTimeToInstant', () => {
  it('converts a normal local date + time to an instant', () => {
    expect(localDateTimeToInstant('2026-10-16', '08:00')).toEqual({
      ok: true,
      instant: new Date(2026, 9, 16, 8, 0).getTime(),
    });
  });

  it('rejects a non-existent time in the spring-forward gap', () => {
    expect(localDateTimeToInstant('2026-03-29', '02:30')).toEqual({
      ok: false,
      error: 'nonexistentTime',
    });
  });

  it('accepts 03:00 on the spring-forward day (first valid time after the gap)', () => {
    expect(localDateTimeToInstant('2026-03-29', '03:00')).toEqual({
      ok: true,
      instant: Date.UTC(2026, 2, 29, 1, 0),
    });
  });

  it('accepts 01:59 on the spring-forward day (last valid time before the gap)', () => {
    expect(localDateTimeToInstant('2026-03-29', '01:59')).toEqual({
      ok: true,
      instant: Date.UTC(2026, 2, 29, 0, 59),
    });
  });

  it('resolves an ambiguous fall-back time to the first occurrence (CEST)', () => {
    expect(localDateTimeToInstant('2026-10-25', '02:30')).toEqual({
      ok: true,
      instant: Date.UTC(2026, 9, 25, 0, 30),
    });
  });

  it('rejects an invalid calendar date', () => {
    expect(localDateTimeToInstant('2026-02-30', '08:00')).toEqual({
      ok: false,
      error: 'invalidFormat',
    });
  });

  it('rejects an out-of-range time', () => {
    expect(localDateTimeToInstant('2026-10-16', '24:00')).toEqual({
      ok: false,
      error: 'invalidFormat',
    });
  });

  it('rejects a time that does not match HH:MM', () => {
    expect(localDateTimeToInstant('2026-10-16', '8:00')).toEqual({
      ok: false,
      error: 'invalidFormat',
    });
  });

  it('rejects an empty date key', () => {
    expect(localDateTimeToInstant('', '08:00')).toEqual({
      ok: false,
      error: 'invalidFormat',
    });
  });

  it('rejects an empty time', () => {
    expect(localDateTimeToInstant('2026-10-16', '')).toEqual({
      ok: false,
      error: 'invalidFormat',
    });
  });
});

describe('toDateKey', () => {
  it('formats the local date as yyyy-MM-dd', () => {
    expect(toDateKey(new Date(2026, 9, 5, 23, 30).getTime())).toBe('2026-10-05');
  });
});

describe('toTimeValue', () => {
  it('formats the local time as HH:mm, dropping seconds', () => {
    expect(toTimeValue(new Date(2026, 9, 5, 8, 0, 37).getTime())).toBe('08:00');
  });
});

describe('formatDateKey', () => {
  it('reformats a date key to DD.MM.YYYY', () => {
    expect(formatDateKey('2026-03-29')).toBe('29.03.2026');
  });

  it('returns the input unchanged when it does not match the pattern', () => {
    expect(formatDateKey('x')).toBe('x');
  });
});

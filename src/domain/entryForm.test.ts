import { describe, expect, it } from 'vitest';
import { shiftDay } from './calendar';
import {
  endInputKindFor,
  entryChanges,
  initialFormValues,
  parseEntryTimes,
  type EntryFormContext,
  type EntryFormValues,
} from './entryForm';
import type { Entry } from './types';

function local(y: number, m: number, d: number, h = 0, min = 0, s = 0): number {
  return new Date(y, m - 1, d, h, min, s).getTime();
}

const day = new Date(2026, 9, 14).getTime();

function entry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 'e',
    type: 'work',
    start: local(2026, 10, 14, 8),
    end: local(2026, 10, 14, 12),
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function values(overrides: Partial<EntryFormValues> = {}): EntryFormValues {
  return { type: 'work', startTime: '', endTime: '', endNextDay: false, endDate: '2026-10-14', ...overrides };
}

function context(overrides: Partial<EntryFormContext> = {}): EntryFormContext {
  return {
    dayStart: day,
    endInput: 'nextDayFlag',
    original: null,
    startTouched: true,
    endTouched: true,
    endRequired: true,
    ...overrides,
  };
}

describe('parseEntryTimes', () => {
  it('parses add mode times on the start day', () => {
    expect(parseEntryTimes(values({ startTime: '08:00', endTime: '12:00' }), context())).toEqual({
      ok: true,
      start: local(2026, 10, 14, 8),
      end: local(2026, 10, 14, 12),
    });
  });

  it('puts the end on the next day when endNextDay is set', () => {
    expect(
      parseEntryTimes(values({ startTime: '22:00', endTime: '02:00', endNextDay: true }), context()),
    ).toEqual({ ok: true, start: local(2026, 10, 14, 22), end: local(2026, 10, 15, 2) });
  });

  it('reports a nonexistent start time in the spring-forward gap', () => {
    const springDay = new Date(2026, 2, 29).getTime();
    const result = parseEntryTimes(
      values({ startTime: '02:30', endTime: '04:00' }),
      context({ dayStart: springDay }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toEqual({ field: 'start', kind: 'nonexistentTime', dateKey: '2026-03-29' });
  });

  it('reports both required errors, start first', () => {
    expect(parseEntryTimes(values(), context())).toEqual({
      ok: false,
      errors: [
        { field: 'start', kind: 'required', dateKey: '' },
        { field: 'end', kind: 'required', dateKey: '' },
      ],
    });
  });

  it('keeps an untouched start exactly as stored', () => {
    const storedStart = local(2026, 10, 14, 8, 0, 37);
    const result = parseEntryTimes(
      values({ startTime: '08:00', endTime: '13:00' }),
      context({
        original: { start: storedStart, end: local(2026, 10, 14, 12) },
        startTouched: false,
        endTouched: true,
      }),
    );
    expect(result).toEqual({ ok: true, start: storedStart, end: local(2026, 10, 14, 13) });
  });

  it('keeps an untouched end in date mode exactly as stored', () => {
    const storedEnd = local(2026, 10, 24, 9, 15, 12);
    const result = parseEntryTimes(
      values({ startTime: '08:00', endTime: '09:15', endDate: '2026-10-24' }),
      context({
        endInput: 'date',
        original: { start: local(2026, 10, 14, 8), end: storedEnd },
        startTouched: false,
        endTouched: false,
      }),
    );
    expect(result).toEqual({ ok: true, start: local(2026, 10, 14, 8), end: storedEnd });
  });

  it('combines endDate and endTime in date mode', () => {
    const result = parseEntryTimes(
      values({ startTime: '08:00', endTime: '09:00', endDate: '2026-10-18' }),
      context({ endInput: 'date' }),
    );
    expect(result).toEqual({ ok: true, start: local(2026, 10, 14, 8), end: local(2026, 10, 18, 9) });
  });

  it('requires an endDate in date mode', () => {
    const result = parseEntryTimes(
      values({ startTime: '08:00', endTime: '09:00', endDate: '' }),
      context({ endInput: 'date' }),
    );
    expect(result).toEqual({ ok: false, errors: [{ field: 'end', kind: 'required', dateKey: '' }] });
  });

  it('returns a null end for an untouched older open entry', () => {
    const result = parseEntryTimes(
      values({ startTime: '08:00' }),
      context({
        endInput: 'date',
        original: { start: local(2026, 10, 14, 8), end: null },
        startTouched: false,
        endTouched: false,
        endRequired: false,
      }),
    );
    expect(result).toEqual({ ok: true, start: local(2026, 10, 14, 8), end: null });
  });

  it('returns the original end in none mode', () => {
    const result = parseEntryTimes(
      values({ startTime: '09:00' }),
      context({
        endInput: 'none',
        original: { start: local(2026, 10, 14, 8), end: null },
        endRequired: false,
      }),
    );
    expect(result).toEqual({ ok: true, start: local(2026, 10, 14, 9), end: null });
  });
});

describe('endInputKindFor', () => {
  it('chooses the end input mode', () => {
    expect(endInputKindFor(null, null, day, false)).toBe('nextDayFlag');
    expect(endInputKindFor(entry(), null, day, true)).toBe('date');
    expect(endInputKindFor(entry({ id: 'a', end: null }), 'a', day, false)).toBe('none');
    expect(endInputKindFor(entry({ id: 'b', end: null }), 'a', day, false)).toBe('date');
    expect(endInputKindFor(entry({ end: shiftDay(day, 1) + 2 * 60 * 60 * 1000 }), null, day, false)).toBe(
      'nextDayFlag',
    );
    expect(endInputKindFor(entry({ end: shiftDay(day, 2) }), null, day, false)).toBe('date');
  });
});

describe('initialFormValues', () => {
  it('returns empty values when adding', () => {
    expect(initialFormValues(null, day, null)).toEqual({
      type: 'work',
      startTime: '',
      endTime: '',
      endNextDay: false,
      endDate: '2026-10-14',
    });
  });

  it('prefills a closed entry crossing midnight', () => {
    const closed = entry({ type: 'break', start: local(2026, 10, 14, 22), end: local(2026, 10, 15, 2) });
    expect(initialFormValues(closed, day, closed.end)).toEqual({
      type: 'break',
      startTime: '22:00',
      endTime: '02:00',
      endNextDay: true,
      endDate: '2026-10-15',
    });
  });
});

describe('entryChanges', () => {
  const original = entry();

  it('returns null when nothing changed', () => {
    expect(entryChanges(original, { type: 'work', start: original.start, end: original.end }, 5)).toBeNull();
  });

  it('returns only the changed end plus updatedAt', () => {
    const end = local(2026, 10, 14, 13);
    const result = entryChanges(original, { type: 'work', start: original.start, end }, 5);
    expect(result).toEqual({ end, updatedAt: 5 });
    expect(Object.keys(result as object)).toEqual(['end', 'updatedAt']);
  });

  it('orders keys type, start, end, updatedAt', () => {
    const result = entryChanges(
      original,
      { type: 'break', start: local(2026, 10, 14, 9), end: local(2026, 10, 14, 13) },
      5,
    );
    expect(Object.keys(result as object)).toEqual(['type', 'start', 'end', 'updatedAt']);
  });

  it('does not send a null end', () => {
    const open = entry({ end: null });
    const result = entryChanges(open, { type: 'work', start: local(2026, 10, 14, 9), end: null }, 5);
    expect(result).toEqual({ start: local(2026, 10, 14, 9), updatedAt: 5 });
  });
});

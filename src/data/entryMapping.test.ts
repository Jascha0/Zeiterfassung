import { describe, expect, it } from 'vitest';
import {
  parseEntry,
  parsePreferences,
  parseStoredEntry,
  parseStoredPreferences,
  toStoredEntry,
  type TimestampLike,
} from './entryMapping';

function ts(ms: number): TimestampLike {
  return { toMillis: () => ms };
}

const VALID_DATA = {
  type: 'work' as const,
  start: ts(1000),
  end: null,
  createdAt: ts(1000),
  updatedAt: ts(2000),
};

describe('parseEntry', () => {
  it('parses a valid work entry (happy path)', () => {
    const result = parseEntry('e1', VALID_DATA);
    expect(result).toEqual({
      id: 'e1',
      type: 'work',
      start: 1000,
      end: null,
      createdAt: 1000,
      updatedAt: 2000,
    });
  });

  it('parses a valid closed break entry with end timestamp', () => {
    const result = parseEntry('e2', { ...VALID_DATA, type: 'break', end: ts(5000) });
    expect(result).toMatchObject({ type: 'break', end: 5000 });
  });

  it('includes optional projectId/note when present and valid', () => {
    const result = parseEntry('e3', { ...VALID_DATA, projectId: 'p1', note: 'hello' });
    expect(result).toMatchObject({ projectId: 'p1', note: 'hello' });
  });

  it('omits projectId/note keys entirely when absent', () => {
    const result = parseEntry('e1', VALID_DATA);
    expect(result).not.toBeNull();
    expect('projectId' in (result as object)).toBe(false);
    expect('note' in (result as object)).toBe(false);
  });

  it('returns null (never throws) for undefined data', () => {
    expect(parseEntry('e1', undefined)).toBeNull();
  });

  it('returns null for an invalid type', () => {
    expect(parseEntry('e1', { ...VALID_DATA, type: 'other' })).toBeNull();
  });

  it('returns null when start is not TimestampLike', () => {
    expect(parseEntry('e1', { ...VALID_DATA, start: '2026-01-01' })).toBeNull();
  });

  it('returns null when createdAt is not TimestampLike', () => {
    expect(parseEntry('e1', { ...VALID_DATA, createdAt: 123 })).toBeNull();
  });

  it('returns null when updatedAt is not TimestampLike', () => {
    expect(parseEntry('e1', { ...VALID_DATA, updatedAt: 123 })).toBeNull();
  });

  it('returns null when end is neither null nor TimestampLike', () => {
    expect(parseEntry('e1', { ...VALID_DATA, end: 'not-a-timestamp' })).toBeNull();
  });

  it('returns null when projectId is present but not a string', () => {
    expect(parseEntry('e1', { ...VALID_DATA, projectId: 42 })).toBeNull();
  });

  it('returns null when note is present but not a string', () => {
    expect(parseEntry('e1', { ...VALID_DATA, note: 42 })).toBeNull();
  });

  it('does not throw for a completely malformed document (edge case 31)', () => {
    expect(() => parseEntry('e1', { random: 'junk' })).not.toThrow();
    expect(parseEntry('e1', { random: 'junk' })).toBeNull();
  });

  it('returns null when a required field is missing', () => {
    const { start: _start, ...rest } = VALID_DATA;
    expect(parseEntry('e1', rest as Record<string, unknown>)).toBeNull();
  });
});

describe('parsePreferences', () => {
  it('parses a valid preferences document (happy path)', () => {
    expect(parsePreferences({ theme: 'dark' })).toEqual({ theme: 'dark' });
  });

  it.each(['light', 'dark', 'system'])('accepts theme "%s"', (theme) => {
    expect(parsePreferences({ theme })).toEqual({ theme });
  });

  it('returns null for an invalid theme value', () => {
    expect(parsePreferences({ theme: 'blue' })).toBeNull();
  });

  it('returns null for undefined data', () => {
    expect(parsePreferences(undefined)).toBeNull();
  });

  it('returns null when theme is missing', () => {
    expect(parsePreferences({})).toBeNull();
  });
});

describe('parseStoredEntry / toStoredEntry', () => {
  it('round-trips a stored record with end: null', () => {
    const entry = { id: 'a', type: 'work' as const, start: 1000, end: null, createdAt: 1000, updatedAt: 2000 };
    const record = toStoredEntry(entry);
    expect(record).toEqual(entry);
    expect(parseStoredEntry(record)).toEqual(entry);
    expect(parseStoredEntry(record)?.end).toBeNull();
  });

  it('round-trips a closed entry with a numeric end', () => {
    const entry = { id: 'a', type: 'break' as const, start: 1000, end: 5000, createdAt: 1000, updatedAt: 2000 };
    const record = toStoredEntry(entry);
    expect(record).toEqual(entry);
    expect(parseStoredEntry(record)).toEqual(entry);
  });

  it('round-trips projectId and note when present', () => {
    const entry = {
      id: 'a',
      type: 'work' as const,
      start: 1000,
      end: null,
      createdAt: 1000,
      updatedAt: 2000,
      projectId: 'p1',
      note: 'hello',
    };
    const record = toStoredEntry(entry);
    expect(record).toEqual(entry);
    expect(parseStoredEntry(record)).toEqual(entry);
  });

  it('omits projectId and note keys entirely when absent', () => {
    const entry = { id: 'a', type: 'work' as const, start: 1000, end: null, createdAt: 1000, updatedAt: 2000 };
    const record = toStoredEntry(entry);
    expect('projectId' in record).toBe(false);
    expect('note' in record).toBe(false);
    const parsed = parseStoredEntry(record);
    expect(parsed).not.toBeNull();
    expect('projectId' in (parsed as object)).toBe(false);
    expect('note' in (parsed as object)).toBe(false);
  });

  it.each([undefined, null, 'text', 42, {}])('returns null (never throws) for %j', (value) => {
    expect(() => parseStoredEntry(value)).not.toThrow();
    expect(parseStoredEntry(value)).toBeNull();
  });

  it('returns null for a missing id', () => {
    const { id: _id, ...rest } = toStoredEntry({
      id: 'a',
      type: 'work',
      start: 1000,
      end: null,
      createdAt: 1000,
      updatedAt: 2000,
    });
    expect(parseStoredEntry(rest)).toBeNull();
  });

  it('returns null for an empty id', () => {
    const record = { ...toStoredEntry({ id: 'a', type: 'work', start: 1000, end: null, createdAt: 1000, updatedAt: 2000 }), id: '' };
    expect(parseStoredEntry(record)).toBeNull();
  });

  it('returns null for a non-work/break type', () => {
    const record = { ...toStoredEntry({ id: 'a', type: 'work', start: 1000, end: null, createdAt: 1000, updatedAt: 2000 }), type: 'other' };
    expect(parseStoredEntry(record)).toBeNull();
  });

  it.each(['start', 'createdAt', 'updatedAt'])('returns null when %s is not a number', (field) => {
    const record: Record<string, unknown> = {
      ...toStoredEntry({ id: 'a', type: 'work', start: 1000, end: null, createdAt: 1000, updatedAt: 2000 }),
      [field]: 'not-a-number',
    };
    expect(parseStoredEntry(record)).toBeNull();
  });

  it.each(['start', 'createdAt', 'updatedAt'])('returns null when %s is NaN', (field) => {
    const record: Record<string, unknown> = {
      ...toStoredEntry({ id: 'a', type: 'work', start: 1000, end: null, createdAt: 1000, updatedAt: 2000 }),
      [field]: NaN,
    };
    expect(parseStoredEntry(record)).toBeNull();
  });

  it('returns null when end is missing', () => {
    const { end: _end, ...rest } = toStoredEntry({
      id: 'a',
      type: 'work',
      start: 1000,
      end: null,
      createdAt: 1000,
      updatedAt: 2000,
    });
    expect(parseStoredEntry(rest)).toBeNull();
  });

  it('returns null when end is neither null nor finite', () => {
    const record = { ...toStoredEntry({ id: 'a', type: 'work', start: 1000, end: null, createdAt: 1000, updatedAt: 2000 }), end: 'not-a-number' };
    expect(parseStoredEntry(record)).toBeNull();
  });

  it('returns null when projectId is present but not a string', () => {
    const record = { ...toStoredEntry({ id: 'a', type: 'work', start: 1000, end: null, createdAt: 1000, updatedAt: 2000 }), projectId: 42 };
    expect(parseStoredEntry(record)).toBeNull();
  });

  it('returns null when note is present but not a string', () => {
    const record = { ...toStoredEntry({ id: 'a', type: 'work', start: 1000, end: null, createdAt: 1000, updatedAt: 2000 }), note: 42 };
    expect(parseStoredEntry(record)).toBeNull();
  });
});

describe('parseStoredPreferences', () => {
  it.each(['light', 'dark', 'system'])('accepts theme "%s"', (theme) => {
    expect(parseStoredPreferences({ theme })).toEqual({ theme });
  });

  it.each([{ theme: 'blue' }, {}, null, undefined, 42])('returns null for %j', (value) => {
    expect(parseStoredPreferences(value)).toBeNull();
  });
});

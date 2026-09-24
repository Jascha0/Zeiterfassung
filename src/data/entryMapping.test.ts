import { describe, expect, it } from 'vitest';
import { parseStoredEntry, parseStoredPreferences, toStoredEntry } from './entryMapping';

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

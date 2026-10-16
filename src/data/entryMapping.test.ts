import { describe, expect, it } from 'vitest';
import { parseEntry, parsePreferences, parseProject, type TimestampLike } from './entryMapping';

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

describe('parseProject', () => {
  const VALID_PROJECT = { name: 'A', color: 'blue', archived: false, createdAt: ts(1), updatedAt: ts(2) };

  it('parseProject maps an unknown color key to gray', () => {
    expect(
      parseProject('p1', { name: 'A', color: 'pink', archived: false, createdAt: ts(1), updatedAt: ts(2) }),
    ).toEqual({ id: 'p1', name: 'A', color: 'gray', archived: false, createdAt: 1, updatedAt: 2 });
  });

  it('parses a valid project (happy path)', () => {
    expect(parseProject('p1', VALID_PROJECT)).toEqual({
      id: 'p1',
      name: 'A',
      color: 'blue',
      archived: false,
      createdAt: 1,
      updatedAt: 2,
    });
  });

  it.each<[string, Record<string, unknown>]>([
    ['missing name', { color: 'blue', archived: false, createdAt: ts(1), updatedAt: ts(2) }],
    ['numeric color', { ...VALID_PROJECT, color: 3 }],
    ['archived "yes"', { ...VALID_PROJECT, archived: 'yes' }],
    ['non-timestamp createdAt', { ...VALID_PROJECT, createdAt: 'x' }],
    ['non-finite updatedAt', { ...VALID_PROJECT, updatedAt: ts(Number.NaN) }],
  ])('returns null for %s', (_label, data) => {
    expect(parseProject('p1', data)).toBeNull();
  });

  it('returns null for undefined data', () => {
    expect(parseProject('p1', undefined)).toBeNull();
  });
});

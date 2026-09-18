import { describe, expect, it } from 'vitest';
import { LONG_RUNNING_THRESHOLD_MS, findOpenEntries, hasMultipleOpenEntries, isLongRunningWork } from './warnings';
import type { Entry } from './types';

function entry(overrides: Partial<Entry> & { id: string }): Entry {
  return {
    type: 'work',
    start: 0,
    end: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('findOpenEntries', () => {
  it('returns only entries with end === null', () => {
    const open = entry({ id: 'a', end: null });
    const closed = entry({ id: 'b', end: 100 });
    expect(findOpenEntries([open, closed])).toEqual([open]);
  });

  it('sorts by start descending', () => {
    const older = entry({ id: 'a', start: 100 });
    const newer = entry({ id: 'b', start: 200 });
    expect(findOpenEntries([older, newer]).map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('breaks ties on equal start by id descending', () => {
    const a = entry({ id: 'a1', start: 100 });
    const b = entry({ id: 'a2', start: 100 });
    expect(findOpenEntries([a, b]).map((e) => e.id)).toEqual(['a2', 'a1']);
  });

  it('returns an empty array when there are no open entries', () => {
    expect(findOpenEntries([entry({ id: 'a', end: 5 })])).toEqual([]);
  });
});

describe('hasMultipleOpenEntries', () => {
  it('is false with 0 or 1 open entries', () => {
    expect(hasMultipleOpenEntries([])).toBe(false);
    expect(hasMultipleOpenEntries([entry({ id: 'a' })])).toBe(false);
  });

  it('is true with 2 or more open entries (edge case 24)', () => {
    expect(hasMultipleOpenEntries([entry({ id: 'a' }), entry({ id: 'b' })])).toBe(true);
  });
});

describe('isLongRunningWork', () => {
  it('is false for null entry', () => {
    expect(isLongRunningWork(null, 1_000_000)).toBe(false);
  });

  it('is false for a closed work entry', () => {
    const e = entry({ id: 'a', start: 0, end: 100 });
    expect(isLongRunningWork(e, LONG_RUNNING_THRESHOLD_MS + 1000)).toBe(false);
  });

  it('is false for an open break entry, even past the threshold (edge case 25)', () => {
    const e = entry({ id: 'a', type: 'break', start: 0, end: null });
    expect(isLongRunningWork(e, LONG_RUNNING_THRESHOLD_MS + 1000)).toBe(false);
  });

  it('is false at exactly the 12h boundary (not strictly greater, edge case 25)', () => {
    const e = entry({ id: 'a', type: 'work', start: 0, end: null });
    expect(isLongRunningWork(e, LONG_RUNNING_THRESHOLD_MS)).toBe(false);
  });

  it('is true at 12h + 1ms (edge case 25)', () => {
    const e = entry({ id: 'a', type: 'work', start: 0, end: null });
    expect(isLongRunningWork(e, LONG_RUNNING_THRESHOLD_MS + 1)).toBe(true);
  });

  it('accepts a custom threshold', () => {
    const e = entry({ id: 'a', type: 'work', start: 0, end: null });
    expect(isLongRunningWork(e, 1001, 1000)).toBe(true);
    expect(isLongRunningWork(e, 1000, 1000)).toBe(false);
  });
});

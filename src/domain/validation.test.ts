import { describe, expect, it } from 'vitest';
import {
  dayDetailRange,
  editValidationRange,
  MAX_ENTRY_DURATION_MS,
  resolutionDefaultEnd,
  validateEntry,
  VALIDATION_LOOKBACK_MS,
  type EntryCandidate,
  type ValidationInput,
} from './validation';
import type { Entry } from './types';

function local(y: number, m: number, d: number, h = 0, min = 0, s = 0): number {
  return new Date(y, m - 1, d, h, min, s).getTime();
}

const now = new Date(2026, 9, 16, 15, 0).getTime();

function entry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 'e',
    type: 'work',
    start: 0,
    end: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function candidate(overrides: Partial<EntryCandidate> = {}): EntryCandidate {
  return {
    id: null,
    type: 'work',
    start: local(2026, 10, 16, 8, 0),
    end: local(2026, 10, 16, 12, 0),
    ...overrides,
  };
}

function input(overrides: Partial<ValidationInput> = {}): ValidationInput {
  return {
    candidate: candidate(),
    original: null,
    entries: [],
    openEntries: [],
    now,
    activeOpenEntryId: null,
    ...overrides,
  };
}

describe('constants', () => {
  it('lookback and max duration are 7 days in ms', () => {
    expect(VALIDATION_LOOKBACK_MS).toBe(7 * 86_400_000);
    expect(MAX_ENTRY_DURATION_MS).toBe(VALIDATION_LOOKBACK_MS);
  });
});

describe('validateEntry', () => {
  it('accepts a new work entry 08:00-12:00 with no other entries', () => {
    expect(validateEntry(input())).toEqual({ ok: true });
  });

  it('rejects end equal to start', () => {
    const c = candidate({ start: local(2026, 10, 16, 8), end: local(2026, 10, 16, 8) });
    expect(validateEntry(input({ candidate: c }))).toEqual({ ok: false, reasons: [{ kind: 'endNotAfterStart' }] });
  });

  it('rejects start and end in the future, start first', () => {
    const c = candidate({ start: local(2026, 10, 16, 16), end: local(2026, 10, 16, 17) });
    expect(validateEntry(input({ candidate: c }))).toEqual({
      ok: false,
      reasons: [
        { kind: 'inFuture', field: 'start' },
        { kind: 'inFuture', field: 'end' },
      ],
    });
  });

  it('reports an overlap with an existing closed entry', () => {
    const existing = entry({ id: 'x1', start: local(2026, 10, 16, 9), end: local(2026, 10, 16, 10) });
    expect(validateEntry(input({ entries: [existing] }))).toEqual({
      ok: false,
      reasons: [{ kind: 'overlap', conflict: existing, conflictIsInactiveOpen: false, coversStart: false }],
    });
  });

  it('accepts touching entries', () => {
    const existing = entry({ id: 'x1', start: local(2026, 10, 16, 12), end: local(2026, 10, 16, 13) });
    expect(validateEntry(input({ entries: [existing] }))).toEqual({ ok: true });
  });

  it('finds an overlap with a previous-day entry running past midnight', () => {
    const existing = entry({ id: 'p', start: local(2026, 10, 15, 22), end: local(2026, 10, 16, 2) });
    const c = candidate({ start: local(2026, 10, 16, 1), end: local(2026, 10, 16, 3) });
    const result = validateEntry(input({ candidate: c, entries: [existing] }));
    expect(result).toEqual({
      ok: false,
      reasons: [{ kind: 'overlap', conflict: existing, conflictIsInactiveOpen: false, coversStart: true }],
    });
  });

  it('finds an overlap with the active open entry (extends to now)', () => {
    const active = entry({ id: 'a', start: local(2026, 10, 16, 14), end: null });
    const c = candidate({ start: local(2026, 10, 16, 14, 30), end: local(2026, 10, 16, 14, 45) });
    const result = validateEntry(input({ candidate: c, entries: [active], openEntries: [active], activeOpenEntryId: 'a' }));
    expect(result).toEqual({
      ok: false,
      reasons: [{ kind: 'overlap', conflict: active, conflictIsInactiveOpen: false, coversStart: true }],
    });
  });

  it('finds an older open entry from openEntries only, marked inactive', () => {
    const older = entry({ id: 'old', start: local(2026, 10, 12, 8), end: null });
    const active = entry({ id: 'a', start: local(2026, 10, 16, 14), end: null });
    const c = candidate({ start: local(2026, 10, 16, 8), end: local(2026, 10, 16, 9) });
    const result = validateEntry(
      input({ candidate: c, entries: [active], openEntries: [older, active], activeOpenEntryId: 'a' }),
    );
    expect(result).toEqual({
      ok: false,
      reasons: [{ kind: 'overlap', conflict: older, conflictIsInactiveOpen: true, coversStart: true }],
    });
  });

  it('finds a long closed entry that started days earlier', () => {
    const long = entry({ id: 'l', start: local(2026, 10, 11, 8), end: local(2026, 10, 16, 7, 30) });
    const c = candidate({ start: local(2026, 10, 16, 7), end: local(2026, 10, 16, 8) });
    const result = validateEntry(input({ candidate: c, entries: [long] }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons).toEqual([
        { kind: 'overlap', conflict: long, conflictIsInactiveOpen: false, coversStart: true },
      ]);
    }
  });

  it('rejects a closed candidate longer than 7 days', () => {
    const c = candidate({ start: local(2026, 10, 1, 8), end: local(2026, 10, 8, 8, 0, 1) });
    const result = validateEntry(input({ candidate: c }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons).toContainEqual({ kind: 'tooLong' });
  });

  it('accepts a closed candidate of exactly 7 days', () => {
    const start = local(2026, 10, 1, 8);
    const c = candidate({ start, end: start + 7 * 86_400_000 });
    expect(validateEntry(input({ candidate: c }))).toEqual({ ok: true });
  });

  it('never reports tooLong for an open candidate', () => {
    const active = entry({ id: 'a', start: local(2026, 10, 16, 14), end: null });
    const c: EntryCandidate = { id: 'a', type: 'work', start: now - 7.5 * 86_400_000, end: null };
    const result = validateEntry(
      input({ candidate: c, original: active, entries: [active], openEntries: [active], activeOpenEntryId: 'a' }),
    );
    expect(result).toEqual({ ok: true });
  });

  it('excludes the edited entry itself', () => {
    const x = entry({ id: 'x', start: local(2026, 10, 16, 8), end: local(2026, 10, 16, 12) });
    const c = candidate({ id: 'x', start: local(2026, 10, 16, 8), end: local(2026, 10, 16, 12, 30) });
    expect(validateEntry(input({ candidate: c, original: x, entries: [x] }))).toEqual({ ok: true });
  });

  it('rejects an end on the active open entry', () => {
    const active = entry({ id: 'a', start: local(2026, 10, 16, 14), end: null });
    const c: EntryCandidate = { id: 'a', type: 'work', start: active.start, end: local(2026, 10, 16, 14, 30) };
    const result = validateEntry(
      input({ candidate: c, original: active, entries: [active], openEntries: [active], activeOpenEntryId: 'a' }),
    );
    expect(result).toEqual({ ok: false, reasons: [{ kind: 'fieldNotEditable', field: 'end' }] });
  });

  it('rejects a changed type on the active open entry', () => {
    const active = entry({ id: 'a', start: local(2026, 10, 16, 14), end: null });
    const c: EntryCandidate = { id: 'a', type: 'break', start: active.start, end: null };
    const result = validateEntry(
      input({ candidate: c, original: active, entries: [active], openEntries: [active], activeOpenEntryId: 'a' }),
    );
    expect(result).toEqual({ ok: false, reasons: [{ kind: 'fieldNotEditable', field: 'type' }] });
  });

  it('requires an end for a new candidate', () => {
    const c = candidate({ end: null });
    const result = validateEntry(input({ candidate: c }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reasons[0]).toEqual({ kind: 'endRequired' });
  });

  it('marks coversStart when another entry covers the open entry start', () => {
    const e = entry({ id: 'E', start: local(2026, 10, 16, 10), end: null });
    const active = entry({ id: 'a', start: local(2026, 10, 16, 14), end: null });
    const other = entry({ id: 'o', start: local(2026, 10, 16, 9), end: local(2026, 10, 16, 11) });
    const c: EntryCandidate = { id: 'E', type: 'work', start: local(2026, 10, 16, 10), end: local(2026, 10, 16, 10, 30) };
    const result = validateEntry(
      input({
        candidate: c,
        original: e,
        entries: [other, e, active],
        openEntries: [e, active],
        activeOpenEntryId: 'a',
      }),
    );
    expect(result).toEqual({
      ok: false,
      reasons: [{ kind: 'overlap', conflict: other, conflictIsInactiveOpen: false, coversStart: true }],
    });
  });

  it('ignores a pre-existing overlap between two other entries', () => {
    const o1 = entry({ id: 'o1', start: local(2026, 10, 16, 13), end: local(2026, 10, 16, 14) });
    const o2 = entry({ id: 'o2', start: local(2026, 10, 16, 13, 30), end: local(2026, 10, 16, 14, 30) });
    expect(validateEntry(input({ entries: [o1, o2] }))).toEqual({ ok: true });
  });

  it('sorts multiple conflicts by start then id', () => {
    const b = entry({ id: 'b', start: local(2026, 10, 16, 9), end: local(2026, 10, 16, 10) });
    const a = entry({ id: 'a2', start: local(2026, 10, 16, 9), end: local(2026, 10, 16, 9, 30) });
    const z = entry({ id: 'z', start: local(2026, 10, 16, 7), end: local(2026, 10, 16, 8, 30) });
    const result = validateEntry(input({ entries: [b, a, z] }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons.map((r) => (r.kind === 'overlap' ? r.conflict.id : r.kind))).toEqual(['z', 'a2', 'b']);
    }
  });
});

describe('resolutionDefaultEnd', () => {
  it('returns now without a next entry', () => {
    expect(resolutionDefaultEnd(null, now)).toBe(now);
  });
  it('returns the next entry start when before now', () => {
    expect(resolutionDefaultEnd(entry({ start: now - 1000 }), now)).toBe(now - 1000);
  });
  it('returns now when the next entry starts in the future', () => {
    expect(resolutionDefaultEnd(entry({ start: now + 1000 }), now)).toBe(now);
  });
});

describe('windows', () => {
  const d = new Date(2026, 9, 24).getTime();
  it('dayDetailRange spans 7 days back to two local days ahead', () => {
    expect(dayDetailRange(d)).toEqual({ start: d - 7 * 86_400_000, end: new Date(2026, 9, 26).getTime() });
  });
  it('editValidationRange spans 7 days back to next day + 7 days', () => {
    expect(editValidationRange(d)).toEqual({
      start: d - 7 * 86_400_000,
      end: new Date(2026, 9, 25).getTime() + 7 * 86_400_000,
    });
  });
});

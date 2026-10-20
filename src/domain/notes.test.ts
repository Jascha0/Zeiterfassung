import { describe, expect, it } from 'vitest';
import { NOTE_MAX_LENGTH, normalizeNote, truncateNote } from './notes';

describe('normalizeNote', () => {
  it('trims the note', () => {
    expect(normalizeNote('  x  ')).toEqual({ ok: true, note: 'x' });
  });

  it('maps a whitespace-only note to undefined', () => {
    expect(normalizeNote('   \n ')).toEqual({ ok: true, note: undefined });
    expect(normalizeNote('')).toEqual({ ok: true, note: undefined });
  });

  it('accepts exactly 500 chars', () => {
    expect(NOTE_MAX_LENGTH).toBe(500);
    const note = 'a'.repeat(500);
    expect(normalizeNote(note)).toEqual({ ok: true, note });
  });

  it('rejects 501 chars', () => {
    expect(normalizeNote('a'.repeat(501))).toEqual({ ok: false, reason: 'tooLong' });
  });

  it('accepts 499 chars with surrounding spaces', () => {
    const core = 'b'.repeat(499);
    expect(normalizeNote(`   ${core}   `)).toEqual({ ok: true, note: core });
  });
});

describe('truncateNote', () => {
  it('leaves a short note unchanged', () => {
    expect(truncateNote('Kurz')).toBe('Kurz');
  });

  it('collapses whitespace including newlines', () => {
    expect(truncateNote('  Zeile 1\n\n  Zeile 2  ')).toBe('Zeile 1 Zeile 2');
  });

  it('cuts a long note with a newline to 60 chars plus …', () => {
    const note = `${'a'.repeat(30)}\n${'b'.repeat(40)}`;
    const result = truncateNote(note);
    expect(result.endsWith('…')).toBe(true);
    expect(result).toBe(`${'a'.repeat(30)} ${'b'.repeat(29)}…`);
  });

  it('keeps exactly 60 chars without ellipsis', () => {
    const note = 'c'.repeat(60);
    expect(truncateNote(note)).toBe(note);
  });

  it('trims trailing space before the ellipsis', () => {
    expect(truncateNote('abcd efgh', 5)).toBe('abcd…');
  });

  it('honours a custom maxLength', () => {
    expect(truncateNote('abcdefgh', 3)).toBe('abc…');
  });
});

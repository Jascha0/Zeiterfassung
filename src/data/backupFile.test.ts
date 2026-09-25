import { describe, expect, it } from 'vitest';
import { BACKUP_APP_MARKER, backupFileName, parseBackup, preImportFileName, serializeBackup } from './backupFile';
import { STORE_FORMAT_VERSION } from './persistence';
import type { Entry } from '../domain/types';

const OPEN: Entry = { id: 'a', type: 'work', start: 1000, end: null, createdAt: 1000, updatedAt: 1000 };
const BREAK: Entry = { id: 'b', type: 'break', start: 1500, end: 1800, createdAt: 1500, updatedAt: 1800 };
const WITH_EXTRAS: Entry = {
  id: 'x',
  type: 'work',
  start: 3000,
  end: 4000,
  createdAt: 3000,
  updatedAt: 4000,
  projectId: 'p1',
  note: 'Kunde A',
};

const EXPORTED_AT = 1_700_000_000_000;

function validText(): string {
  return serializeBackup({ entries: [OPEN, BREAK, WITH_EXTRAS], preferences: { theme: 'dark' } }, EXPORTED_AT);
}

/** One valid file with exactly one aspect overridden. An override of `undefined` removes the key,
 *  because JSON.stringify omits undefined values. */
function fileWith(overrides: Record<string, unknown>): string {
  return JSON.stringify({ ...(JSON.parse(validText()) as Record<string, unknown>), ...overrides });
}

describe('serializeBackup / parseBackup', () => {
  it('round-trips entries, preferences and exportedAt (C5)', () => {
    const text = validText();
    const result = parseBackup(text);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content.entries).toEqual([OPEN, BREAK, WITH_EXTRAS]);
    expect(result.content.preferences).toEqual({ theme: 'dark' });
    expect(result.content.exportedAt).toBe(EXPORTED_AT);

    const raw = JSON.parse(text) as Record<string, unknown>;
    expect(raw.app).toBe('zeiterfassung');
    expect(raw.formatVersion).toBe(STORE_FORMAT_VERSION);
    expect(BACKUP_APP_MARKER).toBe('zeiterfassung');
  });

  it('accepts the unmodified helper baseline, so every override below is the only difference', () => {
    expect(parseBackup(fileWith({})).ok).toBe(true);
  });

  it('refuses text that is not JSON', () => {
    expect(parseBackup('kein json')).toEqual({ ok: false, reason: 'not-json' });
  });

  it('refuses a JSON array', () => {
    expect(parseBackup('[]')).toEqual({ ok: false, reason: 'not-a-backup' });
  });

  it.each([
    ['app missing', { app: undefined }],
    ['a foreign app marker', { app: 'andere-app' }],
    ['formatVersion missing', { formatVersion: undefined }],
    ['formatVersion as a string', { formatVersion: '1' }],
    ['exportedAt missing', { exportedAt: undefined }],
    ['exportedAt as text', { exportedAt: 'heute' }],
    ['entries as an object', { entries: {} }],
    ['an entry without updatedAt', { entries: [{ ...OPEN, updatedAt: undefined }] }],
    ['an entry with an unknown type', { entries: [{ ...OPEN, type: 'urlaub' }] }],
    ['two entries with the same id', { entries: [OPEN, { ...OPEN, note: 'zweiter' }] }],
    ['preferences with an unknown theme', { preferences: { theme: 'purple' } }],
  ] as ReadonlyArray<[string, Record<string, unknown>]>)('refuses %s with not-a-backup', (_label, overrides) => {
    expect(parseBackup(fileWith(overrides))).toEqual({ ok: false, reason: 'not-a-backup' });
  });

  it.each([0, 2])('refuses formatVersion %i with the file version', (fileVersion) => {
    expect(parseBackup(fileWith({ formatVersion: fileVersion }))).toEqual({
      ok: false,
      reason: 'wrong-version',
      fileVersion,
    });
  });

  it('accepts an empty entries array with preferences null', () => {
    const result = parseBackup(serializeBackup({ entries: [], preferences: null }, EXPORTED_AT));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content.entries).toEqual([]);
    expect(result.content.preferences).toBeNull();
  });

  it('accepts a file without a preferences key', () => {
    const result = parseBackup(fileWith({ preferences: undefined }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content.entries).toEqual([OPEN, BREAK, WITH_EXTRAS]);
    expect(result.content.preferences).toBeNull();
  });

  it('accepts preferences: null', () => {
    const result = parseBackup(fileWith({ preferences: null }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content.entries).toEqual([OPEN, BREAK, WITH_EXTRAS]);
    expect(result.content.preferences).toBeNull();
  });
});

describe('backupFileName / preImportFileName', () => {
  const instant = new Date(2026, 8, 25, 14, 3).getTime();
  const pattern = /^zeiterfassung-(sicherung|vor-import)-\d{4}-\d{2}-\d{2}-\d{4}\.json$/;

  it('names a manual backup with local date and time', () => {
    expect(backupFileName(instant)).toBe('zeiterfassung-sicherung-2026-09-25-1403.json');
    expect(backupFileName(instant)).toMatch(pattern);
  });

  it('names a pre-import backup so it never looks like a manual one', () => {
    expect(preImportFileName(instant)).toBe('zeiterfassung-vor-import-2026-09-25-1403.json');
    expect(preImportFileName(instant)).toMatch(pattern);
  });
});

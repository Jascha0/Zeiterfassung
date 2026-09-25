import { format } from 'date-fns';
import { parseStoredEntry, parseStoredPreferences, toStoredEntry } from './entryMapping';
import { STORE_FORMAT_VERSION } from './persistence';
import type { Preferences } from './repository';
import type { Entry } from '../domain/types';

/** Structurally the `BackupData` of the Interfaces section. Declared here because task 1 runs before
 *  task 2 adds the exported type to persistence.ts; task 2 replaces this with
 *  `import { STORE_FORMAT_VERSION, type BackupData } from './persistence';`. */
interface BackupData {
  entries: readonly Entry[];
  preferences: Preferences | null;
}

/** Guards against JSON from a foreign tool. */
export const BACKUP_APP_MARKER = 'zeiterfassung';

export interface BackupContent {
  /** Epoch ms the file was written (0010). */
  exportedAt: number;
  entries: Entry[];
  preferences: Preferences | null;
}

export type BackupParseResult =
  | { ok: true; content: BackupContent }
  | { ok: false; reason: 'not-json' }
  | { ok: false; reason: 'not-a-backup' }
  | { ok: false; reason: 'wrong-version'; fileVersion: number };

/** The complete file text. `preferences` is always present, null when there are none (0059).
 *  Always writes STORE_FORMAT_VERSION, never a version read from storage. */
export function serializeBackup(data: BackupData, exportedAt: number): string {
  return JSON.stringify(
    {
      app: BACKUP_APP_MARKER,
      formatVersion: STORE_FORMAT_VERSION,
      exportedAt,
      entries: data.entries.map(toStoredEntry),
      preferences: data.preferences === null ? null : { theme: data.preferences.theme },
    },
    null,
    2,
  );
}

/** Strict, all-or-nothing (0056). One unreadable record refuses the whole file. Never throws. */
export function parseBackup(text: string): BackupParseResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'not-json' };
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, reason: 'not-a-backup' };
  }
  const record = value as Record<string, unknown>;
  if (record.app !== BACKUP_APP_MARKER) return { ok: false, reason: 'not-a-backup' };
  const version = record.formatVersion;
  if (typeof version !== 'number' || !Number.isFinite(version)) return { ok: false, reason: 'not-a-backup' };
  if (version !== STORE_FORMAT_VERSION) return { ok: false, reason: 'wrong-version', fileVersion: version };
  const exportedAt = record.exportedAt;
  if (typeof exportedAt !== 'number' || !Number.isFinite(exportedAt)) return { ok: false, reason: 'not-a-backup' };
  if (!Array.isArray(record.entries)) return { ok: false, reason: 'not-a-backup' };
  const entries: Entry[] = [];
  const ids = new Set<string>();
  for (const raw of record.entries) {
    const entry = parseStoredEntry(raw);
    if (entry === null) return { ok: false, reason: 'not-a-backup' };
    if (ids.has(entry.id)) return { ok: false, reason: 'not-a-backup' };
    ids.add(entry.id);
    entries.push(entry);
  }
  // parseStoredPreferences returns null for absent AND for invalid input (entryMapping.ts:53-57), so
  // presence must be checked explicitly: a present, non-null, unparseable value refuses the file.
  let preferences: Preferences | null = null;
  const rawPreferences = record.preferences;
  if (rawPreferences !== undefined && rawPreferences !== null) {
    preferences = parseStoredPreferences(rawPreferences);
    if (preferences === null) return { ok: false, reason: 'not-a-backup' };
  }
  return { ok: true, content: { exportedAt, entries, preferences } };
}

/** zeiterfassung-sicherung-JJJJ-MM-TT-HHMM.json, local time. */
export function backupFileName(instant: number): string {
  return `zeiterfassung-sicherung-${format(instant, 'yyyy-MM-dd-HHmm')}.json`;
}

/** zeiterfassung-vor-import-JJJJ-MM-TT-HHMM.json, local time — must never look like a manual backup. */
export function preImportFileName(instant: number): string {
  return `zeiterfassung-vor-import-${format(instant, 'yyyy-MM-dd-HHmm')}.json`;
}

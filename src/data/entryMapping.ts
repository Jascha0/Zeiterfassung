import type { Entry, EntryType } from '../domain/types';
import { isThemePreference } from '../theme/theme';
import type { Preferences } from './repository';

/** The shape of one record in the IndexedDB `entries` store. Plain data only — no class, no Date. */
export interface StoredEntry {
  id: string;
  type: EntryType;
  start: number;
  end: number | null;
  createdAt: number;
  updatedAt: number;
  projectId?: string;
  note?: string;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function toStoredEntry(entry: Entry): StoredEntry {
  const record: StoredEntry = {
    id: entry.id,
    type: entry.type,
    start: entry.start,
    end: entry.end,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
  if (entry.projectId !== undefined) record.projectId = entry.projectId;
  if (entry.note !== undefined) record.note = entry.note;
  return record;
}

/** Returns null for anything that is not a well-formed record; never throws. A rejected record is
 *  skipped on load instead of breaking the whole data set. */
export function parseStoredEntry(value: unknown): Entry | null {
  if (typeof value !== 'object' || value === null) return null;
  const { id, type, start, end, createdAt, updatedAt, projectId, note } = value as Record<string, unknown>;
  if (typeof id !== 'string' || id === '') return null;
  if (type !== 'work' && type !== 'break') return null;
  if (!isFiniteNumber(start) || !isFiniteNumber(createdAt) || !isFiniteNumber(updatedAt)) return null;
  if (end !== null && !isFiniteNumber(end)) return null;
  if (projectId !== undefined && typeof projectId !== 'string') return null;
  if (note !== undefined && typeof note !== 'string') return null;

  const entry: Entry = { id, type, start, end: end as number | null, createdAt, updatedAt };
  if (typeof projectId === 'string') entry.projectId = projectId;
  if (typeof note === 'string') entry.note = note;
  return entry;
}

export function parseStoredPreferences(value: unknown): Preferences | null {
  if (typeof value !== 'object' || value === null) return null;
  const { theme } = value as Record<string, unknown>;
  return isThemePreference(theme) ? { theme } : null;
}

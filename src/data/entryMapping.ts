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

export interface TimestampLike {
  toMillis(): number;
}

function isTimestampLike(value: unknown): value is TimestampLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { toMillis?: unknown }).toMillis === 'function'
  );
}

function toMillis(value: TimestampLike): number | null {
  try {
    const millis = value.toMillis();
    return typeof millis === 'number' && Number.isFinite(millis) ? millis : null;
  } catch {
    return null;
  }
}

export function parseEntry(id: string, data: Record<string, unknown> | undefined): Entry | null {
  if (data === undefined) return null;
  const { type, start, end, createdAt, updatedAt, projectId, note } = data;
  if (type !== 'work' && type !== 'break') return null;
  if (!isTimestampLike(start) || !isTimestampLike(createdAt) || !isTimestampLike(updatedAt)) return null;
  if (end !== null && !isTimestampLike(end)) return null;
  if (projectId !== undefined && typeof projectId !== 'string') return null;
  if (note !== undefined && typeof note !== 'string') return null;

  const startMs = toMillis(start);
  const createdAtMs = toMillis(createdAt);
  const updatedAtMs = toMillis(updatedAt);
  const endMs = end === null ? null : toMillis(end);
  if (startMs === null || createdAtMs === null || updatedAtMs === null) return null;
  if (end !== null && endMs === null) return null;

  const entry: Entry = { id, type, start: startMs, end: endMs, createdAt: createdAtMs, updatedAt: updatedAtMs };
  if (typeof projectId === 'string') entry.projectId = projectId;
  if (typeof note === 'string') entry.note = note;
  return entry;
}

export function parsePreferences(data: Record<string, unknown> | undefined): Preferences | null {
  if (data === undefined || !isThemePreference(data.theme)) return null;
  return { theme: data.theme };
}

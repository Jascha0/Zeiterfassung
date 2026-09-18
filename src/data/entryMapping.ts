import type { Entry } from '../domain/types';
import { isThemePreference } from '../theme/theme';
import type { Preferences } from './repository';

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

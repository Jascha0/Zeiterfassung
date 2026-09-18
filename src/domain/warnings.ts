import type { Entry } from './types';

export const LONG_RUNNING_THRESHOLD_MS = 12 * 60 * 60 * 1000;

export function findOpenEntries(entries: readonly Entry[]): Entry[] {
  return entries
    .filter((entry) => entry.end === null)
    .sort((a, b) => {
      if (a.start !== b.start) return b.start - a.start;
      if (a.id === b.id) return 0;
      return a.id < b.id ? 1 : -1;
    });
}

export function hasMultipleOpenEntries(entries: readonly Entry[]): boolean {
  return findOpenEntries(entries).length > 1;
}

export function isLongRunningWork(
  entry: Entry | null,
  now: number,
  thresholdMs: number = LONG_RUNNING_THRESHOLD_MS,
): boolean {
  return entry !== null && entry.type === 'work' && entry.end === null && now - entry.start > thresholdMs;
}

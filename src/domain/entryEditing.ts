import type { Entry, EntryType, TimeRange } from './types';
import { parseTimeOfDay, resolveEntryInstants } from './timeInput';
import { LONG_RUNNING_THRESHOLD_MS } from './warnings';

export const VALIDATION_MESSAGES = {
  endNotAfterStart: 'Das Ende muss nach dem Start liegen.',
  overlap: 'Der Eintrag überschneidet sich mit einem anderen Eintrag.',
  future: 'Zeiten in der Zukunft sind nicht möglich.',
  tooLong: 'Ein Eintrag darf höchstens 24 Stunden dauern.',
  invalidTime: 'Bitte eine Uhrzeit im Format HH:MM eingeben.',
} as const;

export const FUTURE_TOLERANCE_MS = 2 * 60 * 1000;
export const MAX_ENTRY_DURATION_MS = 24 * 60 * 60 * 1000;

export type EntryFieldName = 'start' | 'end';

export interface EntryFieldError {
  field: EntryFieldName;
  message: string;
}

export interface EntryDraft {
  type: EntryType;
  startText: string;
  endText: string;
}

export interface EntryValues {
  type: EntryType;
  start: number;
  end: number | null;
}

export interface CheckOptions {
  comparisonEntries: readonly Entry[];
  excludeEntryId: string | null;
  now: number;
  checkOverlap: boolean;
}

export interface EntryMarkers {
  open: boolean;
  longRunning: boolean;
  overlap: boolean;
}

export function entryExtent(entry: Pick<Entry, 'start' | 'end'>, now: number): TimeRange {
  return { start: entry.start, end: entry.end ?? Math.max(now, entry.start) };
}

export function entriesOverlap(
  a: Pick<Entry, 'start' | 'end'>,
  b: Pick<Entry, 'start' | 'end'>,
  now: number,
): boolean {
  const ea = entryExtent(a, now);
  const eb = entryExtent(b, now);
  return ea.start < eb.end && eb.start < ea.end;
}

export function isLongEntry(entry: Pick<Entry, 'start' | 'end'>, now: number): boolean {
  return entryExtent(entry, now).end - entry.start > LONG_RUNNING_THRESHOLD_MS;
}

export function entryMarkers(
  entry: Entry,
  comparisonEntries: readonly Entry[],
  now: number,
): EntryMarkers {
  return {
    open: entry.end === null,
    longRunning: isLongEntry(entry, now),
    overlap: comparisonEntries.some(
      (other) => other.id !== entry.id && entriesOverlap(entry, other, now),
    ),
  };
}

export function resolveDraft(
  draft: EntryDraft,
  dayStart: number,
  allowOpenEnd: boolean,
): { ok: true; value: EntryValues } | { ok: false; error: EntryFieldError } {
  const start = parseTimeOfDay(draft.startText);
  if (start === null) {
    return { ok: false, error: { field: 'start', message: VALIDATION_MESSAGES.invalidTime } };
  }
  if (draft.endText.trim() === '' && allowOpenEnd) {
    const instants = resolveEntryInstants(dayStart, start, null);
    return { ok: true, value: { type: draft.type, start: instants.start, end: null } };
  }
  const end = parseTimeOfDay(draft.endText);
  if (end === null) {
    return { ok: false, error: { field: 'end', message: VALIDATION_MESSAGES.invalidTime } };
  }
  const instants = resolveEntryInstants(dayStart, start, end);
  return { ok: true, value: { type: draft.type, start: instants.start, end: instants.end } };
}

export function checkEntryValues(values: EntryValues, options: CheckOptions): EntryFieldError | null {
  if (values.end !== null && values.end <= values.start) {
    return { field: 'end', message: VALIDATION_MESSAGES.endNotAfterStart };
  }
  const futureLimit = options.now + FUTURE_TOLERANCE_MS;
  if (values.start > futureLimit) {
    return { field: 'start', message: VALIDATION_MESSAGES.future };
  }
  if (values.end !== null && values.end > futureLimit) {
    return { field: 'end', message: VALIDATION_MESSAGES.future };
  }
  if (values.end !== null && values.end - values.start > MAX_ENTRY_DURATION_MS) {
    return { field: 'end', message: VALIDATION_MESSAGES.tooLong };
  }
  if (
    options.checkOverlap &&
    options.comparisonEntries.some(
      (other) =>
        other.id !== options.excludeEntryId &&
        entriesOverlap({ start: values.start, end: values.end }, other, options.now),
    )
  ) {
    return { field: 'start', message: VALIDATION_MESSAGES.overlap };
  }
  return null;
}

export function validateEntryDraft(
  draft: EntryDraft,
  input: {
    dayStart: number;
    allowOpenEnd: boolean;
    comparisonEntries: readonly Entry[];
    excludeEntryId: string | null;
    now: number;
  },
): { ok: true; value: EntryValues } | { ok: false; error: EntryFieldError } {
  const resolved = resolveDraft(draft, input.dayStart, input.allowOpenEnd);
  if (!resolved.ok) return resolved;
  const error = checkEntryValues(resolved.value, {
    comparisonEntries: input.comparisonEntries,
    excludeEntryId: input.excludeEntryId,
    now: input.now,
    checkOverlap: true,
  });
  if (error !== null) return { ok: false, error };
  return resolved;
}

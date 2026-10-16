import { shiftDay } from './calendar';
import type { Entry, EntryType, TimeRange } from './types';

export const VALIDATION_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_ENTRY_DURATION_MS = VALIDATION_LOOKBACK_MS;

export interface EntryCandidate {
  id: string | null;
  type: EntryType;
  start: number;
  end: number | null;
}

export type ValidationReason =
  | { kind: 'endRequired' }
  | { kind: 'fieldNotEditable'; field: 'type' | 'end' }
  | { kind: 'endNotAfterStart' }
  | { kind: 'inFuture'; field: 'start' | 'end' }
  | { kind: 'tooLong' }
  | { kind: 'overlap'; conflict: Entry; conflictIsInactiveOpen: boolean; coversStart: boolean };

export interface ValidationInput {
  candidate: EntryCandidate;
  original: Entry | null;
  entries: readonly Entry[];
  openEntries: readonly Entry[];
  now: number;
  activeOpenEntryId: string | null;
}

export type ValidationResult = { ok: true } | { ok: false; reasons: ValidationReason[] };

export function validateEntry(input: ValidationInput): ValidationResult {
  const { candidate, original, entries, openEntries, now, activeOpenEntryId } = input;
  const reasons: ValidationReason[] = [];
  const editingOpen = original !== null && original.end === null;

  if (candidate.end === null && !editingOpen) reasons.push({ kind: 'endRequired' });
  if (editingOpen) {
    if (candidate.type !== original.type) reasons.push({ kind: 'fieldNotEditable', field: 'type' });
    if (original.id === activeOpenEntryId && candidate.end !== null) {
      reasons.push({ kind: 'fieldNotEditable', field: 'end' });
    }
  }
  if (candidate.end !== null && candidate.end <= candidate.start) reasons.push({ kind: 'endNotAfterStart' });
  if (candidate.start > now) reasons.push({ kind: 'inFuture', field: 'start' });
  if (candidate.end !== null && candidate.end > now) reasons.push({ kind: 'inFuture', field: 'end' });
  if (candidate.end !== null && candidate.end - candidate.start > MAX_ENTRY_DURATION_MS) {
    reasons.push({ kind: 'tooLong' });
  }

  const s = candidate.start;
  const e = candidate.end ?? now;
  if (e > s) {
    const others = new Map<string, Entry>();
    for (const entry of entries) others.set(entry.id, entry);
    for (const entry of openEntries) others.set(entry.id, entry);
    if (candidate.id !== null) others.delete(candidate.id);
    const conflicts = [...others.values()]
      .filter((other) => s < (other.end ?? now) && other.start < e)
      .sort((a, b) => (a.start !== b.start ? a.start - b.start : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    for (const conflict of conflicts) {
      const conflictEnd = conflict.end ?? now;
      reasons.push({
        kind: 'overlap',
        conflict,
        conflictIsInactiveOpen: conflict.end === null && conflict.id !== activeOpenEntryId,
        coversStart: conflict.start <= s && conflictEnd > s,
      });
    }
  }

  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

export function resolutionDefaultEnd(nextEntry: Entry | null, now: number): number {
  return nextEntry === null ? now : Math.min(nextEntry.start, now);
}

export function dayDetailRange(dayStart: number): TimeRange {
  return { start: dayStart - VALIDATION_LOOKBACK_MS, end: shiftDay(dayStart, 2) };
}

export function editValidationRange(dayStart: number): TimeRange {
  return { start: dayStart - VALIDATION_LOOKBACK_MS, end: shiftDay(dayStart, 1) + VALIDATION_LOOKBACK_MS };
}

import { shiftDay } from './calendar';
import { localDateTimeToInstant, toDateKey, toTimeValue } from './localTime';
import type { Entry, EntryChanges, EntryLabels, EntryType, FieldChange } from './types';

export type EndInputKind = 'none' | 'nextDayFlag' | 'date';

export interface EntryFormValues {
  type: EntryType;
  startTime: string;
  endTime: string;
  endNextDay: boolean;
  endDate: string;
}

export interface EntryFormContext {
  dayStart: number;
  endInput: EndInputKind;
  original: { start: number; end: number | null } | null;
  startTouched: boolean;
  endTouched: boolean;
  endRequired: boolean;
}

export type FormFieldErrorKind = 'required' | 'invalidFormat' | 'nonexistentTime';
export interface FormFieldError {
  field: 'start' | 'end';
  kind: FormFieldErrorKind;
  dateKey: string;
}

export type ParsedEntryTimes = { ok: true; start: number; end: number | null } | { ok: false; errors: FormFieldError[] };

export function endInputKindFor(
  entry: Entry | null,
  activeOpenEntryId: string | null,
  dayStart: number,
  resolve: boolean,
): EndInputKind {
  if (resolve) return 'date';
  if (entry === null) return 'nextDayFlag';
  if (entry.end === null) return entry.id === activeOpenEntryId ? 'none' : 'date';
  return entry.end >= shiftDay(dayStart, 2) ? 'date' : 'nextDayFlag';
}

export function initialFormValues(entry: Entry | null, dayStart: number, endPrefill: number | null): EntryFormValues {
  return {
    type: entry?.type ?? 'work',
    startTime: entry !== null ? toTimeValue(entry.start) : '',
    endTime: endPrefill !== null ? toTimeValue(endPrefill) : '',
    endNextDay: endPrefill !== null && endPrefill >= shiftDay(dayStart, 1),
    endDate: toDateKey(endPrefill ?? dayStart),
  };
}

export function parseEntryTimes(values: EntryFormValues, context: EntryFormContext): ParsedEntryTimes {
  const errors: FormFieldError[] = [];
  const { dayStart, endInput, original, startTouched, endTouched, endRequired } = context;

  let start = 0;
  if (!startTouched && original !== null) {
    start = original.start;
  } else if (values.startTime === '') {
    errors.push({ field: 'start', kind: 'required', dateKey: '' });
  } else {
    const dateKey = toDateKey(dayStart);
    const result = localDateTimeToInstant(dateKey, values.startTime);
    if (result.ok) start = result.instant;
    else errors.push({ field: 'start', kind: result.error, dateKey });
  }

  let end: number | null = null;
  if (endInput === 'none') {
    end = original?.end ?? null;
  } else if (!endTouched && original !== null) {
    end = original.end;
    if (end === null && endRequired) errors.push({ field: 'end', kind: 'required', dateKey: '' });
  } else if (values.endTime === '') {
    if (endRequired) errors.push({ field: 'end', kind: 'required', dateKey: '' });
  } else {
    const dateKey =
      endInput === 'nextDayFlag' ? toDateKey(values.endNextDay ? shiftDay(dayStart, 1) : dayStart) : values.endDate;
    if (dateKey === '') {
      errors.push({ field: 'end', kind: 'required', dateKey: '' });
    } else {
      const result = localDateTimeToInstant(dateKey, values.endTime);
      if (result.ok) end = result.instant;
      else errors.push({ field: 'end', kind: result.error, dateKey });
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, start, end };
}

export function entryChanges(
  original: Entry,
  next: { type: EntryType; start: number; end: number | null },
  updatedAt: number,
  labels?: EntryLabels,
): EntryChanges | null {
  const typeChanged = next.type !== original.type;
  const startChanged = next.start !== original.start;
  const endChanged = next.end !== null && next.end !== original.end;
  const desired: EntryLabels =
    next.type === 'break'
      ? { projectId: undefined, note: undefined }
      : (labels ?? { projectId: original.projectId, note: original.note });
  const projectId = fieldChange(original.projectId, desired.projectId);
  const note = fieldChange(original.note, desired.note);
  if (!typeChanged && !startChanged && !endChanged && projectId === null && note === null) return null;
  const changes: EntryChanges = {
    ...(typeChanged ? { type: next.type } : {}),
    ...(startChanged ? { start: next.start } : {}),
    ...(endChanged && next.end !== null ? { end: next.end } : {}),
    ...(projectId !== null ? { projectId } : {}),
    ...(note !== null ? { note } : {}),
    updatedAt,
  };
  return changes;
}

function fieldChange(original: string | undefined, desired: string | undefined): FieldChange<string> | null {
  if (desired === original) return null;
  return desired === undefined ? { kind: 'remove' } : { kind: 'set', value: desired };
}

export function changesTouchTime(changes: EntryChanges): boolean {
  return changes.type !== undefined || changes.start !== undefined || changes.end !== undefined;
}

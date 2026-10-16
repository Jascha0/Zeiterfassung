import { shiftDay } from './calendar';
import { localDateTimeToInstant, toDateKey, toTimeValue } from './localTime';
import type { Entry, EntryChanges, EntryType } from './types';

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
): EntryChanges | null {
  const typeChanged = next.type !== original.type;
  const startChanged = next.start !== original.start;
  const endChanged = next.end !== null && next.end !== original.end;
  if (!typeChanged && !startChanged && !endChanged) return null;
  const changes: EntryChanges = {
    ...(typeChanged ? { type: next.type } : {}),
    ...(startChanged ? { start: next.start } : {}),
    ...(endChanged && next.end !== null ? { end: next.end } : {}),
    updatedAt,
  };
  return changes;
}

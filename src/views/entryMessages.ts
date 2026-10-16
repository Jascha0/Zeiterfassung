import type { Entry, EntryType } from '../domain/types';
import { formatClock, formatHoursMinutes, formatShortDate } from '../domain/format';
import { entryDurationMs } from '../domain/totals';
import { toDateKey, formatDateKey } from '../domain/localTime';
import type { ValidationReason } from '../domain/validation';
import type { FormFieldError } from '../domain/entryForm';

export function typeLabel(type: EntryType): string {
  return type === 'work' ? 'Arbeit' : 'Pause';
}

export function entryLine(entry: Entry, now: number): string {
  const { start, end } = entry;
  const endText =
    end === null
      ? 'läuft'
      : toDateKey(end) === toDateKey(start)
        ? formatClock(end)
        : `${formatShortDate(end)} ${formatClock(end)}`;
  return `${typeLabel(entry.type)} ${formatClock(start)} – ${endText} (${formatHoursMinutes(entryDurationMs(entry, now))})`;
}

export function describeEntry(entry: Entry): string {
  const { start, end } = entry;
  if (end === null) {
    return `${typeLabel(entry.type)} ${formatShortDate(start)} ab ${formatClock(start)} (läuft)`;
  }
  const endText =
    toDateKey(end) === toDateKey(start) ? formatClock(end) : `${formatShortDate(end)} ${formatClock(end)}`;
  return `${typeLabel(entry.type)} ${formatShortDate(start)} ${formatClock(start)}–${endText}`;
}

export function formFieldErrorMessage(error: FormFieldError): string {
  if (error.kind === 'nonexistentTime') {
    return `Diese Uhrzeit gibt es am ${formatDateKey(error.dateKey)} wegen der Zeitumstellung nicht.`;
  }
  if (error.kind === 'required') {
    return error.field === 'start' ? 'Bitte gib einen Beginn an.' : 'Bitte gib ein Ende an.';
  }
  return error.field === 'start'
    ? 'Der Beginn ist keine gültige Uhrzeit.'
    : 'Das Ende ist kein gültiges Datum oder keine gültige Uhrzeit.';
}

export function validationReasonMessage(
  reason: ValidationReason,
  context: { candidateIsOpenEntry: boolean },
): string {
  switch (reason.kind) {
    case 'endRequired':
      return 'Bitte gib ein Ende an.';
    case 'fieldNotEditable':
      return reason.field === 'type'
        ? 'Der Typ eines offenen Eintrags kann nicht geändert werden.'
        : 'Beim laufenden Eintrag kann nur der Beginn geändert werden. Beende ihn über den Timer.';
    case 'endNotAfterStart':
      return 'Das Ende muss nach dem Beginn liegen.';
    case 'inFuture':
      return reason.field === 'start'
        ? 'Der Beginn darf nicht in der Zukunft liegen.'
        : 'Das Ende darf nicht in der Zukunft liegen.';
    case 'tooLong':
      return 'Ein Eintrag darf höchstens 7 Tage dauern.';
    case 'overlap': {
      let message = `Überschneidet sich mit: ${describeEntry(reason.conflict)}.`;
      if (reason.conflictIsInactiveOpen) {
        message +=
          ' Das ist ein älterer offener Eintrag – beende oder lösche ihn zuerst (Timer → „Offene Einträge bereinigen“).';
      }
      if (reason.coversStart && context.candidateIsOpenEntry) {
        message += ' Jedes mögliche Ende würde sich überschneiden – bitte lösche diesen offenen Eintrag mit „Löschen“.';
      }
      return message;
    }
  }
}

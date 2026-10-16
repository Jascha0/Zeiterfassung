import { describe, expect, it } from 'vitest';
import type { Entry } from '../domain/types';
import type { FormFieldError } from '../domain/entryForm';
import type { ValidationReason } from '../domain/validation';
import { describeEntry, entryLine, formFieldErrorMessage, typeLabel, validationReasonMessage } from './entryMessages';

function entry(overrides: Partial<Entry> & { start: number }): Entry {
  return {
    id: 'e1',
    type: 'work',
    end: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('typeLabel', () => {
  it('maps entry types to German labels', () => {
    expect(typeLabel('work')).toBe('Arbeit');
    expect(typeLabel('break')).toBe('Pause');
  });
});

describe('entryLine', () => {
  it('formats a closed same-day entry', () => {
    const e = entry({
      start: new Date(2026, 9, 16, 8, 0).getTime(),
      end: new Date(2026, 9, 16, 12, 0).getTime(),
    });
    expect(entryLine(e, Date.now())).toBe('Arbeit 08:00 – 12:00 (4:00)');
  });

  it('formats an entry crossing midnight', () => {
    const e = entry({
      start: new Date(2026, 9, 16, 22, 0).getTime(),
      end: new Date(2026, 9, 17, 2, 0).getTime(),
    });
    expect(entryLine(e, Date.now())).toBe('Arbeit 22:00 – 17.10.2026 02:00 (4:00)');
  });

  it('formats a running entry', () => {
    const start = new Date(2026, 9, 16, 12, 0).getTime();
    const e = entry({ type: 'break', start, end: null });
    const now = start + 15 * 60_000;
    expect(entryLine(e, now)).toBe('Pause 12:00 – läuft (0:15)');
  });
});

describe('describeEntry', () => {
  it('describes a closed same-day entry', () => {
    const e = entry({
      start: new Date(2026, 9, 16, 8, 0).getTime(),
      end: new Date(2026, 9, 16, 12, 0).getTime(),
    });
    expect(describeEntry(e)).toBe('Arbeit 16.10.2026 08:00–12:00');
  });

  it('describes a closed entry spanning two days', () => {
    const e = entry({
      start: new Date(2026, 9, 15, 22, 0).getTime(),
      end: new Date(2026, 9, 16, 2, 0).getTime(),
    });
    expect(describeEntry(e)).toBe('Arbeit 15.10.2026 22:00–16.10.2026 02:00');
  });

  it('describes an open entry', () => {
    const e = entry({ start: new Date(2026, 9, 14, 8, 0).getTime(), end: null });
    expect(describeEntry(e)).toBe('Arbeit 14.10.2026 ab 08:00 (läuft)');
  });
});

describe('formFieldErrorMessage', () => {
  it.each<[FormFieldError, string]>([
    [{ field: 'start', kind: 'required', dateKey: '' }, 'Bitte gib einen Beginn an.'],
    [{ field: 'end', kind: 'required', dateKey: '' }, 'Bitte gib ein Ende an.'],
    [{ field: 'start', kind: 'invalidFormat', dateKey: '' }, 'Der Beginn ist keine gültige Uhrzeit.'],
    [
      { field: 'end', kind: 'invalidFormat', dateKey: '' },
      'Das Ende ist kein gültiges Datum oder keine gültige Uhrzeit.',
    ],
    [
      { field: 'start', kind: 'nonexistentTime', dateKey: '2026-03-29' },
      'Diese Uhrzeit gibt es am 29.03.2026 wegen der Zeitumstellung nicht.',
    ],
    [
      { field: 'end', kind: 'nonexistentTime', dateKey: '2026-03-29' },
      'Diese Uhrzeit gibt es am 29.03.2026 wegen der Zeitumstellung nicht.',
    ],
  ])('maps %o to %s', (error, message) => {
    expect(formFieldErrorMessage(error)).toBe(message);
  });
});

describe('validationReasonMessage', () => {
  const open = { candidateIsOpenEntry: true };
  const closed = { candidateIsOpenEntry: false };

  it.each<[ValidationReason, string]>([
    [{ kind: 'endRequired' }, 'Bitte gib ein Ende an.'],
    [{ kind: 'fieldNotEditable', field: 'type' }, 'Der Typ eines offenen Eintrags kann nicht geändert werden.'],
    [
      { kind: 'fieldNotEditable', field: 'end' },
      'Beim laufenden Eintrag kann nur der Beginn geändert werden. Beende ihn über den Timer.',
    ],
    [{ kind: 'endNotAfterStart' }, 'Das Ende muss nach dem Beginn liegen.'],
    [{ kind: 'inFuture', field: 'start' }, 'Der Beginn darf nicht in der Zukunft liegen.'],
    [{ kind: 'inFuture', field: 'end' }, 'Das Ende darf nicht in der Zukunft liegen.'],
    [{ kind: 'tooLong' }, 'Ein Eintrag darf höchstens 7 Tage dauern.'],
  ])('maps %o to %s', (reason, message) => {
    expect(validationReasonMessage(reason, closed)).toBe(message);
  });

  it('describes an overlap with a closed conflict', () => {
    const conflict = entry({
      id: 'c1',
      start: new Date(2026, 9, 14, 9, 0).getTime(),
      end: new Date(2026, 9, 14, 10, 0).getTime(),
    });
    const reason: ValidationReason = { kind: 'overlap', conflict, conflictIsInactiveOpen: false, coversStart: false };
    expect(validationReasonMessage(reason, closed)).toBe('Überschneidet sich mit: Arbeit 14.10.2026 09:00–10:00.');
  });

  it('appends the inactive-open hint', () => {
    const conflict = entry({ id: 'c1', start: new Date(2026, 9, 10, 8, 0).getTime(), end: null });
    const reason: ValidationReason = { kind: 'overlap', conflict, conflictIsInactiveOpen: true, coversStart: false };
    expect(validationReasonMessage(reason, closed)).toBe(
      'Überschneidet sich mit: Arbeit 10.10.2026 ab 08:00 (läuft). Das ist ein älterer offener Eintrag – beende oder lösche ihn zuerst (Timer → „Offene Einträge bereinigen“).',
    );
  });

  it('appends the coversStart hint only when the candidate is itself an open entry, after the inactive-open hint', () => {
    const conflict = entry({ id: 'c1', start: new Date(2026, 9, 10, 8, 0).getTime(), end: null });
    const reason: ValidationReason = { kind: 'overlap', conflict, conflictIsInactiveOpen: true, coversStart: true };
    expect(validationReasonMessage(reason, open)).toBe(
      'Überschneidet sich mit: Arbeit 10.10.2026 ab 08:00 (läuft). Das ist ein älterer offener Eintrag – beende oder lösche ihn zuerst (Timer → „Offene Einträge bereinigen“). Jedes mögliche Ende würde sich überschneiden – bitte lösche diesen offenen Eintrag mit „Löschen“.',
    );
    expect(validationReasonMessage(reason, closed)).toBe(
      'Überschneidet sich mit: Arbeit 10.10.2026 ab 08:00 (läuft). Das ist ein älterer offener Eintrag – beende oder lösche ihn zuerst (Timer → „Offene Einträge bereinigen“).',
    );
  });

  it('appends only the coversStart hint when the conflict is not an inactive open entry', () => {
    const conflict = entry({ id: 'c1', start: new Date(2026, 9, 16, 7, 0).getTime(), end: null });
    const reason: ValidationReason = { kind: 'overlap', conflict, conflictIsInactiveOpen: false, coversStart: true };
    expect(validationReasonMessage(reason, open)).toBe(
      'Überschneidet sich mit: Arbeit 16.10.2026 ab 07:00 (läuft). Jedes mögliche Ende würde sich überschneiden – bitte lösche diesen offenen Eintrag mit „Löschen“.',
    );
  });
});

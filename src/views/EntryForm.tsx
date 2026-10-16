import { useId, useState } from 'react';
import { useServices } from '../app/ServicesContext';
import { useToast } from '../app/ToastContext';
import { mapWriteError } from '../data/writeErrors';
import { endInputKindFor, entryChanges, initialFormValues, parseEntryTimes, type EntryFormValues } from '../domain/entryForm';
import { formatClock, formatShortDate } from '../domain/format';
import { deriveTimerStatus } from '../domain/timer';
import { dayRange } from '../domain/totals';
import type { Entry, EntryType } from '../domain/types';
import { editValidationRange, validateEntry, type EntryCandidate } from '../domain/validation';
import { useEntriesInRange } from '../hooks/useEntriesInRange';
import { formFieldErrorMessage, validationReasonMessage } from './entryMessages';

export type EntryFormMode =
  | { kind: 'add'; dayStart: number }
  | { kind: 'edit'; dayStart: number; entry: Entry }
  | { kind: 'resolve'; entry: Entry; defaultEnd: number };

export interface EntryFormProps {
  uid: string;
  mode: EntryFormMode;
  baseEntries: readonly Entry[];
  openEntries: readonly Entry[];
  onDone: () => void;
}

const TYPE_OPTIONS: ReadonlyArray<{ value: EntryType; label: string }> = [
  { value: 'work', label: 'Arbeit' },
  { value: 'break', label: 'Pause' },
];

const FORM_LABELS: Record<EntryFormMode['kind'], string> = {
  add: 'Neuer Eintrag',
  edit: 'Eintrag bearbeiten',
  resolve: 'Eintrag beenden',
};

export function EntryForm(props: EntryFormProps): React.JSX.Element {
  const { uid, mode, baseEntries, openEntries, onDone } = props;
  const { entries } = useServices();
  const { showToast } = useToast();
  const id = useId();

  const entry = mode.kind === 'add' ? null : mode.entry;
  const dayStart = mode.kind === 'resolve' ? dayRange(mode.entry.start).start : mode.dayStart;
  const activeId = deriveTimerStatus(openEntries).activeEntry?.id ?? null;
  const endInput = endInputKindFor(entry, activeId, dayStart, mode.kind === 'resolve');
  const showType = mode.kind !== 'resolve' && (entry === null || entry.end !== null);
  const showStart = mode.kind !== 'resolve';
  const endRequired = mode.kind !== 'edit' || entry === null || entry.end !== null;
  const isActiveOpen = entry !== null && entry.end === null && entry.id === activeId;

  const [defaultEnd] = useState<number | null>(() => (mode.kind === 'resolve' ? mode.defaultEnd : null));
  const [values, setValues] = useState<EntryFormValues>(() =>
    initialFormValues(entry, dayStart, mode.kind === 'resolve' ? mode.defaultEnd : (entry?.end ?? null)),
  );
  const [startTouched, setStartTouched] = useState(false);
  const [endTouched, setEndTouched] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);

  const extended = useEntriesInRange(uid, endInput === 'date' ? editValidationRange(dayStart) : null);

  const errorsId = `${id}-errors`;
  const describedBy = messages.length > 0 ? errorsId : undefined;

  const setValue = <K extends keyof EntryFormValues>(key: K, value: EntryFormValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const now = Date.now();
    const parsed = parseEntryTimes(values, {
      dayStart,
      endInput,
      original: entry === null ? null : { start: entry.start, end: mode.kind === 'resolve' ? defaultEnd : entry.end },
      startTouched,
      endTouched,
      endRequired,
    });
    if (!parsed.ok) {
      setMessages(parsed.errors.map(formFieldErrorMessage));
      return;
    }

    const candidate: EntryCandidate = {
      id: entry?.id ?? null,
      type: showType || entry === null ? values.type : entry.type,
      start: parsed.start,
      end: parsed.end,
    };
    const result = validateEntry({
      candidate,
      original: entry,
      entries: endInput === 'date' ? extended.entries : baseEntries,
      openEntries,
      now,
      activeOpenEntryId: activeId,
    });
    if (!result.ok) {
      const candidateIsOpenEntry = entry !== null && entry.end === null;
      setMessages(result.reasons.map((reason) => validationReasonMessage(reason, { candidateIsOpenEntry })));
      return;
    }

    if (entry === null) {
      entries
        .createEntry(uid, {
          type: candidate.type,
          start: candidate.start,
          end: candidate.end as number,
          createdAt: now,
          updatedAt: now,
        })
        .catch((error: unknown) => showToast(mapWriteError(error)));
    } else {
      const changes = entryChanges(entry, candidate, now);
      if (changes !== null) {
        entries.updateEntry(uid, entry.id, changes).catch((error: unknown) => showToast(mapWriteError(error)));
      }
    }
    setMessages([]);
    onDone();
  };

  let info: string | null = null;
  if (mode.kind === 'resolve') info = `Beginn: ${formatShortDate(mode.entry.start)} ${formatClock(mode.entry.start)}`;
  else if (isActiveOpen) info = 'Dieser Eintrag läuft. Nur der Beginn kann geändert werden.';
  else if (entry !== null && entry.end === null) {
    info = 'Offen – nicht aktiv. Gib ein Ende an, um den Eintrag abzuschließen.';
  }

  return (
    <form className="entry-form" aria-label={FORM_LABELS[mode.kind]} noValidate onSubmit={handleSubmit}>
      {info !== null && <p>{info}</p>}
      {showType && (
        <fieldset className="theme-options">
          <legend>Typ</legend>
          {TYPE_OPTIONS.map((option) => (
            <label key={option.value} className="radio">
              <input
                type="radio"
                name={`${id}-type`}
                value={option.value}
                checked={values.type === option.value}
                aria-describedby={describedBy}
                onChange={() => setValue('type', option.value)}
              />
              {option.label}
            </label>
          ))}
        </fieldset>
      )}
      {showStart && (
        <div className="field">
          <label htmlFor={`${id}-start`}>Beginn</label>
          <input
            id={`${id}-start`}
            type="time"
            value={values.startTime}
            aria-describedby={describedBy}
            onChange={(event) => {
              setValue('startTime', event.target.value);
              setStartTouched(true);
            }}
          />
        </div>
      )}
      {endInput === 'date' && (
        <div className="field">
          <label htmlFor={`${id}-end-date`}>Enddatum</label>
          <input
            id={`${id}-end-date`}
            type="date"
            value={values.endDate}
            aria-describedby={describedBy}
            onChange={(event) => {
              setValue('endDate', event.target.value);
              setEndTouched(true);
            }}
          />
        </div>
      )}
      {endInput !== 'none' && (
        <div className="field">
          <label htmlFor={`${id}-end`}>Ende</label>
          <input
            id={`${id}-end`}
            type="time"
            value={values.endTime}
            aria-describedby={describedBy}
            onChange={(event) => {
              setValue('endTime', event.target.value);
              setEndTouched(true);
            }}
          />
        </div>
      )}
      {endInput === 'nextDayFlag' && (
        <label className="radio">
          <input
            type="checkbox"
            checked={values.endNextDay}
            aria-describedby={describedBy}
            onChange={(event) => {
              setValue('endNextDay', event.target.checked);
              setEndTouched(true);
            }}
          />
          endet am Folgetag
        </label>
      )}
      {extended.error !== null && <p role="alert">{extended.error}</p>}
      {messages.length > 0 && (
        <div role="alert" id={errorsId} className="form-errors">
          {messages.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      )}
      <div className="button-row">
        <button
          type="submit"
          className="button-primary"
          disabled={endInput === 'date' && (extended.loading || extended.error !== null)}
        >
          {mode.kind === 'resolve' ? 'Beenden' : 'Speichern'}
        </button>
        <button type="button" onClick={onDone}>
          Abbrechen
        </button>
      </div>
    </form>
  );
}

import { useState } from 'react';
import type { EntryFieldError, EntryValues } from '../domain/entryEditing';
import { validateEntryDraft } from '../domain/entryEditing';
import { formatTimeOfDay } from '../domain/timeInput';
import type { Entry, EntryType } from '../domain/types';

export interface EntryFormProps {
  formLabel: string;
  dayStart: number;
  entry: Entry | null;
  allowOpenEnd: boolean;
  comparisonEntries: readonly Entry[];
  submitting: boolean;
  onSubmit: (values: EntryValues) => void;
  onCancel: () => void;
}

function timeText(instant: number): string {
  const date = new Date(instant);
  return formatTimeOfDay({ hours: date.getHours(), minutes: date.getMinutes() });
}

export function EntryForm(props: EntryFormProps): React.JSX.Element {
  const { entry } = props;
  const [type, setType] = useState<EntryType>(entry?.type ?? 'work');
  const [startText, setStartText] = useState(entry === null ? '' : timeText(entry.start));
  const [endText, setEndText] = useState(
    entry === null || entry.end === null ? '' : timeText(entry.end),
  );
  const [error, setError] = useState<EntryFieldError | null>(null);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (props.submitting) return;
    const result = validateEntryDraft(
      { type, startText, endText },
      {
        dayStart: props.dayStart,
        allowOpenEnd: props.allowOpenEnd,
        comparisonEntries: props.comparisonEntries,
        excludeEntryId: props.entry?.id ?? null,
        now: Date.now(),
      },
    );
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    props.onSubmit(result.value);
  };

  const fieldProps = (field: 'start' | 'end') => ({
    'aria-invalid': error?.field === field ? ('true' as const) : undefined,
    'aria-describedby': error?.field === field ? 'entry-form-error' : undefined,
  });

  return (
    <form aria-label={props.formLabel} onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label htmlFor="entry-form-type">Art</label>
        <select
          id="entry-form-type"
          value={type}
          onChange={(event) => setType(event.target.value as EntryType)}
        >
          <option value="work">Arbeit</option>
          <option value="break">Pause</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="entry-form-start">Start</label>
        <input
          id="entry-form-start"
          type="text"
          inputMode="numeric"
          placeholder="HH:MM"
          value={startText}
          onChange={(event) => setStartText(event.target.value)}
          {...fieldProps('start')}
        />
      </div>
      <div className="field">
        <label htmlFor="entry-form-end">Ende</label>
        <input
          id="entry-form-end"
          type="text"
          inputMode="numeric"
          placeholder="HH:MM"
          value={endText}
          onChange={(event) => setEndText(event.target.value)}
          {...fieldProps('end')}
        />
      </div>
      {error !== null && (
        <p role="alert" id="entry-form-error" className="field-error">
          {error.message}
        </p>
      )}
      <div className="button-row">
        <button type="submit" className="button-primary" disabled={props.submitting}>
          Speichern
        </button>
        <button type="button" className="button-secondary" onClick={props.onCancel}>
          Abbrechen
        </button>
      </div>
    </form>
  );
}

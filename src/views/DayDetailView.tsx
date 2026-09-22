import { useEffect, useState } from 'react';
import { useServices } from '../app/ServicesContext';
import { useToast } from '../app/ToastContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { mapWriteError } from '../data/writeErrors';
import { entryMarkers, type EntryValues } from '../domain/entryEditing';
import { formatDuration, formatEntryLabel, formatLongDate, formatShortDate } from '../domain/format';
import { comparisonEntriesForDay, entriesOfDay } from '../domain/monthView';
import { dayStartFromKey, monthKeyOfDateKey, monthStartFromKey } from '../domain/routing';
import { dayStartOf } from '../domain/timeInput';
import { dailyTotals, entryDurationMs } from '../domain/totals';
import type { Entry } from '../domain/types';
import { useMonthEntries } from '../hooks/useMonthEntries';
import { useNow } from '../hooks/useNow';
import { EntryForm } from './EntryForm';

export interface DayDetailViewProps {
  uid: string;
  dateKey: string;
  onBack: () => void;
  onResolveOpenEntries: () => void;
}

type EditingState = null | { mode: 'add' } | { mode: 'edit'; entry: Entry };

export function DayDetailView(props: DayDetailViewProps): React.JSX.Element {
  const { onBack } = props;
  const { entries } = useServices();
  const { showToast } = useToast();

  const dayStart = dayStartFromKey(props.dateKey);
  const monthStart = monthStartFromKey(monthKeyOfDateKey(props.dateKey));
  const now = useNow(1000);
  const data = useMonthEntries(props.uid, monthStart);
  const dayEntries = entriesOfDay(data.entries, dayStart);
  const comparison = comparisonEntriesForDay(data.entries, dayStart);
  const totals = dailyTotals(data.entries, dayStart, now);
  const isFuture = dayStart > dayStartOf(now);

  const [editing, setEditing] = useState<EditingState>(null);
  const [deleting, setDeleting] = useState<Entry | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (deleting !== null) return;
      if (editing !== null) {
        setEditing(null);
        return;
      }
      onBack();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleting, editing, onBack]);

  const runWrite = (write: Promise<void>) => {
    setSubmitting(true);
    write.catch((error: unknown) => showToast(mapWriteError(error))).finally(() => setSubmitting(false));
  };

  const handleSubmit = (values: EntryValues) => {
    if (editing === null || submitting) return;
    const state = editing;
    setEditing(null);
    const timestamp = Date.now();
    runWrite(
      state.mode === 'add'
        ? entries.createEntry(props.uid, {
            type: values.type,
            start: values.start,
            end: values.end,
            createdAt: timestamp,
            updatedAt: timestamp,
          })
        : entries.updateEntry(props.uid, state.entry.id, {
            type: values.type,
            start: values.start,
            end: values.end,
            updatedAt: timestamp,
          }),
    );
  };

  const handleDelete = (entry: Entry) => {
    setDeleting(null);
    if (submitting) return;
    runWrite(entries.deleteEntry(props.uid, entry.id));
  };

  return (
    <main className="page">
      <section className="card">
        <h2>{formatLongDate(dayStart)}</h2>
        <div className="button-row">
          <button type="button" onClick={onBack}>
            Zurück zum Kalender
          </button>
        </div>
        {data.error !== null && <p role="alert">{data.error}</p>}
        {data.loading ? (
          data.error === null && <p>Lädt…</p>
        ) : (
          <>
            {data.incomplete && (
              <p role="status" className="month-notice">
                Offline – Daten möglicherweise unvollständig
              </p>
            )}
            <p>{`Gearbeitet ${formatDuration(totals.workMs)}`}</p>
            <p>{`Pausen ${formatDuration(totals.breakMs)}`}</p>
            {dayEntries.length === 0 ? (
              <p>Keine Einträge an diesem Tag.</p>
            ) : (
              <ul className="entry-list">
                {dayEntries.map((entry) => {
                  const markers = entryMarkers(entry, comparison, now);
                  return (
                    <li key={entry.id}>
                      <span>{`${formatEntryLabel(entry)} (${formatDuration(entryDurationMs(entry, now))})`}</span>
                      {markers.longRunning && <span className="entry-marker">Mehr als 12 Stunden</span>}
                      {markers.overlap && <span className="entry-marker">Überschneidung</span>}
                      <span className="day-detail-actions">
                        <button type="button" disabled={submitting} onClick={() => setEditing({ mode: 'edit', entry })}>
                          Bearbeiten
                        </button>
                        <button type="button" disabled={submitting} onClick={() => setDeleting(entry)}>
                          Löschen
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {dayEntries.some((entry) => entry.end === null) && (
              <button type="button" className="button-link" onClick={props.onResolveOpenEntries}>
                Offene Einträge bereinigen
              </button>
            )}
            {!isFuture && editing === null && (
              <div className="button-row">
                <button
                  type="button"
                  className="button-primary"
                  disabled={submitting}
                  onClick={() => setEditing({ mode: 'add' })}
                >
                  Eintrag hinzufügen
                </button>
              </div>
            )}
            {editing !== null && (
              <EntryForm
                key={editing.mode === 'add' ? 'add' : editing.entry.id}
                formLabel={editing.mode === 'add' ? 'Eintrag hinzufügen' : 'Eintrag bearbeiten'}
                dayStart={dayStart}
                entry={editing.mode === 'add' ? null : editing.entry}
                allowOpenEnd={editing.mode === 'edit' && editing.entry.end === null}
                comparisonEntries={comparison}
                submitting={submitting}
                onSubmit={handleSubmit}
                onCancel={() => setEditing(null)}
              />
            )}
          </>
        )}
      </section>
      {deleting !== null && (
        <ConfirmDialog
          title="Eintrag löschen?"
          lines={[`${formatEntryLabel(deleting)} am ${formatShortDate(deleting.start)} wird endgültig gelöscht.`]}
          confirmLabel="Löschen"
          cancelLabel="Abbrechen"
          onConfirm={() => handleDelete(deleting)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </main>
  );
}

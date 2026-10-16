import { useState } from 'react';
import { useServices } from '../app/ServicesContext';
import { useToast } from '../app/ToastContext';
import { mapWriteError } from '../data/writeErrors';
import { formatClock, formatShortDate } from '../domain/format';
import { deriveTimerStatus } from '../domain/timer';
import type { Entry } from '../domain/types';
import { resolutionDefaultEnd } from '../domain/validation';
import { useFirstEntryAfter } from '../hooks/useFirstEntryAfter';
import { useOpenEntries } from '../hooks/useOpenEntries';
import { EntryForm } from './EntryForm';
import { typeLabel } from './entryMessages';

type Panel = { kind: 'none' } | { kind: 'resolve'; id: string } | { kind: 'delete'; id: string };

const NO_PANEL: Panel = { kind: 'none' };

function ResolveEntryForm(props: {
  uid: string;
  entry: Entry;
  openEntries: readonly Entry[];
  onDone: () => void;
}): React.JSX.Element {
  const { uid, entry, openEntries, onDone } = props;
  const next = useFirstEntryAfter(uid, entry.start);

  if (next.error !== null) return <p role="alert">{next.error}</p>;
  if (next.loading) return <p>Lädt…</p>;
  return (
    <EntryForm
      uid={uid}
      mode={{ kind: 'resolve', entry, defaultEnd: resolutionDefaultEnd(next.entry, Date.now()) }}
      baseEntries={[]}
      openEntries={openEntries}
      onDone={onDone}
    />
  );
}

export function ResolveView(props: { uid: string; onBack: () => void }): React.JSX.Element {
  const { uid, onBack } = props;
  const { entries } = useServices();
  const { showToast } = useToast();
  const open = useOpenEntries(uid);
  const [panel, setPanel] = useState<Panel>(NO_PANEL);

  const status = deriveTimerStatus(open.entries);
  const active = status.activeEntry;
  const inactive = status.openEntries.filter((e) => e.id !== active?.id).sort((a, b) => a.start - b.start);

  const close = () => setPanel(NO_PANEL);

  const confirmDelete = (id: string) => {
    entries.deleteEntry(uid, id).catch((error: unknown) => showToast(mapWriteError(error)));
    close();
  };

  return (
    <main className="page">
      <section className="card">
        <h2>Offene Einträge bereinigen</h2>
        <p>Der zuletzt gestartete Eintrag bleibt aktiv. Beende oder lösche die älteren offenen Einträge.</p>
        {open.error !== null && <p role="alert">{open.error}</p>}
        {open.loading ? (
          open.error === null && <p>Lädt…</p>
        ) : (
          <>
            {active !== null && (
              <p>{`Aktiver Eintrag: ${typeLabel(active.type)} seit ${formatShortDate(active.start)} ${formatClock(active.start)}`}</p>
            )}
            {inactive.length === 0 ? (
              <p>Es gibt keine älteren offenen Einträge mehr.</p>
            ) : (
              <ul className="entry-list day-entries">
                {inactive.map((e) => (
                  <li key={e.id}>
                    <span>{`${formatShortDate(e.start)} · ${typeLabel(e.type)} ab ${formatClock(e.start)}`}</span>
                    <span className="button-row entry-actions">
                      <button type="button" className="button-link" onClick={() => setPanel({ kind: 'resolve', id: e.id })}>
                        Beenden um …
                      </button>
                      <button type="button" className="button-link" onClick={() => setPanel({ kind: 'delete', id: e.id })}>
                        Löschen
                      </button>
                    </span>
                    {panel.kind === 'resolve' && panel.id === e.id && (
                      <ResolveEntryForm uid={uid} entry={e} openEntries={open.entries} onDone={close} />
                    )}
                    {panel.kind === 'delete' && panel.id === e.id && (
                      <div className="confirm" role="group" aria-label="Löschen bestätigen">
                        <p>Eintrag wirklich löschen?</p>
                        <div className="button-row">
                          <button type="button" className="button-primary" onClick={() => confirmDelete(e.id)}>
                            Ja, löschen
                          </button>
                          <button type="button" onClick={close}>
                            Abbrechen
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <button type="button" onClick={onBack}>
          Zurück zum Timer
        </button>
      </section>
    </main>
  );
}

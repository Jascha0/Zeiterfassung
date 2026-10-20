import { useEffect, useState } from 'react';
import { useServices } from '../app/ServicesContext';
import { useToast } from '../app/ToastContext';
import { ProjectLabel } from '../components/ProjectLabel';
import { mapWriteError } from '../data/writeErrors';
import { entriesStartingIn, mergeEntries, shiftDay } from '../domain/calendar';
import { formatHoursMinutes, formatLongDate } from '../domain/format';
import { truncateNote } from '../domain/notes';
import { projectsById } from '../domain/projects';
import { projectDayTotals } from '../domain/projectTotals';
import { deriveTimerStatus } from '../domain/timer';
import { dailyTotals, dayRange } from '../domain/totals';
import { dayDetailRange } from '../domain/validation';
import { useEntriesInRange } from '../hooks/useEntriesInRange';
import { useNow } from '../hooks/useNow';
import { useOpenEntries } from '../hooks/useOpenEntries';
import { useProjects } from '../hooks/useProjects';
import { EntryForm } from './EntryForm';
import { entryLine } from './entryMessages';
import { NONE_GROUP_LABEL } from './projectMessages';

type Panel = { kind: 'none' } | { kind: 'add' } | { kind: 'edit'; id: string } | { kind: 'delete'; id: string };

const NO_PANEL: Panel = { kind: 'none' };

export function DayDetailView(props: {
  uid: string;
  dayStart: number;
  onDayChange: (dayStart: number) => void;
  onBack: () => void;
}): React.JSX.Element {
  const { uid, dayStart, onDayChange, onBack } = props;
  const { entries } = useServices();
  const { showToast } = useToast();
  const now = useNow(30_000);
  const windowData = useEntriesInRange(uid, dayDetailRange(dayStart));
  const open = useOpenEntries(uid);
  const projectData = useProjects(uid);
  const [panel, setPanel] = useState<Panel>(NO_PANEL);

  const loading = windowData.loading || open.loading || (projectData.loading && projectData.error === null);
  const error = windowData.error ?? open.error;
  const dayEntries = entriesStartingIn(mergeEntries(windowData.entries, open.entries), dayRange(dayStart));
  const totals = dailyTotals(dayEntries, dayStart, now);
  const byId = projectsById(projectData.projects);
  const groups = projectDayTotals(dayEntries, dayStart, byId, now);
  const activeId = deriveTimerStatus(open.entries).activeEntry?.id ?? null;
  const isToday = dayStart >= dayRange(now).start;

  const panelId = panel.kind === 'edit' || panel.kind === 'delete' ? panel.id : null;
  const panelTargetMissing = !loading && panelId !== null && !dayEntries.some((entry) => entry.id === panelId);

  useEffect(() => {
    if (panelTargetMissing) setPanel(NO_PANEL);
  }, [panelTargetMissing]);

  const close = () => setPanel(NO_PANEL);

  const confirmDelete = (id: string) => {
    entries.deleteEntry(uid, id).catch((error: unknown) => showToast(mapWriteError(error)));
    close();
  };

  return (
    <main className="page">
      <section className="card">
        <div className="button-row">
          <button type="button" onClick={onBack}>
            Zurück zum Kalender
          </button>
          <button type="button" onClick={() => onDayChange(shiftDay(dayStart, -1))}>
            Vorheriger Tag
          </button>
          <button type="button" disabled={isToday} onClick={() => onDayChange(shiftDay(dayStart, 1))}>
            Nächster Tag
          </button>
        </div>
        <h2>{formatLongDate(dayStart)}</h2>
        {error !== null && <p role="alert">{error}</p>}
        {projectData.error !== null && <p role="alert">{projectData.error}</p>}
        {loading ? (
          error === null && <p>Lädt…</p>
        ) : (
          <>
            <dl className="totals">
              <div>
                <dt>Gearbeitet</dt>
                <dd>{formatHoursMinutes(totals.workMs)}</dd>
              </div>
              <div>
                <dt>Pausen</dt>
                <dd>{formatHoursMinutes(totals.breakMs)}</dd>
              </div>
            </dl>
            {groups.length > 0 && (
              <div role="group" aria-label="Arbeitszeit nach Projekt">
                <h3>Nach Projekt</h3>
                <dl className="totals project-totals">
                  {groups.map((group) => (
                    <div key={group.kind === 'project' ? `project-${group.project.id}` : group.kind}>
                      <dt>
                        {group.kind === 'project' ? (
                          <ProjectLabel project={group.project} />
                        ) : group.kind === 'none' ? (
                          NONE_GROUP_LABEL
                        ) : (
                          <ProjectLabel project={undefined} />
                        )}
                      </dt>
                      <dd>{formatHoursMinutes(group.workMs)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
            {dayEntries.length === 0 ? (
              <p>Keine Einträge an diesem Tag.</p>
            ) : (
              <ul className="entry-list day-entries">
                {dayEntries.map((entry) => (
                  <li key={entry.id}>
                    <span>{entryLine(entry, now)}</span>
                    {entry.type === 'work' && entry.projectId !== undefined && (
                      <ProjectLabel project={byId.get(entry.projectId)} />
                    )}
                    {entry.type === 'work' && entry.note !== undefined && (
                      <span className="entry-note" title={entry.note}>
                        {truncateNote(entry.note)}
                      </span>
                    )}
                    {entry.end === null && entry.id !== activeId && <span className="badge">offen – nicht aktiv</span>}
                    <span className="button-row entry-actions">
                      <button type="button" className="button-link" onClick={() => setPanel({ kind: 'edit', id: entry.id })}>
                        Bearbeiten
                      </button>
                      <button
                        type="button"
                        className="button-link"
                        onClick={() => setPanel({ kind: 'delete', id: entry.id })}
                      >
                        Löschen
                      </button>
                    </span>
                    {panel.kind === 'edit' && panel.id === entry.id && (
                      <EntryForm
                        uid={uid}
                        mode={{ kind: 'edit', dayStart, entry }}
                        baseEntries={windowData.entries}
                        openEntries={open.entries}
                        projects={projectData.projects}
                        onDone={close}
                      />
                    )}
                    {panel.kind === 'delete' && panel.id === entry.id && (
                      <div className="confirm" role="group" aria-label="Löschen bestätigen">
                        <p>Eintrag wirklich löschen?</p>
                        <div className="button-row">
                          <button type="button" className="button-primary" onClick={() => confirmDelete(entry.id)}>
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
            {panel.kind === 'add' ? (
              <>
                <h3>Neuer Eintrag</h3>
                <EntryForm
                  uid={uid}
                  mode={{ kind: 'add', dayStart }}
                  baseEntries={windowData.entries}
                  openEntries={open.entries}
                  projects={projectData.projects}
                  onDone={close}
                />
              </>
            ) : (
              <button type="button" className="button-primary" onClick={() => setPanel({ kind: 'add' })}>
                Eintrag hinzufügen
              </button>
            )}
          </>
        )}
      </section>
    </main>
  );
}

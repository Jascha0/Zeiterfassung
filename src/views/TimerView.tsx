import { useEffect, useId, useState } from 'react';
import { useServices } from '../app/ServicesContext';
import { useToast } from '../app/ToastContext';
import { ProjectLabel } from '../components/ProjectLabel';
import { mapWriteError } from '../data/writeErrors';
import { entryChanges } from '../domain/entryForm';
import { formatClock, formatDuration } from '../domain/format';
import { normalizeNote } from '../domain/notes';
import { projectPickerOptions, projectsById, type ProjectOption } from '../domain/projects';
import {
  InvalidTimerActionError,
  allowedActions,
  carryOverProjectId,
  deriveTimerStatus,
  planTransition,
  type TimerAction,
  type TimerStatus,
} from '../domain/timer';
import { currentBreakMs, dailyTotals, entryDurationMs } from '../domain/totals';
import type { Entry } from '../domain/types';
import { hasMultipleOpenEntries, isLongRunningWork } from '../domain/warnings';
import { useLastEntryBefore } from '../hooks/useLastEntryBefore';
import { useNow } from '../hooks/useNow';
import { useProjects } from '../hooks/useProjects';
import { useTimerData } from '../hooks/useTimerData';
import { NOTE_TOO_LONG_MESSAGE, NO_PROJECT_LABEL, projectOptionLabel } from './projectMessages';

const ACTION_LABELS: Record<TimerAction, string> = {
  start: 'Start',
  pause: 'Pause',
  resume: 'Weiter',
  end: 'Arbeitstag beenden',
  switch: 'Projekt wechseln',
};

const MULTIPLE_OPEN_WARNING =
  'Es gibt mehrere offene Einträge – vermutlich wurde der Timer offline auf mehreren Geräten gestartet. Aktionen betreffen den zuletzt gestarteten Eintrag. Bitte beende oder lösche die älteren offenen Einträge.';
const LONG_RUNNING_WARNING =
  'Der aktuelle Arbeitsblock läuft seit mehr als 12 Stunden. Hast du vergessen, den Arbeitstag zu beenden?';

function statusText(status: TimerStatus): string {
  if (status.activeEntry === null) return 'Nicht gestartet';
  const since = formatClock(status.activeEntry.start);
  return status.state === 'onBreak' ? `Pause seit ${since}` : `Arbeitet seit ${since}`;
}

function entryText(entry: Entry, now: number): string {
  const type = entry.type === 'work' ? 'Arbeit' : 'Pause';
  const end = entry.end === null ? 'läuft' : formatClock(entry.end);
  return `${type} ${formatClock(entry.start)} – ${end} (${formatDuration(entryDurationMs(entry, now))})`;
}

function ProjectSelect(props: {
  id: string;
  value: string;
  options: readonly ProjectOption[];
  disabled?: boolean;
  onChange: (value: string) => void;
}): React.JSX.Element {
  return (
    <div className="field">
      <label htmlFor={props.id}>Projekt</label>
      <select
        id={props.id}
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value)}
      >
        <option value="">{NO_PROJECT_LABEL}</option>
        {props.options.map((option) => (
          <option key={option.id} value={option.id}>
            {projectOptionLabel(option)}
          </option>
        ))}
      </select>
    </div>
  );
}

function lastEntryBefore(entries: readonly Entry[], before: number): Entry | null {
  let found: Entry | null = null;
  for (const entry of entries) {
    if (entry.start < before && (found === null || entry.start >= found.start)) found = entry;
  }
  return found;
}

function RunningNote(props: { uid: string; entry: Entry }): React.JSX.Element {
  const { uid, entry } = props;
  const { entries } = useServices();
  const { showToast } = useToast();
  const [draft, setDraft] = useState('');
  const [dirty, setDirty] = useState(false);
  const [tooLong, setTooLong] = useState(false);
  const noteId = useId();
  const errorId = useId();

  const save = () => {
    if (!dirty) return;
    const result = normalizeNote(draft);
    if (!result.ok) {
      setTooLong(true);
      return;
    }
    setTooLong(false);
    setDirty(false);
    const changes = entryChanges(
      entry,
      { type: entry.type, start: entry.start, end: entry.end },
      Date.now(),
      { projectId: entry.projectId, note: result.note },
    );
    if (changes === null) return;
    entries.updateEntry(uid, entry.id, changes).catch((error: unknown) => showToast(mapWriteError(error)));
  };

  return (
    <div className="field">
      <label htmlFor={noteId}>Notiz</label>
      <textarea
        id={noteId}
        value={dirty ? draft : (entry.note ?? '')}
        aria-invalid={tooLong}
        aria-describedby={tooLong ? errorId : undefined}
        onChange={(event) => {
          setDraft(event.target.value);
          setDirty(true);
          setTooLong(false);
        }}
        onBlur={save}
      />
      {tooLong && (
        <div role="alert" id={errorId}>
          <p>{NOTE_TOO_LONG_MESSAGE}</p>
        </div>
      )}
      <div className="button-row">
        <button type="button" onClick={save}>
          Notiz speichern
        </button>
      </div>
    </div>
  );
}

export function TimerView(props: { uid: string; onResolveOpenEntries?: () => void }): React.JSX.Element {
  const { uid } = props;
  const { entries } = useServices();
  const { showToast } = useToast();
  const now = useNow(1000);
  const data = useTimerData(uid, now);
  const projectData = useProjects(uid);
  const [pending, setPending] = useState(false);
  const [idleProjectId, setIdleProjectId] = useState('');
  const [switchTarget, setSwitchTarget] = useState('');
  const projectSelectId = useId();
  const switchSelectId = useId();

  useEffect(() => {
    setPending(false);
  }, [data.openEntries]);

  const status = deriveTimerStatus(data.openEntries);
  const activeBreak = !data.loading && status.state === 'onBreak' ? status.activeEntry : null;
  // A break that started today with an earlier entry today has its carry-over source already loaded;
  // only otherwise (break or previous block before midnight) is the one-off lookup needed.
  const previousToday = activeBreak === null ? null : lastEntryBefore(data.todayEntries, activeBreak.start);
  const previous = useLastEntryBefore(
    uid,
    activeBreak !== null && previousToday === null ? activeBreak.start : null,
  );
  const totals = dailyTotals(data.todayEntries, now, now);
  const byId = projectsById(projectData.projects);
  const loading = data.loading || (projectData.loading && projectData.error === null);
  const activeWork = status.state === 'working' ? status.activeEntry : null;
  const idleOptions = projectPickerOptions(projectData.projects, undefined);
  const idleValue = idleOptions.some((option) => option.id === idleProjectId) ? idleProjectId : '';
  const switchOptions: { value: string; label: string }[] =
    activeWork === null
      ? []
      : [
          ...(activeWork.projectId !== undefined ? [{ value: '', label: NO_PROJECT_LABEL }] : []),
          ...projectPickerOptions(projectData.projects, undefined)
            .filter((option) => option.id !== activeWork.projectId)
            .map((option) => ({ value: option.id, label: projectOptionLabel(option) })),
        ];
  const switchValue = switchOptions.some((option) => option.value === switchTarget)
    ? switchTarget
    : (switchOptions[0]?.value ?? '');
  const previousLoading = previous.loading && previous.error === null;

  const projectFor = (action: TimerAction): string | undefined => {
    if (action === 'start') return idleValue || undefined;
    if (action === 'resume') return carryOverProjectId(previousToday ?? previous.entry);
    if (action === 'switch') return switchValue || undefined;
    return undefined;
  };

  const handleAction = (action: TimerAction) => {
    if (pending) return;
    if (action === 'resume' && previousLoading) return;
    let plan;
    try {
      plan = planTransition(data.openEntries, action, Date.now(), projectFor(action));
    } catch (error) {
      if (error instanceof InvalidTimerActionError) return;
      throw error;
    }
    setPending(true);
    if (action === 'start') setIdleProjectId('');
    entries.applyTransition(uid, plan).catch((error: unknown) => {
      showToast(mapWriteError(error));
      setPending(false);
    });
  };

  const handleRelabel = (active: Entry, value: string) => {
    if (value === (active.projectId ?? '')) return;
    const changes = entryChanges(
      active,
      { type: active.type, start: active.start, end: active.end },
      Date.now(),
      { projectId: value || undefined, note: active.note },
    );
    if (changes === null) return;
    entries.updateEntry(uid, active.id, changes).catch((error: unknown) => showToast(mapWriteError(error)));
  };

  return (
    <main className="page">
      <section className="card timer">
        <h2>Arbeitszeit</h2>
        {data.error !== null && <p role="alert">{data.error}</p>}
        {projectData.error !== null && <p role="alert">{projectData.error}</p>}
        {loading ? (
          data.error === null && <p>Lädt…</p>
        ) : (
          <>
            <p className="timer-status">{statusText(status)}</p>
            <dl className="totals">
              <div>
                <dt>Heute gearbeitet</dt>
                <dd>{formatDuration(totals.workMs)}</dd>
              </div>
              <div>
                <dt>Pausen heute</dt>
                <dd>{formatDuration(totals.breakMs)}</dd>
              </div>
              {status.state === 'onBreak' && (
                <div>
                  <dt>Aktuelle Pause</dt>
                  <dd>{formatDuration(currentBreakMs(status, now))}</dd>
                </div>
              )}
            </dl>
            {status.state === 'idle' && (
              <ProjectSelect
                id={projectSelectId}
                value={idleValue}
                options={idleOptions}
                onChange={setIdleProjectId}
              />
            )}
            {activeWork !== null && (
              <>
                <ProjectSelect
                  id={projectSelectId}
                  value={activeWork.projectId ?? ''}
                  options={projectPickerOptions(projectData.projects, activeWork.projectId)}
                  disabled={pending}
                  onChange={(value) => handleRelabel(activeWork, value)}
                />
                {switchOptions.length > 0 && (
                  <>
                    <div className="field">
                      <label htmlFor={switchSelectId}>Wechseln zu</label>
                      <select
                        id={switchSelectId}
                        value={switchValue}
                        onChange={(event) => setSwitchTarget(event.target.value)}
                      >
                        {switchOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="button-row">
                      <button type="button" disabled={pending} onClick={() => handleAction('switch')}>
                        {ACTION_LABELS.switch}
                      </button>
                    </div>
                  </>
                )}
                <RunningNote key={activeWork.id} uid={uid} entry={activeWork} />
              </>
            )}
            {previous.error !== null && <p role="alert">{previous.error}</p>}
            <div className="button-row timer-actions">
              {allowedActions(status.state).map((action) => (
                <button
                  key={action}
                  type="button"
                  className={action === 'end' ? 'button-secondary' : 'button-primary'}
                  disabled={pending || (action === 'resume' && previousLoading)}
                  onClick={() => handleAction(action)}
                >
                  {ACTION_LABELS[action]}
                </button>
              ))}
            </div>
            {hasMultipleOpenEntries(data.openEntries) && <p role="alert">{MULTIPLE_OPEN_WARNING}</p>}
            {hasMultipleOpenEntries(data.openEntries) && props.onResolveOpenEntries !== undefined && (
              <div className="button-row">
                <button type="button" onClick={props.onResolveOpenEntries}>
                  Offene Einträge bereinigen
                </button>
              </div>
            )}
            {isLongRunningWork(status.activeEntry, now) && <p role="alert">{LONG_RUNNING_WARNING}</p>}
          </>
        )}
      </section>
      {!loading && (
        <section className="card">
          <h2>Heutige Einträge</h2>
          {data.todayEntries.length === 0 ? (
            <p>Heute noch keine Einträge.</p>
          ) : (
            <ul className="entry-list">
              {data.todayEntries.map((entry) => (
                <li key={entry.id}>
                  <span>{entryText(entry, now)}</span>
                  {entry.type === 'work' && entry.projectId !== undefined && (
                    <ProjectLabel project={byId.get(entry.projectId)} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}

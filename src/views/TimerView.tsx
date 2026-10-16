import { useEffect, useId, useState } from 'react';
import { useServices } from '../app/ServicesContext';
import { useToast } from '../app/ToastContext';
import { ProjectLabel } from '../components/ProjectLabel';
import { mapWriteError } from '../data/writeErrors';
import { entryChanges } from '../domain/entryForm';
import { formatClock, formatDuration } from '../domain/format';
import { projectPickerOptions, projectsById, type ProjectOption } from '../domain/projects';
import {
  InvalidTimerActionError,
  allowedActions,
  deriveTimerStatus,
  planTransition,
  type TimerAction,
  type TimerStatus,
} from '../domain/timer';
import { currentBreakMs, dailyTotals, entryDurationMs } from '../domain/totals';
import type { Entry } from '../domain/types';
import { hasMultipleOpenEntries, isLongRunningWork } from '../domain/warnings';
import { useNow } from '../hooks/useNow';
import { useProjects } from '../hooks/useProjects';
import { useTimerData } from '../hooks/useTimerData';
import { NO_PROJECT_LABEL, projectOptionLabel } from './projectMessages';

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

export function TimerView(props: { uid: string; onResolveOpenEntries?: () => void }): React.JSX.Element {
  const { uid } = props;
  const { entries } = useServices();
  const { showToast } = useToast();
  const now = useNow(1000);
  const data = useTimerData(uid, now);
  const projectData = useProjects(uid);
  const [pending, setPending] = useState(false);
  const [idleProjectId, setIdleProjectId] = useState('');
  const projectSelectId = useId();

  useEffect(() => {
    setPending(false);
  }, [data.openEntries]);

  const status = deriveTimerStatus(data.openEntries);
  const totals = dailyTotals(data.todayEntries, now, now);
  const byId = projectsById(projectData.projects);
  const loading = data.loading || (projectData.loading && projectData.error === null);
  const activeWork = status.state === 'working' ? status.activeEntry : null;
  const idleOptions = projectPickerOptions(projectData.projects, undefined);
  const idleValue = idleOptions.some((option) => option.id === idleProjectId) ? idleProjectId : '';

  const handleAction = (action: TimerAction) => {
    if (pending) return;
    let plan;
    try {
      plan = planTransition(data.openEntries, action, Date.now(), action === 'start' ? idleValue || undefined : undefined);
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
              <ProjectSelect
                id={projectSelectId}
                value={activeWork.projectId ?? ''}
                options={projectPickerOptions(projectData.projects, activeWork.projectId)}
                disabled={pending}
                onChange={(value) => handleRelabel(activeWork, value)}
              />
            )}
            <div className="button-row timer-actions">
              {allowedActions(status.state).map((action) => (
                <button
                  key={action}
                  type="button"
                  className={action === 'end' ? 'button-secondary' : 'button-primary'}
                  disabled={pending}
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

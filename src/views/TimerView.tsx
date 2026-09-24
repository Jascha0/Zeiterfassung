import { useEffect, useState } from 'react';
import { useServices } from '../app/ServicesContext';
import { useToast } from '../app/ToastContext';
import { mapWriteError } from '../data/writeErrors';
import { formatClock, formatDuration } from '../domain/format';
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
import { useTimerData } from '../hooks/useTimerData';

const ACTION_LABELS: Record<TimerAction, string> = {
  start: 'Start',
  pause: 'Pause',
  resume: 'Weiter',
  end: 'Arbeitstag beenden',
};

const MULTIPLE_OPEN_WARNING =
  'Es gibt mehrere offene Einträge – vermutlich wurde der Timer offline auf mehreren Geräten gestartet. Aktionen betreffen den zuletzt gestarteten Eintrag. Eine Bereinigung ist in einer späteren Version möglich.';
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

export function TimerView(): React.JSX.Element {
  const { entries } = useServices();
  const { showToast } = useToast();
  const now = useNow(1000);
  const data = useTimerData(now);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setPending(false);
  }, [data.openEntries]);

  const status = deriveTimerStatus(data.openEntries);
  const totals = dailyTotals(data.todayEntries, now, now);

  const handleAction = (action: TimerAction) => {
    if (pending) return;
    let plan;
    try {
      plan = planTransition(data.openEntries, action, Date.now());
    } catch (error) {
      if (error instanceof InvalidTimerActionError) return;
      throw error;
    }
    setPending(true);
    entries.applyTransition(plan).catch((error: unknown) => {
      showToast(mapWriteError(error));
      setPending(false);
    });
  };

  return (
    <main className="page">
      <section className="card timer">
        <h2>Arbeitszeit</h2>
        {data.error !== null && <p role="alert">{data.error}</p>}
        {data.loading ? (
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
            {isLongRunningWork(status.activeEntry, now) && <p role="alert">{LONG_RUNNING_WARNING}</p>}
          </>
        )}
      </section>
      {!data.loading && (
        <section className="card">
          <h2>Heutige Einträge</h2>
          {data.todayEntries.length === 0 ? (
            <p>Heute noch keine Einträge.</p>
          ) : (
            <ul className="entry-list">
              {data.todayEntries.map((entry) => (
                <li key={entry.id}>{entryText(entry, now)}</li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}

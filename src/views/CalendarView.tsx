import { addDays, addMonths, endOfMonth, startOfDay, subMonths } from 'date-fns';
import { useEffect, useRef, useState } from 'react';
import { buildCalendarWeeks } from '../domain/calendarGrid';
import { formatDuration, formatMonthTitle } from '../domain/format';
import { buildMonthSummary, formatDayCellLabel, type MonthDay } from '../domain/monthView';
import { dayStartFromKey, monthStartFromKey, toDateKey, toMonthKey } from '../domain/routing';
import { useMonthEntries } from '../hooks/useMonthEntries';
import { useNow } from '../hooks/useNow';

export interface CalendarViewProps {
  uid: string;
  monthKey: string;
  onSelectMonth: (monthKey: string) => void;
  onOpenDay: (dateKey: string) => void;
}

const WEEKDAYS: ReadonlyArray<{ short: string; long: string }> = [
  { short: 'Mo', long: 'Montag' },
  { short: 'Di', long: 'Dienstag' },
  { short: 'Mi', long: 'Mittwoch' },
  { short: 'Do', long: 'Donnerstag' },
  { short: 'Fr', long: 'Freitag' },
  { short: 'Sa', long: 'Samstag' },
  { short: 'So', long: 'Sonntag' },
];

function defaultFocusDateKey(monthStart: number, now: number): string {
  return toMonthKey(now) === toMonthKey(monthStart) ? toDateKey(now) : toDateKey(monthStart);
}

function dayMarkerDots(day: MonthDay): React.JSX.Element {
  return (
    <>
      {day.markers.open && <span className="calendar-marker calendar-marker-open" aria-hidden="true" title="läuft" />}
      {day.markers.longRunning && (
        <span className="calendar-marker calendar-marker-long" aria-hidden="true" title="Mehr als 12 Stunden" />
      )}
      {day.markers.overlap && (
        <span className="calendar-marker calendar-marker-overlap" aria-hidden="true" title="Überschneidung" />
      )}
    </>
  );
}

export function CalendarView(props: CalendarViewProps): React.JSX.Element {
  const monthStart = monthStartFromKey(props.monthKey);
  const now = useNow(1000);
  const data = useMonthEntries(props.uid, monthStart);
  const summary = buildMonthSummary(monthStart, data.entries, now);
  const weeks = buildCalendarWeeks(monthStart);
  const byDateKey = new Map(summary.days.map((day) => [day.dateKey, day]));
  const todayKey = toDateKey(now);
  const lastDayStart = startOfDay(endOfMonth(monthStart)).getTime();

  const [focusedDateKey, setFocusedDateKey] = useState(() => defaultFocusDateKey(monthStart, Date.now()));
  const shouldFocus = useRef(false);
  const gridRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setFocusedDateKey(defaultFocusDateKey(monthStart, Date.now()));
  }, [props.monthKey, monthStart]);

  useEffect(() => {
    if (!shouldFocus.current) return;
    shouldFocus.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focusedDateKey}"]`)?.focus();
  }, [focusedDateKey]);

  function moveFocusTo(event: React.KeyboardEvent<HTMLDivElement>, instant: number): void {
    event.preventDefault();
    shouldFocus.current = true;
    setFocusedDateKey(toDateKey(Math.min(Math.max(instant, monthStart), lastDayStart)));
  }

  function selectMonth(event: React.KeyboardEvent<HTMLDivElement>, monthKey: string): void {
    event.preventDefault();
    shouldFocus.current = true;
    props.onSelectMonth(monthKey);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    const focusedDayStart = dayStartFromKey(focusedDateKey);
    switch (event.key) {
      case 'ArrowLeft':
        moveFocusTo(event, addDays(focusedDayStart, -1).getTime());
        return;
      case 'ArrowRight':
        moveFocusTo(event, addDays(focusedDayStart, 1).getTime());
        return;
      case 'ArrowUp':
        moveFocusTo(event, addDays(focusedDayStart, -7).getTime());
        return;
      case 'ArrowDown':
        moveFocusTo(event, addDays(focusedDayStart, 7).getTime());
        return;
      case 'Home':
        moveFocusTo(event, monthStart);
        return;
      case 'End':
        moveFocusTo(event, lastDayStart);
        return;
      case 'PageUp':
        selectMonth(event, toMonthKey(subMonths(monthStart, 1).getTime()));
        return;
      case 'PageDown':
        selectMonth(event, toMonthKey(addMonths(monthStart, 1).getTime()));
        return;
      case 'Enter':
      case ' ':
        event.preventDefault();
        props.onOpenDay(focusedDateKey);
        return;
      default:
        return;
    }
  }

  return (
    <main className="page">
      <section className="card">
        <h2>{formatMonthTitle(monthStart)}</h2>
        <p className="month-total">{`Monatssumme ${formatDuration(summary.totalWorkMs)}`}</p>
        <div className="button-row">
          <button type="button" onClick={() => props.onSelectMonth(toMonthKey(subMonths(monthStart, 1).getTime()))}>
            Voriger Monat
          </button>
          <button type="button" onClick={() => props.onSelectMonth(toMonthKey(Date.now()))}>
            Heute
          </button>
          <button type="button" onClick={() => props.onSelectMonth(toMonthKey(addMonths(monthStart, 1).getTime()))}>
            Nächster Monat
          </button>
        </div>
      </section>
      <section className="card">
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
            <div
              role="grid"
              aria-label="Monatskalender"
              className="calendar-grid"
              ref={gridRef}
              onKeyDown={handleKeyDown}
            >
              <div role="row">
                {WEEKDAYS.map((weekday) => (
                  <div key={weekday.long} role="columnheader" aria-label={weekday.long}>
                    {weekday.short}
                  </div>
                ))}
              </div>
              {weeks.map((week) => (
                <div role="row" key={week[0].dateKey}>
                  {week.map((cell) => {
                    const day = byDateKey.get(cell.dateKey);
                    if (!cell.inMonth || day === undefined) {
                      return (
                        <div role="gridcell" key={cell.dateKey} className="calendar-cell calendar-cell-outside">
                          <span aria-hidden="true">{cell.dayOfMonth}</span>
                        </div>
                      );
                    }
                    const isToday = cell.dateKey === todayKey;
                    return (
                      <div
                        role="gridcell"
                        key={cell.dateKey}
                        className={isToday ? 'calendar-cell calendar-cell-today' : 'calendar-cell'}
                      >
                        <button
                          type="button"
                          data-date={cell.dateKey}
                          tabIndex={cell.dateKey === focusedDateKey ? 0 : -1}
                          onFocus={() => setFocusedDateKey(cell.dateKey)}
                          aria-label={formatDayCellLabel(day)}
                          aria-current={isToday ? 'date' : undefined}
                          onClick={() => props.onOpenDay(cell.dateKey)}
                          className="calendar-day"
                        >
                          <span className="calendar-day-number" aria-hidden="true">
                            {cell.dayOfMonth}
                          </span>
                          {day.hasEntries && (
                            <span className="calendar-day-time" aria-hidden="true">
                              {formatDuration(day.workMs)}
                            </span>
                          )}
                          {dayMarkerDots(day)}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}

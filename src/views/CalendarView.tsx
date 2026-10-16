import { monthGrid, monthRange, monthStartOf, monthWorkTotals, shiftMonth } from '../domain/calendar';
import { formatHoursMinutes, formatLongDate, formatMonthYear } from '../domain/format';
import { dayRange } from '../domain/totals';
import { useEntriesInRange } from '../hooks/useEntriesInRange';
import { useNow } from '../hooks/useNow';

const WEEKDAYS: ReadonlyArray<{ short: string; long: string }> = [
  { short: 'Mo', long: 'Montag' },
  { short: 'Di', long: 'Dienstag' },
  { short: 'Mi', long: 'Mittwoch' },
  { short: 'Do', long: 'Donnerstag' },
  { short: 'Fr', long: 'Freitag' },
  { short: 'Sa', long: 'Samstag' },
  { short: 'So', long: 'Sonntag' },
];

export function CalendarView(props: {
  uid: string;
  monthStart: number;
  onMonthChange: (monthStart: number) => void;
  onOpenDay: (dayStart: number) => void;
}): React.JSX.Element {
  const { uid, monthStart, onMonthChange, onOpenDay } = props;
  const now = useNow(30_000);
  const data = useEntriesInRange(uid, monthRange(monthStart));
  const totals = monthWorkTotals(data.entries, monthStart, now);
  const todayStart = dayRange(now).start;
  const grid = monthGrid(monthStart);

  return (
    <main className="page">
      <section className="card calendar-card">
        <h2>{formatMonthYear(monthStart)}</h2>
        <div className="button-row calendar-nav">
          <button type="button" onClick={() => onMonthChange(shiftMonth(monthStart, -1))}>
            Vorheriger Monat
          </button>
          <button type="button" onClick={() => onMonthChange(monthStartOf(Date.now()))}>
            Heute
          </button>
          <button type="button" onClick={() => onMonthChange(shiftMonth(monthStart, 1))}>
            Nächster Monat
          </button>
        </div>
        {data.error !== null ? (
          <p role="alert">{data.error}</p>
        ) : data.loading ? (
          <p>Lädt…</p>
        ) : (
          <>
            <table className="calendar">
              <thead>
                <tr>
                  {WEEKDAYS.map((weekday) => (
                    <th key={weekday.short} scope="col" abbr={weekday.long}>
                      {weekday.short}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.map((week) => (
                  <tr key={week[0].dayStart}>
                    {week.map(({ dayStart, inMonth }) => {
                      if (!inMonth) return <td key={dayStart} className="calendar-cell is-outside" />;
                      const d = new Date(dayStart).getDate();
                      const ms = totals.byDay.get(dayStart) ?? 0;
                      const value = ms > 0 ? <span className="calendar-value">{formatHoursMinutes(ms)}</span> : null;
                      if (dayStart > todayStart) {
                        return (
                          <td key={dayStart} className="calendar-cell">
                            <div className="calendar-day is-future">
                              <span className="calendar-date">{d}</span>
                              {value}
                            </div>
                          </td>
                        );
                      }
                      const isToday = dayStart === todayStart;
                      return (
                        <td key={dayStart} className="calendar-cell">
                          <button
                            type="button"
                            className={'calendar-day' + (isToday ? ' is-today' : '')}
                            aria-current={isToday ? 'date' : undefined}
                            aria-label={`${formatLongDate(dayStart)}, ${formatHoursMinutes(ms)} gearbeitet`}
                            onClick={() => onOpenDay(dayStart)}
                          >
                            <span className="calendar-date">{d}</span>
                            {value}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="totals">
              <div>
                <dt>Monat gesamt</dt>
                <dd>{formatHoursMinutes(totals.totalMs)}</dd>
              </div>
            </dl>
          </>
        )}
      </section>
    </main>
  );
}

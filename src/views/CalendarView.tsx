import { useMemo, useState } from 'react';
import { useToast } from '../app/ToastContext';
import { monthGrid, monthRange, monthStartOf, monthWorkTotals, shiftMonth } from '../domain/calendar';
import { monthReportCsv } from '../domain/csv';
import { formatHoursMinutes, formatLongDate, formatMonthYear } from '../domain/format';
import { monthReportPdfContent } from '../domain/pdfContent';
import { projectsById } from '../domain/projects';
import { buildMonthReport, exportFileName } from '../domain/report';
import { dayRange } from '../domain/totals';
import { downloadBlob, downloadText } from '../export/download';
import { renderPdf } from '../export/pdfRenderer';
import { LOAD_ERROR_MESSAGE, useEntriesInRange } from '../hooks/useEntriesInRange';
import { useNow } from '../hooks/useNow';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useProjects } from '../hooks/useProjects';
import {
  CSV_EXPORT_LABEL,
  EXPORT_FAILED_MESSAGE,
  EXPORT_HEADING,
  EXPORT_STATUS_LABEL,
  PDF_EXPORT_LABEL,
  exportStatusLines,
} from './exportMessages';

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
  email?: string | null;
}): React.JSX.Element {
  const { uid, monthStart, onMonthChange, onOpenDay } = props;
  const now = useNow(30_000);
  const data = useEntriesInRange(uid, monthRange(monthStart));
  const totals = monthWorkTotals(data.entries, monthStart, now);
  const todayStart = dayRange(now).start;
  const grid = monthGrid(monthStart);
  const email = props.email ?? null;
  const projectData = useProjects(uid);
  const online = useOnlineStatus();
  const { showToast } = useToast();
  const [pdfBusy, setPdfBusy] = useState(false);
  const byId = useMemo(() => projectsById(projectData.projects), [projectData.projects]);
  const report = useMemo(() => buildMonthReport(data.entries, byId, monthStart), [data.entries, byId, monthStart]);
  const entriesLoaded = !data.loading && data.error === null;
  const canExport = entriesLoaded && !projectData.loading && projectData.error === null && report.entries.length > 0;
  const statusLines = exportStatusLines({
    online,
    entriesLoaded,
    closedCount: report.entries.length,
    runningCount: report.excludedRunningCount,
  });

  function handleCsv(): void {
    try {
      const csv = monthReportCsv(report, byId);
      downloadText(csv, 'text/csv;charset=utf-8', exportFileName(report.monthStart, 'csv'));
    } catch {
      showToast(EXPORT_FAILED_MESSAGE);
    }
  }

  async function handlePdf(): Promise<void> {
    const fileName = exportFileName(report.monthStart, 'pdf');
    setPdfBusy(true);
    try {
      const blob = await renderPdf(monthReportPdfContent(report, { email, createdAt: Date.now() }));
      downloadBlob(blob, fileName);
    } catch {
      showToast(EXPORT_FAILED_MESSAGE);
    } finally {
      setPdfBusy(false);
    }
  }

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
        <div className="export-area">
          <h3>{EXPORT_HEADING}</h3>
          {data.error === null && projectData.error !== null && <p role="alert">{LOAD_ERROR_MESSAGE}</p>}
          <div className="button-row">
            <button type="button" disabled={!canExport} onClick={handleCsv}>
              {CSV_EXPORT_LABEL}
            </button>
            <button type="button" disabled={!canExport || pdfBusy} onClick={() => void handlePdf()}>
              {PDF_EXPORT_LABEL}
            </button>
          </div>
          <div role="status" aria-label={EXPORT_STATUS_LABEL} className="export-status">
            {statusLines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

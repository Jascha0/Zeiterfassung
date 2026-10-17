import { formatHoursMinutes, formatMonthYear, formatShortDateTime, formatWeekdayDate } from './format';
import { projectGroupLabel } from './projectLabels';
import type { MonthReport } from './report';
import { toWinAnsi } from './winAnsi';

export interface PdfContent {
  title: string;
  headerLines: string[];
  dayHead: string[];
  dayRows: string[][];
  totalRows: string[][];
}

export const PDF_DAY_HEAD: readonly string[] = ['Datum', 'Arbeit', 'Pause', 'Projekte'];

/** Pure; never reads entry.note (0041). Every string passes through toWinAnsi (0044). */
export function monthReportPdfContent(
  report: MonthReport,
  meta: { email: string | null; createdAt: number },
): PdfContent {
  const headerLines: string[] = [];
  if (meta.email !== null && meta.email !== '') headerLines.push(meta.email);
  headerLines.push(`Erstellt am ${formatShortDateTime(meta.createdAt)}`);

  const dayRows = report.days.map((day) => [
    formatWeekdayDate(day.dayStart),
    formatHoursMinutes(day.workMs),
    formatHoursMinutes(day.breakMs),
    day.groups.map((group) => `${projectGroupLabel(group)} ${formatHoursMinutes(group.workMs)}`).join(', '),
  ]);

  const totalRows = [
    ['Arbeit gesamt', formatHoursMinutes(report.totals.workMs)],
    ['Pause gesamt', formatHoursMinutes(report.totals.breakMs)],
    ...report.totals.groups.map((group) => [`Arbeit – ${projectGroupLabel(group)}`, formatHoursMinutes(group.workMs)]),
  ];

  return {
    title: toWinAnsi(`Arbeitszeitbericht ${formatMonthYear(report.monthStart)}`),
    headerLines: headerLines.map(toWinAnsi),
    dayHead: PDF_DAY_HEAD.map(toWinAnsi),
    dayRows: dayRows.map((row) => row.map(toWinAnsi)),
    totalRows: totalRows.map((row) => row.map(toWinAnsi)),
  };
}

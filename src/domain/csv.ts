import { formatClock, formatDecimalHours, formatEndTime, formatHoursMinutes, formatShortDate } from './format';
import { UNKNOWN_PROJECT_LABEL } from './projectLabels';
import type { MonthReport } from './report';
import type { Entry, Project } from './types';

export const CSV_HEADER = 'Datum;Typ;Beginn;Ende;Dauer;Stunden;Projekt;Notiz';

/** RFC 4180: if value contains ';', '"', '\r' or '\n' → '"' + value with '"' doubled + '"'; else unchanged. */
export function csvField(value: string): string {
  return /[;"\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function projectCell(projectId: string | undefined, projectsById: ReadonlyMap<string, Project>): string {
  if (projectId === undefined) return '';
  return projectsById.get(projectId)?.name ?? UNKNOWN_PROJECT_LABEL;
}

function entryRow(entry: Entry, end: number, projectsById: ReadonlyMap<string, Project>): string {
  const durationMs = end - entry.start;
  return [
    formatShortDate(entry.start),
    entry.type === 'work' ? 'Arbeit' : 'Pause',
    formatClock(entry.start),
    formatEndTime(entry.start, end),
    formatHoursMinutes(durationMs),
    formatDecimalHours(durationMs),
    projectCell(entry.projectId, projectsById),
    entry.note ?? '',
  ]
    .map(csvField)
    .join(';');
}

/** German-Excel CSV (0040): UTF-8 BOM + header + one row per closed report entry; every line, the last
 *  included, ends with CRLF. Projekt is the plain project name (archived without suffix). Returns the
 *  string WITH the leading '﻿'. */
export function monthReportCsv(report: MonthReport, projectsById: ReadonlyMap<string, Project>): string {
  const rows = report.entries.flatMap((entry) =>
    entry.end === null ? [] : [entryRow(entry, entry.end, projectsById)],
  );
  return '﻿' + [CSV_HEADER, ...rows].map((line) => `${line}\r\n`).join('');
}

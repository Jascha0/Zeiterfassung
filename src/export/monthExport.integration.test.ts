import { describe, expect, it } from 'vitest';
import { monthWorkTotals } from '../domain/calendar';
import { CSV_HEADER, monthReportCsv } from '../domain/csv';
import { monthReportPdfContent } from '../domain/pdfContent';
import { projectsById } from '../domain/projects';
import { buildMonthReport, exportFileName } from '../domain/report';
import type { Entry, Project } from '../domain/types';
import { downloadText } from './download';

const HOUR = 60 * 60 * 1000;
const OCTOBER = new Date(2026, 9, 1).getTime();
const NOW = new Date(2026, 9, 16, 15, 0).getTime();

function local(y: number, m: number, d: number, h = 0, min = 0): number {
  return new Date(y, m - 1, d, h, min).getTime();
}

function project(id: string, name: string, archived = false): Project {
  return { id, name, color: 'blue', archived, createdAt: 0, updatedAt: 0 };
}

function entry(overrides: Partial<Entry> & { id: string }): Entry {
  return { type: 'work', start: 0, end: null, createdAt: 0, updatedAt: 0, ...overrides };
}

const projects = [project('pA', 'Kunde A'), project('pB', 'Alt; "Projekt"', true)];
const byId = projectsById(projects);

const closedInOctober: Entry[] = [
  entry({ id: 'a1', start: local(2026, 10, 6, 8), end: local(2026, 10, 6, 12), projectId: 'pA' }),
  entry({ id: 'a2', type: 'break', start: local(2026, 10, 6, 12), end: local(2026, 10, 6, 12, 30) }),
  entry({ id: 'a3', start: local(2026, 10, 6, 12, 30), end: local(2026, 10, 6, 16), projectId: 'pB' }),
  entry({ id: 'b1', start: local(2026, 10, 7, 9), end: local(2026, 10, 7, 10), projectId: 'gone' }),
  entry({ id: 'b2', start: local(2026, 10, 7, 10), end: local(2026, 10, 7, 11, 15), note: 'a;b "q"\nzeile 2' }),
  // crosses local midnight
  entry({ id: 'm1', start: local(2026, 10, 9, 22), end: local(2026, 10, 10, 2), projectId: 'pA' }),
  // 2026-10-25 is the 25-hour fall-back day in Europe/Berlin: 00:00-06:00 is 7 real hours
  entry({ id: 'd1', start: local(2026, 10, 25, 0), end: local(2026, 10, 25, 6), projectId: 'pA' }),
  // starts 23:30 on the 25-hour day: a fixed 24h day window (00:00 + 24h = 23:00 CET) would lose it
  entry({ id: 'd2', start: local(2026, 10, 25, 23, 30), end: local(2026, 10, 26, 0, 30) }),
];
const running = entry({ id: 'r1', start: local(2026, 10, 16, 14), end: null });
const outsideMonth = [
  entry({ id: 'sep', start: local(2026, 9, 30, 23), end: local(2026, 10, 1, 1) }),
  entry({ id: 'nov', start: local(2026, 11, 1, 8), end: local(2026, 11, 1, 9) }),
];
const all = [...outsideMonth, running, ...closedInOctober];

/** Quote-aware ';' / CRLF reader, independent of csv.ts. Input without BOM. */
function parse(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ';') {
      record.push(field);
      field = '';
    } else if (c === '\r' && text[i + 1] === '\n') {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
      i += 1;
    } else field += c;
  }
  return records;
}

function readBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

describe('month export cross-task flow (realistic October with DST day)', () => {
  const report = buildMonthReport(all, byId, OCTOBER);
  const csv = monthReportCsv(report, byId);
  const content = monthReportPdfContent(report, { email: 'a@b.de', createdAt: NOW });
  const calendarTotalMs = monthWorkTotals(closedInOctober, OCTOBER, 0).totalMs;

  it('CSV work rows, PDF "Arbeit gesamt" and the calendar month total agree', () => {
    expect(calendarTotalMs).toBe((4 + 3.5 + 1 + 1.25 + 4 + 7 + 1) * HOUR);
    const rows = parse(csv.slice(1));
    expect(rows[0]).toEqual(CSV_HEADER.split(';'));
    const workRows = rows.slice(1).filter((row) => row[1] === 'Arbeit');
    const breakRows = rows.slice(1).filter((row) => row[1] === 'Pause');
    const csvWorkMinutes = workRows.reduce((sum, row) => sum + minutes(row[4] ?? ''), 0);
    expect(csvWorkMinutes * 60_000).toBe(calendarTotalMs);
    expect(breakRows.reduce((sum, row) => sum + minutes(row[4] ?? ''), 0)).toBe(30);
    const csvHundredths = workRows.reduce((sum, row) => sum + Number((row[5] ?? '').replace(',', '')), 0);
    expect(csvHundredths).toBe(calendarTotalMs / 36_000);
    expect(content.totalRows[0]).toEqual(['Arbeit gesamt', '21:45']);
    expect(content.totalRows[1]).toEqual(['Pause gesamt', '0:30']);
    expect(minutes('21:45') * 60_000).toBe(calendarTotalMs);
  });

  it('PDF day rows and per-project totals add up to the same total', () => {
    const dayMinutes = content.dayRows.reduce((sum, row) => sum + minutes(row[1] ?? ''), 0);
    expect(dayMinutes * 60_000).toBe(calendarTotalMs);
    const projectRows = content.totalRows.filter((row) => (row[0] ?? '').startsWith('Arbeit – '));
    expect(projectRows.reduce((sum, row) => sum + minutes(row[1] ?? ''), 0) * 60_000).toBe(calendarTotalMs);
    expect(projectRows.map((row) => row[0]).sort()).toEqual(
      [
        'Arbeit – Alt; "Projekt" (archiviert)',
        'Arbeit – Kunde A',
        'Arbeit – Ohne Projekt',
        'Arbeit – Unbekanntes Projekt',
      ].sort(),
    );
  });

  it('keeps the running entry and out-of-month entries out of both outputs, with the count in the report', () => {
    expect(report.excludedRunningCount).toBe(1);
    expect(report.entries.map((e) => e.id).sort()).toEqual(closedInOctober.map((e) => e.id).sort());
    const rows = parse(csv.slice(1)).slice(1);
    expect(rows).toHaveLength(closedInOctober.length);
    expect(rows.some((row) => row[0] === '01.10.2026' || row[0] === '01.11.2026')).toBe(false);
    // the live calendar total would count the running entry up to now; the export must not
    expect(monthWorkTotals([...closedInOctober, running], OCTOBER, NOW).totalMs - calendarTotalMs).toBe(HOUR);
    expect(content.dayRows.some((row) => (row[0] ?? '').includes('16.10.2026'))).toBe(false);
  });

  it('writes project names, quoting, midnight crossing and the DST day correctly into the CSV', () => {
    const rows = parse(csv.slice(1)).slice(1);
    expect(rows.map((row) => row[6])).toContain('Alt; "Projekt"');
    expect(rows.map((row) => row[6])).toContain('Unbekanntes Projekt');
    const note = rows.find((row) => row[7]?.startsWith('a;b'));
    expect(note?.[7]).toBe('a;b "q"\nzeile 2');
    const midnight = rows.find((row) => row[0] === '09.10.2026' && row[2] === '22:00');
    expect(midnight?.slice(3, 6)).toEqual(['10.10.2026 02:00', '4:00', '4,00']);
    const dst = rows.find((row) => row[0] === '25.10.2026');
    expect(dst?.slice(2, 6)).toEqual(['00:00', '06:00', '7:00', '7,00']);
  });

  it('keeps notes out of the PDF content', () => {
    expect(JSON.stringify(content)).not.toContain('zeile 2');
  });

  it('uses the same month for both file names', () => {
    expect(exportFileName(report.monthStart, 'csv')).toBe('zeiterfassung-2026-10.csv');
    expect(exportFileName(report.monthStart, 'pdf')).toBe('zeiterfassung-2026-10.pdf');
  });
});

describe('CSV byte order mark', () => {
  const csv = monthReportCsv(buildMonthReport(closedInOctober, byId, OCTOBER), byId);

  it('starts with exactly one U+FEFF code point followed by the header', () => {
    expect(csv.codePointAt(0)).toBe(0xfeff);
    expect(csv.codePointAt(1)).toBe(CSV_HEADER.codePointAt(0));
    expect(csv.slice(1).startsWith(CSV_HEADER + '\r\n')).toBe(true);
    expect(csv.slice(1).includes(String.fromCodePoint(0xfeff))).toBe(false);
  });

  it('is encoded as EF BB BF by the Blob that downloadText builds', async () => {
    let captured: Blob | undefined;
    const createObjectURL = URL.createObjectURL;
    const revokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = (blob: Blob | MediaSource) => {
      captured = blob as Blob;
      return 'blob:test';
    };
    URL.revokeObjectURL = () => {};
    try {
      downloadText(csv, 'text/csv;charset=utf-8', 'x.csv');
    } finally {
      URL.createObjectURL = createObjectURL;
      URL.revokeObjectURL = revokeObjectURL;
    }
    const bytes = await readBytes(captured as Blob);
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    expect(bytes[3]).toBe(CSV_HEADER.charCodeAt(0));
  });
});

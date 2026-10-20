import { describe, expect, it } from 'vitest';
import { CSV_HEADER, csvField, monthReportCsv } from './csv';
import { projectsById } from './projects';
import { buildMonthReport } from './report';
import type { Entry, Project } from './types';

const OCTOBER = new Date(2026, 9, 1).getTime();
const NOVEMBER = new Date(2026, 10, 1).getTime();
const BOM = '﻿';

function local(y: number, m: number, d: number, h = 0, min = 0, s = 0): number {
  return new Date(y, m - 1, d, h, min, s).getTime();
}

function project(id: string, name: string, archived = false): Project {
  return { id, name, color: 'blue', archived, createdAt: 0, updatedAt: 0 };
}

function entry(overrides: Partial<Entry> & { id: string }): Entry {
  return { type: 'work', start: 0, end: null, createdAt: 0, updatedAt: 0, ...overrides };
}

describe('monthReportCsv', () => {
  it('writes the AC row with an RFC-4180-quoted note', () => {
    const byId = projectsById([project('pA', 'Kunde A')]);
    const work = entry({
      id: 'w',
      start: local(2026, 10, 6, 8),
      end: local(2026, 10, 6, 15, 30),
      projectId: 'pA',
      note: 'Bug; "fix"\nTeil 2',
    });

    const csv = monthReportCsv(buildMonthReport([work], byId, OCTOBER), byId);

    expect(csv).toBe(
      '﻿' +
        'Datum;Typ;Beginn;Ende;Dauer;Stunden;Projekt;Notiz\r\n' +
        '06.10.2026;Arbeit;08:00;15:30;7:30;7,50;Kunde A;"Bug; ""fix""\nTeil 2"\r\n',
    );
  });

  it('round-trips the note through an RFC-4180 parser', () => {
    const note = 'Bug; "fix"\nTeil 2\r\nTeil 3 "Ende"';
    const byId = projectsById([project('pA', 'Kunde A')]);
    const work = entry({ id: 'w', start: local(2026, 10, 6, 8), end: local(2026, 10, 6, 9), projectId: 'pA', note });

    const records = parseCsv(monthReportCsv(buildMonthReport([work], byId, OCTOBER), byId));

    expect(records).toHaveLength(2);
    expect(records[0]).toEqual(CSV_HEADER.split(';'));
    expect(records[1]).toHaveLength(8);
    expect(records[1][7]).toBe(note);
  });

  it('serialises an empty report to BOM + header + CRLF', () => {
    const byId = projectsById([]);
    expect(monthReportCsv(buildMonthReport([], byId, OCTOBER), byId)).toBe(BOM + CSV_HEADER + '\r\n');
  });

  it('writes one sorted row per closed entry incl. breaks and skips open entries', () => {
    const byId = projectsById([]);
    const entries = [
      entry({ id: 'r', start: local(2026, 10, 16, 14), end: null }),
      entry({ id: 'b', type: 'break', start: local(2026, 10, 6, 12), end: local(2026, 10, 6, 12, 30) }),
      entry({ id: 'w2', start: local(2026, 10, 6, 8), end: local(2026, 10, 6, 12) }),
      entry({ id: 'w1', start: local(2026, 10, 6, 8), end: local(2026, 10, 6, 8, 15) }),
    ];

    const lines = body(monthReportCsv(buildMonthReport(entries, byId, OCTOBER), byId));

    expect(lines).toEqual([
      '06.10.2026;Arbeit;08:00;08:15;0:15;0,25;;',
      '06.10.2026;Arbeit;08:00;12:00;4:00;4,00;;',
      '06.10.2026;Pause;12:00;12:30;0:30;0,50;;',
    ]);
  });

  it('shows a midnight-crossing end with its date and keeps it out of November', () => {
    const byId = projectsById([]);
    const night = entry({ id: 'n', start: local(2026, 10, 31, 22), end: local(2026, 11, 1, 2) });

    expect(body(monthReportCsv(buildMonthReport([night], byId, OCTOBER), byId))).toEqual([
      '31.10.2026;Arbeit;22:00;01.11.2026 02:00;4:00;4,00;;',
    ]);
    expect(monthReportCsv(buildMonthReport([night], byId, NOVEMBER), byId)).toBe(BOM + CSV_HEADER + '\r\n');
  });

  it('shows an end at exactly midnight of the next day with its date', () => {
    const byId = projectsById([]);
    const late = entry({ id: 'l', start: local(2026, 10, 6, 23), end: local(2026, 10, 7, 0) });

    expect(body(monthReportCsv(buildMonthReport([late], byId, OCTOBER), byId))).toEqual([
      '06.10.2026;Arbeit;23:00;07.10.2026 00:00;1:00;1,00;;',
    ]);
  });

  it('floors Dauer and rounds Stunden half-up', () => {
    const byId = projectsById([]);
    const long = entry({ id: 'a', start: local(2026, 10, 6, 8), end: local(2026, 10, 6, 15, 29, 59) });
    const short = entry({ id: 'b', start: local(2026, 10, 7, 8), end: local(2026, 10, 7, 8) + 450_000 });

    expect(body(monthReportCsv(buildMonthReport([long, short], byId, OCTOBER), byId))).toEqual([
      '06.10.2026;Arbeit;08:00;15:29;7:29;7,50;;',
      '07.10.2026;Arbeit;08:00;08:07;0:07;0,13;;',
    ]);
  });

  it('writes empty, unknown and archived project cells', () => {
    const byId = projectsById([project('old', 'Alt', true)]);
    const entries = [
      entry({ id: 'a', start: local(2026, 10, 6, 8), end: local(2026, 10, 6, 9) }),
      entry({ id: 'b', start: local(2026, 10, 6, 9), end: local(2026, 10, 6, 10), projectId: 'ghost' }),
      entry({ id: 'c', start: local(2026, 10, 6, 10), end: local(2026, 10, 6, 11), projectId: 'old' }),
    ];

    const projects = body(monthReportCsv(buildMonthReport(entries, byId, OCTOBER), byId)).map(
      (line) => line.split(';')[6],
    );

    expect(projects).toEqual(['', 'Unbekanntes Projekt', 'Alt']);
  });

  it('keeps umlauts and emoji in project names and notes', () => {
    const byId = projectsById([project('p', 'Bäckerei 🚀 Größe')]);
    const work = entry({
      id: 'w',
      start: local(2026, 10, 6, 8),
      end: local(2026, 10, 6, 9),
      projectId: 'p',
      note: 'Übergabe ✅ 東京',
    });

    expect(body(monthReportCsv(buildMonthReport([work], byId, OCTOBER), byId))).toEqual([
      '06.10.2026;Arbeit;08:00;09:00;1:00;1,00;Bäckerei 🚀 Größe;Übergabe ✅ 東京',
    ]);
  });

  it('ends every line with CRLF and has no bare line break outside quoted fields', () => {
    const byId = projectsById([]);
    const entries = [
      entry({ id: 'a', start: local(2026, 10, 6, 8), end: local(2026, 10, 6, 9), note: 'eins\nzwei' }),
      entry({ id: 'b', start: local(2026, 10, 7, 8), end: local(2026, 10, 7, 9), note: 'drei\r\nvier\r' }),
      entry({ id: 'c', type: 'break', start: local(2026, 10, 8, 8), end: local(2026, 10, 8, 9) }),
    ];

    const csv = monthReportCsv(buildMonthReport(entries, byId, OCTOBER), byId);
    const unquoted = csv.replace(/"(?:[^"]|"")*"/g, '');

    expect(csv.startsWith(BOM)).toBe(true);
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(unquoted.replaceAll('\r\n', '')).not.toMatch(/[\r\n]/);
    expect(unquoted.split('\r\n')).toHaveLength(entries.length + 2);
  });
});

describe('csvField', () => {
  it.each([
    ['a', 'a'],
    ['a;b', '"a;b"'],
    ['x"y', '"x""y"'],
    ['a\r\nb', '"a\r\nb"'],
    ['a\nb', '"a\nb"'],
    ['a\rb', '"a\rb"'],
    ['', ''],
  ])('%j → %j', (input, expected) => {
    expect(csvField(input)).toBe(expected);
  });
});

function body(csv: string): string[] {
  const prefix = BOM + CSV_HEADER + '\r\n';
  expect(csv.startsWith(prefix)).toBe(true);
  expect(csv.endsWith('\r\n')).toBe(true);
  return csv
    .slice(prefix.length, -2)
    .split('\r\n')
    .filter((line) => line !== '');
}

/** Minimal RFC 4180 reader: ';' separator, CRLF records, quoted fields with '""' and embedded line breaks. */
function parseCsv(text: string): string[][] {
  const source = text.startsWith(BOM) ? text.slice(1) : text;
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let i = 0;
  while (i < source.length) {
    const char = source[i];
    if (char === '"' && field === '') {
      i += 1;
      while (i < source.length) {
        if (source[i] === '"' && source[i + 1] === '"') {
          field += '"';
          i += 2;
        } else if (source[i] === '"') {
          i += 1;
          break;
        } else {
          field += source[i];
          i += 1;
        }
      }
    } else if (char === ';') {
      record.push(field);
      field = '';
      i += 1;
    } else if (char === '\r' && source[i + 1] === '\n') {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
      i += 2;
    } else {
      field += char;
      i += 1;
    }
  }
  if (field !== '' || record.length > 0) records.push([...record, field]);
  return records;
}

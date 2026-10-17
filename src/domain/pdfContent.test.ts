import { describe, expect, it } from 'vitest';
import { monthWorkTotals } from './calendar';
import { formatHoursMinutes } from './format';
import { monthReportPdfContent } from './pdfContent';
import { projectsById } from './projects';
import { buildMonthReport } from './report';
import type { Entry, Project } from './types';

const OCTOBER = new Date(2026, 9, 1).getTime();

function local(y: number, m: number, d: number, h = 0, min = 0, s = 0): number {
  return new Date(y, m - 1, d, h, min, s).getTime();
}

function project(id: string, name: string, archived = false): Project {
  return { id, name, color: 'blue', archived, createdAt: 0, updatedAt: 0 };
}

function entry(overrides: Partial<Entry> & { id: string }): Entry {
  return { type: 'work', start: 0, end: null, createdAt: 0, updatedAt: 0, ...overrides };
}

const CREATED_AT = local(2026, 10, 17, 14, 5);

describe('monthReportPdfContent', () => {
  it('produces the exact header, day rows and totals', () => {
    const byId = projectsById([project('pA', 'Kunde A')]);
    const entries = [
      entry({ id: 'w1', start: local(2026, 10, 6, 8), end: local(2026, 10, 6, 11, 15), projectId: 'pA' }),
      entry({ id: 'w2', start: local(2026, 10, 6, 11, 45), end: local(2026, 10, 6, 16), note: 'NOTE-SENTINEL-XYZ' }),
      entry({ id: 'b1', type: 'break', start: local(2026, 10, 6, 11, 15), end: local(2026, 10, 6, 11, 45) }),
    ];

    const content = monthReportPdfContent(buildMonthReport(entries, byId, OCTOBER), {
      email: 'jascha@example.com',
      createdAt: CREATED_AT,
    });

    expect(content).toEqual({
      title: 'Arbeitszeitbericht Oktober 2026',
      headerLines: ['jascha@example.com', 'Erstellt am 17.10.2026 14:05'],
      dayHead: ['Datum', 'Arbeit', 'Pause', 'Projekte'],
      dayRows: [['Di 06.10.2026', '7:30', '0:30', 'Ohne Projekt 4:15, Kunde A 3:15']],
      totalRows: [
        ['Arbeit gesamt', '7:30'],
        ['Pause gesamt', '0:30'],
        ['Arbeit – Ohne Projekt', '4:15'],
        ['Arbeit – Kunde A', '3:15'],
      ],
    });
    expect(JSON.stringify(content)).not.toContain('NOTE-SENTINEL-XYZ');
  });

  it('omits the e-mail line when the e-mail is null or empty', () => {
    const byId = projectsById([]);
    const report = buildMonthReport([], byId, OCTOBER);
    for (const email of [null, '']) {
      expect(monthReportPdfContent(report, { email, createdAt: CREATED_AT }).headerLines).toEqual([
        'Erstellt am 17.10.2026 14:05',
      ]);
    }
  });

  it('lists only days with entries, in date order', () => {
    const byId = projectsById([]);
    const entries = [
      entry({ id: 'b', start: local(2026, 10, 13, 9), end: local(2026, 10, 13, 10) }),
      entry({ id: 'a', start: local(2026, 10, 6, 9), end: local(2026, 10, 6, 11) }),
    ];

    const content = monthReportPdfContent(buildMonthReport(entries, byId, OCTOBER), { email: null, createdAt: CREATED_AT });

    expect(content.dayRows).toEqual([
      ['Di 06.10.2026', '2:00', '0:00', 'Ohne Projekt 2:00'],
      ['Di 13.10.2026', '1:00', '0:00', 'Ohne Projekt 1:00'],
    ]);
  });

  it('labels archived and dangling projects', () => {
    const byId = projectsById([project('old', 'Alt', true)]);
    const entries = [
      entry({ id: 'a', start: local(2026, 10, 6, 8), end: local(2026, 10, 6, 9), projectId: 'old' }),
      entry({ id: 'b', start: local(2026, 10, 6, 9), end: local(2026, 10, 6, 11), projectId: 'gone' }),
    ];

    const content = monthReportPdfContent(buildMonthReport(entries, byId, OCTOBER), { email: null, createdAt: CREATED_AT });

    expect(content.dayRows[0][3]).toContain('Alt (archiviert) 1:00');
    expect(content.dayRows[0][3]).toContain('Unbekanntes Projekt 2:00');
    expect(content.totalRows).toContainEqual(['Arbeit – Alt (archiviert)', '1:00']);
    expect(content.totalRows).toContainEqual(['Arbeit – Unbekanntes Projekt', '2:00']);
  });

  it('sums Arbeit gesamt from exact ms, not from floored rows', () => {
    const byId = projectsById([]);
    const entries = [6, 7, 8].map((d) =>
      entry({ id: `w${d}`, start: local(2026, 10, d, 8), end: local(2026, 10, d, 15, 29, 59) }),
    );
    const report = buildMonthReport(entries, byId, OCTOBER);

    const content = monthReportPdfContent(report, { email: null, createdAt: CREATED_AT });

    expect(content.dayRows.map((row) => row[1])).toEqual(['7:29', '7:29', '7:29']);
    expect(content.totalRows[0]).toEqual([
      'Arbeit gesamt',
      formatHoursMinutes(monthWorkTotals(report.entries, OCTOBER, 0).totalMs),
    ]);
    expect(content.totalRows[0][1]).toBe('22:29');
  });

  it('replaces characters outside WinAnsi by ? and keeps umlauts', () => {
    const byId = projectsById([project('r', 'Kunde 🚀 A'), project('t', '東京')]);
    const entries = [
      entry({ id: 'a', start: local(2026, 10, 6, 8), end: local(2026, 10, 6, 9), projectId: 'r' }),
      entry({ id: 'b', start: local(2026, 10, 7, 8), end: local(2026, 10, 7, 9), projectId: 't' }),
    ];

    const content = monthReportPdfContent(buildMonthReport(entries, byId, OCTOBER), {
      email: 'jürgen@exämple.de',
      createdAt: CREATED_AT,
    });

    expect(content.headerLines[0]).toBe('jürgen@exämple.de');
    expect(content.dayRows[0][3]).toBe('Kunde ? A 1:00');
    expect(content.dayRows[1][3]).toBe('?? 1:00');
    expect(content.totalRows).toContainEqual(['Arbeit – Kunde ? A', '1:00']);
    expect(content.totalRows).toContainEqual(['Arbeit – ??', '1:00']);
  });

  it('shows a break-only day with zero work and an empty Projekte cell', () => {
    const byId = projectsById([]);
    const brk = entry({ id: 'b', type: 'break', start: local(2026, 10, 6, 12), end: local(2026, 10, 6, 12, 30) });

    const content = monthReportPdfContent(buildMonthReport([brk], byId, OCTOBER), { email: null, createdAt: CREATED_AT });

    expect(content.dayRows).toEqual([['Di 06.10.2026', '0:00', '0:30', '']]);
  });

  it('produces only the two zero total rows for an empty report', () => {
    const byId = projectsById([]);

    const content = monthReportPdfContent(buildMonthReport([], byId, OCTOBER), { email: null, createdAt: CREATED_AT });

    expect(content.dayRows).toEqual([]);
    expect(content.totalRows).toEqual([
      ['Arbeit gesamt', '0:00'],
      ['Pause gesamt', '0:00'],
    ]);
  });
});

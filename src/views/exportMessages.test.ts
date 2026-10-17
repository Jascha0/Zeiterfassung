import { describe, expect, it } from 'vitest';
import {
  CSV_EXPORT_LABEL,
  EXPORT_EMPTY_MESSAGE,
  EXPORT_FAILED_MESSAGE,
  EXPORT_HEADING,
  EXPORT_OFFLINE_MESSAGE,
  EXPORT_STATUS_LABEL,
  PDF_EXPORT_LABEL,
  exportStatusLines,
  runningExcludedMessage,
} from './exportMessages';

const OFFLINE = 'Offline: Der Export enthält nur die auf diesem Gerät gespeicherten Daten.';
const EMPTY = 'Keine Einträge in diesem Monat.';

describe('export messages', () => {
  it('has the exact German strings', () => {
    expect(EXPORT_HEADING).toBe('Exportieren');
    expect(CSV_EXPORT_LABEL).toBe('CSV exportieren');
    expect(PDF_EXPORT_LABEL).toBe('PDF exportieren');
    expect(EXPORT_STATUS_LABEL).toBe('Exportstatus');
    expect(EXPORT_OFFLINE_MESSAGE).toBe(OFFLINE);
    expect(EXPORT_EMPTY_MESSAGE).toBe(EMPTY);
    expect(EXPORT_FAILED_MESSAGE).toBe('Export fehlgeschlagen.');
  });

  it('words the running line in singular and plural', () => {
    expect(runningExcludedMessage(1)).toBe('1 laufender Eintrag ist nicht enthalten.');
    expect(runningExcludedMessage(2)).toBe('2 laufende Einträge sind nicht enthalten.');
    expect(runningExcludedMessage(10)).toBe('10 laufende Einträge sind nicht enthalten.');
  });
});

describe('exportStatusLines', () => {
  it('keeps the order offline, empty, running for every combination', () => {
    for (const online of [true, false]) {
      for (const closedCount of [0, 3]) {
        for (const runningCount of [0, 2]) {
          const expected: string[] = [];
          if (!online) expected.push(OFFLINE);
          if (closedCount === 0) expected.push(EMPTY);
          if (runningCount > 0) expected.push('2 laufende Einträge sind nicht enthalten.');
          expect(exportStatusLines({ online, entriesLoaded: true, closedCount, runningCount })).toEqual(expected);
        }
      }
    }
  });

  it('returns no lines when online, loaded, with closed and no running entries', () => {
    expect(exportStatusLines({ online: true, entriesLoaded: true, closedCount: 1, runningCount: 0 })).toEqual([]);
  });

  it('suppresses the empty and running lines until entries are loaded', () => {
    expect(exportStatusLines({ online: true, entriesLoaded: false, closedCount: 0, runningCount: 2 })).toEqual([]);
    expect(exportStatusLines({ online: false, entriesLoaded: false, closedCount: 0, runningCount: 2 })).toEqual([
      OFFLINE,
    ]);
  });
});

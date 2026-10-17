export const EXPORT_HEADING = 'Exportieren';
export const CSV_EXPORT_LABEL = 'CSV exportieren';
export const PDF_EXPORT_LABEL = 'PDF exportieren';
export const EXPORT_STATUS_LABEL = 'Exportstatus';
export const EXPORT_OFFLINE_MESSAGE = 'Offline: Der Export enthält nur die auf diesem Gerät gespeicherten Daten.';
export const EXPORT_EMPTY_MESSAGE = 'Keine Einträge in diesem Monat.';
export const EXPORT_FAILED_MESSAGE = 'Export fehlgeschlagen.';

/** 1 → '1 laufender Eintrag ist nicht enthalten.'; n ≥ 2 → `${n} laufende Einträge sind nicht enthalten.` */
export function runningExcludedMessage(count: number): string {
  return count === 1 ? '1 laufender Eintrag ist nicht enthalten.' : `${count} laufende Einträge sind nicht enthalten.`;
}

/** In order, only if applicable: offline line (online === false); empty line (entriesLoaded && closedCount === 0);
 *  running line (entriesLoaded && runningCount > 0). */
export function exportStatusLines(input: {
  online: boolean;
  entriesLoaded: boolean;
  closedCount: number;
  runningCount: number;
}): string[] {
  const lines: string[] = [];
  if (!input.online) lines.push(EXPORT_OFFLINE_MESSAGE);
  if (input.entriesLoaded && input.closedCount === 0) lines.push(EXPORT_EMPTY_MESSAGE);
  if (input.entriesLoaded && input.runningCount > 0) lines.push(runningExcludedMessage(input.runningCount));
  return lines;
}

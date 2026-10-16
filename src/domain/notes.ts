export const NOTE_MAX_LENGTH = 500;

export type NoteResult = { ok: true; note: string | undefined } | { ok: false; reason: 'tooLong' };

/** trim(); '' → { ok: true, note: undefined }; trimmed length > 500 → tooLong; else the trimmed note. */
export function normalizeNote(raw: string): NoteResult {
  const note = raw.trim();
  if (note === '') return { ok: true, note: undefined };
  if (note.length > NOTE_MAX_LENGTH) return { ok: false, reason: 'tooLong' };
  return { ok: true, note };
}

/** Collapses every whitespace run (incl. newlines) to one space and trims; if longer than maxLength,
 *  returns the first maxLength chars, trimEnd(), plus '…'. */
export function truncateNote(note: string, maxLength = 60): string {
  const collapsed = note.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= maxLength) return collapsed;
  return `${collapsed.slice(0, maxLength).trimEnd()}…`;
}

const WRITE_FAILED = 'Die Änderung konnte nicht gespeichert werden.';
const STORAGE_FULL = 'Der Speicher ist voll. Die Änderung wurde nicht gespeichert.';

function errorName(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const name = (error as { name?: unknown }).name;
  return typeof name === 'string' ? name : undefined;
}

/** Maps a local persistence failure to its German message. Storage exhaustion has its own message;
 *  every other cause (store unavailable, aborted transaction, unknown) shares the generic one. */
export function mapWriteError(error: unknown): string {
  return errorName(error) === 'QuotaExceededError' ? STORAGE_FULL : WRITE_FAILED;
}

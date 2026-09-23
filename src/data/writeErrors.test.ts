import { describe, expect, it } from 'vitest';
import { mapWriteError } from './writeErrors';

const WRITE_FAILED = 'Die Änderung konnte nicht gespeichert werden.';
const STORAGE_FULL = 'Der Speicher ist voll. Die Änderung wurde nicht gespeichert.';

describe('mapWriteError', () => {
  it('maps a DOMException named QuotaExceededError to the storage-full message', () => {
    expect(mapWriteError(new DOMException('quota', 'QuotaExceededError'))).toBe(STORAGE_FULL);
  });

  it('maps any object whose name is QuotaExceededError to the storage-full message', () => {
    expect(mapWriteError({ name: 'QuotaExceededError' })).toBe(STORAGE_FULL);
  });

  it('maps an aborted transaction to the generic message', () => {
    expect(mapWriteError(new DOMException('abort', 'AbortError'))).toBe(WRITE_FAILED);
  });

  it('maps a plain error to the generic message', () => {
    expect(mapWriteError(new Error('boom'))).toBe(WRITE_FAILED);
  });

  it('maps non-object values to the generic message', () => {
    expect(mapWriteError('boom')).toBe(WRITE_FAILED);
    expect(mapWriteError(null)).toBe(WRITE_FAILED);
    expect(mapWriteError(undefined)).toBe(WRITE_FAILED);
  });
});

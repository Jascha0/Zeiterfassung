import { describe, expect, it } from 'vitest';
import { mapWriteError } from './writeErrors';

describe('mapWriteError', () => {
  it('maps permission-denied to the specific German message', () => {
    expect(mapWriteError({ code: 'permission-denied' })).toBe('Speichern fehlgeschlagen: keine Berechtigung.');
  });

  it('maps any other code to the generic German message', () => {
    expect(mapWriteError({ code: 'unavailable' })).toBe('Speichern fehlgeschlagen. Bitte versuche es später erneut.');
  });

  it('maps an error without a code to the generic message', () => {
    expect(mapWriteError(new Error('boom'))).toBe('Speichern fehlgeschlagen. Bitte versuche es später erneut.');
  });

  it('maps a non-object error to the generic message', () => {
    expect(mapWriteError('boom')).toBe('Speichern fehlgeschlagen. Bitte versuche es später erneut.');
    expect(mapWriteError(null)).toBe('Speichern fehlgeschlagen. Bitte versuche es später erneut.');
    expect(mapWriteError(undefined)).toBe('Speichern fehlgeschlagen. Bitte versuche es später erneut.');
  });
});

import { describe, expect, it } from 'vitest';
import { AUTH_MESSAGES, isCancelledAuthError, mapAuthError, shouldFallbackToRedirect } from './authErrors';
import { AuthError, type AuthErrorCode } from './authTypes';

const DIRECT_CODES: AuthErrorCode[] = [
  'invalid-credential',
  'wrong-password',
  'user-not-found',
  'email-already-in-use',
  'weak-password',
  'invalid-email',
  'account-exists-with-different-credential',
  'credential-already-in-use',
  'provider-already-linked',
  'requires-recent-login',
  'network-request-failed',
  'too-many-requests',
  'popup-blocked',
  'user-disabled',
];

describe('mapAuthError: every code in AUTH_MESSAGES', () => {
  it.each(DIRECT_CODES)('maps "auth/%s" to the exact German message', (code) => {
    const error = mapAuthError({ code: `auth/${code}` });
    expect(error).toBeInstanceOf(AuthError);
    expect(error.code).toBe(code);
    expect(error.message).toBe(AUTH_MESSAGES[code]);
  });

  it.each(DIRECT_CODES)('maps the bare code "%s" (without auth/ prefix) the same way', (code) => {
    const error = mapAuthError({ code });
    expect(error.code).toBe(code);
    expect(error.message).toBe(AUTH_MESSAGES[code]);
  });
});

describe('mapAuthError: cancelled aliases', () => {
  it.each(['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'auth/user-cancelled'])(
    'maps "%s" to cancelled with an empty message',
    (raw) => {
      const error = mapAuthError({ code: raw });
      expect(error.code).toBe('cancelled');
      expect(error.message).toBe('');
    },
  );
});

describe('mapAuthError: other aliases', () => {
  it('maps "auth/operation-not-supported-in-environment" to popup-blocked', () => {
    expect(mapAuthError({ code: 'auth/operation-not-supported-in-environment' }).code).toBe('popup-blocked');
  });

  it('maps "auth/invalid-login-credentials" to invalid-credential', () => {
    expect(mapAuthError({ code: 'auth/invalid-login-credentials' }).code).toBe('invalid-credential');
  });
});

describe('mapAuthError: fallback to unknown', () => {
  it('maps a non-object error to unknown', () => {
    expect(mapAuthError('boom').code).toBe('unknown');
    expect(mapAuthError('boom').message).toBe(AUTH_MESSAGES.unknown);
  });

  it('maps null to unknown', () => {
    expect(mapAuthError(null).code).toBe('unknown');
  });

  it('maps undefined to unknown', () => {
    expect(mapAuthError(undefined).code).toBe('unknown');
  });

  it('maps an object with no code to unknown', () => {
    expect(mapAuthError({ message: 'oops' }).code).toBe('unknown');
  });

  it('maps an unrecognised code to unknown', () => {
    expect(mapAuthError({ code: 'auth/something-else' }).code).toBe('unknown');
  });

  it('maps a code equal to an Object.prototype property name to unknown (no prototype leakage)', () => {
    expect(mapAuthError({ code: 'constructor' }).code).toBe('unknown');
    expect(mapAuthError({ code: 'toString' }).code).toBe('unknown');
    expect(mapAuthError({ code: 'hasOwnProperty' }).code).toBe('unknown');
  });

  it('maps a non-string code to unknown', () => {
    expect(mapAuthError({ code: 42 }).code).toBe('unknown');
  });
});

describe('mapAuthError: AuthError passthrough', () => {
  it('returns an AuthError input unchanged', () => {
    const original = new AuthError('weak-password', AUTH_MESSAGES['weak-password']);
    expect(mapAuthError(original)).toBe(original);
  });
});

describe('isCancelledAuthError', () => {
  it('is true for a cancelled-mapping error', () => {
    expect(isCancelledAuthError({ code: 'auth/popup-closed-by-user' })).toBe(true);
  });

  it('is false for other errors', () => {
    expect(isCancelledAuthError({ code: 'auth/wrong-password' })).toBe(false);
    expect(isCancelledAuthError(null)).toBe(false);
  });
});

describe('shouldFallbackToRedirect', () => {
  it('is true for raw "auth/popup-blocked"', () => {
    expect(shouldFallbackToRedirect({ code: 'auth/popup-blocked' })).toBe(true);
  });

  it('is true for raw "auth/operation-not-supported-in-environment"', () => {
    expect(shouldFallbackToRedirect({ code: 'auth/operation-not-supported-in-environment' })).toBe(true);
  });

  it('is false for other codes', () => {
    expect(shouldFallbackToRedirect({ code: 'auth/wrong-password' })).toBe(false);
  });

  it('is false when the error has no code', () => {
    expect(shouldFallbackToRedirect(null)).toBe(false);
  });
});

import type { AuthUser } from '../auth/authTypes';

/** Auth fixture for view tests. It lives here, not under src/views/, so no `uid` literal remains in a
 *  directory that 0034 requires to be identity-free. Deleted in 2R-B with the auth stack. */
export function testAuthUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    uid: 'u1',
    email: 'a@b.de',
    displayName: null,
    emailVerified: true,
    providerIds: ['password'],
    ...overrides,
  };
}

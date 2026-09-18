import { vi } from 'vitest';
import type { AuthService, AuthUser, Unsubscribe } from '../auth/authTypes';

/**
 * Controllable AuthService fake for view/context tests.
 * Every method is a vi.fn() with a resolving default; tests override behaviour
 * with mockRejectedValueOnce / mockImplementationOnce as needed.
 * onAuthStateChanged calls back asynchronously (queueMicrotask) like the spec requires.
 */
export class FakeAuthService implements AuthService {
  private user: AuthUser | null = null;
  private readonly listeners = new Set<(user: AuthUser | null) => void>();

  onAuthStateChanged = vi.fn((cb: (user: AuthUser | null) => void): Unsubscribe => {
    this.listeners.add(cb);
    queueMicrotask(() => {
      if (this.listeners.has(cb)) cb(this.user);
    });
    return () => {
      this.listeners.delete(cb);
    };
  });

  signInWithGoogle = vi.fn(async (): Promise<void> => {});
  completeRedirect = vi.fn(async (): Promise<void> => {});
  signInWithEmail = vi.fn(async (_email: string, _password: string): Promise<void> => {});
  registerWithEmail = vi.fn(async (_email: string, _password: string): Promise<void> => {});
  sendPasswordReset = vi.fn(async (_email: string): Promise<void> => {});
  resendVerificationEmail = vi.fn(async (): Promise<void> => {});
  reloadUser = vi.fn(async (): Promise<void> => {});
  linkGoogle = vi.fn(async (): Promise<void> => {});
  linkPassword = vi.fn(async (_password: string): Promise<void> => {});
  signOut = vi.fn(async (): Promise<void> => {
    this.setUser(null);
  });

  /** Test helper: push a new current user and notify subscribers synchronously. */
  setUser(user: AuthUser | null): void {
    this.user = user;
    for (const listener of [...this.listeners]) listener(user);
  }

  getUser(): AuthUser | null {
    return this.user;
  }
}

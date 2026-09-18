export type Unsubscribe = () => void;
export type AuthProviderId = 'google.com' | 'password';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
  providerIds: AuthProviderId[];
}

export type AuthErrorCode =
  | 'invalid-credential'
  | 'wrong-password'
  | 'user-not-found'
  | 'email-already-in-use'
  | 'weak-password'
  | 'invalid-email'
  | 'account-exists-with-different-credential'
  | 'credential-already-in-use'
  | 'provider-already-linked'
  | 'requires-recent-login'
  | 'network-request-failed'
  | 'too-many-requests'
  | 'popup-blocked'
  | 'cancelled'
  | 'user-disabled'
  | 'unknown';

export class AuthError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

export interface AuthService {
  onAuthStateChanged(cb: (user: AuthUser | null) => void): Unsubscribe;
  signInWithGoogle(): Promise<void>;
  completeRedirect(): Promise<void>;
  signInWithEmail(email: string, password: string): Promise<void>;
  registerWithEmail(email: string, password: string): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  resendVerificationEmail(): Promise<void>;
  reloadUser(): Promise<void>;
  linkGoogle(): Promise<void>;
  linkPassword(password: string): Promise<void>;
  signOut(): Promise<void>;
}

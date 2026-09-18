import {
  EmailAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getRedirectResult,
  linkWithCredential,
  linkWithPopup,
  linkWithRedirect,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut as firebaseSignOut,
  type Auth,
  type User,
} from 'firebase/auth';
import { AUTH_MESSAGES, mapAuthError, shouldFallbackToRedirect } from './authErrors';
import { AuthError, type AuthProviderId, type AuthService, type AuthUser, type Unsubscribe } from './authTypes';

const KNOWN_PROVIDER_IDS: readonly AuthProviderId[] = ['google.com', 'password'];

export function toAuthUser(user: User): AuthUser {
  const providerIds: AuthProviderId[] = [];
  for (const info of user.providerData) {
    const id = KNOWN_PROVIDER_IDS.find((known) => known === info.providerId);
    if (id !== undefined && !providerIds.includes(id)) providerIds.push(id);
  }
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    emailVerified: user.emailVerified,
    providerIds,
  };
}

export class FirebaseAuthService implements AuthService {
  private readonly auth: Auth;
  private readonly listeners = new Set<(user: AuthUser | null) => void>();

  constructor(auth: Auth) {
    this.auth = auth;
  }

  onAuthStateChanged(cb: (user: AuthUser | null) => void): Unsubscribe {
    this.listeners.add(cb);
    const unsubscribeFirebase = firebaseOnAuthStateChanged(this.auth, (user) => {
      cb(user ? toAuthUser(user) : null);
    });
    return () => {
      this.listeners.delete(cb);
      unsubscribeFirebase();
    };
  }

  async signInWithGoogle(): Promise<void> {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(this.auth, provider);
    } catch (error) {
      if (!shouldFallbackToRedirect(error)) throw mapAuthError(error);
      try {
        await signInWithRedirect(this.auth, provider);
      } catch (redirectError) {
        throw mapAuthError(redirectError);
      }
    }
  }

  async completeRedirect(): Promise<void> {
    try {
      const result = await getRedirectResult(this.auth);
      if (result !== null && result.operationType === 'link') {
        await this.reloadAndNotify();
      }
    } catch (error) {
      const mapped = mapAuthError(error);
      if (mapped.code === 'cancelled') return;
      throw mapped;
    }
  }

  async signInWithEmail(email: string, password: string): Promise<void> {
    try {
      await signInWithEmailAndPassword(this.auth, email, password);
    } catch (error) {
      throw mapAuthError(error);
    }
  }

  async registerWithEmail(email: string, password: string): Promise<void> {
    let user: User;
    try {
      const credential = await createUserWithEmailAndPassword(this.auth, email, password);
      user = credential.user;
    } catch (error) {
      throw mapAuthError(error);
    }
    try {
      await sendEmailVerification(user);
    } catch (error) {
      console.warn('Bestätigungs-E-Mail konnte nicht gesendet werden', error);
    }
  }

  async sendPasswordReset(email: string): Promise<void> {
    try {
      await sendPasswordResetEmail(this.auth, email);
    } catch (error) {
      const mapped = mapAuthError(error);
      if (mapped.code === 'user-not-found') return;
      throw mapped;
    }
  }

  async resendVerificationEmail(): Promise<void> {
    const user = this.auth.currentUser;
    if (user === null) return;
    try {
      await sendEmailVerification(user);
    } catch (error) {
      throw mapAuthError(error);
    }
  }

  async reloadUser(): Promise<void> {
    try {
      await this.reloadAndNotify();
    } catch (error) {
      throw mapAuthError(error);
    }
  }

  async linkGoogle(): Promise<void> {
    const user = this.auth.currentUser;
    if (user === null) throw new AuthError('unknown', AUTH_MESSAGES.unknown);
    const provider = new GoogleAuthProvider();
    try {
      try {
        await linkWithPopup(user, provider);
      } catch (error) {
        if (!shouldFallbackToRedirect(error)) throw error;
        await linkWithRedirect(user, provider);
        return;
      }
      await this.reloadAndNotify();
    } catch (error) {
      throw mapAuthError(error);
    }
  }

  async linkPassword(password: string): Promise<void> {
    const user = this.auth.currentUser;
    if (user === null || !user.email) throw new AuthError('unknown', AUTH_MESSAGES.unknown);
    try {
      await linkWithCredential(user, EmailAuthProvider.credential(user.email, password));
      await this.reloadAndNotify();
    } catch (error) {
      throw mapAuthError(error);
    }
  }

  async signOut(): Promise<void> {
    try {
      await firebaseSignOut(this.auth);
    } catch (error) {
      throw mapAuthError(error);
    }
  }

  private async reloadAndNotify(): Promise<void> {
    const user = this.auth.currentUser;
    if (user === null) return;
    await reload(user);
    this.notify();
  }

  private notify(): void {
    const user = this.auth.currentUser;
    const value = user ? toAuthUser(user) : null;
    for (const listener of this.listeners) listener(value);
  }
}

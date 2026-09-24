import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import type { AuthService } from '../auth/authTypes';
import { FirebaseAuthService } from '../auth/firebaseAuthService';
import type { FirebaseWebConfig } from './config';

/** Deleted in 2R-B together with the rest of the auth stack (0035). */
export function createFirebaseAuthService(config: FirebaseWebConfig): AuthService {
  const app = initializeApp(config);
  const auth = getAuth(app);
  auth.languageCode = 'de';
  return new FirebaseAuthService(auth);
}

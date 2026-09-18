import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import type { Services } from '../app/ServicesContext';
import { FirebaseAuthService } from '../auth/firebaseAuthService';
import { FirestoreRepository } from '../data/firestoreRepository';
import type { FirebaseWebConfig } from './config';

export function createFirebaseServices(config: FirebaseWebConfig): Services {
  const app = initializeApp(config);
  const auth = getAuth(app);
  auth.languageCode = 'de';
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  const repo = new FirestoreRepository(db);
  return { auth: new FirebaseAuthService(auth), entries: repo, settings: repo };
}

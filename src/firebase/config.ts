export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  storageBucket?: string;
  messagingSenderId?: string;
}

function readValue(env: Record<string, string | boolean | undefined>, key: string): string {
  const value = env[key];
  return typeof value === 'string' ? value.trim() : '';
}

export function readFirebaseConfig(env: Record<string, string | boolean | undefined>): FirebaseWebConfig | null {
  const apiKey = readValue(env, 'VITE_FIREBASE_API_KEY');
  const authDomain = readValue(env, 'VITE_FIREBASE_AUTH_DOMAIN');
  const projectId = readValue(env, 'VITE_FIREBASE_PROJECT_ID');
  const appId = readValue(env, 'VITE_FIREBASE_APP_ID');
  if (!apiKey || !authDomain || !projectId || !appId) return null;

  const config: FirebaseWebConfig = { apiKey, authDomain, projectId, appId };
  const storageBucket = readValue(env, 'VITE_FIREBASE_STORAGE_BUCKET');
  if (storageBucket) config.storageBucket = storageBucket;
  const messagingSenderId = readValue(env, 'VITE_FIREBASE_MESSAGING_SENDER_ID');
  if (messagingSenderId) config.messagingSenderId = messagingSenderId;
  return config;
}

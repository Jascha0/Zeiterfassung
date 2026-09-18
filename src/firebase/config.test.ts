import { describe, expect, it } from 'vitest';
import { readFirebaseConfig } from './config';

const FULL_ENV = {
  VITE_FIREBASE_API_KEY: 'api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'project.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'project',
  VITE_FIREBASE_APP_ID: 'app-id',
  VITE_FIREBASE_STORAGE_BUCKET: 'project.appspot.com',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '12345',
};

describe('readFirebaseConfig', () => {
  it('reads a complete config (happy path)', () => {
    expect(readFirebaseConfig(FULL_ENV)).toEqual({
      apiKey: 'api-key',
      authDomain: 'project.firebaseapp.com',
      projectId: 'project',
      appId: 'app-id',
      storageBucket: 'project.appspot.com',
      messagingSenderId: '12345',
    });
  });

  it('returns null when a required var is missing entirely (edge case 1)', () => {
    const { VITE_FIREBASE_API_KEY, ...rest } = FULL_ENV;
    expect(readFirebaseConfig(rest)).toBeNull();
  });

  it.each(['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID'])(
    'returns null when required var %s is empty',
    (key) => {
      expect(readFirebaseConfig({ ...FULL_ENV, [key]: '' })).toBeNull();
    },
  );

  it.each(['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_APP_ID'])(
    'treats a whitespace-only required var %s as missing (edge case 2)',
    (key) => {
      expect(readFirebaseConfig({ ...FULL_ENV, [key]: '   ' })).toBeNull();
    },
  );

  it('trims whitespace from required values', () => {
    const config = readFirebaseConfig({ ...FULL_ENV, VITE_FIREBASE_API_KEY: '  api-key  ' });
    expect(config?.apiKey).toBe('api-key');
  });

  it('omits optional values that are empty after trim (edge case 2)', () => {
    const config = readFirebaseConfig({
      ...FULL_ENV,
      VITE_FIREBASE_STORAGE_BUCKET: '',
      VITE_FIREBASE_MESSAGING_SENDER_ID: '   ',
    });
    expect(config).not.toBeNull();
    expect(config).not.toHaveProperty('storageBucket');
    expect(config).not.toHaveProperty('messagingSenderId');
  });

  it('omits optional values that are entirely missing', () => {
    const { VITE_FIREBASE_STORAGE_BUCKET, VITE_FIREBASE_MESSAGING_SENDER_ID, ...rest } = FULL_ENV;
    const config = readFirebaseConfig(rest);
    expect(config).not.toBeNull();
    expect(config).not.toHaveProperty('storageBucket');
    expect(config).not.toHaveProperty('messagingSenderId');
  });

  it('ignores non-string env values (e.g. boolean) treating them as missing', () => {
    expect(readFirebaseConfig({ ...FULL_ENV, VITE_FIREBASE_API_KEY: true })).toBeNull();
  });
});

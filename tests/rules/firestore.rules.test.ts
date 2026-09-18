import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest';

const PROJECT_ID = 'demo-zeiterfassung';
const OWNER_UID = 'owner-uid';
const OTHER_UID = 'other-uid';

let testEnv: RulesTestEnvironment;

function validEntry(overrides: Record<string, unknown> = {}) {
  return {
    type: 'work',
    start: serverTimestamp(),
    end: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('users/{uid}/entries: owner access', () => {
  it('owner can create a valid entry', async () => {
    const db = testEnv.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(setDoc(doc(db, 'users', OWNER_UID, 'entries', 'e1'), validEntry()));
  });

  it('owner can read their own entries', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', OWNER_UID, 'entries', 'e1'), validEntry());
    });
    const db = testEnv.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(getDoc(doc(db, 'users', OWNER_UID, 'entries', 'e1')));
  });

  it('owner can update a valid entry', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', OWNER_UID, 'entries', 'e1'), validEntry());
    });
    const db = testEnv.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(
      updateDoc(doc(db, 'users', OWNER_UID, 'entries', 'e1'), { end: serverTimestamp(), updatedAt: serverTimestamp() }),
    );
  });

  it('owner can delete their own entry', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', OWNER_UID, 'entries', 'e1'), validEntry());
    });
    const db = testEnv.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(deleteDoc(doc(db, 'users', OWNER_UID, 'entries', 'e1')));
  });
});

describe('users/{uid}/entries: unauthenticated and cross-user access denied', () => {
  it('unauthenticated read is denied', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', OWNER_UID, 'entries', 'e1'), validEntry());
    });
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'users', OWNER_UID, 'entries', 'e1')));
  });

  it('unauthenticated write is denied', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(db, 'users', OWNER_UID, 'entries', 'e1'), validEntry()));
  });

  it('user A reading users/B/entries is denied', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', OWNER_UID, 'entries', 'e1'), validEntry());
    });
    const db = testEnv.authenticatedContext(OTHER_UID).firestore();
    await assertFails(getDoc(doc(db, 'users', OWNER_UID, 'entries', 'e1')));
  });

  it('user A writing to users/B/entries is denied', async () => {
    const db = testEnv.authenticatedContext(OTHER_UID).firestore();
    await assertFails(setDoc(doc(db, 'users', OWNER_UID, 'entries', 'e1'), validEntry()));
  });

  it('user A updating or deleting an entry of user B is denied', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', OWNER_UID, 'entries', 'e1'), validEntry());
    });
    const db = testEnv.authenticatedContext(OTHER_UID).firestore();
    const ref = doc(db, 'users', OWNER_UID, 'entries', 'e1');
    await assertFails(updateDoc(ref, { end: serverTimestamp(), updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(ref));
  });

  it('unauthenticated update or delete is denied', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', OWNER_UID, 'entries', 'e1'), validEntry());
    });
    const db = testEnv.unauthenticatedContext().firestore();
    const ref = doc(db, 'users', OWNER_UID, 'entries', 'e1');
    await assertFails(updateDoc(ref, { end: serverTimestamp(), updatedAt: serverTimestamp() }));
    await assertFails(deleteDoc(ref));
  });
});

describe('users/{uid}/entries: shape validation (edge case 36)', () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ['type is not work|break', validEntry({ type: 'other' })],
    ['start is a string, not a timestamp', validEntry({ start: '2026-01-01' })],
    ['end < start', validEntry({ start: serverTimestamp(), end: new Date(0) })],
    ['createdAt missing', (() => {
      const e = validEntry();
      delete (e as Record<string, unknown>).createdAt;
      return e;
    })()],
    ['an extra unknown field is present', validEntry({ extra: 'nope' })],
    ['note is not a string', validEntry({ note: 42 })],
  ];

  it.each(cases)('denies create when %s', async (_label, data) => {
    const db = testEnv.authenticatedContext(OWNER_UID).firestore();
    await assertFails(setDoc(doc(db, 'users', OWNER_UID, 'entries', 'bad'), data));
  });

  it('denies an owner update that sets an invalid type', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', OWNER_UID, 'entries', 'e1'), validEntry());
    });
    const db = testEnv.authenticatedContext(OWNER_UID).firestore();
    await assertFails(updateDoc(doc(db, 'users', OWNER_UID, 'entries', 'e1'), { type: 'other' }));
  });

  it('denies an owner update that moves end before start', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', OWNER_UID, 'entries', 'e1'), validEntry());
    });
    const db = testEnv.authenticatedContext(OWNER_UID).firestore();
    await assertFails(updateDoc(doc(db, 'users', OWNER_UID, 'entries', 'e1'), { end: new Date(0) }));
  });
});

describe('users/{uid}/settings/preferences', () => {
  it('owner can create valid preferences', async () => {
    const db = testEnv.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(setDoc(doc(db, 'users', OWNER_UID, 'settings', 'preferences'), { theme: 'dark' }));
  });

  it('denies an invalid theme value', async () => {
    const db = testEnv.authenticatedContext(OWNER_UID).firestore();
    await assertFails(setDoc(doc(db, 'users', OWNER_UID, 'settings', 'preferences'), { theme: 'blue' }));
  });

  it('denies an extra key', async () => {
    const db = testEnv.authenticatedContext(OWNER_UID).firestore();
    await assertFails(
      setDoc(doc(db, 'users', OWNER_UID, 'settings', 'preferences'), { theme: 'dark', extra: 'x' }),
    );
  });

  it('cross-user access to preferences is denied', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', OWNER_UID, 'settings', 'preferences'), { theme: 'dark' });
    });
    const db = testEnv.authenticatedContext(OTHER_UID).firestore();
    await assertFails(getDoc(doc(db, 'users', OWNER_UID, 'settings', 'preferences')));
  });
});

describe('paths outside the allowed shapes are denied', () => {
  it('writes to the users/{uid} root doc are denied', async () => {
    const db = testEnv.authenticatedContext(OWNER_UID).firestore();
    await assertFails(setDoc(doc(db, 'users', OWNER_UID), { anything: true }));
  });

  it('writes to users/{uid}/projects/x are denied (slice 3, not in scope yet)', async () => {
    const db = testEnv.authenticatedContext(OWNER_UID).firestore();
    await assertFails(setDoc(doc(db, 'users', OWNER_UID, 'projects', 'p1'), { name: 'Test', color: '#fff' }));
  });
});

import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { noopChannelFactory } from './channel';
import { ENTRIES_STORE, IndexedDbAdapter, META_STORE, PREFERENCES_KEY } from './indexedDbAdapter';
import { createLocalStore, type LocalStore } from './localStore';
import { STORE_FORMAT_VERSION } from './persistence';
import { mapWriteError } from './writeErrors';
import type { Entry } from '../domain/types';

let counter = 0;
const openStores: LocalStore[] = [];

function dbName(): string {
  counter += 1;
  return `zeiterfassung-store-${counter}`;
}

function storeOn(name: string, onWriteStaged?: (tx: IDBTransaction) => void): LocalStore {
  const adapter = new IndexedDbAdapter(onWriteStaged === undefined ? { dbName: name } : { dbName: name, onWriteStaged });
  const store = createLocalStore({ adapter, navigator: null, channelFactory: noopChannelFactory });
  openStores.push(store);
  return store;
}

async function rejection(promise: Promise<void>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the write to reject');
}

/** Writes straight into the database, bypassing the adapter's own mapping, so a record the store could
 *  never have produced itself can be planted. Requires the database to exist already. */
async function rawPut(name: string, storeName: string, value: unknown, key?: string): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('raw open failed'));
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([storeName], 'readwrite');
      if (key === undefined) tx.objectStore(storeName).put(value);
      else tx.objectStore(storeName).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('raw put failed'));
    });
  } finally {
    db.close();
  }
}

afterEach(() => {
  for (const store of openStores.splice(0)) store.close();
});

describe('LocalStore over IndexedDB (A4)', () => {
  it('reads everything back through a fresh store instance over the same database', async () => {
    const name = dbName();
    const first = storeOn(name);
    await first.whenReady();
    await first.createEntry({ type: 'work', start: 1000, end: null, createdAt: 1000, updatedAt: 1500 });
    await first.createEntry({ type: 'break', start: 2000, end: 3000, createdAt: 2000, updatedAt: 2000 });
    await first.savePreferences({ theme: 'dark' });
    const written = first.getEntries();
    first.close();

    const second = storeOn(name);
    await second.whenReady();
    expect(second.getEntries()).toEqual(written);
    expect(second.getEntries()[0].end).toBeNull();
    expect(second.getPreferences()).toEqual({ theme: 'dark' });
    expect(second.getFormatVersion()).toBe(STORE_FORMAT_VERSION);
  });
});

describe('LocalStore over IndexedDB: applyTransition rollback (A5)', () => {
  it('rolls close + create back in memory and in the database when the transaction aborts', async () => {
    const name = dbName();
    const seed = storeOn(name);
    await seed.whenReady();
    await seed.createEntry({ type: 'work', start: 1000, end: null, createdAt: 1000, updatedAt: 1000 });
    const seeded = seed.getEntries();
    seed.close();

    const failing = storeOn(name, (tx) => tx.abort());
    await failing.whenReady();
    const before = failing.getEntries();
    expect(before).toEqual(seeded);

    const caught = await rejection(
      failing.applyTransition({
        close: [{ id: before[0].id, end: 5000, updatedAt: 5000 }],
        create: { type: 'break', start: 5000, end: null, createdAt: 5000, updatedAt: 5000 },
        delete: [],
      }),
    );
    expect(mapWriteError(caught)).toBe('Die Änderung konnte nicht gespeichert werden.');
    expect(failing.getEntries()).toEqual(before);
    failing.close();

    const reread = storeOn(name);
    await reread.whenReady();
    expect(reread.getEntries()).toEqual(seeded);
    expect(reread.getEntries()[0].end).toBeNull();
    expect(reread.getEntries()[0].updatedAt).toBe(1000);
  });
});

describe('LocalStore over IndexedDB: atomic close + delete (A5)', () => {
  it('keeps the closed entry open and the deleted entry present after an aborted transaction', async () => {
    const name = dbName();
    const seed = storeOn(name);
    await seed.whenReady();
    await seed.createEntry({ type: 'work', start: 1000, end: null, createdAt: 1000, updatedAt: 1000 });
    await seed.createEntry({ type: 'break', start: 2000, end: 3000, createdAt: 2000, updatedAt: 2000 });
    const seeded = seed.getEntries();
    seed.close();

    const failing = storeOn(name, (tx) => tx.abort());
    await failing.whenReady();
    const before = failing.getEntries();
    expect(before).toEqual(seeded);
    const [a, b] = before;

    const caught = await rejection(
      failing.applyTransition({
        close: [{ id: a.id, end: 4000, updatedAt: 4000 }],
        create: null,
        delete: [b.id],
      }),
    );
    expect(mapWriteError(caught)).toBe('Die Änderung konnte nicht gespeichert werden.');
    expect(failing.getEntries()).toEqual(before);
    failing.close();

    const reread = storeOn(name);
    await reread.whenReady();
    const after = reread.getEntries();
    expect(after).toEqual(seeded);
    expect(after.find((entry) => entry.id === a.id)?.end).toBeNull();
    expect(after.find((entry) => entry.id === b.id)).toBeDefined();
  });
});

describe('LocalStore over IndexedDB: single-write rollback (A6)', () => {
  it('rolls a failed createEntry back and reports the storage-full message', async () => {
    const name = dbName();
    const seed = storeOn(name);
    await seed.whenReady();
    await seed.createEntry({ type: 'work', start: 1000, end: 2000, createdAt: 1000, updatedAt: 1000 });
    const seeded = seed.getEntries();
    seed.close();

    const failing = storeOn(name, () => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    await failing.whenReady();
    const before: Entry[] = failing.getEntries();
    expect(before).toEqual(seeded);

    const caught = await rejection(
      failing.createEntry({ type: 'break', start: 3000, end: null, createdAt: 3000, updatedAt: 3000 }),
    );
    expect(mapWriteError(caught)).toBe('Der Speicher ist voll. Die Änderung wurde nicht gespeichert.');
    expect(failing.getEntries()).toEqual(before);
    failing.close();

    const reread = storeOn(name);
    await reread.whenReady();
    expect(reread.getEntries()).toEqual(seeded);
  });

  it('rolls a failed updateEntry back in memory and in the database', async () => {
    const name = dbName();
    const seed = storeOn(name);
    await seed.whenReady();
    await seed.createEntry({ type: 'work', start: 1000, end: null, createdAt: 1000, updatedAt: 1000 });
    const seeded = seed.getEntries();
    seed.close();

    const failing = storeOn(name, (tx) => tx.abort());
    await failing.whenReady();
    const before: Entry[] = failing.getEntries();
    expect(before).toEqual(seeded);

    const caught = await rejection(
      failing.updateEntry(before[0].id, { type: 'break', start: 1500, end: 9000, updatedAt: 9000 }),
    );
    expect(mapWriteError(caught)).toBe('Die Änderung konnte nicht gespeichert werden.');
    expect(failing.getEntries()).toEqual(before);
    failing.close();

    const reread = storeOn(name);
    await reread.whenReady();
    expect(reread.getEntries()).toEqual(seeded);
    expect(reread.getEntries()[0].end).toBeNull();
    expect(reread.getEntries()[0].type).toBe('work');
    expect(reread.getEntries()[0].start).toBe(1000);
    expect(reread.getEntries()[0].updatedAt).toBe(1000);
  });

  it('rolls a failed deleteEntry back in memory and in the database', async () => {
    const name = dbName();
    const seed = storeOn(name);
    await seed.whenReady();
    await seed.createEntry({ type: 'work', start: 1000, end: 2000, createdAt: 1000, updatedAt: 1000 });
    await seed.createEntry({ type: 'break', start: 3000, end: 4000, createdAt: 3000, updatedAt: 3000 });
    const seeded = seed.getEntries();
    seed.close();

    const failing = storeOn(name, (tx) => tx.abort());
    await failing.whenReady();
    const before: Entry[] = failing.getEntries();
    expect(before).toEqual(seeded);

    const caught = await rejection(failing.deleteEntry(before[1].id));
    expect(mapWriteError(caught)).toBe('Die Änderung konnte nicht gespeichert werden.');
    expect(failing.getEntries()).toEqual(before);
    failing.close();

    const reread = storeOn(name);
    await reread.whenReady();
    expect(reread.getEntries()).toEqual(seeded);
    expect(reread.getEntries().map((entry) => entry.id)).toContain(before[1].id);
  });
});

describe('LocalStore over IndexedDB: load timing (A12)', () => {
  it(
    'records how long loadAll takes for 10 000 records under fake-indexeddb',
    async () => {
      const name = dbName();
      const seed = storeOn(name);
      await seed.whenReady();
      const base = new Date(2020, 0, 1).getTime();
      for (let i = 0; i < 10_000; i += 1) {
        const start = base + i * 6 * 60 * 60 * 1000;
        await seed.createEntry({ type: 'work', start, end: start + 3_600_000, createdAt: start, updatedAt: start });
      }
      seed.close();

      const started = performance.now();
      const reloaded = storeOn(name);
      await reloaded.whenReady();
      const elapsed = performance.now() - started;
      expect(reloaded.getEntries()).toHaveLength(10_000);
      console.info(`loadAll of 10000 records under fake-indexeddb: ${Math.round(elapsed)} ms`);
    },
    60_000,
  );
});

describe('LocalStore over IndexedDB: replaceAll (C13)', () => {
  it('replaces every entry and deletes the preferences, readable through a fresh store', async () => {
    const name = dbName();
    const first = storeOn(name);
    await first.whenReady();
    await first.createEntry({ type: 'work', start: 1000, end: 2000, createdAt: 1000, updatedAt: 1000 });
    await first.createEntry({ type: 'break', start: 3000, end: null, createdAt: 3000, updatedAt: 3000 });
    await first.savePreferences({ theme: 'dark' });

    const imported: Entry = { id: 'imp-1', type: 'work', start: 5000, end: 6000, createdAt: 5000, updatedAt: 5000 };
    await first.replaceAll({ entries: [imported], preferences: null });
    first.close();

    const second = storeOn(name);
    await second.whenReady();
    expect(second.getEntries()).toEqual([imported]);
    expect(second.getPreferences()).toBeNull();
    expect(second.getFormatVersion()).toBe(STORE_FORMAT_VERSION);
  });
});

describe('LocalStore over IndexedDB: malformed stored records (edge cases 4 and 5)', () => {
  it('skips every junk record and the junk preferences, loads the valid entries and reports no error', async () => {
    const name = dbName();
    const seed = storeOn(name);
    await seed.whenReady();
    await seed.createEntry({ type: 'work', start: 1000, end: 2000, createdAt: 1000, updatedAt: 1000 });
    await seed.createEntry({ type: 'break', start: 3000, end: null, createdAt: 3000, updatedAt: 3000 });
    await seed.savePreferences({ theme: 'dark' });
    const valid = seed.getEntries();
    seed.close();

    // Wrong type, missing start, a non-numeric timestamp, and junk from an imagined future version.
    await rawPut(name, ENTRIES_STORE, { id: 'junk-type', type: 'sleep', start: 10, end: null, createdAt: 1, updatedAt: 1 });
    await rawPut(name, ENTRIES_STORE, { id: 'junk-no-start', type: 'work', end: null, createdAt: 1, updatedAt: 1 });
    await rawPut(name, ENTRIES_STORE, { id: 'junk-ts', type: 'work', start: 10, end: null, createdAt: '1', updatedAt: 1 });
    await rawPut(name, ENTRIES_STORE, { id: 'junk-future', kind: 'work', startedAt: 10, v: 7 });
    await rawPut(name, META_STORE, { theme: 'neon' }, PREFERENCES_KEY);

    const reread = storeOn(name);
    const onError = vi.fn();
    reread.subscribeEntriesInRange({ start: 0, end: 10_000 }, vi.fn(), onError);
    await reread.whenReady();

    expect(reread.getEntries()).toEqual(valid);
    expect(reread.getPreferences()).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });
});

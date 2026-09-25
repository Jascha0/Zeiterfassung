import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  IndexedDbAdapter,
  ENTRIES_STORE,
  FORMAT_VERSION_KEY,
  META_STORE,
  PREFERENCES_KEY,
} from './indexedDbAdapter';
import { STORE_FORMAT_VERSION } from './persistence';
import { mapWriteError } from './writeErrors';
import type { Entry } from '../domain/types';

let counter = 0;
const openAdapters: IndexedDbAdapter[] = [];

function adapterFor(dbName: string, onWriteStaged?: (tx: IDBTransaction) => void): IndexedDbAdapter {
  const adapter = new IndexedDbAdapter(onWriteStaged === undefined ? { dbName } : { dbName, onWriteStaged });
  openAdapters.push(adapter);
  return adapter;
}

function dbName(): string {
  counter += 1;
  return `zeiterfassung-test-${counter}`;
}

afterEach(() => {
  for (const adapter of openAdapters.splice(0)) adapter.close();
  vi.unstubAllGlobals();
});

function rawOpen(name: string): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('raw open failed'));
  });
}

/** Reads one record through a raw connection, bypassing the adapter entirely. */
async function rawGet(name: string, store: string, key: string): Promise<unknown> {
  const db = await rawOpen(name);
  try {
    return await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction([store], 'readonly');
      const request = tx.objectStore(store).get(key);
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error ?? new Error('raw get failed'));
    });
  } finally {
    db.close();
  }
}

/** Writes a record through a raw connection, so the adapter's own mapping cannot sanitise it. */
async function rawPut(name: string, store: string, value: unknown, key?: IDBValidKey): Promise<void> {
  const db = await rawOpen(name);
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([store], 'readwrite');
      if (key === undefined) tx.objectStore(store).put(value);
      else tx.objectStore(store).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('raw put failed'));
    });
  } finally {
    db.close();
  }
}

const OPEN: Entry = { id: 'a', type: 'work', start: 1000, end: null, createdAt: 1000, updatedAt: 1000 };
/** Its id sorts *after* OPEN's while its start is *earlier*, so the store's key order (`getAll()` returns
 *  primary-key order) and the expected start order disagree. Any assertion on the returned order therefore
 *  fails if loadAll stops sorting. */
const CLOSED: Entry = {
  id: 'b',
  type: 'break',
  start: 200,
  end: 700,
  createdAt: 200,
  updatedAt: 300,
  projectId: 'p1',
  note: 'Mittag',
};
const IMPORTED: Entry = { id: 'c', type: 'work', start: 5000, end: 6000, createdAt: 5000, updatedAt: 6000 };

describe('IndexedDbAdapter', () => {
  it('writes and reads back every field over a fresh adapter on the same database', async () => {
    const name = dbName();
    const first = adapterFor(name);
    await first.apply({ put: [OPEN], delete: [], preferences: { theme: 'dark' } });
    first.close();

    const second = adapterFor(name);
    const data = await second.loadAll();
    expect(data.entries).toEqual([OPEN]);
    expect(data.entries[0].end).toBeNull();
    expect(data.preferences).toEqual({ theme: 'dark' });
    expect(data.formatVersion).toBe(STORE_FORMAT_VERSION);
  });

  it('returns an empty data set for an untouched database and stores the format version', async () => {
    const name = dbName();
    const adapter = adapterFor(name);

    expect(await adapter.loadAll()).toEqual({ entries: [], preferences: null, formatVersion: 1 });
    expect(await rawGet(name, META_STORE, 'formatVersion')).toBe(1);
  });

  it('round-trips optional fields and a closed entry, and returns entries sorted by start ascending', async () => {
    const name = dbName();
    const adapter = adapterFor(name);
    await adapter.apply({ put: [OPEN, CLOSED], delete: [], preferences: null });

    const data = await adapter.loadAll();
    expect(data.entries).toEqual([CLOSED, OPEN]);
    expect(data.entries[0].end).toBe(700);
    expect(data.entries[0].projectId).toBe('p1');
    expect(data.entries[0].note).toBe('Mittag');
  });

  it('breaks a tie on equal starts by ascending id', async () => {
    const name = dbName();
    const adapter = adapterFor(name);
    const second: Entry = { id: 'b', type: 'work', start: 300, end: 400, createdAt: 300, updatedAt: 300 };
    const first: Entry = { id: 'a', type: 'break', start: 300, end: 400, createdAt: 300, updatedAt: 300 };
    await adapter.apply({ put: [second, first], delete: [], preferences: null });

    const data = await adapter.loadAll();
    expect(data.entries).toEqual([first, second]);
  });

  it('skips a malformed record and still returns the valid ones', async () => {
    const name = dbName();
    const adapter = adapterFor(name);
    await adapter.apply({ put: [OPEN, CLOSED], delete: [], preferences: null });
    await rawPut(name, ENTRIES_STORE, { id: 'x', type: 'nope' });

    const data = await adapter.loadAll();
    expect(data.entries).toEqual([CLOSED, OPEN]);
  });

  it('applies deletes and puts in one transaction', async () => {
    const name = dbName();
    const adapter = adapterFor(name);
    await adapter.apply({ put: [OPEN, CLOSED], delete: [], preferences: null });

    const changed: Entry = { ...OPEN, end: 2000, updatedAt: 2000 };
    await adapter.apply({ put: [changed], delete: [CLOSED.id], preferences: null });

    const data = await adapter.loadAll();
    expect(data.entries).toEqual([changed]);
  });

  it('leaves stored preferences untouched when preferences is null', async () => {
    const name = dbName();
    const adapter = adapterFor(name);
    await adapter.apply({ put: [], delete: [], preferences: { theme: 'dark' } });
    await adapter.apply({ put: [OPEN], delete: [], preferences: null });

    const data = await adapter.loadAll();
    expect(data.preferences).toEqual({ theme: 'dark' });
    expect(await rawGet(name, META_STORE, PREFERENCES_KEY)).toEqual({ theme: 'dark' });
  });

  it('rejects apply and persists nothing when the hook aborts the staged transaction', async () => {
    const name = dbName();
    const aborting = adapterFor(name, (tx) => tx.abort());

    await expect(aborting.apply({ put: [OPEN], delete: [], preferences: null })).rejects.toBeDefined();
    aborting.close();

    const fresh = adapterFor(name);
    expect((await fresh.loadAll()).entries).toEqual([]);
  });

  it('rejects apply with the quota error thrown inside the transaction and rolls the batch back', async () => {
    const name = dbName();
    const seeding = adapterFor(name);
    await seeding.apply({ put: [OPEN], delete: [], preferences: null });
    seeding.close();

    const quota = new DOMException('full', 'QuotaExceededError');
    const failing = adapterFor(name, () => {
      throw quota;
    });
    let caught: unknown = null;
    try {
      await failing.apply({ put: [CLOSED], delete: [OPEN.id], preferences: null });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(quota);
    expect(mapWriteError(caught)).toBe('Der Speicher ist voll. Die Änderung wurde nicht gespeichert.');
    failing.close();

    const fresh = adapterFor(name);
    expect((await fresh.loadAll()).entries).toEqual([OPEN]);
  });

  it('rejects loadAll with a German message when the environment has no IndexedDB', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const adapter = new IndexedDbAdapter({ dbName: dbName() });
    await expect(adapter.loadAll()).rejects.toThrow('IndexedDB ist in dieser Umgebung nicht verfügbar.');
  });

  it('closes idempotently and reopens on the next load', async () => {
    const name = dbName();
    const adapter = adapterFor(name);
    await adapter.apply({ put: [OPEN], delete: [], preferences: { theme: 'light' } });
    adapter.close();
    expect(() => adapter.close()).not.toThrow();

    const data = await adapter.loadAll();
    expect(data.entries).toEqual([OPEN]);
    expect(data.preferences).toEqual({ theme: 'light' });
  });

  it('replaceAll drops every previous entry, writes the imported set and stamps the format version', async () => {
    const name = dbName();
    const adapter = adapterFor(name);
    await adapter.apply({ put: [OPEN, CLOSED], delete: [], preferences: { theme: 'dark' } });
    // A foreign version in storage, so the assertion below can only pass if replaceAll writes
    // STORE_FORMAT_VERSION itself instead of leaving whatever it found there.
    await rawPut(name, META_STORE, 99, FORMAT_VERSION_KEY);

    await adapter.replaceAll({ entries: [IMPORTED], preferences: { theme: 'light' } });

    const data = await adapter.loadAll();
    expect(data.entries).toEqual([IMPORTED]);
    expect(data.preferences).toEqual({ theme: 'light' });
    expect(await rawGet(name, META_STORE, FORMAT_VERSION_KEY)).toBe(STORE_FORMAT_VERSION);
  });

  it('calls onWriteStaged as the last staged step, after the clear, the puts and the preferences delete', async () => {
    const name = dbName();
    const seeding = adapterFor(name);
    await seeding.apply({ put: [OPEN], delete: [], preferences: { theme: 'dark' } });
    seeding.close();

    let stagedEntries = -1;
    let stagedPreferences: unknown = 'never read';
    const observing = adapterFor(name, (tx) => {
      const count = tx.objectStore(ENTRIES_STORE).count();
      count.onsuccess = () => {
        stagedEntries = count.result;
      };
      const preferences = tx.objectStore(META_STORE).get(PREFERENCES_KEY);
      preferences.onsuccess = () => {
        stagedPreferences = preferences.result;
      };
    });

    await observing.replaceAll({ entries: [IMPORTED, CLOSED], preferences: null });

    // Requests issued from the hook queue behind everything replaceAll staged, so they observe the
    // complete write set: the seeded entry gone, both imported entries in, the preferences deleted.
    expect(stagedEntries).toBe(2);
    expect(stagedPreferences).toBeUndefined();
  });

  it('replaceAll with null preferences deletes the preferences record instead of leaving it behind', async () => {
    const name = dbName();
    const adapter = adapterFor(name);
    await adapter.apply({ put: [OPEN], delete: [], preferences: { theme: 'dark' } });

    await adapter.replaceAll({ entries: [IMPORTED, CLOSED], preferences: null });

    expect(await rawGet(name, META_STORE, PREFERENCES_KEY)).toBeUndefined();
    const data = await adapter.loadAll();
    expect(data.entries).toEqual([CLOSED, IMPORTED]);
    expect(data.preferences).toBeNull();
  });

  it('rejects replaceAll with the error thrown inside the staged transaction and keeps every previous record', async () => {
    const name = dbName();
    const seeding = adapterFor(name);
    await seeding.apply({ put: [OPEN], delete: [], preferences: { theme: 'dark' } });
    seeding.close();

    const staged: { mode: string; entries: boolean; meta: boolean }[] = [];
    const failing = adapterFor(name, (tx) => {
      staged.push({
        mode: tx.mode,
        entries: tx.objectStoreNames.contains(ENTRIES_STORE),
        meta: tx.objectStoreNames.contains(META_STORE),
      });
      throw new Error('abbruch');
    });

    await expect(failing.replaceAll({ entries: [IMPORTED, CLOSED], preferences: null })).rejects.toThrow('abbruch');
    // The hook ran exactly once and inside the write transaction: an abort injected before the
    // transaction existed would have had no transaction to hand over.
    expect(staged).toEqual([{ mode: 'readwrite', entries: true, meta: true }]);
    failing.close();

    const fresh = adapterFor(name);
    const data = await fresh.loadAll();
    expect(data.entries).toEqual([OPEN]);
    expect(data.preferences).toEqual({ theme: 'dark' });
    expect(await rawGet(name, META_STORE, PREFERENCES_KEY)).toEqual({ theme: 'dark' });
  });

  it('rejects replaceAll and persists nothing when the hook aborts the staged transaction', async () => {
    const name = dbName();
    const seeding = adapterFor(name);
    await seeding.apply({ put: [OPEN], delete: [], preferences: { theme: 'dark' } });
    seeding.close();

    const aborting = adapterFor(name, (tx) => tx.abort());

    await expect(aborting.replaceAll({ entries: [IMPORTED, CLOSED], preferences: null })).rejects.toBeDefined();
    aborting.close();

    const fresh = adapterFor(name);
    const data = await fresh.loadAll();
    expect(data.entries).toEqual([OPEN]);
    expect(data.preferences).toEqual({ theme: 'dark' });
    expect(await rawGet(name, META_STORE, PREFERENCES_KEY)).toEqual({ theme: 'dark' });
  });
});

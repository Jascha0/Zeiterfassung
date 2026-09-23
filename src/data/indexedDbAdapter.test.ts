import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IndexedDbAdapter, ENTRIES_STORE, META_STORE, PREFERENCES_KEY } from './indexedDbAdapter';
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
async function rawPut(name: string, store: string, value: unknown): Promise<void> {
  const db = await rawOpen(name);
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([store], 'readwrite');
      tx.objectStore(store).put(value);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('raw put failed'));
    });
  } finally {
    db.close();
  }
}

const OPEN: Entry = { id: 'a', type: 'work', start: 1000, end: null, createdAt: 1000, updatedAt: 1000 };
const CLOSED: Entry = {
  id: 'b',
  type: 'break',
  start: 5000,
  end: 7000,
  createdAt: 5000,
  updatedAt: 6000,
  projectId: 'p1',
  note: 'Mittag',
};

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
    await adapter.apply({ put: [CLOSED, OPEN], delete: [], preferences: null });

    const data = await adapter.loadAll();
    expect(data.entries).toEqual([OPEN, CLOSED]);
    expect(data.entries[1].end).toBe(7000);
    expect(data.entries[1].projectId).toBe('p1');
    expect(data.entries[1].note).toBe('Mittag');
  });

  it('skips a malformed record and still returns the valid ones', async () => {
    const name = dbName();
    const adapter = adapterFor(name);
    await adapter.apply({ put: [OPEN, CLOSED], delete: [], preferences: null });
    await rawPut(name, ENTRIES_STORE, { id: 'x', type: 'nope' });

    const data = await adapter.loadAll();
    expect(data.entries).toEqual([OPEN, CLOSED]);
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
});

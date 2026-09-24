import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { noopChannelFactory } from './channel';
import { IndexedDbAdapter } from './indexedDbAdapter';
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

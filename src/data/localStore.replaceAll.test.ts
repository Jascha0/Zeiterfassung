import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeChannelHub } from '../test/fakeChannel';
import type { Entry, NewEntry } from '../domain/types';
import { noopChannelFactory, type ChannelFactory } from './channel';
import { InMemoryAdapter, type InMemoryAdapterSeed } from './inMemoryAdapter';
import { createLocalStore, type LocalStore } from './localStore';
import { STORE_FORMAT_VERSION } from './persistence';

const FULL_RANGE = { start: 0, end: 10_000_000 };

function entry(overrides: Partial<Entry> & { id: string }): Entry {
  return { type: 'work', start: 0, end: null, createdAt: 0, updatedAt: 0, ...overrides };
}

function newEntry(start: number): NewEntry {
  return { type: 'work', start, end: null, createdAt: start, updatedAt: start };
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => queueMicrotask(resolve));
}

/** Drains the microtask queue far enough that any pending reload or persist has run. */
async function settle(rounds = 12): Promise<void> {
  for (let i = 0; i < rounds; i += 1) await flushMicrotasks();
}

const openStores: LocalStore[] = [];

function storeOver(adapter: InMemoryAdapter, channelFactory: ChannelFactory = noopChannelFactory): LocalStore {
  let counter = 0;
  const store = createLocalStore({
    adapter,
    navigator: null,
    channelFactory,
    newId: () => `mem-${(counter += 1)}`,
  });
  openStores.push(store);
  return store;
}

function adapterWith(seed: InMemoryAdapterSeed = {}): InMemoryAdapter {
  return new InMemoryAdapter(seed);
}

afterEach(() => {
  for (const store of openStores.splice(0)) store.close();
});

const OLD_A = entry({ id: 'old-a', start: 1000, end: 2000, createdAt: 1000, updatedAt: 1000 });
const OLD_B = entry({ id: 'old-b', start: 3000, end: 4000, createdAt: 3000, updatedAt: 3000 });
const IMPORTED = entry({ id: 'imp-1', start: 5000, end: 6000, createdAt: 5000, updatedAt: 5000 });

describe('LocalStore.readAll (the guarded full read)', () => {
  it('hands out every entry sorted by start asc, the preferences and the format version (case 1)', async () => {
    const adapter = adapterWith({ entries: [OLD_B, OLD_A], preferences: { theme: 'light' } });
    const store = storeOver(adapter);
    await store.whenReady();

    expect(store.readAll()).toEqual({
      entries: [OLD_A, OLD_B],
      preferences: { theme: 'light' },
      formatVersion: STORE_FORMAT_VERSION,
    });
  });

  it('returns null while the initial load is still running (case 2a)', async () => {
    const adapter = adapterWith({ entries: [OLD_A], preferences: { theme: 'light' } });
    const release = adapter.holdNextLoad();
    const store = storeOver(adapter);

    expect(store.readAll()).toBeNull();

    release();
    await store.whenReady();
    expect(store.readAll()).not.toBeNull();
  });

  it('returns null after the initial load failed (case 2b)', async () => {
    const adapter = adapterWith({ entries: [OLD_A], preferences: { theme: 'light' } });
    adapter.failNextLoad(new Error('boom'));
    const store = storeOver(adapter);
    await store.whenReady();

    expect(store.readAll()).toBeNull();
  });

  it('hands out copies, so mutating the result does not change the store (case 3)', async () => {
    const adapter = adapterWith({ entries: [OLD_A, OLD_B], preferences: { theme: 'light' } });
    const store = storeOver(adapter);
    await store.whenReady();

    const first = store.readAll();
    if (first === null) throw new Error('readAll refused unexpectedly');
    first.entries.pop();
    first.entries[0].start = 999_999;
    first.entries[0].id = 'tampered';
    if (first.preferences !== null) first.preferences.theme = 'dark';
    first.formatVersion = 42;

    expect(store.readAll()).toEqual({
      entries: [OLD_A, OLD_B],
      preferences: { theme: 'light' },
      formatVersion: STORE_FORMAT_VERSION,
    });
  });
});

describe('LocalStore.replaceAll (the import)', () => {
  it('replaces entries and preferences in memory, in storage and for subscribers (case 4)', async () => {
    const adapter = adapterWith({ entries: [OLD_A, OLD_B], preferences: { theme: 'light' } });
    const store = storeOver(adapter);
    await store.whenReady();
    const onEntries = vi.fn();
    const onPrefs = vi.fn();
    store.subscribeEntriesInRange(FULL_RANGE, onEntries, vi.fn());
    store.subscribePreferences(onPrefs, vi.fn());
    await settle();

    await store.replaceAll({ entries: [IMPORTED], preferences: { theme: 'dark' } });

    expect(store.getEntries()).toEqual([IMPORTED]);
    expect(store.getPreferences()).toEqual({ theme: 'dark' });
    expect(adapter.storedEntries()).toEqual([IMPORTED]);
    expect(adapter.storedPreferences()).toEqual({ theme: 'dark' });
    expect(onEntries.mock.calls.at(-1)?.[0]).toEqual([IMPORTED]);
    expect(onPrefs.mock.calls.at(-1)?.[0]).toEqual({ theme: 'dark' });
  });

  it('clears the preferences when handed null, in memory, in storage and for subscribers (case 5)', async () => {
    const adapter = adapterWith({ entries: [OLD_A, OLD_B], preferences: { theme: 'light' } });
    const store = storeOver(adapter);
    await store.whenReady();
    const onPrefs = vi.fn();
    store.subscribePreferences(onPrefs, vi.fn());
    await settle();

    await store.replaceAll({ entries: [IMPORTED], preferences: null });

    expect(store.getPreferences()).toBeNull();
    expect(adapter.storedPreferences()).toBeNull();
    expect(onPrefs.mock.calls.at(-1)?.[0]).toBeNull();
  });

  it('leaves no preferences behind for a fresh store over the same storage (case 6)', async () => {
    const adapter = adapterWith({ entries: [OLD_A, OLD_B], preferences: { theme: 'light' } });
    const store = storeOver(adapter);
    await store.whenReady();
    await store.replaceAll({ entries: [IMPORTED], preferences: null });

    const fresh = storeOver(adapter);
    await fresh.whenReady();

    expect(fresh.getPreferences()).toBeNull();
    expect(fresh.getEntries()).toEqual([IMPORTED]);
  });

  it('swaps memory only after the adapter resolved (case 7)', async () => {
    const adapter = adapterWith({ entries: [OLD_A, OLD_B], preferences: { theme: 'light' } });
    const store = storeOver(adapter);
    await store.whenReady();
    const onEntries = vi.fn();
    store.subscribeEntriesInRange(FULL_RANGE, onEntries, vi.fn());
    await settle();
    const callsBefore = onEntries.mock.calls.length;

    const release = adapter.holdNextReplaceAll();
    const replaced = store.replaceAll({ entries: [IMPORTED], preferences: { theme: 'dark' } });
    await settle();

    expect(store.getEntries()).toEqual([OLD_A, OLD_B]);
    expect(store.getPreferences()).toEqual({ theme: 'light' });
    expect(onEntries.mock.calls.length).toBe(callsBefore);

    release();
    await replaced;

    expect(store.getEntries()).toEqual([IMPORTED]);
    expect(store.getPreferences()).toEqual({ theme: 'dark' });
    expect(onEntries.mock.calls.at(-1)?.[0]).toEqual([IMPORTED]);
  });

  it('changes nothing at all when the adapter rejects (case 8, C14)', async () => {
    const adapter = adapterWith({ entries: [OLD_A, OLD_B], preferences: { theme: 'light' } });
    const store = storeOver(adapter);
    await store.whenReady();
    const onEntries = vi.fn();
    const onPrefs = vi.fn();
    store.subscribeEntriesInRange(FULL_RANGE, onEntries, vi.fn());
    store.subscribePreferences(onPrefs, vi.fn());
    await settle();

    const failure = new Error('boom');
    adapter.failNextReplaceAll(failure);
    await expect(store.replaceAll({ entries: [IMPORTED], preferences: { theme: 'dark' } })).rejects.toBe(failure);

    expect(store.getEntries()).toEqual([OLD_A, OLD_B]);
    expect(store.getPreferences()).toEqual({ theme: 'light' });
    expect(adapter.storedEntries()).toEqual([OLD_A, OLD_B]);
    expect(adapter.storedPreferences()).toEqual({ theme: 'light' });
    expect(onEntries.mock.calls.at(-1)?.[0]).toEqual([OLD_A, OLD_B]);
    expect(onPrefs.mock.calls.at(-1)?.[0]).toEqual({ theme: 'light' });
  });

  it('never interleaves with a write that was started first (case 9)', async () => {
    const adapter = adapterWith({ entries: [OLD_A], preferences: null });
    const store = storeOver(adapter);
    await store.whenReady();

    const release = adapter.holdNextApply();
    const created = store.createEntry(newEntry(7000));
    const replaced = store.replaceAll({ entries: [IMPORTED], preferences: null });
    await settle();
    expect(adapter.applyCount).toBe(1);
    expect(adapter.replaceAllCount).toBe(0);

    release();
    await created;
    await replaced;

    expect(adapter.applyCount).toBe(1);
    expect(adapter.replaceAllCount).toBe(1);
    expect(store.getEntries()).toEqual([IMPORTED]);
    expect(adapter.storedEntries()).toEqual([IMPORTED]);
  });

  it('honours the write gate while the initial load is still running (case 12a)', async () => {
    const adapter = adapterWith({ entries: [OLD_A], preferences: { theme: 'light' } });
    const release = adapter.holdNextLoad();
    const store = storeOver(adapter);

    const replaced = store.replaceAll({ entries: [IMPORTED], preferences: null });
    await settle();
    expect(adapter.replaceAllCount).toBe(0);

    release();
    await replaced;

    expect(adapter.replaceAllCount).toBe(1);
    expect(store.getEntries()).toEqual([IMPORTED]);
    expect(adapter.storedEntries()).toEqual([IMPORTED]);
  });

  it('refuses and writes nothing after a failed initial load (case 12b)', async () => {
    const adapter = adapterWith({ entries: [OLD_A], preferences: { theme: 'light' } });
    adapter.failNextLoad(new Error('boom'));
    const store = storeOver(adapter);
    await store.whenReady();

    await expect(store.replaceAll({ entries: [IMPORTED], preferences: null })).rejects.toThrow(
      'Der lokale Speicher konnte nicht geladen werden.',
    );
    expect(adapter.replaceAllCount).toBe(0);
    expect(adapter.storedEntries()).toEqual([OLD_A]);
  });
});

describe('LocalStore.replaceAll: a cross-tab reload cannot revert it (case 10, C15)', () => {
  it('keeps the imported data set when another tab asks for a reload during the replace', async () => {
    const hub = createFakeChannelHub();
    const adapter = adapterWith({ entries: [OLD_A], preferences: { theme: 'light' } });
    const store = storeOver(adapter, hub.factory);
    await store.whenReady();
    const otherTab = hub.factory(() => undefined);

    const releaseLoad = adapter.holdNextLoad();
    const releaseReplace = adapter.holdNextReplaceAll();
    const replaced = store.replaceAll({ entries: [IMPORTED], preferences: null });
    otherTab.post({ origin: 'other-tab' });
    await settle();
    releaseReplace();
    await replaced;
    await settle();
    releaseLoad();
    await settle();

    expect(store.getEntries()).toEqual([IMPORTED]);
    expect(adapter.storedEntries()).toEqual([IMPORTED]);
    expect(store.getPreferences()).toBeNull();
    otherTab.close();
  });
});

describe('LocalStore: a throwing channel post never fails a persisted write (case 11, C18)', () => {
  const throwingChannelFactory: ChannelFactory = () => ({
    post: () => {
      throw new Error('post kaputt');
    },
    close: () => undefined,
  });

  it('resolves createEntry and keeps the entry in storage', async () => {
    const adapter = adapterWith();
    const store = storeOver(adapter, throwingChannelFactory);
    await store.whenReady();

    await expect(store.createEntry(newEntry(8000))).resolves.toBeUndefined();
    expect(adapter.storedEntries().map((e) => e.start)).toEqual([8000]);
  });

  it('resolves replaceAll and keeps the imported set in storage and in memory', async () => {
    const adapter = adapterWith({ entries: [OLD_A], preferences: { theme: 'light' } });
    const store = storeOver(adapter, throwingChannelFactory);
    await store.whenReady();

    await expect(store.replaceAll({ entries: [IMPORTED], preferences: null })).resolves.toBeUndefined();
    expect(adapter.storedEntries()).toEqual([IMPORTED]);
    expect(store.getEntries()).toEqual([IMPORTED]);
    expect(store.getPreferences()).toBeNull();
  });
});

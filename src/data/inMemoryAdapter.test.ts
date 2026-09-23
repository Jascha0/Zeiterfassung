import { describe, expect, it } from 'vitest';
import { InMemoryAdapter } from './inMemoryAdapter';
import { STORE_FORMAT_VERSION } from './persistence';
import type { Entry } from '../domain/types';

const OPEN: Entry = { id: 'a', type: 'work', start: 1000, end: null, createdAt: 1000, updatedAt: 1000 };
const EARLIER: Entry = { id: 'b', type: 'break', start: 500, end: 800, createdAt: 500, updatedAt: 800 };
const LATER: Entry = { id: 'c', type: 'work', start: 2000, end: 3000, createdAt: 2000, updatedAt: 3000 };

const NO_CHANGES = { put: [], delete: [], preferences: null } as const;

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('InMemoryAdapter', () => {
  it('reads back what apply() wrote, including end: null, the preferences and the format version', async () => {
    const adapter = new InMemoryAdapter();
    await adapter.apply({ put: [OPEN], delete: [], preferences: { theme: 'dark' } });
    const data = await adapter.loadAll();
    expect(data.entries).toEqual([OPEN]);
    expect(data.entries[0].end).toBeNull();
    expect(data.preferences).toEqual({ theme: 'dark' });
    expect(data.formatVersion).toBe(STORE_FORMAT_VERSION);
  });

  it('returns a seeded data set sorted by start asc', async () => {
    const adapter = new InMemoryAdapter({ entries: [LATER, OPEN, EARLIER], preferences: { theme: 'light' } });
    const data = await adapter.loadAll();
    expect(data.entries).toEqual([EARLIER, OPEN, LATER]);
    expect(data.preferences).toEqual({ theme: 'light' });
  });

  it('applies the deletes before the puts, so an id in both survives', async () => {
    const adapter = new InMemoryAdapter({ entries: [EARLIER, OPEN] });
    const rewritten: Entry = { ...EARLIER, start: 600, updatedAt: 900 };
    await adapter.apply({ put: [rewritten], delete: ['b', 'a'], preferences: null });
    expect(adapter.storedEntries()).toEqual([rewritten]);
  });

  it('leaves the stored preferences untouched when preferences is null', async () => {
    const adapter = new InMemoryAdapter({ preferences: { theme: 'dark' } });
    await adapter.apply({ put: [OPEN], delete: [], preferences: null });
    expect(adapter.storedPreferences()).toEqual({ theme: 'dark' });
    const data = await adapter.loadAll();
    expect(data.preferences).toEqual({ theme: 'dark' });
  });

  it('returns copies from loadAll, so mutating the result does not change the adapter', async () => {
    const adapter = new InMemoryAdapter({ entries: [OPEN], preferences: { theme: 'light' } });
    const first = await adapter.loadAll();
    first.entries[0].start = 9999;
    first.entries.push(LATER);
    if (first.preferences !== null) first.preferences.theme = 'dark';
    const second = await adapter.loadAll();
    expect(second.entries).toEqual([OPEN]);
    expect(second.preferences).toEqual({ theme: 'light' });
  });

  it('failNextLoad rejects exactly the next loadAll and lets the one after it succeed', async () => {
    const adapter = new InMemoryAdapter({ entries: [OPEN] });
    const boom = new Error('load failed');
    adapter.failNextLoad(boom);
    await expect(adapter.loadAll()).rejects.toBe(boom);
    const data = await adapter.loadAll();
    expect(data.entries).toEqual([OPEN]);
  });

  it('failNextApply rejects the next apply and stores nothing, and the apply after it succeeds', async () => {
    const adapter = new InMemoryAdapter({ entries: [EARLIER] });
    const boom = new Error('write failed');
    adapter.failNextApply(boom);
    await expect(adapter.apply({ put: [OPEN], delete: ['b'], preferences: { theme: 'dark' } })).rejects.toBe(boom);
    expect(adapter.storedEntries()).toEqual([EARLIER]);
    expect(adapter.storedPreferences()).toBeNull();
    await adapter.apply({ put: [OPEN], delete: [], preferences: null });
    expect(adapter.storedEntries()).toEqual([EARLIER, OPEN]);
  });

  it('holdNextApply keeps the promise pending until the release function is called', async () => {
    const adapter = new InMemoryAdapter();
    const release = adapter.holdNextApply();
    let settled = false;
    const pending = adapter.apply({ put: [OPEN], delete: [], preferences: null }).then(() => {
      settled = true;
    });
    await flushMicrotasks();
    expect(settled).toBe(false);
    expect(adapter.storedEntries()).toEqual([]);
    release();
    await pending;
    expect(settled).toBe(true);
    expect(adapter.storedEntries()).toEqual([OPEN]);
  });

  it('holdNextLoad snapshots the data at call time, not at release time', async () => {
    const adapter = new InMemoryAdapter({ entries: [OPEN] });
    const release = adapter.holdNextLoad();
    const pending = adapter.loadAll();
    adapter.seedEntries([EARLIER, LATER]);
    release();
    const data = await pending;
    expect(data.entries).toEqual([OPEN]);
    const afterwards = await adapter.loadAll();
    expect(afterwards.entries).toEqual([EARLIER, LATER]);
  });

  it('counts every loadAll and every apply, including the failed ones', async () => {
    const adapter = new InMemoryAdapter();
    expect(adapter.loadCount).toBe(0);
    expect(adapter.applyCount).toBe(0);
    await adapter.loadAll();
    await adapter.apply(NO_CHANGES);
    adapter.failNextLoad(new Error('nope'));
    await expect(adapter.loadAll()).rejects.toThrow('nope');
    adapter.failNextApply(new Error('nope'));
    await expect(adapter.apply(NO_CHANGES)).rejects.toThrow('nope');
    expect(adapter.loadCount).toBe(2);
    expect(adapter.applyCount).toBe(2);
  });
});

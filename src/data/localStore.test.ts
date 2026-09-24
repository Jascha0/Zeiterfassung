import { describe, expect, it, vi } from 'vitest';
import { createTestStore } from '../test/createTestStore';
import { createFakeChannelHub } from '../test/fakeChannel';
import type { TransitionPlan } from '../domain/timer';
import { buildMonthSummary, monthRange } from '../domain/monthView';
import type { Entry } from '../domain/types';
import { noopChannelFactory } from './channel';
import { InMemoryAdapter } from './inMemoryAdapter';
import { createLocalStore } from './localStore';
import { mapWriteError } from './writeErrors';

function entry(overrides: Partial<Entry> & { id: string }): Entry {
  return { type: 'work', start: 0, end: null, createdAt: 0, updatedAt: 0, ...overrides };
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => queueMicrotask(resolve));
}

describe('LocalStore: live reads', () => {
  it('delivers a newly created entry to an open range subscription without a reload', async () => {
    const { store } = createTestStore({ entries: [entry({ id: 'a', start: 1000 })] });
    await store.whenReady();
    const onChange = vi.fn();
    store.subscribeEntriesInRange({ start: 0, end: 10_000 }, onChange, vi.fn());
    await flushMicrotasks();
    expect(onChange.mock.calls[0][0].map((e: Entry) => e.id)).toEqual(['a']);

    await store.createEntry({ type: 'break', start: 2000, end: null, createdAt: 2000, updatedAt: 2000 });
    expect(onChange.mock.calls.at(-1)?.[0].map((e: Entry) => e.id)).toEqual(['a', 'mem-1']);
  });
});

describe('LocalStore: initial delivery', () => {
  it('delivers the initial snapshot in a microtask, never synchronously', async () => {
    const { store } = createTestStore({ entries: [entry({ id: 'a', start: 100 })] });
    await store.whenReady();
    const onChange = vi.fn();
    store.subscribeOpenEntries(onChange, vi.fn());
    expect(onChange).not.toHaveBeenCalled();
    await flushMicrotasks();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('delivers nothing before the initial load resolves, then exactly once', async () => {
    const adapter = new InMemoryAdapter({ entries: [entry({ id: 'a', start: 100 })] });
    const release = adapter.holdNextLoad();
    const store = createLocalStore({ adapter, navigator: null, channelFactory: noopChannelFactory });
    const onChange = vi.fn();
    store.subscribeOpenEntries(onChange, vi.fn());
    await flushMicrotasks();
    expect(onChange).not.toHaveBeenCalled();

    release();
    await store.whenReady();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].map((e: Entry) => e.id)).toEqual(['a']);
  });

  it('subscribeEntriesInRange filters by start range [start, end)', async () => {
    const { store } = createTestStore({
      entries: [entry({ id: 'a', start: 100 }), entry({ id: 'b', start: 200 }), entry({ id: 'c', start: 300 })],
    });
    await store.whenReady();
    const onChange = vi.fn();
    store.subscribeEntriesInRange({ start: 100, end: 300 }, onChange, vi.fn());
    await flushMicrotasks();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].map((e: Entry) => e.id)).toEqual(['a', 'b']);
  });

  it('subscribeOpenEntries only returns entries with end === null', async () => {
    const { store } = createTestStore({ entries: [entry({ id: 'a', end: null }), entry({ id: 'b', end: 500 })] });
    await store.whenReady();
    const onChange = vi.fn();
    store.subscribeOpenEntries(onChange, vi.fn());
    await flushMicrotasks();
    expect(onChange.mock.calls[0][0].map((e: Entry) => e.id)).toEqual(['a']);
  });
});

describe('LocalStore: applyTransition (close + create)', () => {
  const plan: TransitionPlan = {
    close: [{ id: 'w1', end: 2000, updatedAt: 2000 }],
    create: { type: 'break', start: 2000, end: null, createdAt: 2000, updatedAt: 2000 },
    delete: [],
  };

  it('notifies synchronously before the promise settles and persists both records', async () => {
    const { store, adapter } = createTestStore({ entries: [entry({ id: 'w1', type: 'work', start: 1000 })] });
    await store.whenReady();
    const onChange = vi.fn();
    store.subscribeOpenEntries(onChange, vi.fn());
    await flushMicrotasks();
    const firstCallArray = onChange.mock.calls[0][0];
    onChange.mockClear();

    const promise = store.applyTransition(plan);
    expect(onChange).toHaveBeenCalledTimes(1);
    const secondCallArray = onChange.mock.calls[0][0];
    expect(secondCallArray).not.toBe(firstCallArray);
    expect(secondCallArray.map((e: Entry) => e.type)).toEqual(['break']);

    await promise;
    const stored = adapter.storedEntries();
    expect(stored.map((e) => e.id)).toEqual(['w1', 'mem-1']);
    expect(stored[0].end).toBe(2000);
  });

  it('rejects with the adapter error, rolls back completely and leaves the stored data untouched', async () => {
    const { store, adapter } = createTestStore({ entries: [entry({ id: 'w1', type: 'work', start: 1000 })] });
    await store.whenReady();
    const before = store.getEntries();
    const storedBefore = adapter.storedEntries();
    const onChange = vi.fn();
    store.subscribeOpenEntries(onChange, vi.fn());
    await flushMicrotasks();
    onChange.mockClear();

    const error = Object.assign(new Error('boom'), { name: 'AbortError' });
    adapter.failNextApply(error);
    await expect(store.applyTransition(plan)).rejects.toBe(error);

    expect(store.getEntries()).toEqual(before);
    expect(onChange.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(adapter.storedEntries()).toEqual(storedBefore);
  });
});

describe('LocalStore: atomic close + delete (0028)', () => {
  const plan: TransitionPlan = {
    close: [{ id: 'a', end: 5000, updatedAt: 5000 }],
    create: null,
    delete: ['b'],
  };

  it('rolls close and delete back together when the write fails, and the retry applies both', async () => {
    const seed = [entry({ id: 'a', type: 'work', start: 1000 }), entry({ id: 'b', type: 'work', start: 2000 })];
    const { store, adapter } = createTestStore({ entries: seed });
    await store.whenReady();

    const error = Object.assign(new Error('denied'), { name: 'AbortError' });
    adapter.failNextApply(error);
    await expect(store.applyTransition(plan)).rejects.toBe(error);
    expect(store.getEntries()).toEqual(seed);
    expect(adapter.storedEntries()).toEqual(seed);

    await store.applyTransition(plan);
    const after = store.getEntries();
    expect(after.map((e) => e.id)).toEqual(['a']);
    expect(after[0].end).toBe(5000);
    expect(adapter.storedEntries().map((e) => e.id)).toEqual(['a']);
  });
});

describe('LocalStore: missing id', () => {
  it('closing a non-existent id rejects with a not-found error and applies nothing', async () => {
    const seed = [entry({ id: 'w1', start: 100 })];
    const { store, adapter } = createTestStore({ entries: seed });
    await store.whenReady();

    const plan: TransitionPlan = {
      close: [{ id: 'does-not-exist', end: 200, updatedAt: 200 }],
      create: { type: 'break', start: 200, end: null, createdAt: 200, updatedAt: 200 },
      delete: [],
    };
    await expect(store.applyTransition(plan)).rejects.toMatchObject({ code: 'not-found' });
    expect(store.getEntries()).toEqual(seed);
    expect(adapter.storedEntries()).toEqual(seed);
    expect(adapter.applyCount).toBe(0);
  });
});

describe('LocalStore: failed initial load', () => {
  it('reports the error to subscriptions opened before and after the load, and holds no entries', async () => {
    const adapter = new InMemoryAdapter({ entries: [entry({ id: 'a', start: 100 })] });
    const release = adapter.holdNextLoad();
    const loadError = new Error('boom');
    adapter.failNextLoad(loadError);
    const store = createLocalStore({ adapter, navigator: null, channelFactory: noopChannelFactory });

    const onErrorBefore = vi.fn();
    store.subscribeOpenEntries(vi.fn(), onErrorBefore);
    await flushMicrotasks();
    expect(onErrorBefore).not.toHaveBeenCalled();

    release();
    await store.whenReady();
    expect(onErrorBefore).toHaveBeenCalledTimes(1);
    expect(onErrorBefore.mock.calls[0][0]).toBe(loadError);

    const onErrorAfter = vi.fn();
    const onChangeAfter = vi.fn();
    store.subscribeEntriesInRange({ start: 0, end: 10_000 }, onChangeAfter, onErrorAfter);
    await flushMicrotasks();
    expect(onErrorAfter).toHaveBeenCalledTimes(1);
    expect(onChangeAfter).not.toHaveBeenCalled();
    expect(store.getEntries()).toEqual([]);
  });
});

describe('LocalStore: persistent storage request (A8)', () => {
  const newEntry = { type: 'work' as const, start: 100, end: null, createdAt: 100, updatedAt: 100 };

  it('requests persistence once and writes when persistence is granted', async () => {
    const persist = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
    const adapter = new InMemoryAdapter();
    const store = createLocalStore({
      adapter,
      navigator: { storage: { persist } },
      channelFactory: noopChannelFactory,
      newId: () => 'id-1',
    });
    await store.whenReady();
    expect(persist).toHaveBeenCalledTimes(1);

    await store.createEntry(newEntry);
    expect(adapter.storedEntries().map((e) => e.id)).toEqual(['id-1']);
  });

  it('requests persistence once and writes when persistence is denied', async () => {
    const persist = vi.fn<() => Promise<boolean>>().mockResolvedValue(false);
    const adapter = new InMemoryAdapter();
    const store = createLocalStore({
      adapter,
      navigator: { storage: { persist } },
      channelFactory: noopChannelFactory,
      newId: () => 'id-1',
    });
    await store.whenReady();
    expect(persist).toHaveBeenCalledTimes(1);

    await store.createEntry(newEntry);
    expect(adapter.storedEntries().map((e) => e.id)).toEqual(['id-1']);
  });

  it('writes identically for a navigator without a storage API', async () => {
    const adapter = new InMemoryAdapter();
    const store = createLocalStore({ adapter, navigator: {}, channelFactory: noopChannelFactory, newId: () => 'id-1' });
    await store.whenReady();

    await store.createEntry(newEntry);
    expect(adapter.storedEntries().map((e) => e.id)).toEqual(['id-1']);
  });
});

describe('LocalStore: ids', () => {
  it('uses the injected newId for created entries', async () => {
    const { store, adapter } = createTestStore();
    await store.whenReady();
    await store.createEntry({ type: 'work', start: 100, end: null, createdAt: 100, updatedAt: 100 });
    await store.createEntry({ type: 'break', start: 200, end: null, createdAt: 200, updatedAt: 200 });
    expect(adapter.storedEntries().map((e) => e.id)).toEqual(['mem-1', 'mem-2']);
  });

  it('falls back to a random uuid when no newId is injected', async () => {
    const adapter = new InMemoryAdapter();
    const store = createLocalStore({ adapter, navigator: null, channelFactory: noopChannelFactory });
    await store.whenReady();
    await store.createEntry({ type: 'work', start: 100, end: null, createdAt: 100, updatedAt: 100 });
    expect(adapter.storedEntries()[0].id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});

describe('LocalStore: multi-tab propagation (0033)', () => {
  it("delivers another instance's write to this instance's subscribers without a reload", async () => {
    const hub = createFakeChannelHub();
    const shared = new InMemoryAdapter();
    const a = createLocalStore({ adapter: shared, navigator: null, channelFactory: hub.factory, newId: () => 'w1' });
    const b = createLocalStore({ adapter: shared, navigator: null, channelFactory: hub.factory });
    await Promise.all([a.whenReady(), b.whenReady()]);
    const onChange = vi.fn();
    b.subscribeOpenEntries(onChange, vi.fn());
    await flushMicrotasks();
    expect(onChange.mock.calls[0][0]).toEqual([]);

    await a.createEntry({ type: 'work', start: 5000, end: null, createdAt: 5000, updatedAt: 5000 });
    await vi.waitFor(() => expect(onChange.mock.calls.at(-1)?.[0].map((e: Entry) => e.id)).toEqual(['w1']));
    a.close();
    b.close();
  });
});

describe('LocalStore: reload ordering (A9)', () => {
  it('discards a held older reload so it cannot overwrite newer state', async () => {
    const hub = createFakeChannelHub();
    const adapter = new InMemoryAdapter();
    const b = createLocalStore({ adapter, navigator: null, channelFactory: hub.factory });
    const other = hub.factory(() => undefined);
    await b.whenReady();
    const onChange = vi.fn();
    b.subscribeEntriesInRange({ start: 0, end: 10_000 }, onChange, vi.fn());
    await flushMicrotasks();

    adapter.seedEntries([entry({ id: 's1', start: 1000 })]);
    const release = adapter.holdNextLoad();
    other.post({ origin: 'other-tab' });

    adapter.seedEntries([entry({ id: 's2', start: 2000 })]);
    other.post({ origin: 'other-tab' });
    await vi.waitFor(() => expect(onChange.mock.calls.at(-1)?.[0].map((e: Entry) => e.id)).toEqual(['s2']));

    release();
    for (let i = 0; i < 10; i += 1) await flushMicrotasks();

    expect(b.getEntries().map((e) => e.id)).toEqual(['s2']);
    expect(onChange.mock.calls.at(-1)?.[0].map((e: Entry) => e.id)).toEqual(['s2']);
    other.close();
    b.close();
  });

  it('postpones a reload that arrives while a local write is in flight', async () => {
    const hub = createFakeChannelHub();
    const adapter = new InMemoryAdapter();
    const b = createLocalStore({ adapter, navigator: null, channelFactory: hub.factory, newId: () => 'local-1' });
    const other = hub.factory(() => undefined);
    await b.whenReady();

    const releaseApply = adapter.holdNextApply();
    const write = b.createEntry({ type: 'work', start: 3000, end: null, createdAt: 3000, updatedAt: 3000 });
    other.post({ origin: 'other-tab' });
    expect(adapter.loadCount).toBe(1);

    releaseApply();
    await write;
    await vi.waitFor(() => expect(adapter.loadCount).toBe(2));

    expect(b.getEntries().map((e) => e.id)).toEqual(['local-1']);
    other.close();
    b.close();
  });
});

describe('LocalStore: subscription bookkeeping', () => {
  it('listenerCount reflects active subscriptions and unsubscribe removes them', async () => {
    const { store } = createTestStore();
    await store.whenReady();
    expect(store.listenerCount()).toBe(0);

    const unsubscribeEntries = store.subscribeOpenEntries(vi.fn(), vi.fn());
    const unsubscribePreferences = store.subscribePreferences(vi.fn(), vi.fn());
    expect(store.listenerCount()).toBe(2);

    unsubscribeEntries();
    expect(store.listenerCount()).toBe(1);
    unsubscribePreferences();
    expect(store.listenerCount()).toBe(0);
  });

  it('unsubscribe is idempotent', async () => {
    const { store } = createTestStore();
    await store.whenReady();
    const unsubscribe = store.subscribeOpenEntries(vi.fn(), vi.fn());
    unsubscribe();
    expect(() => unsubscribe()).not.toThrow();
    expect(store.listenerCount()).toBe(0);
  });

  it('never delivers to a subscription cancelled before its microtask runs', async () => {
    const { store } = createTestStore({ entries: [entry({ id: 'a', start: 100 })] });
    await store.whenReady();
    const onChange = vi.fn();
    const onError = vi.fn();

    const unsubscribe = store.subscribeEntriesInRange({ start: 0, end: 10_000 }, onChange, onError);
    unsubscribe();
    await flushMicrotasks();

    expect(onChange).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});

describe('LocalStore: getEntries snapshot', () => {
  it('returns every entry sorted by start asc', async () => {
    const { store } = createTestStore({
      entries: [entry({ id: 'b', start: 200 }), entry({ id: 'a', start: 100 }), entry({ id: 'c', start: 300 })],
    });
    await store.whenReady();
    expect(store.getEntries().map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('returns copies, so mutating the result does not change the store', async () => {
    const { store } = createTestStore({ entries: [entry({ id: 'a', start: 100 })] });
    await store.whenReady();

    const snapshot = store.getEntries();
    snapshot[0].start = 9999;

    expect(store.getEntries()[0].start).toBe(100);
  });
});

describe('LocalStore: updateEntry', () => {
  it('applies only the patched fields, bumps updatedAt and persists the result', async () => {
    const seed = entry({ id: 'a', type: 'work', start: 1000, createdAt: 1000, updatedAt: 1000 });
    const { store, adapter } = createTestStore({ entries: [seed] });
    await store.whenReady();

    await store.updateEntry('a', { end: 5000, updatedAt: 7000 });

    expect(store.getEntries()).toEqual([{ ...seed, end: 5000, updatedAt: 7000 }]);
    expect(adapter.storedEntries()).toEqual([{ ...seed, end: 5000, updatedAt: 7000 }]);
  });

  it('rejects an unknown id with a not-found error and changes nothing', async () => {
    const seed = [entry({ id: 'a', start: 1000 })];
    const { store, adapter } = createTestStore({ entries: seed });
    await store.whenReady();

    await expect(store.updateEntry('does-not-exist', { updatedAt: 2000 })).rejects.toMatchObject({
      code: 'not-found',
    });
    expect(store.getEntries()).toEqual(seed);
    expect(adapter.storedEntries()).toEqual(seed);
    expect(adapter.applyCount).toBe(0);
  });
});

describe('LocalStore: deleteEntry', () => {
  it('resolves for an unknown id without calling the adapter', async () => {
    const seed = [entry({ id: 'a', start: 1000 })];
    const { store, adapter } = createTestStore({ entries: seed });
    await store.whenReady();

    await expect(store.deleteEntry('does-not-exist')).resolves.toBeUndefined();
    expect(adapter.applyCount).toBe(0);
    expect(store.getEntries()).toEqual(seed);
    expect(adapter.storedEntries()).toEqual(seed);
  });

  it('rolls a failed delete back into memory and leaves the entry in the adapter', async () => {
    const seed = [entry({ id: 'a', start: 1000 }), entry({ id: 'b', start: 2000 })];
    const { store, adapter } = createTestStore({ entries: seed });
    await store.whenReady();
    const onChange = vi.fn();
    store.subscribeEntriesInRange({ start: 0, end: 10_000 }, onChange, vi.fn());
    await flushMicrotasks();
    onChange.mockClear();

    const error = Object.assign(new Error('boom'), { name: 'AbortError' });
    adapter.failNextApply(error);
    await expect(store.deleteEntry('a')).rejects.toBe(error);

    expect(store.getEntries()).toEqual(seed);
    expect(adapter.storedEntries()).toEqual(seed);
    expect(onChange.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(onChange.mock.calls.at(-1)?.[0].map((e: Entry) => e.id)).toEqual(['a', 'b']);
  });
});

describe('LocalStore: savePreferences', () => {
  it('notifies the preferences subscription and stores the value', async () => {
    const { store, adapter } = createTestStore();
    await store.whenReady();
    const onChange = vi.fn();
    store.subscribePreferences(onChange, vi.fn());
    await flushMicrotasks();
    onChange.mockClear();

    await expect(store.savePreferences({ theme: 'dark' })).resolves.toBeUndefined();

    expect(onChange).toHaveBeenCalledWith({ theme: 'dark' });
    expect(store.getPreferences()).toEqual({ theme: 'dark' });
    expect(adapter.storedPreferences()).toEqual({ theme: 'dark' });
  });

  it('rolls back to the previous value and rejects when the write fails', async () => {
    const { store, adapter } = createTestStore({ preferences: { theme: 'light' } });
    await store.whenReady();
    const onChange = vi.fn();
    store.subscribePreferences(onChange, vi.fn());
    await flushMicrotasks();
    onChange.mockClear();

    const error = new Error('fail');
    adapter.failNextApply(error);
    await expect(store.savePreferences({ theme: 'dark' })).rejects.toBe(error);

    expect(store.getPreferences()).toEqual({ theme: 'light' });
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual({ theme: 'light' });
    expect(adapter.storedPreferences()).toEqual({ theme: 'light' });
  });

  it('rolls back to null when there were no preferences before', async () => {
    const { store, adapter } = createTestStore();
    await store.whenReady();
    const onChange = vi.fn();
    store.subscribePreferences(onChange, vi.fn());
    await flushMicrotasks();
    onChange.mockClear();

    const error = new Error('fail');
    adapter.failNextApply(error);
    await expect(store.savePreferences({ theme: 'dark' })).rejects.toBe(error);

    expect(store.getPreferences()).toBeNull();
    expect(onChange.mock.calls.at(-1)?.[0]).toBeNull();
    expect(adapter.storedPreferences()).toBeNull();
  });

  it('delivers null to a preferences subscription on an empty store', async () => {
    const { store } = createTestStore();
    await store.whenReady();
    const onChange = vi.fn();
    store.subscribePreferences(onChange, vi.fn());
    await flushMicrotasks();
    expect(onChange).toHaveBeenCalledWith(null);
  });
});

describe('LocalStore: empty plan', () => {
  it('resolves and changes nothing', async () => {
    const seed = [entry({ id: 'a', start: 1000 })];
    const { store, adapter } = createTestStore({ entries: seed });
    await store.whenReady();

    await expect(store.applyTransition({ close: [], create: null, delete: [] })).resolves.toBeUndefined();

    expect(store.getEntries()).toEqual(seed);
    expect(adapter.storedEntries()).toEqual(seed);
  });
});

describe('LocalStore: writes around the initial load', () => {
  const newEntry = { type: 'work' as const, start: 5000, end: null, createdAt: 5000, updatedAt: 5000 };

  it('applies a write issued before the initial load resolved once it has resolved', async () => {
    const adapter = new InMemoryAdapter({ entries: [entry({ id: 'a', start: 100 })] });
    const release = adapter.holdNextLoad();
    const store = createLocalStore({
      adapter,
      navigator: null,
      channelFactory: noopChannelFactory,
      newId: () => 'w1',
    });

    const write = store.createEntry(newEntry);
    await flushMicrotasks();
    expect(adapter.applyCount).toBe(0);

    release();
    await write;

    expect(store.getEntries().map((e) => e.id)).toEqual(['a', 'w1']);
    expect(adapter.storedEntries().map((e) => e.id)).toEqual(['a', 'w1']);
  });

  it('rejects a write issued after a failed initial load with the generic write message', async () => {
    const adapter = new InMemoryAdapter();
    adapter.failNextLoad(new Error('boom'));
    const store = createLocalStore({ adapter, navigator: null, channelFactory: noopChannelFactory });
    await store.whenReady();

    let rejection: unknown = null;
    await store.createEntry(newEntry).catch((error: unknown) => {
      rejection = error;
    });

    expect(rejection).toBeInstanceOf(Error);
    expect(mapWriteError(rejection)).toBe('Die Änderung konnte nicht gespeichert werden.');
    expect(adapter.applyCount).toBe(0);
    expect(store.getEntries()).toEqual([]);
  });
});

describe('LocalStore: read performance (10 000 entries)', () => {
  it(
    'serves one month range plus the monthView derivation in under 100 ms',
    async () => {
      const base = new Date(2020, 0, 1).getTime();
      const entries: Entry[] = [];
      for (let i = 0; i < 10_000; i += 1) {
        const start = base + i * 6 * 60 * 60 * 1000;
        entries.push({ id: `e${i}`, type: 'work', start, end: start + 3_600_000, createdAt: start, updatedAt: start });
      }
      const { store } = createTestStore({ entries });
      await store.whenReady();
      const monthStart = new Date(2026, 8, 1).getTime();
      const range = monthRange(monthStart);
      const now = new Date(2026, 8, 18, 12, 0).getTime();

      const started = performance.now();
      const delivered = await new Promise<Entry[]>((resolve) => {
        const unsubscribe = store.subscribeEntriesInRange(
          range,
          (result) => {
            resolve(result);
            queueMicrotask(unsubscribe);
          },
          () => resolve([]),
        );
      });
      const summary = buildMonthSummary(monthStart, delivered, now);
      const elapsed = performance.now() - started;

      expect(summary.days.length).toBeGreaterThan(0);
      console.info(`month range + monthView over 10000 entries: ${Math.round(elapsed)} ms`);
      expect(elapsed).toBeLessThan(100);
    },
    30_000,
  );
});

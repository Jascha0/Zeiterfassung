import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeChannelHub } from '../test/fakeChannel';
import { createTestStore } from '../test/createTestStore';
import type { Entry, NewEntry } from '../domain/types';
import { noopChannelFactory, type ChannelFactory, type StoreChannelMessage } from './channel';
import { InMemoryAdapter } from './inMemoryAdapter';
import { createLocalStore, type LocalStore } from './localStore';
import type { Unsubscribe } from './repository';

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

function withTimeout<T>(promise: Promise<T>, label: string, ms = 1000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error(`${label} did not settle within ${ms} ms`)), ms);
    }),
  ]);
}

/** Delivers everything posted back to the poster. A real BroadcastChannel never echoes to its own
 *  sender, so this is the only way to reach the store's own-origin guard. Passing an origin rewrites
 *  the echo into a foreign message, which is the positive control for the same case. */
function echoChannelFactory(foreignOrigin?: string): ChannelFactory {
  return (onMessage) => ({
    post: (message: StoreChannelMessage) =>
      onMessage(foreignOrigin === undefined ? message : { origin: foreignOrigin }),
    close: () => undefined,
  });
}

const openStores: LocalStore[] = [];

function track(store: LocalStore): LocalStore {
  openStores.push(store);
  return store;
}

afterEach(() => {
  for (const store of openStores.splice(0)) store.close();
  vi.unstubAllGlobals();
});

describe('LocalStore: its own channel message (edge case 11)', () => {
  it('ignores the echo of its own write, so a write never triggers a self-reload', async () => {
    const adapter = new InMemoryAdapter();
    const store = track(
      createLocalStore({ adapter, navigator: null, channelFactory: echoChannelFactory(), newId: () => 'w1' }),
    );
    await store.whenReady();
    expect(adapter.loadCount).toBe(1);

    await store.createEntry(newEntry(1000));
    await settle();

    expect(adapter.loadCount).toBe(1);
    expect(store.getEntries().map((e) => e.id)).toEqual(['w1']);
  });

  it('does reload for the same echo carrying a foreign origin (positive control)', async () => {
    const adapter = new InMemoryAdapter();
    const store = track(
      createLocalStore({
        adapter,
        navigator: null,
        channelFactory: echoChannelFactory('other-tab'),
        newId: () => 'w1',
      }),
    );
    await store.whenReady();
    expect(adapter.loadCount).toBe(1);

    await store.createEntry(newEntry(1000));
    await vi.waitFor(() => expect(adapter.loadCount).toBe(2));
  });
});

describe('LocalStore: BroadcastChannel absent (edge case 10)', () => {
  it('posts after a write into a no-op channel and never reloads', async () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const adapter = new InMemoryAdapter();
    // No channelFactory on purpose: the default seam must degrade to the no-op channel here.
    const store = track(createLocalStore({ adapter, navigator: null, newId: () => 'w1' }));
    await store.whenReady();

    await expect(store.createEntry(newEntry(1000))).resolves.toBeUndefined();
    await settle();

    expect(adapter.loadCount).toBe(1);
    expect(adapter.storedEntries().map((e) => e.id)).toEqual(['w1']);
    expect(() => store.close()).not.toThrow();
  });
});

describe('LocalStore: several foreign messages during one pending write (edge case 13)', () => {
  it('coalesces them into exactly one reload after the write settles', async () => {
    const hub = createFakeChannelHub();
    const adapter = new InMemoryAdapter();
    const store = track(
      createLocalStore({ adapter, navigator: null, channelFactory: hub.factory, newId: () => 'local-1' }),
    );
    const other = hub.factory(() => undefined);
    await store.whenReady();
    expect(adapter.loadCount).toBe(1);

    const release = adapter.holdNextApply();
    const write = store.createEntry(newEntry(3000));
    other.post({ origin: 'tab-2' });
    other.post({ origin: 'tab-3' });
    other.post({ origin: 'tab-2' });
    await settle();
    expect(adapter.loadCount).toBe(1);

    release();
    await write;
    await vi.waitFor(() => expect(adapter.loadCount).toBe(2));
    await settle();

    expect(adapter.loadCount).toBe(2);
    expect(store.getEntries().map((e) => e.id)).toEqual(['local-1']);
    other.close();
  });
});

describe('LocalStore: two overlapping writes (edge case 14)', () => {
  it('serialises the adapter applies in call order instead of issuing them in parallel', async () => {
    const adapter = new InMemoryAdapter();
    let counter = 0;
    const store = track(
      createLocalStore({
        adapter,
        navigator: null,
        channelFactory: noopChannelFactory,
        newId: () => `w${(counter += 1)}`,
      }),
    );
    await store.whenReady();

    const release = adapter.holdNextApply();
    const first = store.createEntry(newEntry(1000));
    const second = store.createEntry(newEntry(2000));
    await settle();
    // The second apply has not even been issued while the first one is still held.
    expect(adapter.applyCount).toBe(1);
    expect(adapter.storedEntries()).toEqual([]);

    release();
    await Promise.all([first, second]);

    expect(adapter.applyCount).toBe(2);
    expect(adapter.storedEntries().map((e) => e.id)).toEqual(['w1', 'w2']);
  });

  it('rolls back only the records of the failing batch when the first of two writes fails', async () => {
    const adapter = new InMemoryAdapter();
    let counter = 0;
    const store = track(
      createLocalStore({
        adapter,
        navigator: null,
        channelFactory: noopChannelFactory,
        newId: () => `w${(counter += 1)}`,
      }),
    );
    await store.whenReady();

    const boom = Object.assign(new Error('boom'), { name: 'AbortError' });
    adapter.failNextApply(boom);
    const first = store.createEntry(newEntry(1000));
    const second = store.createEntry(newEntry(2000));

    await expect(first).rejects.toBe(boom);
    await expect(second).resolves.toBeUndefined();

    expect(store.getEntries().map((e) => e.id)).toEqual(['w2']);
    expect(adapter.storedEntries().map((e) => e.id)).toEqual(['w2']);
  });
});

describe('LocalStore: notification is re-entrant (edge case 18)', () => {
  it('keeps notifying the remaining subscribers when one cancels itself and another during the pass', async () => {
    const { store } = createTestStore({ entries: [entry({ id: 'a', start: 100 })] });
    await store.whenReady();

    let unsubscribeFirst: Unsubscribe = () => undefined;
    let unsubscribeSecond: Unsubscribe = () => undefined;
    let cancelDuringNotify = false;
    const onFirst = vi.fn(() => {
      if (!cancelDuringNotify) return;
      unsubscribeFirst();
      unsubscribeSecond();
    });
    const onSecond = vi.fn();
    const onThird = vi.fn();

    unsubscribeFirst = store.subscribeEntriesInRange(FULL_RANGE, onFirst, vi.fn());
    unsubscribeSecond = store.subscribeEntriesInRange(FULL_RANGE, onSecond, vi.fn());
    store.subscribeEntriesInRange(FULL_RANGE, onThird, vi.fn());
    await flushMicrotasks();
    expect([onFirst, onSecond, onThird].map((fn) => fn.mock.calls.length)).toEqual([1, 1, 1]);

    cancelDuringNotify = true;
    await expect(store.createEntry(newEntry(200))).resolves.toBeUndefined();

    expect(onFirst).toHaveBeenCalledTimes(2);
    // Cancelled mid-pass: it must not be called again.
    expect(onSecond).toHaveBeenCalledTimes(1);
    // Still subscribed, so it must still receive the change although the set shrank mid-pass.
    expect(onThird).toHaveBeenCalledTimes(2);
    expect(onThird.mock.calls[1][0].map((e: Entry) => e.id)).toEqual(['a', 'mem-1']);
    expect(store.listenerCount()).toBe(1);
  });
});

describe('LocalStore: a subscription cancelled while the initial load is still running', () => {
  it('is never delivered to when the load settles', async () => {
    const adapter = new InMemoryAdapter({ entries: [entry({ id: 'a', start: 100 })] });
    const release = adapter.holdNextLoad();
    const store = track(createLocalStore({ adapter, navigator: null, channelFactory: noopChannelFactory }));
    const onChange = vi.fn();
    const onError = vi.fn();

    const unsubscribe = store.subscribeEntriesInRange(FULL_RANGE, onChange, onError);
    await flushMicrotasks();
    unsubscribe();

    release();
    await store.whenReady();
    await settle();

    expect(onChange).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(store.listenerCount()).toBe(0);
  });
});

describe('LocalStore: sort order tie-break', () => {
  it('orders two entries with the same start by ascending id', async () => {
    const { store } = createTestStore({
      entries: [entry({ id: 'b', start: 500 }), entry({ id: 'a', start: 500 })],
    });
    await store.whenReady();
    expect(store.getEntries().map((e) => e.id)).toEqual(['a', 'b']);
  });
});

describe('LocalStore: a subscription opened while loading whose microtask lands after the load settled', () => {
  /** Documented behaviour, not an accident: `flushInitial` delivers to every subscription once the load
   *  settles, and the subscription's own `queueMicrotask` then delivers a second time. Both deliveries
   *  carry the same data, so `toHaveBeenCalledTimes(1)` is the wrong assertion for this timing. */
  it('receives the identical initial snapshot twice', async () => {
    const adapter = new InMemoryAdapter({ entries: [entry({ id: 'a', start: 100 })] });
    const release = adapter.holdNextLoad();
    const store = track(createLocalStore({ adapter, navigator: null, channelFactory: noopChannelFactory }));
    release();
    await Promise.resolve();
    // Precondition: the load has not been applied yet, so this subscription starts out in the loading state.
    expect(store.getEntries()).toEqual([]);

    const onChange = vi.fn();
    const onError = vi.fn();
    store.subscribeEntriesInRange(FULL_RANGE, onChange, onError);
    await store.whenReady();
    await settle();

    expect(onError).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls[0][0]).toEqual(onChange.mock.calls[1][0]);
    expect(onChange.mock.calls[1][0].map((e: Entry) => e.id)).toEqual(['a']);
  });

  it('receives the identical load error twice when the initial load failed', async () => {
    const adapter = new InMemoryAdapter({ entries: [entry({ id: 'a', start: 100 })] });
    const release = adapter.holdNextLoad();
    const loadError = new Error('boom');
    adapter.failNextLoad(loadError);
    const store = track(createLocalStore({ adapter, navigator: null, channelFactory: noopChannelFactory }));
    release();
    await Promise.resolve();

    const onChange = vi.fn();
    const onError = vi.fn();
    store.subscribeEntriesInRange(FULL_RANGE, onChange, onError);
    await store.whenReady();
    await settle();

    expect(onChange).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError.mock.calls[0][0]).toBe(loadError);
    expect(onError.mock.calls[1][0]).toBe(loadError);
  });
});

describe('LocalStore: a foreign channel message during the initial load', () => {
  it('still reaches the ready state and delivers the data', async () => {
    const hub = createFakeChannelHub();
    const adapter = new InMemoryAdapter({ entries: [entry({ id: 'a', start: 100 })] });
    const release = adapter.holdNextLoad();
    const store = track(createLocalStore({ adapter, navigator: null, channelFactory: hub.factory }));
    const other = hub.factory(() => undefined);
    const onChange = vi.fn();
    const onError = vi.fn();
    store.subscribeEntriesInRange(FULL_RANGE, onChange, onError);

    // Another tab writes while this tab is still running its very first load.
    other.post({ origin: 'other-tab' });
    await settle();
    release();

    await withTimeout(store.whenReady(), 'the initial load');
    await settle();

    expect(onError).not.toHaveBeenCalled();
    expect(onChange.mock.calls.at(-1)?.[0].map((e: Entry) => e.id)).toEqual(['a']);
    expect(store.getEntries().map((e) => e.id)).toEqual(['a']);
    other.close();
  });
});

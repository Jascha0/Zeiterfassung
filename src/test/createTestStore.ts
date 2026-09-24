import { noopChannelFactory, type ChannelFactory } from '../data/channel'; // task 8
import { InMemoryAdapter } from '../data/inMemoryAdapter';
import { createLocalStore, type LocalStore } from '../data/localStore';
import type { Preferences } from '../data/repository';
import type { Entry } from '../domain/types';

export interface TestStoreSeed {
  entries?: readonly Entry[];
  preferences?: Preferences | null;
}

export interface TestStoreOptions {
  channelFactory?: ChannelFactory; // task 8
  /** Defaults to sequential ids mem-1, mem-2, … per store. */
  newId?: () => string;
}

export interface TestStoreHandle {
  store: LocalStore;
  adapter: InMemoryAdapter;
}

/** A store backed by the in-memory adapter and seeded before its initial load runs. */
export function createTestStore(seed: TestStoreSeed = {}, options: TestStoreOptions = {}): TestStoreHandle {
  const adapter = new InMemoryAdapter({ entries: seed.entries ?? [], preferences: seed.preferences ?? null });
  let counter = 0;
  const store = createLocalStore({
    adapter,
    navigator: null,
    channelFactory: options.channelFactory ?? noopChannelFactory, // task 8
    newId: options.newId ?? (() => `mem-${++counter}`),
  });
  return { store, adapter };
}

import type { TransitionPlan } from '../domain/timer';
import type { Entry, NewEntry, TimeRange } from '../domain/types';
import { createDefaultChannel, type ChannelFactory, type StoreChannel } from './channel'; // task 8
import {
  STORE_FORMAT_VERSION,
  type BackupData,
  type PersistenceAdapter,
  type StoreChanges,
  type StoredData,
} from './persistence';
import { requestPersistentStorage, type StorageCapableNavigator } from './persistentStorage';
import type {
  BackupRepository,
  EntryPatch,
  EntryRepository,
  Preferences,
  SettingsRepository,
  Unsubscribe,
} from './repository';

interface EntrySubscription {
  kind: 'entries';
  select: (entries: readonly Entry[]) => Entry[];
  onChange: (entries: Entry[]) => void;
  onError: (error: Error) => void;
}

interface PreferencesSubscription {
  kind: 'preferences';
  onChange: (prefs: Preferences | null) => void;
  onError: (error: Error) => void;
}

type Subscription = EntrySubscription | PreferencesSubscription;

type LoadState = 'loading' | 'ready' | 'failed';

export interface LocalStoreOptions {
  adapter: PersistenceAdapter;
  /** Defaults to createDefaultChannel. (task 8) */
  channelFactory?: ChannelFactory;
  /** Omit to use globalThis.navigator; pass null for an environment without one. */
  navigator?: StorageCapableNavigator | null;
  /** Defaults to crypto.randomUUID(). */
  newId?: () => string;
}

const LOAD_FAILED_MESSAGE = 'Der lokale Speicher konnte nicht geladen werden.';

function byStartAsc(a: Entry, b: Entry): number {
  if (a.start !== b.start) return a.start - b.start;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

function notFound(id: string): Error {
  return Object.assign(new Error(`Eintrag ${id} existiert nicht.`), { code: 'not-found' });
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

/** Authoritative in-memory state plus a persistence adapter (0033). Every read is served from memory;
 *  every write mutates memory, notifies subscribers and is persisted — a failed persist is rolled back
 *  completely and the returned promise rejects. */
export class LocalStore implements EntryRepository, SettingsRepository, BackupRepository {
  private readonly adapter: PersistenceAdapter;
  private readonly makeId: () => string;
  private readonly channel: StoreChannel; // task 8
  private readonly instanceId = `store-${Math.random().toString(36).slice(2)}`; // task 8
  private readonly subscriptions = new Set<Subscription>();
  private entries = new Map<string, Entry>();
  private preferences: Preferences | null = null;
  private formatVersion = STORE_FORMAT_VERSION;
  private sorted: Entry[] | null = null;
  private state: LoadState = 'loading';
  private loadError: Error | null = null;
  private loadTicket = 0;
  private pendingWrites = 0;
  private reloadRequested = false;
  private persistChain: Promise<void> = Promise.resolve();
  private readonly ready: Promise<void>;
  private resolveReady: () => void = () => undefined;

  constructor(options: LocalStoreOptions) {
    this.adapter = options.adapter;
    this.makeId = options.newId ?? (() => globalThis.crypto.randomUUID());
    this.channel = (options.channelFactory ?? createDefaultChannel)((message) => {
      // task 8
      if (message.origin === this.instanceId) return;
      void this.load(false);
    });
    this.ready = new Promise<void>((resolve) => {
      this.resolveReady = resolve;
    });
    void this.load(true);
  }

  /** Resolves once the initial load has settled, successfully or not. */
  whenReady(): Promise<void> {
    return this.ready;
  }

  /** Snapshot copy of all entries, sorted by start asc. */
  getEntries(): Entry[] {
    return this.sortedEntries().map((entry) => ({ ...entry }));
  }

  getPreferences(): Preferences | null {
    return this.preferences === null ? null : { ...this.preferences };
  }

  getFormatVersion(): number {
    return this.formatVersion;
  }

  listenerCount(): number {
    return this.subscriptions.size;
  }

  close(): void {
    this.subscriptions.clear();
    this.channel.close(); // task 8
    this.adapter.close();
  }

  subscribeEntriesInRange(
    range: TimeRange,
    onChange: (entries: Entry[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    return this.subscribe({
      kind: 'entries',
      select: (entries) => entries.filter((entry) => entry.start >= range.start && entry.start < range.end),
      onChange,
      onError,
    });
  }

  subscribeOpenEntries(onChange: (entries: Entry[]) => void, onError: (error: Error) => void): Unsubscribe {
    return this.subscribe({
      kind: 'entries',
      select: (entries) => entries.filter((entry) => entry.end === null),
      onChange,
      onError,
    });
  }

  subscribePreferences(
    onChange: (prefs: Preferences | null) => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    return this.subscribe({ kind: 'preferences', onChange, onError });
  }

  applyTransition(plan: TransitionPlan): Promise<void> {
    return this.write(() => {
      for (const close of plan.close) {
        if (!this.entries.has(close.id)) return Promise.reject(notFound(close.id));
      }
      const previous: Array<[string, Entry | undefined]> = [];
      const put: Entry[] = [];
      const remove: string[] = [];
      for (const close of plan.close) {
        const entry = this.entries.get(close.id) as Entry;
        previous.push([close.id, entry]);
        const next: Entry = { ...entry, end: close.end, updatedAt: close.updatedAt };
        this.entries.set(close.id, next);
        put.push(next);
      }
      for (const id of plan.delete) {
        const entry = this.entries.get(id);
        if (entry === undefined) continue;
        previous.push([id, entry]);
        this.entries.delete(id);
        remove.push(id);
      }
      if (plan.create !== null) {
        const created: Entry = { id: this.makeId(), ...plan.create };
        previous.push([created.id, undefined]);
        this.entries.set(created.id, created);
        put.push(created);
      }
      this.sorted = null;
      this.notifyEntries();
      return this.persist({ put, delete: remove, preferences: null }, () => this.restoreEntries(previous));
    });
  }

  createEntry(entry: NewEntry): Promise<void> {
    return this.write(() => {
      const created: Entry = { id: this.makeId(), ...entry };
      this.entries.set(created.id, created);
      this.sorted = null;
      this.notifyEntries();
      return this.persist({ put: [created], delete: [], preferences: null }, () =>
        this.restoreEntries([[created.id, undefined]]),
      );
    });
  }

  updateEntry(id: string, patch: EntryPatch): Promise<void> {
    return this.write(() => {
      const entry = this.entries.get(id);
      if (entry === undefined) return Promise.reject(notFound(id));
      const next: Entry = { ...entry, updatedAt: patch.updatedAt };
      if (patch.type !== undefined) next.type = patch.type;
      if (patch.start !== undefined) next.start = patch.start;
      if (patch.end !== undefined) next.end = patch.end;
      this.entries.set(id, next);
      this.sorted = null;
      this.notifyEntries();
      return this.persist({ put: [next], delete: [], preferences: null }, () => this.restoreEntries([[id, entry]]));
    });
  }

  deleteEntry(id: string): Promise<void> {
    return this.write(() => {
      const entry = this.entries.get(id);
      if (entry === undefined) return Promise.resolve();
      this.entries.delete(id);
      this.sorted = null;
      this.notifyEntries();
      return this.persist({ put: [], delete: [id], preferences: null }, () => this.restoreEntries([[id, entry]]));
    });
  }

  savePreferences(prefs: Preferences): Promise<void> {
    return this.write(() => {
      const previous = this.preferences;
      this.preferences = { theme: prefs.theme };
      this.notifyPreferences();
      return this.persist({ put: [], delete: [], preferences: { theme: prefs.theme } }, () => {
        this.preferences = previous;
        this.notifyPreferences();
      });
    });
  }

  /** Guarded full read (0053). Copies only — the caller can never reach the store's own objects
   *  (2R-A finding 6 stays out of reach). */
  readAll(): StoredData | null {
    if (this.state !== 'ready') return null;
    return { entries: this.getEntries(), preferences: this.getPreferences(), formatVersion: this.formatVersion };
  }

  replaceAll(data: BackupData): Promise<void> {
    return this.write(() => {
      const entries = data.entries.map((entry) => ({ ...entry }));
      const preferences = data.preferences === null ? null : { theme: data.preferences.theme };
      return this.persistWith(
        () => this.adapter.replaceAll({ entries, preferences }),
        () => {
          // Persisted first, so there is nothing to roll back: memory is derived from what storage took.
          this.entries = new Map(entries.map((entry) => [entry.id, { ...entry }]));
          this.preferences = preferences === null ? null : { ...preferences };
          this.formatVersion = STORE_FORMAT_VERSION;
          this.sorted = null;
          this.notifyEntries();
          this.notifyPreferences();
        },
        () => undefined,
      );
    });
  }

  /** Runs the mutation immediately once the store is loaded. Before that it waits for the initial load
   *  (so nothing is written that the load would overwrite); if the load failed, it rejects. */
  private write(mutate: () => Promise<void>): Promise<void> {
    if (this.state === 'ready') return mutate();
    if (this.state === 'failed') return Promise.reject(new Error(LOAD_FAILED_MESSAGE));
    return this.ready.then(() => this.write(mutate));
  }

  /** One adapter write with the store's full bookkeeping: serialised through persistChain, counted in
   *  pendingWrites so a cross-tab reload cannot interleave (:278, :295), settled afterwards, announced on
   *  the channel. onPersisted runs after the adapter resolved; onFailed after it rejected. */
  private persistWith(run: () => Promise<void>, onPersisted: () => void, onFailed: () => void): Promise<void> {
    this.pendingWrites += 1;
    const applied = this.persistChain.then(run);
    this.persistChain = applied.then(
      () => undefined,
      () => undefined,
    );
    return applied.then(
      () => {
        onPersisted();
        this.settleWrite();
        try {
          this.channel.post({ origin: this.instanceId }); // task 8
        } catch {
          // Best effort: a failed cross-tab notification never turns a persisted write into a rejected
          // one (0054, 2R-A finding 3). The write's promise reflects persistence only.
        }
      },
      (error: unknown) => {
        onFailed();
        this.settleWrite();
        throw error;
      },
    );
  }

  private persist(changes: StoreChanges, rollback: () => void): Promise<void> {
    return this.persistWith(
      () => this.adapter.apply(changes),
      () => undefined,
      rollback,
    );
  }

  private settleWrite(): void {
    this.pendingWrites -= 1;
    if (this.pendingWrites === 0 && this.reloadRequested) {
      this.reloadRequested = false;
      void this.load(false);
    }
  }

  private restoreEntries(previous: ReadonlyArray<readonly [string, Entry | undefined]>): void {
    for (const [id, entry] of previous) {
      if (entry === undefined) this.entries.delete(id);
      else this.entries.set(id, entry);
    }
    this.sorted = null;
    this.notifyEntries();
  }

  /** initial === true: the one load at startup, whose failure becomes the views' load error.
   *  initial === false: a reload triggered by another tab (task 8). A reload never overwrites newer
   *  state: it is postponed while a write or the initial load is in flight and discarded if a later
   *  reload started first. */
  private async load(initial: boolean): Promise<void> {
    if (!initial && (this.state === 'loading' || this.pendingWrites > 0)) {
      this.reloadRequested = true;
      return;
    }
    const ticket = ++this.loadTicket;
    let data;
    try {
      data = await this.adapter.loadAll();
    } catch (error) {
      if (!initial) return; // a failed background reload keeps the current state
      this.state = 'failed';
      this.loadError = toError(error);
      this.resolveReady();
      this.flushInitial();
      return;
    }
    if (ticket !== this.loadTicket) return;
    if (!initial && this.pendingWrites > 0) {
      this.reloadRequested = true;
      return;
    }
    this.entries = new Map(data.entries.map((entry) => [entry.id, entry]));
    this.preferences = data.preferences;
    this.formatVersion = data.formatVersion;
    this.sorted = null;
    if (initial) {
      this.state = 'ready';
      this.resolveReady();
      this.flushInitial();
      if (this.reloadRequested) {
        this.reloadRequested = false;
        void this.load(false);
      }
      return;
    }
    this.notifyEntries();
    this.notifyPreferences();
  }

  private flushInitial(): void {
    for (const subscription of [...this.subscriptions]) {
      if (this.subscriptions.has(subscription)) this.deliverInitial(subscription);
    }
  }

  private subscribe(subscription: Subscription): Unsubscribe {
    this.subscriptions.add(subscription);
    queueMicrotask(() => {
      if (this.subscriptions.has(subscription)) this.deliverInitial(subscription);
    });
    return () => {
      this.subscriptions.delete(subscription);
    };
  }

  private deliverInitial(subscription: Subscription): void {
    if (this.state === 'loading') return; // delivered when the initial load settles
    if (this.state === 'failed') {
      subscription.onError(this.loadError ?? new Error(LOAD_FAILED_MESSAGE));
      return;
    }
    this.deliver(subscription);
  }

  private deliver(subscription: Subscription): void {
    if (subscription.kind === 'entries') subscription.onChange(subscription.select(this.sortedEntries()));
    else subscription.onChange(this.getPreferences());
  }

  private notifyEntries(): void {
    if (this.state !== 'ready') return;
    for (const subscription of [...this.subscriptions]) {
      if (subscription.kind === 'entries' && this.subscriptions.has(subscription)) this.deliver(subscription);
    }
  }

  private notifyPreferences(): void {
    if (this.state !== 'ready') return;
    for (const subscription of [...this.subscriptions]) {
      if (subscription.kind === 'preferences' && this.subscriptions.has(subscription)) this.deliver(subscription);
    }
  }

  private sortedEntries(): readonly Entry[] {
    if (this.sorted === null) this.sorted = [...this.entries.values()].sort(byStartAsc);
    return this.sorted;
  }
}

/** The app's entry point into the data layer: builds the store and issues the one-off
 *  persistent-storage request (0033). Called once per tab. */
export function createLocalStore(options: LocalStoreOptions): LocalStore {
  const store = new LocalStore(options);
  const nav =
    options.navigator === undefined
      ? (globalThis.navigator as StorageCapableNavigator | undefined)
      : options.navigator;
  void requestPersistentStorage(nav);
  return store;
}

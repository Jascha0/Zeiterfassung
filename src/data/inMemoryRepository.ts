import type { Unsubscribe } from '../auth/authTypes';
import type { TransitionPlan } from '../domain/timer';
import type { Entry, TimeRange } from '../domain/types';
import type { EntryRepository, Preferences, SettingsRepository, SubscriptionMeta } from './repository';

interface EntrySubscription {
  kind: 'entries';
  uid: string;
  select: (entries: Entry[]) => Entry[];
  onChange: (entries: Entry[], meta: SubscriptionMeta) => void;
}

interface PreferencesSubscription {
  kind: 'preferences';
  uid: string;
  onChange: (prefs: Preferences | null) => void;
}

type Subscription = EntrySubscription | PreferencesSubscription;

function byStartAsc(a: Entry, b: Entry): number {
  if (a.start !== b.start) return a.start - b.start;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

function copyEntries(entries: Iterable<Entry>): Entry[] {
  return Array.from(entries, (entry) => ({ ...entry })).sort(byStartAsc);
}

export class InMemoryRepository implements EntryRepository, SettingsRepository {
  private readonly entries = new Map<string, Map<string, Entry>>();
  private readonly preferences = new Map<string, Preferences | null>();
  private readonly subscriptions = new Set<Subscription>();
  private readonly pendingWrites: Array<() => void> = [];
  private nextId = 1;
  private nextWriteError: Error | null = null;
  private offline = false;
  private fromCacheOverride: boolean | null = null;

  seedEntries(uid: string, entries: Entry[]): void {
    this.entries.set(uid, new Map(entries.map((entry) => [entry.id, { ...entry }])));
    this.notifyEntries(uid);
  }

  getEntries(uid: string): Entry[] {
    return copyEntries(this.userEntries(uid).values());
  }

  seedPreferences(uid: string, prefs: Preferences | null): void {
    this.preferences.set(uid, prefs === null ? null : { ...prefs });
    this.notifyPreferences(uid);
  }

  failNextWrite(error: Error): void {
    this.nextWriteError = error;
  }

  setOffline(offline: boolean): void {
    this.offline = offline;
    this.notifyAllEntries();
    if (offline) return;
    const pending = this.pendingWrites.splice(0);
    for (const settle of pending) settle();
  }

  setFromCacheOverride(fromCache: boolean | null): void {
    this.fromCacheOverride = fromCache;
    this.notifyAllEntries();
  }

  listenerCount(): number {
    return this.subscriptions.size;
  }

  subscribeEntriesInRange(
    uid: string,
    range: TimeRange,
    onChange: (entries: Entry[], meta: SubscriptionMeta) => void,
    _onError: (error: Error) => void,
  ): Unsubscribe {
    return this.subscribe({
      kind: 'entries',
      uid,
      select: (entries) => entries.filter((entry) => entry.start >= range.start && entry.start < range.end),
      onChange,
    });
  }

  subscribeOpenEntries(
    uid: string,
    onChange: (entries: Entry[], meta: SubscriptionMeta) => void,
    _onError: (error: Error) => void,
  ): Unsubscribe {
    return this.subscribe({
      kind: 'entries',
      uid,
      select: (entries) => entries.filter((entry) => entry.end === null),
      onChange,
    });
  }

  subscribePreferences(
    uid: string,
    onChange: (prefs: Preferences | null) => void,
    _onError: (error: Error) => void,
  ): Unsubscribe {
    return this.subscribe({ kind: 'preferences', uid, onChange });
  }

  applyTransition(uid: string, plan: TransitionPlan): Promise<void> {
    const userEntries = this.userEntries(uid);
    if (plan.close.some((close) => !userEntries.has(close.id))) {
      return Promise.reject(Object.assign(new Error('not-found'), { code: 'not-found' }));
    }

    const previous = plan.close.map((close) => ({ ...(userEntries.get(close.id) as Entry) }));
    for (const close of plan.close) {
      const entry = userEntries.get(close.id) as Entry;
      userEntries.set(close.id, { ...entry, end: close.end, updatedAt: close.updatedAt });
    }
    let createdId: string | null = null;
    if (plan.create !== null) {
      createdId = `mem-${this.nextId++}`;
      userEntries.set(createdId, { id: createdId, ...plan.create });
    }
    this.entries.set(uid, userEntries);
    this.notifyEntries(uid);

    return this.settleWrite(() => {
      const current = this.userEntries(uid);
      if (createdId !== null) current.delete(createdId);
      for (const entry of previous) current.set(entry.id, entry);
      this.notifyEntries(uid);
    });
  }

  savePreferences(uid: string, prefs: Preferences): Promise<void> {
    const hadPrevious = this.preferences.has(uid);
    const previous = this.preferences.get(uid) ?? null;
    this.preferences.set(uid, { theme: prefs.theme });
    this.notifyPreferences(uid);

    return this.settleWrite(() => {
      if (hadPrevious) this.preferences.set(uid, previous);
      else this.preferences.delete(uid);
      this.notifyPreferences(uid);
    });
  }

  private settleWrite(rollback: () => void): Promise<void> {
    const error = this.nextWriteError;
    this.nextWriteError = null;
    return new Promise<void>((resolve, reject) => {
      const settle = () => {
        if (error === null) {
          resolve();
          return;
        }
        rollback();
        reject(error);
      };
      if (this.offline) this.pendingWrites.push(settle);
      else queueMicrotask(settle);
    });
  }

  private subscribe(subscription: Subscription): Unsubscribe {
    this.subscriptions.add(subscription);
    queueMicrotask(() => {
      if (this.subscriptions.has(subscription)) this.deliver(subscription);
    });
    return () => {
      this.subscriptions.delete(subscription);
    };
  }

  private currentMeta(): SubscriptionMeta {
    return {
      fromCache: this.fromCacheOverride ?? this.offline,
      hasPendingWrites: this.pendingWrites.length > 0,
    };
  }

  private deliver(subscription: Subscription): void {
    if (subscription.kind === 'entries') {
      subscription.onChange(subscription.select(this.getEntries(subscription.uid)), this.currentMeta());
    } else {
      const prefs = this.preferences.get(subscription.uid) ?? null;
      subscription.onChange(prefs === null ? null : { ...prefs });
    }
  }

  private notifyEntries(uid: string): void {
    for (const subscription of [...this.subscriptions]) {
      if (subscription.kind === 'entries' && subscription.uid === uid && this.subscriptions.has(subscription)) {
        this.deliver(subscription);
      }
    }
  }

  private notifyAllEntries(): void {
    for (const subscription of [...this.subscriptions]) {
      if (subscription.kind === 'entries' && this.subscriptions.has(subscription)) {
        this.deliver(subscription);
      }
    }
  }

  private notifyPreferences(uid: string): void {
    for (const subscription of [...this.subscriptions]) {
      if (subscription.kind === 'preferences' && subscription.uid === uid && this.subscriptions.has(subscription)) {
        this.deliver(subscription);
      }
    }
  }

  private userEntries(uid: string): Map<string, Entry> {
    let userEntries = this.entries.get(uid);
    if (userEntries === undefined) {
      userEntries = new Map();
      this.entries.set(uid, userEntries);
    }
    return userEntries;
  }
}

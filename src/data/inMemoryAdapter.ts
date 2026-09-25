import type { Entry } from '../domain/types';
import {
  STORE_FORMAT_VERSION,
  type BackupData,
  type PersistenceAdapter,
  type StoreChanges,
  type StoredData,
} from './persistence';
import type { Preferences } from './repository';

export interface InMemoryAdapterSeed {
  entries?: readonly Entry[];
  preferences?: Preferences | null;
  formatVersion?: number;
}

function byStartAsc(a: Entry, b: Entry): number {
  if (a.start !== b.start) return a.start - b.start;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/** Persistence adapter for tests. The store code above it is the same code production runs. */
export class InMemoryAdapter implements PersistenceAdapter {
  private entries = new Map<string, Entry>();
  private preferences: Preferences | null;
  private readonly formatVersion: number;
  private nextLoadError: unknown = null;
  private nextApplyError: unknown = null;
  private nextLoadHold: Promise<void> | null = null;
  private nextApplyHold: Promise<void> | null = null;
  private nextReplaceAllError: unknown = null;
  private nextReplaceAllHold: Promise<void> | null = null;
  loadCount = 0;
  applyCount = 0;
  replaceAllCount = 0;

  constructor(seed: InMemoryAdapterSeed = {}) {
    for (const entry of seed.entries ?? []) this.entries.set(entry.id, { ...entry });
    this.preferences = seed.preferences ?? null;
    this.formatVersion = seed.formatVersion ?? STORE_FORMAT_VERSION;
  }

  async loadAll(): Promise<StoredData> {
    this.loadCount += 1;
    // Snapshot BEFORE waiting: a held load must resolve with the data as it was when the load was
    // issued, not with whatever the data became meanwhile. That is what makes a genuinely stale
    // delivery reproducible, and therefore what makes the store's ordering guard testable (A9).
    const snapshot: StoredData = {
      entries: [...this.entries.values()].map((entry) => ({ ...entry })).sort(byStartAsc),
      preferences: this.preferences === null ? null : { ...this.preferences },
      formatVersion: this.formatVersion,
    };
    const hold = this.nextLoadHold;
    this.nextLoadHold = null;
    if (hold !== null) await hold;
    const error = this.nextLoadError;
    if (error !== null) {
      this.nextLoadError = null;
      throw error;
    }
    return snapshot;
  }

  async apply(changes: StoreChanges): Promise<void> {
    this.applyCount += 1;
    const hold = this.nextApplyHold;
    this.nextApplyHold = null;
    if (hold !== null) await hold;
    const error = this.nextApplyError;
    if (error !== null) {
      this.nextApplyError = null;
      throw error;
    }
    for (const id of changes.delete) this.entries.delete(id);
    for (const entry of changes.put) this.entries.set(entry.id, { ...entry });
    if (changes.preferences !== null) this.preferences = { ...changes.preferences };
  }

  async replaceAll(data: BackupData): Promise<void> {
    this.replaceAllCount += 1;
    const hold = this.nextReplaceAllHold;
    this.nextReplaceAllHold = null;
    if (hold !== null) await hold;
    const error = this.nextReplaceAllError;
    if (error !== null) {
      this.nextReplaceAllError = null;
      throw error;
    }
    this.entries = new Map(data.entries.map((entry) => [entry.id, { ...entry }]));
    // Mirrors the IndexedDB delete, or the in-memory tests would pass while the real path diverges (0059).
    this.preferences = data.preferences === null ? null : { ...data.preferences };
  }

  close(): void {
    // Nothing to release.
  }

  /** Test seam: the next loadAll() rejects with this error and reads nothing. */
  failNextLoad(error: unknown): void {
    this.nextLoadError = error;
  }

  /** Test seam: the next apply() rejects with this error and changes nothing. */
  failNextApply(error: unknown): void {
    this.nextApplyError = error;
  }

  /** Test seam: holds the next loadAll() until the returned release function is called. */
  holdNextLoad(): () => void {
    let release = (): void => undefined;
    this.nextLoadHold = new Promise<void>((resolve) => {
      release = () => resolve();
    });
    return release;
  }

  /** Test seam: holds the next apply() until the returned release function is called. */
  holdNextApply(): () => void {
    let release = (): void => undefined;
    this.nextApplyHold = new Promise<void>((resolve) => {
      release = () => resolve();
    });
    return release;
  }

  /** Test seam: the next replaceAll() rejects with this error and changes nothing. */
  failNextReplaceAll(error: unknown): void {
    this.nextReplaceAllError = error;
  }

  /** Test seam: holds the next replaceAll() until the returned release function is called. */
  holdNextReplaceAll(): () => void {
    let release = (): void => undefined;
    this.nextReplaceAllHold = new Promise<void>((resolve) => {
      release = () => resolve();
    });
    return release;
  }

  /** Test seam: replaces the stored entries without going through apply(). */
  seedEntries(entries: readonly Entry[]): void {
    this.entries = new Map(entries.map((entry) => [entry.id, { ...entry }]));
  }

  /** Test seam: the stored entries, sorted by start asc. */
  storedEntries(): Entry[] {
    return [...this.entries.values()].map((entry) => ({ ...entry })).sort(byStartAsc);
  }

  /** Test seam: the stored preferences. */
  storedPreferences(): Preferences | null {
    return this.preferences === null ? null : { ...this.preferences };
  }
}

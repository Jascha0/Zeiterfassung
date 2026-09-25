import type { Entry, EntryType, NewEntry, TimeRange } from '../domain/types';
import type { TransitionPlan } from '../domain/timer';
import type { BackupData, StoredData } from './persistence';
import type { ThemePreference } from '../theme/theme';

/** Cancels a subscription. Idempotent. The data layer's own alias; the auth stack that had a second
 *  identical one was deleted in 2R-B (0035). */
export type Unsubscribe = () => void;

export interface Preferences {
  theme: ThemePreference;
}

export interface EntryPatch {
  type?: EntryType;
  start?: number;
  end?: number | null;
  /** Required; always set by the caller. */
  updatedAt: number;
}

export interface EntryRepository {
  /** Entries with range.start <= start < range.end, ordered by start asc. onChange fires with the
   *  initial result and on every later change; onError fires when the local data could not be loaded. */
  subscribeEntriesInRange(
    range: TimeRange,
    onChange: (entries: Entry[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe;
  subscribeOpenEntries(onChange: (entries: Entry[]) => void, onError: (error: Error) => void): Unsubscribe;
  /** Resolves once the change is persisted locally; rejects if it could not be persisted, after the
   *  in-memory state has been rolled back. Closes, the optional creation and the deletions are one
   *  all-or-nothing batch (0028). */
  applyTransition(plan: TransitionPlan): Promise<void>;
  /** Resolves once persisted; rejects after rolling back the optimistic in-memory change. */
  createEntry(entry: NewEntry): Promise<void>;
  updateEntry(id: string, patch: EntryPatch): Promise<void>;
  deleteEntry(id: string): Promise<void>;
}

export interface SettingsRepository {
  subscribePreferences(onChange: (prefs: Preferences | null) => void, onError: (error: Error) => void): Unsubscribe;
  savePreferences(prefs: Preferences): Promise<void>;
}

/** The backup's view of the store (0053). Type-only import of the persistence shapes; nothing here
 *  reaches the adapter directly. */
export interface BackupRepository {
  /** Everything the backup needs: the format version plus copies of every entry and of the
   *  preferences. Returns **null** unless the initial load succeeded — an export written while the
   *  load is still running or after it failed would be a file the user wrongly trusts (0053).
   *  Synchronous: the store answers from memory. Never returns an empty data set to mean "refused". */
  readAll(): StoredData | null;
  /** Replaces the whole data set atomically: persists first, then swaps memory and notifies entry and
   *  preference subscribers. Rejects without changing anything if the write failed (0053).
   *  `data.preferences === null` clears the stored preferences (0059). */
  replaceAll(data: BackupData): Promise<void>;
}

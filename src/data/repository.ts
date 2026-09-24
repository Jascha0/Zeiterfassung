import type { Entry, EntryType, NewEntry, TimeRange } from '../domain/types';
import type { TransitionPlan } from '../domain/timer';
import type { ThemePreference } from '../theme/theme';

/** Cancels a subscription. Idempotent. Home of the data-side type since 2R-A; `src/auth/authTypes.ts`
 *  keeps its own identical alias until 2R-B deletes the auth stack (0035). */
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
  subscribePreferences(
    uid: string,
    onChange: (prefs: Preferences | null) => void,
    onError: (error: Error) => void,
  ): Unsubscribe;
  savePreferences(uid: string, prefs: Preferences): Promise<void>;
}

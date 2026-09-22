import type { Entry, EntryType, NewEntry, TimeRange } from '../domain/types';
import type { TransitionPlan } from '../domain/timer';
import type { Unsubscribe } from '../auth/authTypes';
import type { ThemePreference } from '../theme/theme';

export interface Preferences {
  theme: ThemePreference;
}

export interface SubscriptionMeta {
  fromCache: boolean;
  hasPendingWrites: boolean;
}

export interface EntryPatch {
  type?: EntryType;
  start?: number;
  end?: number | null;
  /** Required; always set by the caller. */
  updatedAt: number;
}

export interface EntryRepository {
  /** Entries with range.start <= start < range.end, ordered by start asc.
   *  onChange fires with the initial result and on every local (incl. pending/offline) or remote change. */
  subscribeEntriesInRange(
    uid: string,
    range: TimeRange,
    onChange: (entries: Entry[], meta: SubscriptionMeta) => void,
    onError: (error: Error) => void,
  ): Unsubscribe;
  subscribeOpenEntries(
    uid: string,
    onChange: (entries: Entry[], meta: SubscriptionMeta) => void,
    onError: (error: Error) => void,
  ): Unsubscribe;
  /** Resolves on server acknowledgement (may stay pending offline); rejects on rule rejection.
   *  Closes, the optional creation and the deletions are written as one all-or-nothing batch. */
  applyTransition(uid: string, plan: TransitionPlan): Promise<void>;
  /** Resolves on server acknowledgement (may stay pending offline); rejects on rule rejection. */
  createEntry(uid: string, entry: NewEntry): Promise<void>;
  /** Resolves on server acknowledgement (may stay pending offline); rejects on rule rejection. */
  updateEntry(uid: string, id: string, patch: EntryPatch): Promise<void>;
  /** Resolves on server acknowledgement (may stay pending offline); rejects on rule rejection. */
  deleteEntry(uid: string, id: string): Promise<void>;
}

export interface SettingsRepository {
  subscribePreferences(
    uid: string,
    onChange: (prefs: Preferences | null) => void,
    onError: (error: Error) => void,
  ): Unsubscribe;
  savePreferences(uid: string, prefs: Preferences): Promise<void>;
}

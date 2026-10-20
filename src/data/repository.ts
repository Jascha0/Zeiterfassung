import type { Entry, EntryChanges, NewClosedEntry, NewProject, Project, ProjectChanges, TimeRange } from '../domain/types';
import type { TransitionPlan } from '../domain/timer';
import type { Unsubscribe } from '../auth/authTypes';
import type { ThemePreference } from '../theme/theme';

export interface Preferences {
  theme: ThemePreference;
}

export interface EntryRepository {
  /** Entries with range.start <= start < range.end, ordered by start asc.
   *  onChange fires with the initial result and on every local (incl. pending/offline) or remote change. */
  subscribeEntriesInRange(
    uid: string,
    range: TimeRange,
    onChange: (entries: Entry[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe;
  subscribeOpenEntries(uid: string, onChange: (entries: Entry[]) => void, onError: (error: Error) => void): Unsubscribe;
  /** Resolves on server acknowledgement (may stay pending offline); rejects on rule rejection. */
  applyTransition(uid: string, plan: TransitionPlan): Promise<void>;
  /** Creates one closed entry with a generated id. Optimistic; resolves on server ack (may stay pending offline); rejects on rule rejection. */
  createEntry(uid: string, entry: NewClosedEntry): Promise<void>;
  /** Writes only the defined fields of `changes` plus updatedAt to entry `id`. Rejects with code 'not-found' if the entry does not exist.
   *  projectId/note: { kind: 'set' } writes the value, { kind: 'remove' } removes the field. */
  updateEntry(uid: string, id: string, changes: EntryChanges): Promise<void>;
  /** Deletes entry `id`. Resolves also when it does not exist. */
  deleteEntry(uid: string, id: string): Promise<void>;
  /** The entry with the smallest start strictly greater than `after` (ties: smallest id), or null. Fires initially and on every change. */
  subscribeFirstEntryAfter(
    uid: string,
    after: number,
    onChange: (entry: Entry | null) => void,
    onError: (error: Error) => void,
  ): Unsubscribe;
  /** The entry with the greatest start strictly less than `before` (ties: greatest id), or null. Fires initially and on every change. */
  subscribeLastEntryBefore(
    uid: string,
    before: number,
    onChange: (entry: Entry | null) => void,
    onError: (error: Error) => void,
  ): Unsubscribe;
}

export interface ProjectRepository {
  /** All projects of the user incl. archived, in no defined order. Fires initially and on every local (incl. pending/offline) or remote change. */
  subscribeProjects(uid: string, onChange: (projects: Project[]) => void, onError: (error: Error) => void): Unsubscribe;
  /** Creates one project with a generated id. Optimistic; resolves on server ack (may stay pending offline); rejects on rule rejection. */
  createProject(uid: string, project: NewProject): Promise<void>;
  /** Writes only the defined fields of `changes` plus updatedAt. Rejects with code 'not-found' if the project does not exist. No delete exists (0034). */
  updateProject(uid: string, id: string, changes: ProjectChanges): Promise<void>;
}

export interface SettingsRepository {
  subscribePreferences(
    uid: string,
    onChange: (prefs: Preferences | null) => void,
    onError: (error: Error) => void,
  ): Unsubscribe;
  savePreferences(uid: string, prefs: Preferences): Promise<void>;
}

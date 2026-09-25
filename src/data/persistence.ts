import type { Entry } from '../domain/types';
import type { Preferences } from './repository';

/** Version of the stored shape. Slice 2E writes the same number into the backup file (0037). */
export const STORE_FORMAT_VERSION = 1;

export interface StoredData {
  entries: Entry[];
  preferences: Preferences | null;
  formatVersion: number;
}

export interface StoreChanges {
  /** Entries to insert or overwrite. */
  put: readonly Entry[];
  /** Ids to remove. */
  delete: readonly string[];
  /** null means: leave the stored preferences untouched. replaceAll does NOT use this convention (0059). */
  preferences: Preferences | null;
}

/** A complete data set for replaceAll. Values are taken literally: preferences === null means
 *  DELETE the stored preferences, never "leave them untouched" (0059). Deliberately not StoreChanges —
 *  a patch language cannot express "nothing". */
export interface BackupData {
  entries: readonly Entry[];
  preferences: Preferences | null;
}

export interface PersistenceAdapter {
  /** Reads the complete data set. Rejects when the store cannot be read. */
  loadAll(): Promise<StoredData>;
  /** Applies every put, delete and the preferences atomically: all of it lands, or none of it. */
  apply(changes: StoreChanges): Promise<void>;
  /** Replaces the whole data set in ONE atomic operation: the previous entries are gone, every entry of
   *  `data` is stored, the preferences are written or deleted by value, and STORE_FORMAT_VERSION is
   *  written as the format version. All of it lands, or none of it. */
  replaceAll(data: BackupData): Promise<void>;
  /** Releases the underlying resources. Idempotent. */
  close(): void;
}

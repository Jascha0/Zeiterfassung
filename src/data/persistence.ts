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
  /** null means: leave the stored preferences untouched. */
  preferences: Preferences | null;
}

export interface PersistenceAdapter {
  /** Reads the complete data set. Rejects when the store cannot be read. */
  loadAll(): Promise<StoredData>;
  /** Applies every put, delete and the preferences atomically: all of it lands, or none of it. */
  apply(changes: StoreChanges): Promise<void>;
  /** Releases the underlying resources. Idempotent. */
  close(): void;
}

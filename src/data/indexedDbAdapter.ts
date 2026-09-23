import { parseStoredEntry, parseStoredPreferences, toStoredEntry } from './entryMapping';
import { STORE_FORMAT_VERSION, type PersistenceAdapter, type StoreChanges, type StoredData } from './persistence';
import type { Entry } from '../domain/types';

export const DB_NAME = 'zeiterfassung';
export const DB_VERSION = 1;
export const ENTRIES_STORE = 'entries';
export const META_STORE = 'meta';
export const PREFERENCES_KEY = 'preferences';
export const FORMAT_VERSION_KEY = 'formatVersion';

export interface IndexedDbAdapterOptions {
  /** Defaults to globalThis.indexedDB, which jsdom does not provide. */
  factory?: IDBFactory;
  /** Defaults to DB_NAME; tests use one database name per case. */
  dbName?: string;
  /** Test seam: runs inside the write transaction after every put and delete has been issued.
   *  Throwing aborts the transaction and makes apply() reject with the thrown error; calling
   *  tx.abort() directly makes it reject with the transaction's own AbortError. */
  onWriteStaged?: (tx: IDBTransaction) => void;
}

function byStartAsc(a: Entry, b: Entry): number {
  if (a.start !== b.start) return a.start - b.start;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

export class IndexedDbAdapter implements PersistenceAdapter {
  private readonly factory: IDBFactory | undefined;
  private readonly dbName: string;
  private readonly onWriteStaged: ((tx: IDBTransaction) => void) | undefined;
  private connection: Promise<IDBDatabase> | null = null;

  constructor(options: IndexedDbAdapterOptions = {}) {
    this.factory = options.factory ?? (globalThis.indexedDB as IDBFactory | undefined);
    this.dbName = options.dbName ?? DB_NAME;
    this.onWriteStaged = options.onWriteStaged;
  }

  async loadAll(): Promise<StoredData> {
    const db = await this.open();
    return new Promise<StoredData>((resolve, reject) => {
      const tx = db.transaction([ENTRIES_STORE, META_STORE], 'readonly');
      const entriesRequest = tx.objectStore(ENTRIES_STORE).getAll();
      const preferencesRequest = tx.objectStore(META_STORE).get(PREFERENCES_KEY);
      const versionRequest = tx.objectStore(META_STORE).get(FORMAT_VERSION_KEY);
      tx.oncomplete = () => {
        const entries: Entry[] = [];
        for (const record of entriesRequest.result as unknown[]) {
          const entry = parseStoredEntry(record);
          if (entry !== null) entries.push(entry);
        }
        entries.sort(byStartAsc);
        const version: unknown = versionRequest.result;
        resolve({
          entries,
          preferences: parseStoredPreferences(preferencesRequest.result),
          formatVersion: typeof version === 'number' ? version : STORE_FORMAT_VERSION,
        });
      };
      tx.onerror = () => reject(tx.error ?? new Error('Laden aus IndexedDB fehlgeschlagen.'));
      tx.onabort = () => reject(tx.error ?? new Error('Laden aus IndexedDB abgebrochen.'));
    });
  }

  async apply(changes: StoreChanges): Promise<void> {
    const db = await this.open();
    return new Promise<void>((resolve, reject) => {
      let injected: unknown = null;
      const tx = db.transaction([ENTRIES_STORE, META_STORE], 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(injected ?? tx.error ?? new Error('Schreiben in IndexedDB fehlgeschlagen.'));
      tx.onabort = () => reject(injected ?? tx.error ?? new Error('Schreiben in IndexedDB abgebrochen.'));
      try {
        const entries = tx.objectStore(ENTRIES_STORE);
        for (const id of changes.delete) entries.delete(id);
        for (const entry of changes.put) entries.put(toStoredEntry(entry));
        if (changes.preferences !== null) {
          tx.objectStore(META_STORE).put({ theme: changes.preferences.theme }, PREFERENCES_KEY);
        }
        if (this.onWriteStaged !== undefined) this.onWriteStaged(tx);
      } catch (error) {
        injected = error;
        try {
          tx.abort();
        } catch {
          // The hook aborted the transaction itself.
        }
      }
    });
  }

  close(): void {
    const connection = this.connection;
    this.connection = null;
    if (connection !== null) {
      void connection.then(
        (db) => db.close(),
        () => undefined,
      );
    }
  }

  private open(): Promise<IDBDatabase> {
    if (this.connection !== null) return this.connection;
    const factory = this.factory;
    if (factory === undefined) {
      return Promise.reject(new Error('IndexedDB ist in dieser Umgebung nicht verfügbar.'));
    }
    const connection = new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(this.dbName, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(ENTRIES_STORE)) {
          db.createObjectStore(ENTRIES_STORE, { keyPath: 'id' }).createIndex('start', 'start');
        }
        if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
        const tx = request.transaction;
        if (tx !== null) tx.objectStore(META_STORE).put(STORE_FORMAT_VERSION, FORMAT_VERSION_KEY);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB konnte nicht geöffnet werden.'));
      request.onblocked = () => reject(new Error('IndexedDB ist durch eine andere Verbindung blockiert.'));
    }).catch((error: unknown) => {
      this.connection = null;
      throw error;
    });
    this.connection = connection;
    return connection;
  }
}

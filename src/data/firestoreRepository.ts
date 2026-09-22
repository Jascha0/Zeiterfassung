import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
  type Query,
  type QuerySnapshot,
} from 'firebase/firestore';
import type { Unsubscribe } from '../auth/authTypes';
import type { TransitionPlan } from '../domain/timer';
import type { Entry, NewEntry, TimeRange } from '../domain/types';
import { parseEntry, parsePreferences } from './entryMapping';
import type { EntryPatch, EntryRepository, Preferences, SettingsRepository, SubscriptionMeta } from './repository';

function toEntries(snapshot: QuerySnapshot): Entry[] {
  const entries: Entry[] = [];
  for (const document of snapshot.docs) {
    const entry = parseEntry(document.id, document.data());
    if (entry === null) {
      console.warn(`Ungültiger Eintrag übersprungen: ${document.id}`);
      continue;
    }
    entries.push(entry);
  }
  return entries;
}

export class FirestoreRepository implements EntryRepository, SettingsRepository {
  private readonly db: Firestore;

  constructor(db: Firestore) {
    this.db = db;
  }

  subscribeEntriesInRange(
    uid: string,
    range: TimeRange,
    onChange: (entries: Entry[], meta: SubscriptionMeta) => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    const rangeQuery = query(
      this.entriesCollection(uid),
      where('start', '>=', Timestamp.fromMillis(range.start)),
      where('start', '<', Timestamp.fromMillis(range.end)),
      orderBy('start', 'asc'),
    );
    return this.subscribeQuery(rangeQuery, onChange, onError);
  }

  subscribeOpenEntries(
    uid: string,
    onChange: (entries: Entry[], meta: SubscriptionMeta) => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    const openQuery = query(this.entriesCollection(uid), where('end', '==', null));
    return this.subscribeQuery(
      openQuery,
      (entries, meta) => onChange(entries.sort((a, b) => a.start - b.start), meta),
      onError,
    );
  }

  applyTransition(uid: string, plan: TransitionPlan): Promise<void> {
    if (plan.close.length === 0 && plan.create === null && plan.delete.length === 0) return Promise.resolve();
    const entries = this.entriesCollection(uid);
    const batch = writeBatch(this.db);
    for (const close of plan.close) {
      batch.update(doc(entries, close.id), {
        end: Timestamp.fromMillis(close.end),
        updatedAt: Timestamp.fromMillis(close.updatedAt),
      });
    }
    if (plan.create !== null) {
      const create = plan.create;
      batch.set(doc(entries), {
        type: create.type,
        start: Timestamp.fromMillis(create.start),
        end: create.end === null ? null : Timestamp.fromMillis(create.end),
        createdAt: Timestamp.fromMillis(create.createdAt),
        updatedAt: Timestamp.fromMillis(create.updatedAt),
      });
    }
    for (const id of plan.delete) batch.delete(doc(entries, id));
    return batch.commit();
  }

  createEntry(uid: string, entry: NewEntry): Promise<void> {
    return setDoc(doc(this.entriesCollection(uid)), {
      type: entry.type,
      start: Timestamp.fromMillis(entry.start),
      end: entry.end === null ? null : Timestamp.fromMillis(entry.end),
      createdAt: Timestamp.fromMillis(entry.createdAt),
      updatedAt: Timestamp.fromMillis(entry.updatedAt),
    });
  }

  updateEntry(uid: string, id: string, patch: EntryPatch): Promise<void> {
    const payload: Record<string, unknown> = { updatedAt: Timestamp.fromMillis(patch.updatedAt) };
    if (patch.type !== undefined) payload.type = patch.type;
    if (patch.start !== undefined) payload.start = Timestamp.fromMillis(patch.start);
    if (patch.end !== undefined) payload.end = patch.end === null ? null : Timestamp.fromMillis(patch.end);
    return updateDoc(doc(this.entriesCollection(uid), id), payload);
  }

  deleteEntry(uid: string, id: string): Promise<void> {
    return deleteDoc(doc(this.entriesCollection(uid), id));
  }

  subscribePreferences(
    uid: string,
    onChange: (prefs: Preferences | null) => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    return onSnapshot(
      this.preferencesDoc(uid),
      (snapshot) => onChange(parsePreferences(snapshot.data())),
      onError,
    );
  }

  savePreferences(uid: string, prefs: Preferences): Promise<void> {
    return setDoc(this.preferencesDoc(uid), { theme: prefs.theme });
  }

  private entriesCollection(uid: string) {
    return collection(this.db, 'users', uid, 'entries');
  }

  private preferencesDoc(uid: string) {
    return doc(this.db, 'users', uid, 'settings', 'preferences');
  }

  private subscribeQuery(
    target: Query,
    onChange: (entries: Entry[], meta: SubscriptionMeta) => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    return onSnapshot(
      target,
      { includeMetadataChanges: true },
      (snapshot) =>
        onChange(toEntries(snapshot), {
          fromCache: snapshot.metadata.fromCache,
          hasPendingWrites: snapshot.metadata.hasPendingWrites,
        }),
      onError,
    );
  }
}

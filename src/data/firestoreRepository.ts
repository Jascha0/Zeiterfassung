import {
  Timestamp,
  collection,
  deleteDoc,
  deleteField,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type FieldValue,
  type Firestore,
  type Query,
  type QuerySnapshot,
} from 'firebase/firestore';
import type { Unsubscribe } from '../auth/authTypes';
import type { TransitionPlan } from '../domain/timer';
import type {
  Entry,
  EntryChanges,
  FieldChange,
  NewClosedEntry,
  NewProject,
  Project,
  ProjectChanges,
  TimeRange,
} from '../domain/types';
import { parseEntry, parsePreferences, parseProject } from './entryMapping';
import type { EntryRepository, Preferences, ProjectRepository, SettingsRepository } from './repository';

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

function toProjects(snapshot: QuerySnapshot): Project[] {
  const projects: Project[] = [];
  for (const document of snapshot.docs) {
    const project = parseProject(document.id, document.data());
    if (project === null) {
      console.warn(`Ungültiges Projekt übersprungen: ${document.id}`);
      continue;
    }
    projects.push(project);
  }
  return projects;
}

function fieldChangeValue(change: FieldChange<string>): string | FieldValue {
  return change.kind === 'set' ? change.value : deleteField();
}

export class FirestoreRepository implements EntryRepository, SettingsRepository, ProjectRepository {
  private readonly db: Firestore;

  constructor(db: Firestore) {
    this.db = db;
  }

  subscribeEntriesInRange(
    uid: string,
    range: TimeRange,
    onChange: (entries: Entry[]) => void,
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

  subscribeOpenEntries(uid: string, onChange: (entries: Entry[]) => void, onError: (error: Error) => void): Unsubscribe {
    const openQuery = query(this.entriesCollection(uid), where('end', '==', null));
    return this.subscribeQuery(openQuery, (entries) => onChange(entries.sort((a, b) => a.start - b.start)), onError);
  }

  applyTransition(uid: string, plan: TransitionPlan): Promise<void> {
    if (plan.close.length === 0 && plan.create === null) return Promise.resolve();
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
      const data: { [field: string]: string | Timestamp | null } = {
        type: create.type,
        start: Timestamp.fromMillis(create.start),
        end: null,
        createdAt: Timestamp.fromMillis(create.createdAt),
        updatedAt: Timestamp.fromMillis(create.updatedAt),
      };
      if (create.projectId !== undefined) data.projectId = create.projectId;
      batch.set(doc(entries), data);
    }
    return batch.commit();
  }

  createEntry(uid: string, entry: NewClosedEntry): Promise<void> {
    const data: { [field: string]: string | Timestamp } = {
      type: entry.type,
      start: Timestamp.fromMillis(entry.start),
      end: Timestamp.fromMillis(entry.end),
      createdAt: Timestamp.fromMillis(entry.createdAt),
      updatedAt: Timestamp.fromMillis(entry.updatedAt),
    };
    if (entry.projectId !== undefined) data.projectId = entry.projectId;
    if (entry.note !== undefined) data.note = entry.note;
    return setDoc(doc(this.entriesCollection(uid)), data);
  }

  updateEntry(uid: string, id: string, changes: EntryChanges): Promise<void> {
    const data: { [field: string]: string | Timestamp | FieldValue } = {
      updatedAt: Timestamp.fromMillis(changes.updatedAt),
    };
    if (changes.type !== undefined) data.type = changes.type;
    if (changes.start !== undefined) data.start = Timestamp.fromMillis(changes.start);
    if (changes.end !== undefined) data.end = Timestamp.fromMillis(changes.end);
    if (changes.projectId !== undefined) data.projectId = fieldChangeValue(changes.projectId);
    if (changes.note !== undefined) data.note = fieldChangeValue(changes.note);
    return updateDoc(doc(this.entriesCollection(uid), id), data);
  }

  deleteEntry(uid: string, id: string): Promise<void> {
    return deleteDoc(doc(this.entriesCollection(uid), id));
  }

  subscribeFirstEntryAfter(
    uid: string,
    after: number,
    onChange: (entry: Entry | null) => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    const nextQuery = query(
      this.entriesCollection(uid),
      where('start', '>', Timestamp.fromMillis(after)),
      orderBy('start', 'asc'),
      limit(1),
    );
    return this.subscribeQuery(nextQuery, (entries) => onChange(entries[0] ?? null), onError);
  }

  subscribeLastEntryBefore(
    uid: string,
    before: number,
    onChange: (entry: Entry | null) => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    const previousQuery = query(
      this.entriesCollection(uid),
      where('start', '<', Timestamp.fromMillis(before)),
      orderBy('start', 'desc'),
      limit(1),
    );
    return this.subscribeQuery(previousQuery, (entries) => onChange(entries[0] ?? null), onError);
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

  subscribeProjects(uid: string, onChange: (projects: Project[]) => void, onError: (error: Error) => void): Unsubscribe {
    return onSnapshot(this.projectsCollection(uid), (snapshot) => onChange(toProjects(snapshot)), onError);
  }

  createProject(uid: string, project: NewProject): Promise<void> {
    return setDoc(doc(this.projectsCollection(uid)), {
      name: project.name,
      color: project.color,
      archived: project.archived,
      createdAt: Timestamp.fromMillis(project.createdAt),
      updatedAt: Timestamp.fromMillis(project.updatedAt),
    });
  }

  updateProject(uid: string, id: string, changes: ProjectChanges): Promise<void> {
    const data: { [field: string]: string | boolean | Timestamp } = {
      updatedAt: Timestamp.fromMillis(changes.updatedAt),
    };
    if (changes.name !== undefined) data.name = changes.name;
    if (changes.color !== undefined) data.color = changes.color;
    if (changes.archived !== undefined) data.archived = changes.archived;
    return updateDoc(doc(this.projectsCollection(uid), id), data);
  }

  private entriesCollection(uid: string) {
    return collection(this.db, 'users', uid, 'entries');
  }

  private projectsCollection(uid: string) {
    return collection(this.db, 'users', uid, 'projects');
  }

  private preferencesDoc(uid: string) {
    return doc(this.db, 'users', uid, 'settings', 'preferences');
  }

  private subscribeQuery(
    target: Query,
    onChange: (entries: Entry[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    return onSnapshot(target, (snapshot) => onChange(toEntries(snapshot)), onError);
  }
}

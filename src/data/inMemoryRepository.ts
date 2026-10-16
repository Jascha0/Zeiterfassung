import type { Unsubscribe } from '../auth/authTypes';
import type { TransitionPlan } from '../domain/timer';
import type {
  Entry,
  EntryChanges,
  FieldChange,
  NewClosedEntry,
  NewEntry,
  NewProject,
  Project,
  ProjectChanges,
  TimeRange,
} from '../domain/types';
import type { EntryRepository, Preferences, ProjectRepository, SettingsRepository } from './repository';

interface EntrySubscription {
  kind: 'entries';
  uid: string;
  select: (entries: Entry[]) => Entry[];
  onChange: (entries: Entry[]) => void;
}

interface PreferencesSubscription {
  kind: 'preferences';
  uid: string;
  onChange: (prefs: Preferences | null) => void;
}

interface ProjectSubscription {
  kind: 'projects';
  uid: string;
  onChange: (projects: Project[]) => void;
}

type Subscription = EntrySubscription | PreferencesSubscription | ProjectSubscription;

function byStartAsc(a: Entry, b: Entry): number {
  if (a.start !== b.start) return a.start - b.start;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

function copyEntries(entries: Iterable<Entry>): Entry[] {
  return Array.from(entries, (entry) => ({ ...entry })).sort(byStartAsc);
}

function copyProjects(projects: Iterable<Project>): Project[] {
  return Array.from(projects, (project) => ({ ...project })).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function notFound(): Promise<never> {
  return Promise.reject(Object.assign(new Error('not-found'), { code: 'not-found' }));
}

function entryFromNew(id: string, create: NewEntry): Entry {
  const created: Entry = {
    id,
    type: create.type,
    start: create.start,
    end: create.end,
    createdAt: create.createdAt,
    updatedAt: create.updatedAt,
  };
  if (create.projectId !== undefined) created.projectId = create.projectId;
  return created;
}

function applyFieldChange(entry: Entry, field: 'projectId' | 'note', change: FieldChange<string> | undefined): void {
  if (change === undefined) return;
  if (change.kind === 'set') entry[field] = change.value;
  else delete entry[field];
}

export class InMemoryRepository implements EntryRepository, SettingsRepository, ProjectRepository {
  private readonly entries = new Map<string, Map<string, Entry>>();
  private readonly preferences = new Map<string, Preferences | null>();
  private readonly projects = new Map<string, Map<string, Project>>();
  private readonly subscriptions = new Set<Subscription>();
  private readonly pendingWrites: Array<() => void> = [];
  private nextId = 1;
  private nextWriteError: Error | null = null;
  private offline = false;

  seedEntries(uid: string, entries: Entry[]): void {
    this.entries.set(uid, new Map(entries.map((entry) => [entry.id, { ...entry }])));
    this.notifyEntries(uid);
  }

  getEntries(uid: string): Entry[] {
    return copyEntries(this.userEntries(uid).values());
  }

  seedPreferences(uid: string, prefs: Preferences | null): void {
    this.preferences.set(uid, prefs === null ? null : { ...prefs });
    this.notifyPreferences(uid);
  }

  seedProjects(uid: string, projects: Project[]): void {
    this.projects.set(uid, new Map(projects.map((project) => [project.id, { ...project }])));
    this.notifyProjects(uid);
  }

  getProjects(uid: string): Project[] {
    return copyProjects(this.userProjects(uid).values());
  }

  failNextWrite(error: Error): void {
    this.nextWriteError = error;
  }

  setOffline(offline: boolean): void {
    this.offline = offline;
    if (offline) return;
    const pending = this.pendingWrites.splice(0);
    for (const settle of pending) settle();
  }

  listenerCount(): number {
    return this.subscriptions.size;
  }

  subscribeEntriesInRange(
    uid: string,
    range: TimeRange,
    onChange: (entries: Entry[]) => void,
    _onError: (error: Error) => void,
  ): Unsubscribe {
    return this.subscribe({
      kind: 'entries',
      uid,
      select: (entries) => entries.filter((entry) => entry.start >= range.start && entry.start < range.end),
      onChange,
    });
  }

  subscribeOpenEntries(uid: string, onChange: (entries: Entry[]) => void, _onError: (error: Error) => void): Unsubscribe {
    return this.subscribe({
      kind: 'entries',
      uid,
      select: (entries) => entries.filter((entry) => entry.end === null),
      onChange,
    });
  }

  subscribePreferences(
    uid: string,
    onChange: (prefs: Preferences | null) => void,
    _onError: (error: Error) => void,
  ): Unsubscribe {
    return this.subscribe({ kind: 'preferences', uid, onChange });
  }

  applyTransition(uid: string, plan: TransitionPlan): Promise<void> {
    const userEntries = this.userEntries(uid);
    if (plan.close.some((close) => !userEntries.has(close.id))) return notFound();

    const previous = plan.close.map((close) => ({ ...(userEntries.get(close.id) as Entry) }));
    for (const close of plan.close) {
      const entry = userEntries.get(close.id) as Entry;
      userEntries.set(close.id, { ...entry, end: close.end, updatedAt: close.updatedAt });
    }
    let createdId: string | null = null;
    if (plan.create !== null) {
      createdId = `mem-${this.nextId++}`;
      userEntries.set(createdId, entryFromNew(createdId, plan.create));
    }
    this.entries.set(uid, userEntries);
    this.notifyEntries(uid);

    return this.settleWrite(() => {
      const current = this.userEntries(uid);
      if (createdId !== null) current.delete(createdId);
      for (const entry of previous) current.set(entry.id, entry);
      this.notifyEntries(uid);
    });
  }

  createEntry(uid: string, entry: NewClosedEntry): Promise<void> {
    const userEntries = this.userEntries(uid);
    const id = `mem-${this.nextId++}`;
    const created: Entry = {
      id,
      type: entry.type,
      start: entry.start,
      end: entry.end,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    };
    if (entry.projectId !== undefined) created.projectId = entry.projectId;
    if (entry.note !== undefined) created.note = entry.note;
    userEntries.set(id, created);
    this.notifyEntries(uid);
    return this.settleWrite(() => {
      this.userEntries(uid).delete(id);
      this.notifyEntries(uid);
    });
  }

  updateEntry(uid: string, id: string, changes: EntryChanges): Promise<void> {
    const userEntries = this.userEntries(uid);
    const previous = userEntries.get(id);
    if (previous === undefined) return notFound();
    const updated: Entry = { ...previous, updatedAt: changes.updatedAt };
    if (changes.type !== undefined) updated.type = changes.type;
    if (changes.start !== undefined) updated.start = changes.start;
    if (changes.end !== undefined) updated.end = changes.end;
    applyFieldChange(updated, 'projectId', changes.projectId);
    applyFieldChange(updated, 'note', changes.note);
    userEntries.set(id, updated);
    this.notifyEntries(uid);
    const snapshot = { ...previous };
    return this.settleWrite(() => {
      this.userEntries(uid).set(id, snapshot);
      this.notifyEntries(uid);
    });
  }

  deleteEntry(uid: string, id: string): Promise<void> {
    const userEntries = this.userEntries(uid);
    const previous = userEntries.get(id);
    if (previous === undefined) return this.settleWrite(() => {});
    const snapshot = { ...previous };
    userEntries.delete(id);
    this.notifyEntries(uid);
    return this.settleWrite(() => {
      this.userEntries(uid).set(id, snapshot);
      this.notifyEntries(uid);
    });
  }

  subscribeFirstEntryAfter(
    uid: string,
    after: number,
    onChange: (entry: Entry | null) => void,
    _onError: (error: Error) => void,
  ): Unsubscribe {
    return this.subscribe({
      kind: 'entries',
      uid,
      select: (entries) => entries.filter((entry) => entry.start > after).slice(0, 1),
      onChange: (entries) => onChange(entries[0] ?? null),
    });
  }

  subscribeLastEntryBefore(
    uid: string,
    before: number,
    onChange: (entry: Entry | null) => void,
    _onError: (error: Error) => void,
  ): Unsubscribe {
    return this.subscribe({
      kind: 'entries',
      uid,
      select: (entries) => entries.filter((entry) => entry.start < before).slice(-1),
      onChange: (entries) => onChange(entries[0] ?? null),
    });
  }

  subscribeProjects(uid: string, onChange: (projects: Project[]) => void, _onError: (error: Error) => void): Unsubscribe {
    return this.subscribe({ kind: 'projects', uid, onChange });
  }

  createProject(uid: string, project: NewProject): Promise<void> {
    const id = `mem-${this.nextId++}`;
    this.userProjects(uid).set(id, {
      id,
      name: project.name,
      color: project.color,
      archived: project.archived,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    });
    this.notifyProjects(uid);
    return this.settleWrite(() => {
      this.userProjects(uid).delete(id);
      this.notifyProjects(uid);
    });
  }

  updateProject(uid: string, id: string, changes: ProjectChanges): Promise<void> {
    const userProjects = this.userProjects(uid);
    const previous = userProjects.get(id);
    if (previous === undefined) return notFound();
    const updated: Project = { ...previous, updatedAt: changes.updatedAt };
    if (changes.name !== undefined) updated.name = changes.name;
    if (changes.color !== undefined) updated.color = changes.color;
    if (changes.archived !== undefined) updated.archived = changes.archived;
    userProjects.set(id, updated);
    this.notifyProjects(uid);
    const snapshot = { ...previous };
    return this.settleWrite(() => {
      this.userProjects(uid).set(id, snapshot);
      this.notifyProjects(uid);
    });
  }

  savePreferences(uid: string, prefs: Preferences): Promise<void> {
    const hadPrevious = this.preferences.has(uid);
    const previous = this.preferences.get(uid) ?? null;
    this.preferences.set(uid, { theme: prefs.theme });
    this.notifyPreferences(uid);

    return this.settleWrite(() => {
      if (hadPrevious) this.preferences.set(uid, previous);
      else this.preferences.delete(uid);
      this.notifyPreferences(uid);
    });
  }

  private settleWrite(rollback: () => void): Promise<void> {
    const error = this.nextWriteError;
    this.nextWriteError = null;
    return new Promise<void>((resolve, reject) => {
      const settle = () => {
        if (error === null) {
          resolve();
          return;
        }
        rollback();
        reject(error);
      };
      if (this.offline) this.pendingWrites.push(settle);
      else queueMicrotask(settle);
    });
  }

  private subscribe(subscription: Subscription): Unsubscribe {
    this.subscriptions.add(subscription);
    queueMicrotask(() => {
      if (this.subscriptions.has(subscription)) this.deliver(subscription);
    });
    return () => {
      this.subscriptions.delete(subscription);
    };
  }

  private deliver(subscription: Subscription): void {
    if (subscription.kind === 'entries') {
      subscription.onChange(subscription.select(this.getEntries(subscription.uid)));
    } else if (subscription.kind === 'projects') {
      subscription.onChange(this.getProjects(subscription.uid));
    } else {
      const prefs = this.preferences.get(subscription.uid) ?? null;
      subscription.onChange(prefs === null ? null : { ...prefs });
    }
  }

  private notifyEntries(uid: string): void {
    for (const subscription of [...this.subscriptions]) {
      if (subscription.kind === 'entries' && subscription.uid === uid && this.subscriptions.has(subscription)) {
        this.deliver(subscription);
      }
    }
  }

  private notifyPreferences(uid: string): void {
    for (const subscription of [...this.subscriptions]) {
      if (subscription.kind === 'preferences' && subscription.uid === uid && this.subscriptions.has(subscription)) {
        this.deliver(subscription);
      }
    }
  }

  private notifyProjects(uid: string): void {
    for (const subscription of [...this.subscriptions]) {
      if (subscription.kind === 'projects' && subscription.uid === uid && this.subscriptions.has(subscription)) {
        this.deliver(subscription);
      }
    }
  }

  private userProjects(uid: string): Map<string, Project> {
    let userProjects = this.projects.get(uid);
    if (userProjects === undefined) {
      userProjects = new Map();
      this.projects.set(uid, userProjects);
    }
    return userProjects;
  }

  private userEntries(uid: string): Map<string, Entry> {
    let userEntries = this.entries.get(uid);
    if (userEntries === undefined) {
      userEntries = new Map();
      this.entries.set(uid, userEntries);
    }
    return userEntries;
  }
}

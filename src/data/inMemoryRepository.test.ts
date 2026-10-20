import { describe, expect, it, vi } from 'vitest';
import { InMemoryRepository } from './inMemoryRepository';
import type { Entry, NewClosedEntry, NewProject, Project } from '../domain/types';
import type { TransitionPlan } from '../domain/timer';

function entry(overrides: Partial<Entry> & { id: string }): Entry {
  return {
    type: 'work',
    start: 0,
    end: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => queueMicrotask(resolve));
}

describe('InMemoryRepository: seeding / snapshot', () => {
  it('getEntries returns a snapshot copy sorted by start asc', () => {
    const repo = new InMemoryRepository();
    repo.seedEntries('u1', [entry({ id: 'b', start: 200 }), entry({ id: 'a', start: 100 })]);
    expect(repo.getEntries('u1').map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('getEntries returns copies, not references to internal state', () => {
    const repo = new InMemoryRepository();
    repo.seedEntries('u1', [entry({ id: 'a', start: 100 })]);
    const snapshot = repo.getEntries('u1');
    snapshot[0].start = 9999;
    expect(repo.getEntries('u1')[0].start).toBe(100);
  });

  it('seedEntries replaces all entries of a user and notifies subscribers', async () => {
    const repo = new InMemoryRepository();
    const onChange = vi.fn();
    repo.subscribeOpenEntries('u1', onChange, vi.fn());
    await flushMicrotasks();
    onChange.mockClear();

    repo.seedEntries('u1', [entry({ id: 'a' })]);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toHaveLength(1);
  });

  it('seedPreferences(uid, null) clears preferences and notifies', async () => {
    const repo = new InMemoryRepository();
    repo.seedPreferences('u1', { theme: 'dark' });
    const onChange = vi.fn();
    repo.subscribePreferences('u1', onChange, vi.fn());
    await flushMicrotasks();
    expect(onChange).toHaveBeenLastCalledWith({ theme: 'dark' });

    repo.seedPreferences('u1', null);
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});

describe('InMemoryRepository: subscriptions', () => {
  it('delivers the initial snapshot asynchronously via microtask (not synchronously)', () => {
    const repo = new InMemoryRepository();
    repo.seedEntries('u1', [entry({ id: 'a', start: 100 })]);
    const onChange = vi.fn();
    repo.subscribeOpenEntries('u1', onChange, vi.fn());
    expect(onChange).not.toHaveBeenCalled();
  });

  it('subscribeEntriesInRange filters by start range [start, end)', async () => {
    const repo = new InMemoryRepository();
    repo.seedEntries('u1', [
      entry({ id: 'a', start: 100 }),
      entry({ id: 'b', start: 200 }),
      entry({ id: 'c', start: 300 }),
    ]);
    const onChange = vi.fn();
    repo.subscribeEntriesInRange('u1', { start: 100, end: 300 }, onChange, vi.fn());
    await flushMicrotasks();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].map((e: Entry) => e.id)).toEqual(['a', 'b']);
  });

  it('subscribeOpenEntries only returns entries with end === null', async () => {
    const repo = new InMemoryRepository();
    repo.seedEntries('u1', [entry({ id: 'a', end: null }), entry({ id: 'b', end: 500 })]);
    const onChange = vi.fn();
    repo.subscribeOpenEntries('u1', onChange, vi.fn());
    await flushMicrotasks();
    expect(onChange.mock.calls[0][0].map((e: Entry) => e.id)).toEqual(['a']);
  });

  it('listenerCount reflects active subscriptions and unsubscribe removes them', async () => {
    const repo = new InMemoryRepository();
    expect(repo.listenerCount()).toBe(0);
    const unsubA = repo.subscribeOpenEntries('u1', vi.fn(), vi.fn());
    const unsubB = repo.subscribePreferences('u1', vi.fn(), vi.fn());
    expect(repo.listenerCount()).toBe(2);
    unsubA();
    expect(repo.listenerCount()).toBe(1);
    unsubB();
    expect(repo.listenerCount()).toBe(0);
  });

  it('unsubscribe is idempotent', () => {
    const repo = new InMemoryRepository();
    const unsub = repo.subscribeOpenEntries('u1', vi.fn(), vi.fn());
    unsub();
    expect(() => unsub()).not.toThrow();
    expect(repo.listenerCount()).toBe(0);
  });

  it('a late-delivered initial snapshot is skipped if unsubscribed before the microtask runs', async () => {
    const repo = new InMemoryRepository();
    const onChange = vi.fn();
    const unsub = repo.subscribeOpenEntries('u1', onChange, vi.fn());
    unsub();
    await flushMicrotasks();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('InMemoryRepository: applyTransition', () => {
  it('creates entries with ids mem-1, mem-2, ... per instance', async () => {
    const repo = new InMemoryRepository();
    const plan1: TransitionPlan = { close: [], create: { type: 'work', start: 100, end: null, createdAt: 100, updatedAt: 100 } };
    await repo.applyTransition('u1', plan1);
    const plan2: TransitionPlan = { close: [], create: { type: 'work', start: 200, end: null, createdAt: 200, updatedAt: 200 } };
    await repo.applyTransition('u1', plan2);
    expect(repo.getEntries('u1').map((e) => e.id)).toEqual(['mem-1', 'mem-2']);
  });

  it('applies close + create atomically and notifies listeners synchronously with fresh object identities', async () => {
    const repo = new InMemoryRepository();
    repo.seedEntries('u1', [entry({ id: 'w1', type: 'work', start: 1000 })]);
    const onChange = vi.fn();
    repo.subscribeOpenEntries('u1', onChange, vi.fn());
    await flushMicrotasks();
    const firstCallArray = onChange.mock.calls[0][0];
    onChange.mockClear();

    const plan: TransitionPlan = {
      close: [{ id: 'w1', end: 2000, updatedAt: 2000 }],
      create: { type: 'break', start: 2000, end: null, createdAt: 2000, updatedAt: 2000 },
    };
    const promise = repo.applyTransition('u1', plan);
    // Synchronous notification, before the promise settles.
    expect(onChange).toHaveBeenCalledTimes(1);
    const secondCallArray = onChange.mock.calls[0][0];
    expect(secondCallArray).not.toBe(firstCallArray);
    expect(secondCallArray.map((e: Entry) => e.type)).toEqual(['break']);
    await promise;
  });

  it('resolves once the write settles (online, default)', async () => {
    const repo = new InMemoryRepository();
    const plan: TransitionPlan = { close: [], create: { type: 'work', start: 100, end: null, createdAt: 100, updatedAt: 100 } };
    await expect(repo.applyTransition('u1', plan)).resolves.toBeUndefined();
  });

  it('closing a non-existent id rejects with a not-found error and applies nothing (atomic)', async () => {
    const repo = new InMemoryRepository();
    repo.seedEntries('u1', [entry({ id: 'w1', start: 100 })]);
    const plan: TransitionPlan = {
      close: [{ id: 'does-not-exist', end: 200, updatedAt: 200 }],
      create: { type: 'break', start: 200, end: null, createdAt: 200, updatedAt: 200 },
    };
    await expect(repo.applyTransition('u1', plan)).rejects.toMatchObject({ code: 'not-found' });
    // Nothing applied: original entry untouched, nothing created.
    expect(repo.getEntries('u1')).toEqual([entry({ id: 'w1', start: 100 })]);
  });

  it('empty plan resolves without creating or closing anything', async () => {
    const repo = new InMemoryRepository();
    await expect(repo.applyTransition('u1', { close: [], create: null })).resolves.toBeUndefined();
    expect(repo.getEntries('u1')).toEqual([]);
  });
});

describe('InMemoryRepository: failNextWrite', () => {
  it('rolls back the local change, notifies, then rejects with the given error', async () => {
    const repo = new InMemoryRepository();
    repo.seedEntries('u1', [entry({ id: 'w1', type: 'work', start: 1000 })]);
    const onChange = vi.fn();
    repo.subscribeOpenEntries('u1', onChange, vi.fn());
    await flushMicrotasks();
    onChange.mockClear();

    const error = Object.assign(new Error('denied'), { code: 'permission-denied' });
    repo.failNextWrite(error);
    const plan: TransitionPlan = {
      close: [{ id: 'w1', end: 2000, updatedAt: 2000 }],
      create: { type: 'break', start: 2000, end: null, createdAt: 2000, updatedAt: 2000 },
    };
    await expect(repo.applyTransition('u1', plan)).rejects.toBe(error);

    // Rolled back to the original open work entry.
    expect(repo.getEntries('u1')).toEqual([entry({ id: 'w1', type: 'work', start: 1000 })]);
    // Notified at least twice: once for the optimistic update, once for the rollback.
    expect(onChange.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(onChange.mock.calls.at(-1)?.[0].map((e: Entry) => e.id)).toEqual(['w1']);
  });

  it('only fails the next write, not subsequent ones', async () => {
    const repo = new InMemoryRepository();
    const error = new Error('once');
    repo.failNextWrite(error);
    const plan1: TransitionPlan = { close: [], create: { type: 'work', start: 100, end: null, createdAt: 100, updatedAt: 100 } };
    await expect(repo.applyTransition('u1', plan1)).rejects.toBe(error);

    const plan2: TransitionPlan = { close: [], create: { type: 'work', start: 200, end: null, createdAt: 200, updatedAt: 200 } };
    await expect(repo.applyTransition('u1', plan2)).resolves.toBeUndefined();
  });
});

describe('InMemoryRepository: setOffline', () => {
  it('write promises stay pending while offline, local state updates immediately', async () => {
    const repo = new InMemoryRepository();
    repo.setOffline(true);
    const onChange = vi.fn();
    repo.subscribeOpenEntries('u1', onChange, vi.fn());
    await flushMicrotasks();
    onChange.mockClear();

    const plan: TransitionPlan = { close: [], create: { type: 'work', start: 100, end: null, createdAt: 100, updatedAt: 100 } };
    const promise = repo.applyTransition('u1', plan);
    expect(onChange).toHaveBeenCalledTimes(1); // local update happened
    expect(onChange.mock.calls[0][0]).toHaveLength(1);

    let settled = false;
    promise.then(() => (settled = true));
    await flushMicrotasks();
    await flushMicrotasks();
    expect(settled).toBe(false);

    repo.setOffline(false);
    await promise;
    expect(settled).toBe(true);
  });

  it('a failure armed while offline settles (rolls back and rejects) only once setOffline(false) is called', async () => {
    const repo = new InMemoryRepository();
    repo.setOffline(true);
    const error = new Error('offline-fail');
    repo.failNextWrite(error);
    const plan: TransitionPlan = { close: [], create: { type: 'work', start: 100, end: null, createdAt: 100, updatedAt: 100 } };
    const promise = repo.applyTransition('u1', plan);
    expect(repo.getEntries('u1')).toHaveLength(1); // optimistic local apply

    let rejected: unknown = null;
    promise.catch((e) => (rejected = e));
    await flushMicrotasks();
    expect(rejected).toBeNull();

    repo.setOffline(false);
    await flushMicrotasks();
    expect(rejected).toBe(error);
    expect(repo.getEntries('u1')).toHaveLength(0); // rolled back
  });

  it('setOffline(false) with no pending writes is a no-op', () => {
    const repo = new InMemoryRepository();
    expect(() => repo.setOffline(false)).not.toThrow();
  });
});

describe('InMemoryRepository: savePreferences', () => {
  it('sets preferences and notifies, resolving on settle', async () => {
    const repo = new InMemoryRepository();
    const onChange = vi.fn();
    repo.subscribePreferences('u1', onChange, vi.fn());
    await flushMicrotasks();
    onChange.mockClear();

    await expect(repo.savePreferences('u1', { theme: 'dark' })).resolves.toBeUndefined();
    expect(onChange).toHaveBeenCalledWith({ theme: 'dark' });
  });

  it('rolls back preferences to the previous value on failNextWrite', async () => {
    const repo = new InMemoryRepository();
    repo.seedPreferences('u1', { theme: 'light' });
    const error = new Error('fail');
    repo.failNextWrite(error);
    await expect(repo.savePreferences('u1', { theme: 'dark' })).rejects.toBe(error);

    const onChange = vi.fn();
    repo.subscribePreferences('u1', onChange, vi.fn());
    await flushMicrotasks();
    expect(onChange).toHaveBeenCalledWith({ theme: 'light' });
  });
});

describe('InMemoryRepository: single-entry writes', () => {
  const closed: NewClosedEntry = { type: 'work', start: 100, end: 200, createdAt: 1, updatedAt: 1 };

  it('createEntry adds an entry with id mem-1, notifies a range subscriber synchronously and resolves', async () => {
    const repo = new InMemoryRepository();
    const onChange = vi.fn();
    repo.subscribeEntriesInRange('u1', { start: 0, end: 1000 }, onChange, vi.fn());
    await flushMicrotasks();
    onChange.mockClear();

    const promise = repo.createEntry('u1', closed);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toEqual([{ id: 'mem-1', ...closed }]);
    await expect(promise).resolves.toBeUndefined();
    expect(repo.getEntries('u1')).toEqual([{ id: 'mem-1', ...closed }]);
  });

  it('updateEntry changes only end and updatedAt', async () => {
    const repo = new InMemoryRepository();
    repo.seedEntries('u1', [entry({ id: 'a', type: 'break', start: 100, end: 300, createdAt: 5, updatedAt: 5 })]);
    await expect(repo.updateEntry('u1', 'a', { end: 500, updatedAt: 9 })).resolves.toBeUndefined();
    expect(repo.getEntries('u1')).toEqual([
      entry({ id: 'a', type: 'break', start: 100, end: 500, createdAt: 5, updatedAt: 9 }),
    ]);
  });

  it('updateEntry on a missing id rejects with not-found and changes nothing', async () => {
    const repo = new InMemoryRepository();
    repo.seedEntries('u1', [entry({ id: 'a', start: 100, end: 300 })]);
    const onChange = vi.fn();
    repo.subscribeEntriesInRange('u1', { start: 0, end: 1000 }, onChange, vi.fn());
    await flushMicrotasks();
    onChange.mockClear();

    await expect(repo.updateEntry('u1', 'missing', { end: 500, updatedAt: 9 })).rejects.toMatchObject({
      code: 'not-found',
    });
    expect(repo.getEntries('u1')).toEqual([entry({ id: 'a', start: 100, end: 300 })]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('deleteEntry removes and notifies', async () => {
    const repo = new InMemoryRepository();
    repo.seedEntries('u1', [entry({ id: 'a', start: 100, end: 300 }), entry({ id: 'b', start: 400, end: 500 })]);
    const onChange = vi.fn();
    repo.subscribeEntriesInRange('u1', { start: 0, end: 1000 }, onChange, vi.fn());
    await flushMicrotasks();
    onChange.mockClear();

    const promise = repo.deleteEntry('u1', 'a');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].map((e: Entry) => e.id)).toEqual(['b']);
    await expect(promise).resolves.toBeUndefined();
  });

  it('deleteEntry of a missing id resolves', async () => {
    const repo = new InMemoryRepository();
    repo.seedEntries('u1', [entry({ id: 'a', start: 100, end: 300 })]);
    await expect(repo.deleteEntry('u1', 'missing')).resolves.toBeUndefined();
    expect(repo.getEntries('u1')).toEqual([entry({ id: 'a', start: 100, end: 300 })]);
  });

  it('offline: each write is visible immediately, stays pending and resolves after setOffline(false)', async () => {
    const repo = new InMemoryRepository();
    repo.seedEntries('u1', [entry({ id: 'a', start: 100, end: 300 }), entry({ id: 'b', start: 400, end: 500 })]);
    repo.setOffline(true);

    const created = repo.createEntry('u1', { ...closed, start: 600, end: 700 });
    expect(repo.getEntries('u1').map((e) => e.id)).toEqual(['a', 'b', 'mem-1']);
    const updated = repo.updateEntry('u1', 'a', { start: 150, updatedAt: 9 });
    expect(repo.getEntries('u1')[0].start).toBe(150);
    const deleted = repo.deleteEntry('u1', 'b');
    expect(repo.getEntries('u1').map((e) => e.id)).toEqual(['a', 'mem-1']);

    const settled: string[] = [];
    void created.then(() => settled.push('create'));
    void updated.then(() => settled.push('update'));
    void deleted.then(() => settled.push('delete'));
    await flushMicrotasks();
    await flushMicrotasks();
    expect(settled).toEqual([]);

    repo.setOffline(false);
    await Promise.all([created, updated, deleted]);
    expect(settled).toEqual(['create', 'update', 'delete']);
  });

  it('failNextWrite then createEntry rolls back, notifies and rejects with the error', async () => {
    const repo = new InMemoryRepository();
    repo.seedEntries('u1', [entry({ id: 'a', start: 100, end: 300 })]);
    const onChange = vi.fn();
    repo.subscribeEntriesInRange('u1', { start: 0, end: 1000 }, onChange, vi.fn());
    await flushMicrotasks();
    onChange.mockClear();

    const error = new Error('denied');
    repo.failNextWrite(error);
    await expect(repo.createEntry('u1', { ...closed, start: 400, end: 500 })).rejects.toBe(error);
    expect(repo.getEntries('u1')).toEqual([entry({ id: 'a', start: 100, end: 300 })]);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls.at(-1)?.[0].map((e: Entry) => e.id)).toEqual(['a']);
  });

  it('failNextWrite then updateEntry rolls back to the previous value, notifies and rejects', async () => {
    const repo = new InMemoryRepository();
    const original = entry({ id: 'a', type: 'work', start: 100, end: 300, createdAt: 5, updatedAt: 5 });
    repo.seedEntries('u1', [original]);
    const onChange = vi.fn();
    repo.subscribeEntriesInRange('u1', { start: 0, end: 1000 }, onChange, vi.fn());
    await flushMicrotasks();
    onChange.mockClear();

    const error = new Error('denied');
    repo.failNextWrite(error);
    await expect(repo.updateEntry('u1', 'a', { type: 'break', start: 150, end: 400, updatedAt: 9 })).rejects.toBe(error);
    expect(repo.getEntries('u1')).toEqual([original]);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual([original]);
  });

  it('failNextWrite then deleteEntry restores the entry, notifies and rejects', async () => {
    const repo = new InMemoryRepository();
    const original = entry({ id: 'a', start: 100, end: 300 });
    repo.seedEntries('u1', [original]);
    const onChange = vi.fn();
    repo.subscribeEntriesInRange('u1', { start: 0, end: 1000 }, onChange, vi.fn());
    await flushMicrotasks();
    onChange.mockClear();

    const error = new Error('denied');
    repo.failNextWrite(error);
    await expect(repo.deleteEntry('u1', 'a')).rejects.toBe(error);
    expect(repo.getEntries('u1')).toEqual([original]);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls[0][0]).toEqual([]);
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual([original]);
  });

  it('subscribeFirstEntryAfter delivers the earliest entry strictly after t, null if none, and re-fires on change', async () => {
    const repo = new InMemoryRepository();
    repo.seedEntries('u1', [
      entry({ id: 'x', start: 100, end: 150 }),
      entry({ id: 'z', start: 300, end: 350 }),
      entry({ id: 'y', start: 200, end: 250 }),
    ]);
    const cb = vi.fn();
    repo.subscribeFirstEntryAfter('u1', 100, cb, () => {});
    await flushMicrotasks();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0]).toEqual(entry({ id: 'y', start: 200, end: 250 }));

    await repo.createEntry('u1', { ...closed, start: 120, end: 130 });
    expect(cb.mock.calls.at(-1)?.[0]).toEqual({ id: 'mem-1', ...closed, start: 120, end: 130 });

    const none = vi.fn();
    repo.subscribeFirstEntryAfter('u1', 300, none, () => {});
    await flushMicrotasks();
    expect(none).toHaveBeenCalledWith(null);
  });

  it('subscribeFirstEntryAfter breaks a tied start by the smallest id', async () => {
    const repo = new InMemoryRepository();
    repo.seedEntries('u1', [
      entry({ id: 'z', start: 200 }),
      entry({ id: 'a', start: 200 }),
      entry({ id: 'm', start: 200 }),
    ]);
    const cb = vi.fn();
    repo.subscribeFirstEntryAfter('u1', 100, cb, () => {});
    await flushMicrotasks();
    expect(cb.mock.calls[0]?.[0]?.id).toBe('a');
  });
});

describe('InMemoryRepository: entry project and note fields', () => {
  it('updateEntry removes note and sets projectId', async () => {
    const repo = new InMemoryRepository();
    repo.seedEntries('u1', [entry({ id: 'a', start: 100, end: 200, projectId: 'p1', note: 'n' })]);
    await repo.updateEntry('u1', 'a', { projectId: { kind: 'set', value: 'p2' }, note: { kind: 'remove' }, updatedAt: 9 });
    const stored = repo.getEntries('u1')[0];
    expect(stored.projectId).toBe('p2');
    expect('note' in stored).toBe(false);
  });
});

describe('InMemoryRepository: entry project and note writes', () => {
  it('rollback of a remove restores the field', async () => {
    const repo = new InMemoryRepository();
    const original = entry({ id: 'a', start: 100, end: 200, projectId: 'p1', note: 'n' });
    repo.seedEntries('u1', [original]);
    const error = new Error('denied');
    repo.failNextWrite(error);
    const promise = repo.updateEntry('u1', 'a', { projectId: { kind: 'remove' }, note: { kind: 'remove' }, updatedAt: 9 });
    const optimistic = repo.getEntries('u1')[0];
    expect('projectId' in optimistic).toBe(false);
    expect('note' in optimistic).toBe(false);
    await expect(promise).rejects.toBe(error);
    expect(repo.getEntries('u1')).toEqual([original]);
  });

  it('applyTransition stores create.projectId when given', async () => {
    const repo = new InMemoryRepository();
    const plan: TransitionPlan = {
      close: [],
      create: { type: 'work', start: 100, end: null, projectId: 'p1', createdAt: 100, updatedAt: 100 },
    };
    await repo.applyTransition('u1', plan);
    expect(repo.getEntries('u1')[0].projectId).toBe('p1');
  });

  it('applyTransition without create.projectId stores no projectId key', async () => {
    const repo = new InMemoryRepository();
    const plan: TransitionPlan = { close: [], create: { type: 'work', start: 100, end: null, createdAt: 100, updatedAt: 100 } };
    await repo.applyTransition('u1', plan);
    expect('projectId' in repo.getEntries('u1')[0]).toBe(false);
  });

  it('createEntry stores projectId and note when given, and no keys otherwise', async () => {
    const repo = new InMemoryRepository();
    const base: NewClosedEntry = { type: 'work', start: 100, end: 200, createdAt: 1, updatedAt: 1 };
    await repo.createEntry('u1', { ...base, projectId: 'p1', note: 'n' });
    await repo.createEntry('u1', { ...base, start: 300, end: 400 });
    const [withLabels, without] = repo.getEntries('u1');
    expect(withLabels.projectId).toBe('p1');
    expect(withLabels.note).toBe('n');
    expect('projectId' in without).toBe(false);
    expect('note' in without).toBe(false);
  });
});

function project(overrides: Partial<Project> & { id: string }): Project {
  return { name: overrides.id, color: 'blue', archived: false, createdAt: 0, updatedAt: 0, ...overrides };
}

const newProject: NewProject = { name: 'Kunde A', color: 'green', archived: false, createdAt: 5, updatedAt: 5 };

describe('InMemoryRepository: projects', () => {
  it('seedProjects replaces the projects of a user and notifies subscribers', async () => {
    const repo = new InMemoryRepository();
    const onChange = vi.fn();
    repo.subscribeProjects('u1', onChange, vi.fn());
    await flushMicrotasks();
    expect(onChange).toHaveBeenLastCalledWith([]);
    repo.seedProjects('u1', [project({ id: 'p2' }), project({ id: 'p1' })]);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(repo.getProjects('u1').map((p) => p.id)).toEqual(['p1', 'p2']);
    repo.seedProjects('u1', [project({ id: 'p3' })]);
    expect(repo.getProjects('u1').map((p) => p.id)).toEqual(['p3']);
  });

  it('getProjects and delivered lists are copies', async () => {
    const repo = new InMemoryRepository();
    repo.seedProjects('u1', [project({ id: 'p1', name: 'A' })]);
    repo.getProjects('u1')[0].name = 'X';
    const onChange = vi.fn();
    repo.subscribeProjects('u1', onChange, vi.fn());
    await flushMicrotasks();
    (onChange.mock.calls[0][0] as Project[])[0].name = 'Y';
    expect(repo.getProjects('u1')[0].name).toBe('A');
  });

  it('createProject stores explicit fields with a generated id and notifies immediately', async () => {
    const repo = new InMemoryRepository();
    const onChange = vi.fn();
    repo.subscribeProjects('u1', onChange, vi.fn());
    await flushMicrotasks();
    onChange.mockClear();
    const promise = repo.createProject('u1', { ...newProject, extra: 'x' } as NewProject);
    expect(onChange).toHaveBeenCalledTimes(1);
    const [created] = repo.getProjects('u1');
    expect(created).toEqual({ id: created.id, name: 'Kunde A', color: 'green', archived: false, createdAt: 5, updatedAt: 5 });
    expect(created.id).toMatch(/^mem-/);
    await expect(promise).resolves.toBeUndefined();
  });

  it('project subscriptions are per user', async () => {
    const repo = new InMemoryRepository();
    const onChange = vi.fn();
    repo.subscribeProjects('u2', onChange, vi.fn());
    await flushMicrotasks();
    onChange.mockClear();
    await repo.createProject('u1', newProject);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('updateProject applies only defined fields plus updatedAt and notifies immediately', async () => {
    const repo = new InMemoryRepository();
    repo.seedProjects('u1', [project({ id: 'p1', name: 'A', color: 'blue', archived: false, createdAt: 1, updatedAt: 1 })]);
    const onChange = vi.fn();
    repo.subscribeProjects('u1', onChange, vi.fn());
    await flushMicrotasks();
    onChange.mockClear();
    const promise = repo.updateProject('u1', 'p1', { archived: true, updatedAt: 7 });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(repo.getProjects('u1')).toEqual([
      { id: 'p1', name: 'A', color: 'blue', archived: true, createdAt: 1, updatedAt: 7 },
    ]);
    await promise;
    await repo.updateProject('u1', 'p1', { name: 'B', color: 'red', updatedAt: 8 });
    expect(repo.getProjects('u1')[0]).toEqual({ id: 'p1', name: 'B', color: 'red', archived: true, createdAt: 1, updatedAt: 8 });
  });

  it('updateProject rejects with code not-found for a missing project', async () => {
    const repo = new InMemoryRepository();
    await expect(repo.updateProject('u1', 'nope', { name: 'X', updatedAt: 1 })).rejects.toMatchObject({ code: 'not-found' });
    expect(repo.getProjects('u1')).toEqual([]);
  });

  it('failNextWrite rejects and rolls back createProject', async () => {
    const repo = new InMemoryRepository();
    const onChange = vi.fn();
    repo.subscribeProjects('u1', onChange, vi.fn());
    await flushMicrotasks();
    const error = new Error('denied');
    repo.failNextWrite(error);
    await expect(repo.createProject('u1', newProject)).rejects.toBe(error);
    expect(repo.getProjects('u1')).toEqual([]);
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('failNextWrite rejects and rolls back updateProject', async () => {
    const repo = new InMemoryRepository();
    const original = project({ id: 'p1', name: 'A', createdAt: 1, updatedAt: 1 });
    repo.seedProjects('u1', [original]);
    const error = new Error('denied');
    repo.failNextWrite(error);
    const promise = repo.updateProject('u1', 'p1', { name: 'B', archived: true, updatedAt: 9 });
    expect(repo.getProjects('u1')[0].name).toBe('B');
    await expect(promise).rejects.toBe(error);
    expect(repo.getProjects('u1')).toEqual([original]);
  });

  it('offline project writes stay pending and resolve on setOffline(false)', async () => {
    const repo = new InMemoryRepository();
    repo.setOffline(true);
    let settled = 0;
    const created = repo.createProject('u1', newProject).then(() => settled++);
    const id = repo.getProjects('u1')[0].id;
    const updated = repo.updateProject('u1', id, { name: 'Kunde B', updatedAt: 6 }).then(() => settled++);
    expect(repo.getProjects('u1')[0].name).toBe('Kunde B');
    await flushMicrotasks();
    await flushMicrotasks();
    expect(settled).toBe(0);
    repo.setOffline(false);
    await Promise.all([created, updated]);
    expect(settled).toBe(2);
  });

  it('listenerCount includes project subscriptions and drops on unsubscribe', () => {
    const repo = new InMemoryRepository();
    const unsubscribe = repo.subscribeProjects('u1', vi.fn(), vi.fn());
    expect(repo.listenerCount()).toBe(1);
    unsubscribe();
    expect(repo.listenerCount()).toBe(0);
  });

  it('an unsubscribed project listener is not called', async () => {
    const repo = new InMemoryRepository();
    const onChange = vi.fn();
    const unsubscribe = repo.subscribeProjects('u1', onChange, vi.fn());
    unsubscribe();
    await flushMicrotasks();
    repo.seedProjects('u1', [project({ id: 'p1' })]);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('InMemoryRepository: subscribeLastEntryBefore', () => {
  it('delivers the entry with the greatest start strictly before, ties by greatest id', async () => {
    const repo = new InMemoryRepository();
    repo.seedEntries('u1', [
      entry({ id: 'a', start: 100, end: 200 }),
      entry({ id: 'c', start: 300, end: 400 }),
      entry({ id: 'b', start: 300, end: 400 }),
      entry({ id: 'd', start: 500, end: null, type: 'break' }),
    ]);
    const onChange = vi.fn();
    repo.subscribeLastEntryBefore('u1', 500, onChange, vi.fn());
    await flushMicrotasks();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].id).toBe('c');
  });

  it('delivers null when no entry starts before', async () => {
    const repo = new InMemoryRepository();
    repo.seedEntries('u1', [entry({ id: 'a', start: 500 })]);
    const onChange = vi.fn();
    repo.subscribeLastEntryBefore('u1', 500, onChange, vi.fn());
    await flushMicrotasks();
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('updates when a new entry is created before the bound', async () => {
    const repo = new InMemoryRepository();
    const onChange = vi.fn();
    repo.subscribeLastEntryBefore('u1', 1000, onChange, vi.fn());
    await flushMicrotasks();
    expect(onChange).toHaveBeenLastCalledWith(null);
    await repo.createEntry('u1', { type: 'work', start: 100, end: 200, projectId: 'p1', createdAt: 1, updatedAt: 1 });
    expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({ start: 100, projectId: 'p1' });
  });
});

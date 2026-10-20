import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ServicesProvider, type Services } from '../app/ServicesContext';
import type { Unsubscribe } from '../auth/authTypes';
import { InMemoryRepository } from '../data/inMemoryRepository';
import type { Entry, TimeRange } from '../domain/types';
import { FakeAuthService } from '../test/fakeAuthService';
import { useEntriesInRange } from './useEntriesInRange';
import { useFirstEntryAfter } from './useFirstEntryAfter';
import { useOpenEntries } from './useOpenEntries';

function entry(id: string, start: number, end: number | null = start + 50): Entry {
  return { id, type: 'work', start, end, createdAt: start, updatedAt: start };
}

function wrapperFor(repo: InMemoryRepository) {
  const services: Services = { auth: new FakeAuthService(), entries: repo, settings: repo };
  return function Wrapper(props: { children: React.ReactNode }): React.JSX.Element {
    return <ServicesProvider services={services}>{props.children}</ServicesProvider>;
  };
}

class FailingRepository extends InMemoryRepository {
  override subscribeEntriesInRange(
    _uid: string,
    _range: TimeRange,
    _onChange: (entries: Entry[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    queueMicrotask(() => onError(new Error('permission-denied')));
    return () => {};
  }
}

describe('useEntriesInRange', () => {
  it('delivers entries of the range and re-subscribes with one listener when the range changes', async () => {
    const repo = new InMemoryRepository();
    repo.seedEntries('u1', [entry('a', 100), entry('b', 2000)]);
    const { result, rerender } = renderHook(
      ({ range }: { range: TimeRange | null }) => useEntriesInRange('u1', range),
      { wrapper: wrapperFor(repo), initialProps: { range: { start: 0, end: 1000 } as TimeRange | null } },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entries.map((e) => e.start)).toEqual([100]);

    rerender({ range: { start: 1500, end: 3000 } });
    expect(result.current.entries.map((e) => e.start)).not.toEqual([100]);
    await waitFor(() => expect(result.current.entries.map((e) => e.start)).toEqual([2000]));
    expect(repo.listenerCount()).toBe(1);

    rerender({ range: null });
    expect(result.current).toEqual({ loading: false, error: null, entries: [] });
    expect(repo.listenerCount()).toBe(0);
  });

  it('reports a load error', async () => {
    const repo = new FailingRepository();
    const { result } = renderHook(() => useEntriesInRange('u1', { start: 0, end: 1000 }), {
      wrapper: wrapperFor(repo),
    });
    await waitFor(() => expect(result.current.error).toBe('Daten konnten nicht geladen werden.'));
  });
});

describe('useFirstEntryAfter', () => {
  it('returns the earliest entry starting after the instant', async () => {
    const repo = new InMemoryRepository();
    repo.seedEntries('u1', [entry('a', 100), entry('c', 300), entry('b', 200)]);
    const { result } = renderHook(() => useFirstEntryAfter('u1', 100), { wrapper: wrapperFor(repo) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entry?.start).toBe(200);
  });

  it('does not subscribe when after is null', () => {
    const repo = new InMemoryRepository();
    const { result } = renderHook(() => useFirstEntryAfter('u1', null), { wrapper: wrapperFor(repo) });
    expect(result.current).toEqual({ loading: false, error: null, entry: null });
    expect(repo.listenerCount()).toBe(0);
  });
});

describe('useOpenEntries', () => {
  it('returns only open entries', async () => {
    const repo = new InMemoryRepository();
    repo.seedEntries('u1', [entry('a', 100), entry('b', 200, null)]);
    const { result } = renderHook(() => useOpenEntries('u1'), { wrapper: wrapperFor(repo) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entries.map((e) => e.id)).toEqual(['b']);
  });
});

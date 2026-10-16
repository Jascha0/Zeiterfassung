import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ServicesProvider, type Services } from '../app/ServicesContext';
import type { Unsubscribe } from '../auth/authTypes';
import { InMemoryRepository } from '../data/inMemoryRepository';
import type { Entry } from '../domain/types';
import { FakeAuthService } from '../test/fakeAuthService';
import { useLastEntryBefore } from './useLastEntryBefore';

function entry(id: string, start: number, end: number | null = start + 50): Entry {
  return { id, type: 'work', start, end, createdAt: start, updatedAt: start };
}

function wrapperFor(repo: InMemoryRepository) {
  const services: Services = { auth: new FakeAuthService(), entries: repo, settings: repo, projects: repo };
  return function Wrapper(props: { children: React.ReactNode }): React.JSX.Element {
    return <ServicesProvider services={services}>{props.children}</ServicesProvider>;
  };
}

class FailingLastEntryRepository extends InMemoryRepository {
  override subscribeLastEntryBefore(
    _uid: string,
    _before: number,
    _onChange: (entry: Entry | null) => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    queueMicrotask(() => onError(new Error('permission-denied')));
    return () => {};
  }
}

describe('useLastEntryBefore', () => {
  it('returns the latest entry starting strictly before the instant', async () => {
    const repo = new InMemoryRepository();
    repo.seedEntries('u1', [entry('a', 100), entry('c', 300), entry('b', 200)]);
    const { result } = renderHook(() => useLastEntryBefore('u1', 300), { wrapper: wrapperFor(repo) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entry?.id).toBe('b');
    expect(result.current.error).toBeNull();
  });

  it('returns null when no entry starts before the instant', async () => {
    const repo = new InMemoryRepository();
    repo.seedEntries('u1', [entry('a', 100)]);
    const { result } = renderHook(() => useLastEntryBefore('u1', 100), { wrapper: wrapperFor(repo) });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entry).toBeNull();
  });

  it('updates live when an earlier entry appears', async () => {
    const repo = new InMemoryRepository();
    repo.seedEntries('u1', [entry('a', 100)]);
    const { result } = renderHook(() => useLastEntryBefore('u1', 1000), { wrapper: wrapperFor(repo) });
    await waitFor(() => expect(result.current.entry?.id).toBe('a'));
    act(() => repo.seedEntries('u1', [entry('a', 100), entry('b', 500)]));
    await waitFor(() => expect(result.current.entry?.id).toBe('b'));
  });

  it('does not subscribe when before is null', () => {
    const repo = new InMemoryRepository();
    const { result } = renderHook(() => useLastEntryBefore('u1', null), { wrapper: wrapperFor(repo) });
    expect(result.current).toEqual({ loading: false, error: null, entry: null });
    expect(repo.listenerCount()).toBe(0);
  });

  it('re-keys when before changes', async () => {
    const repo = new InMemoryRepository();
    repo.seedEntries('u1', [entry('a', 100), entry('b', 200)]);
    const { result, rerender } = renderHook(
      ({ before }: { before: number | null }) => useLastEntryBefore('u1', before),
      { wrapper: wrapperFor(repo), initialProps: { before: 1000 as number | null } },
    );
    await waitFor(() => expect(result.current.entry?.id).toBe('b'));

    rerender({ before: 200 });
    expect(result.current.entry?.id).not.toBe('b');
    await waitFor(() => expect(result.current.entry?.id).toBe('a'));
    expect(repo.listenerCount()).toBe(1);

    rerender({ before: null });
    expect(result.current).toEqual({ loading: false, error: null, entry: null });
    expect(repo.listenerCount()).toBe(0);
  });

  it('reports a load error and stays loading', async () => {
    const repo = new FailingLastEntryRepository();
    const { result } = renderHook(() => useLastEntryBefore('u1', 1000), { wrapper: wrapperFor(repo) });
    await waitFor(() => expect(result.current.error).toBe('Daten konnten nicht geladen werden.'));
    expect(result.current.loading).toBe(true);
    expect(result.current.entry).toBeNull();
  });
});

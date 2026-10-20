import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ServicesProvider, type Services } from '../app/ServicesContext';
import type { Unsubscribe } from '../auth/authTypes';
import { InMemoryRepository } from '../data/inMemoryRepository';
import type { Project } from '../domain/types';
import { FakeAuthService } from '../test/fakeAuthService';
import { useProjects } from './useProjects';

function project(id: string, name: string): Project {
  return { id, name, color: 'blue', archived: false, createdAt: 1, updatedAt: 1 };
}

function wrapperFor(services: Services) {
  return function Wrapper(props: { children: React.ReactNode }): React.JSX.Element {
    return <ServicesProvider services={services}>{props.children}</ServicesProvider>;
  };
}

function servicesFor(repo: InMemoryRepository): Services {
  return { auth: new FakeAuthService(), entries: repo, settings: repo, projects: repo };
}

class FailingProjectsRepository extends InMemoryRepository {
  override subscribeProjects(
    _uid: string,
    _onChange: (projects: Project[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    queueMicrotask(() => onError(new Error('permission-denied')));
    return () => {};
  }
}

describe('useProjects', () => {
  it('delivers projects and live updates', async () => {
    const repo = new InMemoryRepository();
    repo.seedProjects('u1', [project('p1', 'Kunde A')]);
    const { result } = renderHook(() => useProjects('u1'), { wrapper: wrapperFor(servicesFor(repo)) });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.projects.map((p) => p.name)).toEqual(['Kunde A']);

    repo.seedProjects('u1', [project('p1', 'Kunde B')]);
    await waitFor(() => expect(result.current.projects.map((p) => p.name)).toEqual(['Kunde B']));
    expect(repo.listenerCount()).toBe(1);
  });

  it('reports a load error and stays loading', async () => {
    const repo = new FailingProjectsRepository();
    const { result } = renderHook(() => useProjects('u1'), { wrapper: wrapperFor(servicesFor(repo)) });
    await waitFor(() => expect(result.current.error).toBe('Daten konnten nicht geladen werden.'));
    expect(result.current.loading).toBe(true);
    expect(result.current.projects).toEqual([]);
  });

  it('returns a loaded empty list without subscribing when the projects service is absent', () => {
    const repo = new InMemoryRepository();
    repo.seedProjects('u1', [project('p1', 'Kunde A')]);
    const services: Services = { auth: new FakeAuthService(), entries: repo, settings: repo };
    const { result } = renderHook(() => useProjects('u1'), { wrapper: wrapperFor(services) });
    expect(result.current).toEqual({ loading: false, error: null, projects: [] });
    expect(repo.listenerCount()).toBe(0);
  });

  it('re-keys when the uid changes', async () => {
    const repo = new InMemoryRepository();
    repo.seedProjects('u1', [project('p1', 'Kunde A')]);
    repo.seedProjects('u2', [project('p2', 'Kunde Z')]);
    const { result, rerender } = renderHook(({ uid }: { uid: string }) => useProjects(uid), {
      wrapper: wrapperFor(servicesFor(repo)),
      initialProps: { uid: 'u1' },
    });
    await waitFor(() => expect(result.current.projects.map((p) => p.id)).toEqual(['p1']));

    rerender({ uid: 'u2' });
    expect(result.current.projects.map((p) => p.id)).not.toEqual(['p1']);
    await waitFor(() => expect(result.current.projects.map((p) => p.id)).toEqual(['p2']));
    expect(repo.listenerCount()).toBe(1);
  });
});

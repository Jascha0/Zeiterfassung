import { useEffect, useState } from 'react';
import { useServices } from '../app/ServicesContext';
import type { Project } from '../domain/types';
import { LOAD_ERROR_MESSAGE } from './useEntriesInRange';

export interface ProjectListData {
  loading: boolean;
  error: string | null;
  projects: Project[];
}

const EMPTY_PROJECTS: Project[] = [];

interface State {
  key: string;
  projects: Project[] | null;
  error: string | null;
}

export function useProjects(uid: string): ProjectListData {
  const { projects: repository } = useServices();
  const key = uid;
  const [state, setState] = useState<State>({ key, projects: null, error: null });

  useEffect(() => {
    setState({ key, projects: null, error: null });
    if (repository === undefined) return undefined;
    const update = (patch: Partial<Omit<State, 'key'>>) =>
      setState((current) => (current.key === key ? { ...current, ...patch } : current));
    return repository.subscribeProjects(
      uid,
      (projects) => update({ projects }),
      () => update({ error: LOAD_ERROR_MESSAGE }),
    );
  }, [repository, uid, key]);

  if (repository === undefined) return { loading: false, error: null, projects: EMPTY_PROJECTS };
  const current = state.key === key ? state : null;
  return {
    loading: (current?.projects ?? null) === null,
    error: current?.error ?? null,
    projects: current?.projects ?? EMPTY_PROJECTS,
  };
}

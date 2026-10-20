import { useEffect, useState } from 'react';
import { useServices } from '../app/ServicesContext';
import type { Entry } from '../domain/types';
import { LOAD_ERROR_MESSAGE } from './useEntriesInRange';

export interface LastEntryData {
  loading: boolean;
  error: string | null;
  entry: Entry | null;
}

interface State {
  key: string;
  loaded: boolean;
  entry: Entry | null;
  error: string | null;
}

export function useLastEntryBefore(uid: string, before: number | null): LastEntryData {
  const { entries: repository } = useServices();
  const key = before === null ? `${uid}|none` : `${uid}|${before}`;
  const [state, setState] = useState<State>({ key, loaded: false, entry: null, error: null });

  useEffect(() => {
    setState({ key, loaded: false, entry: null, error: null });
    if (before === null) return undefined;
    const update = (patch: Partial<Omit<State, 'key'>>) =>
      setState((current) => (current.key === key ? { ...current, ...patch } : current));
    return repository.subscribeLastEntryBefore(
      uid,
      before,
      (entry) => update({ entry, loaded: true }),
      () => update({ error: LOAD_ERROR_MESSAGE }),
    );
  }, [repository, uid, before, key]);

  if (before === null) return { loading: false, error: null, entry: null };
  const current = state.key === key ? state : null;
  return {
    loading: !(current?.loaded ?? false),
    error: current?.error ?? null,
    entry: current?.entry ?? null,
  };
}

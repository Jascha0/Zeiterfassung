import { useEffect, useState } from 'react';
import { useServices } from '../app/ServicesContext';
import type { Entry } from '../domain/types';
import { LOAD_ERROR_MESSAGE } from './useEntriesInRange';

export interface FirstEntryData {
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

export function useFirstEntryAfter(uid: string, after: number | null): FirstEntryData {
  const { entries: repository } = useServices();
  const key = after === null ? `${uid}|none` : `${uid}|${after}`;
  const [state, setState] = useState<State>({ key, loaded: false, entry: null, error: null });

  useEffect(() => {
    setState({ key, loaded: false, entry: null, error: null });
    if (after === null) return undefined;
    const update = (patch: Partial<Omit<State, 'key'>>) =>
      setState((current) => (current.key === key ? { ...current, ...patch } : current));
    return repository.subscribeFirstEntryAfter(
      uid,
      after,
      (entry) => update({ entry, loaded: true }),
      () => update({ error: LOAD_ERROR_MESSAGE }),
    );
  }, [repository, uid, after, key]);

  if (after === null) return { loading: false, error: null, entry: null };
  const current = state.key === key ? state : null;
  return {
    loading: !(current?.loaded ?? false),
    error: current?.error ?? null,
    entry: current?.entry ?? null,
  };
}

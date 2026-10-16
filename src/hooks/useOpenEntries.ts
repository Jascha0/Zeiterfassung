import { useEffect, useState } from 'react';
import { useServices } from '../app/ServicesContext';
import type { Entry } from '../domain/types';
import { LOAD_ERROR_MESSAGE, type EntryListData } from './useEntriesInRange';

const EMPTY_ENTRIES: Entry[] = [];

interface State {
  key: string;
  entries: Entry[] | null;
  error: string | null;
}

export function useOpenEntries(uid: string): EntryListData {
  const { entries: repository } = useServices();
  const key = uid;
  const [state, setState] = useState<State>({ key, entries: null, error: null });

  useEffect(() => {
    setState({ key, entries: null, error: null });
    const update = (patch: Partial<Omit<State, 'key'>>) =>
      setState((current) => (current.key === key ? { ...current, ...patch } : current));
    return repository.subscribeOpenEntries(
      uid,
      (entries) => update({ entries }),
      () => update({ error: LOAD_ERROR_MESSAGE }),
    );
  }, [repository, uid, key]);

  const current = state.key === key ? state : null;
  return {
    loading: (current?.entries ?? null) === null,
    error: current?.error ?? null,
    entries: current?.entries ?? EMPTY_ENTRIES,
  };
}

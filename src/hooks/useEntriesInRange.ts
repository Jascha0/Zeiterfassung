import { useEffect, useState } from 'react';
import { useServices } from '../app/ServicesContext';
import type { Entry, TimeRange } from '../domain/types';

export const LOAD_ERROR_MESSAGE = 'Daten konnten nicht geladen werden.';

export interface EntryListData {
  loading: boolean;
  error: string | null;
  entries: Entry[];
}

const EMPTY_ENTRIES: Entry[] = [];

interface State {
  key: string;
  entries: Entry[] | null;
  error: string | null;
}

export function useEntriesInRange(uid: string, range: TimeRange | null): EntryListData {
  const { entries: repository } = useServices();
  const rangeStart = range?.start ?? null;
  const rangeEnd = range?.end ?? null;
  const key = rangeStart === null || rangeEnd === null ? `${uid}|none` : `${uid}|${rangeStart}|${rangeEnd}`;
  const [state, setState] = useState<State>({ key, entries: null, error: null });

  useEffect(() => {
    setState({ key, entries: null, error: null });
    if (rangeStart === null || rangeEnd === null) return undefined;
    const update = (patch: Partial<Omit<State, 'key'>>) =>
      setState((current) => (current.key === key ? { ...current, ...patch } : current));
    return repository.subscribeEntriesInRange(
      uid,
      { start: rangeStart, end: rangeEnd },
      (entries) => update({ entries }),
      () => update({ error: LOAD_ERROR_MESSAGE }),
    );
  }, [repository, uid, rangeStart, rangeEnd, key]);

  if (rangeStart === null || rangeEnd === null) return { loading: false, error: null, entries: EMPTY_ENTRIES };
  const current = state.key === key ? state : null;
  return {
    loading: (current?.entries ?? null) === null,
    error: current?.error ?? null,
    entries: current?.entries ?? EMPTY_ENTRIES,
  };
}

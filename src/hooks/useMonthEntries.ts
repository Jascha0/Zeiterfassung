import { useEffect, useMemo, useState } from 'react';
import { useServices } from '../app/ServicesContext';
import { monthRange } from '../domain/monthView';
import type { Entry } from '../domain/types';

export interface MonthEntriesData {
  loading: boolean;
  error: string | null;
  entries: Entry[];
  openEntries: Entry[];
}

const EMPTY_ENTRIES: Entry[] = [];

const LOAD_ERROR_MESSAGE = 'Daten konnten nicht geladen werden.';

interface MonthSubscriptionState {
  key: string;
  rangeEntries: Entry[] | null;
  openEntries: Entry[] | null;
  error: string | null;
}

function emptyState(key: string): MonthSubscriptionState {
  return { key, rangeEntries: null, openEntries: null, error: null };
}

export function useMonthEntries(monthStart: number): MonthEntriesData {
  const { entries } = useServices();
  const range = monthRange(monthStart);
  const rangeStart = range.start;
  const rangeEnd = range.end;
  const key = String(rangeStart);

  const [state, setState] = useState<MonthSubscriptionState>(() => emptyState(key));

  useEffect(() => {
    setState(emptyState(key));
    const update = (patch: Partial<Omit<MonthSubscriptionState, 'key'>>) =>
      setState((current) => (current.key === key ? { ...current, ...patch } : current));
    const onError = () => update({ error: LOAD_ERROR_MESSAGE });

    const unsubscribeRange = entries.subscribeEntriesInRange(
      { start: rangeStart, end: rangeEnd },
      (rangeEntries) => update({ rangeEntries }),
      onError,
    );
    const unsubscribeOpen = entries.subscribeOpenEntries((openEntries) => update({ openEntries }), onError);
    return () => {
      unsubscribeRange();
      unsubscribeOpen();
    };
  }, [entries, rangeStart, rangeEnd, key]);

  const current = state.key === key ? state : null;
  const rangeEntries = current?.rangeEntries ?? null;
  const openEntries = current?.openEntries ?? null;

  const allEntries = useMemo(() => {
    const byId = new Map<string, Entry>();
    for (const entry of rangeEntries ?? []) byId.set(entry.id, entry);
    for (const entry of openEntries ?? []) byId.set(entry.id, entry);
    return [...byId.values()].sort((a, b) => a.start - b.start);
  }, [rangeEntries, openEntries]);

  return {
    loading: rangeEntries === null || openEntries === null,
    error: current?.error ?? null,
    entries: allEntries,
    openEntries: openEntries ?? EMPTY_ENTRIES,
  };
}

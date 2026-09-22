import { useEffect, useMemo, useState } from 'react';
import { useServices } from '../app/ServicesContext';
import { monthRange } from '../domain/monthView';
import type { Entry } from '../domain/types';
import { useOnlineStatus } from './useOnlineStatus';

export interface MonthEntriesData {
  loading: boolean;
  error: string | null;
  entries: Entry[];
  openEntries: Entry[];
  incomplete: boolean;
}

const EMPTY_ENTRIES: Entry[] = [];

const LOAD_ERROR_MESSAGE = 'Daten konnten nicht geladen werden.';

interface MonthSubscriptionState {
  key: string;
  rangeEntries: Entry[] | null;
  openEntries: Entry[] | null;
  rangeFromCache: boolean;
  serverDelivered: boolean;
  error: string | null;
}

function emptyState(key: string): MonthSubscriptionState {
  return { key, rangeEntries: null, openEntries: null, rangeFromCache: false, serverDelivered: false, error: null };
}

export function useMonthEntries(uid: string, monthStart: number): MonthEntriesData {
  const { entries } = useServices();
  const range = monthRange(monthStart);
  const rangeStart = range.start;
  const rangeEnd = range.end;
  const key = `${uid}|${rangeStart}`;

  const [state, setState] = useState<MonthSubscriptionState>(() => emptyState(key));
  const online = useOnlineStatus();

  useEffect(() => {
    setState(emptyState(key));
    const update = (patch: Partial<Omit<MonthSubscriptionState, 'key'>>) =>
      setState((current) => (current.key === key ? { ...current, ...patch } : current));
    const onError = () => update({ error: LOAD_ERROR_MESSAGE });

    const unsubscribeRange = entries.subscribeEntriesInRange(
      uid,
      { start: rangeStart, end: rangeEnd },
      (rangeEntries, meta) =>
        setState((current) =>
          current.key === key
            ? {
                ...current,
                rangeEntries,
                rangeFromCache: meta.fromCache,
                serverDelivered: current.serverDelivered || !meta.fromCache,
              }
            : current,
        ),
      onError,
    );
    const unsubscribeOpen = entries.subscribeOpenEntries(uid, (openEntries) => update({ openEntries }), onError);
    return () => {
      unsubscribeRange();
      unsubscribeOpen();
    };
  }, [entries, uid, rangeStart, rangeEnd, key]);

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
    loading: rangeEntries === null || openEntries === null || (online && !(current?.serverDelivered ?? false)),
    error: current?.error ?? null,
    entries: allEntries,
    openEntries: openEntries ?? EMPTY_ENTRIES,
    incomplete: rangeEntries !== null && (current?.rangeFromCache ?? false) && !online,
  };
}

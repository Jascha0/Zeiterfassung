import { useEffect, useMemo, useState } from 'react';
import { useServices } from '../app/ServicesContext';
import { dayRange } from '../domain/totals';
import type { Entry } from '../domain/types';

export interface TimerData {
  loading: boolean;
  error: string | null;
  todayEntries: Entry[];
  openEntries: Entry[];
}

const EMPTY_ENTRIES: Entry[] = [];

const LOAD_ERROR_MESSAGE = 'Daten konnten nicht geladen werden.';

interface SubscriptionState {
  key: string;
  rangeEntries: Entry[] | null;
  openEntries: Entry[] | null;
  error: string | null;
}

export function useTimerData(now: number): TimerData {
  const { entries } = useServices();
  const range = dayRange(now);
  const dayStart = range.start;
  const dayEnd = range.end;
  const key = String(dayStart);

  const [state, setState] = useState<SubscriptionState>({ key, rangeEntries: null, openEntries: null, error: null });

  useEffect(() => {
    setState({ key, rangeEntries: null, openEntries: null, error: null });
    const update = (patch: Partial<Omit<SubscriptionState, 'key'>>) =>
      setState((current) => (current.key === key ? { ...current, ...patch } : current));
    const onError = () => update({ error: LOAD_ERROR_MESSAGE });

    const unsubscribeRange = entries.subscribeEntriesInRange(
      { start: dayStart, end: dayEnd },
      (rangeEntries) => update({ rangeEntries }),
      onError,
    );
    const unsubscribeOpen = entries.subscribeOpenEntries((openEntries) => update({ openEntries }), onError);
    return () => {
      unsubscribeRange();
      unsubscribeOpen();
    };
  }, [entries, dayStart, dayEnd, key]);

  const current = state.key === key ? state : null;
  const rangeEntries = current?.rangeEntries ?? null;
  const openEntries = current?.openEntries ?? null;

  const todayEntries = useMemo(() => {
    const byId = new Map<string, Entry>();
    for (const entry of rangeEntries ?? []) byId.set(entry.id, entry);
    for (const entry of openEntries ?? []) {
      if (entry.start >= dayStart && entry.start < dayEnd) byId.set(entry.id, entry);
    }
    return [...byId.values()].sort((a, b) => a.start - b.start);
  }, [rangeEntries, openEntries, dayStart, dayEnd]);

  return {
    loading: rangeEntries === null || openEntries === null,
    error: current?.error ?? null,
    todayEntries,
    openEntries: openEntries ?? EMPTY_ENTRIES,
  };
}

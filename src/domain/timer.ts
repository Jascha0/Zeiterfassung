import type { Entry, NewEntry } from './types';
import { findOpenEntries } from './warnings';

export type TimerState = 'idle' | 'working' | 'onBreak';
export type TimerAction = 'start' | 'pause' | 'resume' | 'end';

export interface TimerStatus {
  state: TimerState;
  activeEntry: Entry | null;
  openEntries: Entry[];
}

export interface EntryClose {
  id: string;
  end: number;
  updatedAt: number;
}

export interface TransitionPlan {
  close: EntryClose[];
  create: NewEntry | null;
  delete: string[];
}

export class InvalidTimerActionError extends Error {
  readonly action: TimerAction;
  readonly state: TimerState;

  constructor(action: TimerAction, state: TimerState) {
    super(`Timer action "${action}" is not allowed in state "${state}"`);
    this.name = 'InvalidTimerActionError';
    this.action = action;
    this.state = state;
  }
}

export function deriveTimerStatus(entries: readonly Entry[]): TimerStatus {
  const openEntries = findOpenEntries(entries);
  const activeEntry = openEntries[0] ?? null;
  let state: TimerState = 'idle';
  if (activeEntry !== null) {
    state = activeEntry.type === 'work' ? 'working' : 'onBreak';
  }
  return { state, activeEntry, openEntries };
}

export function allowedActions(state: TimerState): TimerAction[] {
  switch (state) {
    case 'idle':
      return ['start'];
    case 'working':
      return ['pause', 'end'];
    case 'onBreak':
      return ['resume', 'end'];
  }
}

function newEntry(type: NewEntry['type'], start: number, now: number): NewEntry {
  return { type, start, end: null, createdAt: now, updatedAt: now };
}

export function planTransition(entries: readonly Entry[], action: TimerAction, now: number): TransitionPlan {
  const status = deriveTimerStatus(entries);
  if (!allowedActions(status.state).includes(action)) {
    throw new InvalidTimerActionError(action, status.state);
  }
  const active = status.activeEntry;
  if (action === 'start' || active === null) {
    return { close: [], create: newEntry('work', now, now), delete: [] };
  }
  const closeAt = Math.max(now, active.start);
  const close: EntryClose[] = [{ id: active.id, end: closeAt, updatedAt: now }];
  switch (action) {
    case 'pause':
      return { close, create: newEntry('break', closeAt, now), delete: [] };
    case 'resume':
      return { close, create: newEntry('work', closeAt, now), delete: [] };
    case 'end':
      return { close, create: null, delete: [] };
  }
}

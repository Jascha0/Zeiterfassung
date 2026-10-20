import type { Entry, NewEntry } from './types';
import { findOpenEntries } from './warnings';

export type TimerState = 'idle' | 'working' | 'onBreak';
export type TimerAction = 'start' | 'pause' | 'resume' | 'end' | 'switch';

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

function newEntry(type: NewEntry['type'], start: number, now: number, projectId?: string): NewEntry {
  if (projectId === undefined) {
    return { type, start, end: null, createdAt: now, updatedAt: now };
  }
  return { type, start, end: null, projectId, createdAt: now, updatedAt: now };
}

function isValidAction(state: TimerState, action: TimerAction): boolean {
  return action === 'switch' ? state === 'working' : allowedActions(state).includes(action);
}

export function planTransition(
  entries: readonly Entry[],
  action: TimerAction,
  now: number,
  projectId?: string,
): TransitionPlan {
  const status = deriveTimerStatus(entries);
  if (!isValidAction(status.state, action)) {
    throw new InvalidTimerActionError(action, status.state);
  }
  const active = status.activeEntry;
  if (action === 'start' || active === null) {
    return { close: [], create: newEntry('work', now, now, projectId) };
  }
  if (action === 'switch' && projectId === active.projectId) {
    throw new InvalidTimerActionError(action, status.state);
  }
  const closeAt = Math.max(now, active.start);
  const close: EntryClose[] = [{ id: active.id, end: closeAt, updatedAt: now }];
  switch (action) {
    case 'pause':
      return { close, create: newEntry('break', closeAt, now) };
    case 'resume':
    case 'switch':
      return { close, create: newEntry('work', closeAt, now, projectId) };
    case 'end':
      return { close, create: null };
  }
}

export function carryOverProjectId(previous: Entry | null): string | undefined {
  return previous?.type === 'work' ? previous.projectId : undefined;
}

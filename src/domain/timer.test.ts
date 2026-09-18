import { describe, expect, it } from 'vitest';
import {
  InvalidTimerActionError,
  allowedActions,
  deriveTimerStatus,
  planTransition,
} from './timer';
import type { Entry } from './types';

function entry(overrides: Partial<Entry> & { id: string }): Entry {
  return {
    type: 'work',
    start: 0,
    end: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('deriveTimerStatus', () => {
  it('is idle with no open entries', () => {
    const status = deriveTimerStatus([entry({ id: 'a', end: 100 })]);
    expect(status.state).toBe('idle');
    expect(status.activeEntry).toBeNull();
    expect(status.openEntries).toEqual([]);
  });

  it('is working when the most recent open entry is work', () => {
    const status = deriveTimerStatus([entry({ id: 'a', type: 'work', start: 100 })]);
    expect(status.state).toBe('working');
    expect(status.activeEntry?.id).toBe('a');
  });

  it('is onBreak when the most recent open entry is a break', () => {
    const status = deriveTimerStatus([entry({ id: 'a', type: 'break', start: 100 })]);
    expect(status.state).toBe('onBreak');
  });

  it('picks the most recently started open entry as active (edge case 24)', () => {
    const older = entry({ id: 'a', type: 'work', start: 100 });
    const newer = entry({ id: 'b', type: 'break', start: 200 });
    const status = deriveTimerStatus([older, newer]);
    expect(status.activeEntry?.id).toBe('b');
    expect(status.state).toBe('onBreak');
    expect(status.openEntries.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('breaks ties on equal start by greater id (lexicographic)', () => {
    const a = entry({ id: 'x1', type: 'work', start: 100 });
    const b = entry({ id: 'x2', type: 'break', start: 100 });
    const status = deriveTimerStatus([a, b]);
    expect(status.activeEntry?.id).toBe('x2');
  });

  it('ignores closed entries even if mixed with open ones', () => {
    const closed = entry({ id: 'a', end: 100 });
    const open = entry({ id: 'b', start: 50 });
    const status = deriveTimerStatus([closed, open]);
    expect(status.openEntries).toEqual([open]);
  });
});

describe('allowedActions', () => {
  it('idle -> [start]', () => {
    expect(allowedActions('idle')).toEqual(['start']);
  });
  it('working -> [pause, end] in this exact order', () => {
    expect(allowedActions('working')).toEqual(['pause', 'end']);
  });
  it('onBreak -> [resume, end] in this exact order', () => {
    expect(allowedActions('onBreak')).toEqual(['resume', 'end']);
  });
});

describe('planTransition', () => {
  it('start from idle creates an open work entry, closes nothing', () => {
    const plan = planTransition([], 'start', 1000);
    expect(plan.close).toEqual([]);
    expect(plan.create).toEqual({ type: 'work', start: 1000, end: null, createdAt: 1000, updatedAt: 1000 });
  });

  it('pause closes the active work entry and opens a break at the same instant', () => {
    const working = entry({ id: 'w1', type: 'work', start: 1000 });
    const plan = planTransition([working], 'pause', 2000);
    expect(plan.close).toEqual([{ id: 'w1', end: 2000, updatedAt: 2000 }]);
    expect(plan.create).toEqual({ type: 'break', start: 2000, end: null, createdAt: 2000, updatedAt: 2000 });
  });

  it('resume closes the active break entry and opens work at the same instant', () => {
    const onBreak = entry({ id: 'b1', type: 'break', start: 2000 });
    const plan = planTransition([onBreak], 'resume', 3000);
    expect(plan.close).toEqual([{ id: 'b1', end: 3000, updatedAt: 3000 }]);
    expect(plan.create).toEqual({ type: 'work', start: 3000, end: null, createdAt: 3000, updatedAt: 3000 });
  });

  it('end closes the active entry and creates nothing', () => {
    const working = entry({ id: 'w1', type: 'work', start: 1000 });
    const plan = planTransition([working], 'end', 5000);
    expect(plan.close).toEqual([{ id: 'w1', end: 5000, updatedAt: 5000 }]);
    expect(plan.create).toBeNull();
  });

  it('only closes the active entry, other open entries are untouched (edge case 24)', () => {
    const older = entry({ id: 'a', type: 'work', start: 100 });
    const newer = entry({ id: 'b', type: 'break', start: 200 });
    const plan = planTransition([older, newer], 'end', 5000);
    expect(plan.close).toEqual([{ id: 'b', end: 5000, updatedAt: 5000 }]);
  });

  it('clamps closeAt to activeEntry.start under clock skew (edge case 26)', () => {
    const working = entry({ id: 'w1', type: 'work', start: 10_000 });
    const plan = planTransition([working], 'pause', 5_000); // now < start
    expect(plan.close).toEqual([{ id: 'w1', end: 10_000, updatedAt: 5_000 }]);
    expect(plan.create?.start).toBe(10_000);
  });

  it.each(['pause', 'resume', 'end'] as const)('throws InvalidTimerActionError for "%s" when idle', (action) => {
    expect(() => planTransition([], action, 1000)).toThrow(InvalidTimerActionError);
  });

  it('throws for start when working', () => {
    const working = entry({ id: 'w1', type: 'work', start: 100 });
    expect(() => planTransition([working], 'start', 1000)).toThrow(InvalidTimerActionError);
  });

  it('throws for resume when working', () => {
    const working = entry({ id: 'w1', type: 'work', start: 100 });
    expect(() => planTransition([working], 'resume', 1000)).toThrow(InvalidTimerActionError);
  });

  it('throws for pause when onBreak', () => {
    const onBreak = entry({ id: 'b1', type: 'break', start: 100 });
    expect(() => planTransition([onBreak], 'pause', 1000)).toThrow(InvalidTimerActionError);
  });

  it('error carries the attempted action and current state', () => {
    try {
      planTransition([], 'pause', 1000);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidTimerActionError);
      const e = error as InvalidTimerActionError;
      expect(e.action).toBe('pause');
      expect(e.state).toBe('idle');
    }
  });

  it('AC sequence: Start -> Pause -> Weiter -> Pause -> Weiter -> Arbeitstag beenden yields 3 work + 2 break, all closed and contiguous', () => {
    let entries: Entry[] = [];
    let nextId = 1;
    const apply = (action: 'start' | 'pause' | 'resume' | 'end', now: number) => {
      const plan = planTransition(entries, action, now);
      const closedIds = new Set(plan.close.map((c) => c.id));
      entries = entries.map((e) =>
        closedIds.has(e.id) ? { ...e, end: plan.close.find((c) => c.id === e.id)!.end, updatedAt: now } : e,
      );
      if (plan.create !== null) {
        entries = [...entries, { id: `e${nextId++}`, ...plan.create }];
      }
    };

    apply('start', 1000); // work1 starts 1000
    apply('pause', 2000); // work1 ends 2000, break1 starts 2000
    apply('resume', 3000); // break1 ends 3000, work2 starts 3000
    apply('pause', 4000); // work2 ends 4000, break2 starts 4000
    apply('resume', 5000); // break2 ends 5000, work3 starts 5000
    apply('end', 6000); // work3 ends 6000

    const work = entries.filter((e) => e.type === 'work');
    const breaks = entries.filter((e) => e.type === 'break');
    expect(work).toHaveLength(3);
    expect(breaks).toHaveLength(2);
    expect(entries.every((e) => e.end !== null)).toBe(true);

    const sorted = [...entries].sort((a, b) => a.start - b.start);
    for (let i = 0; i < sorted.length - 1; i++) {
      expect(sorted[i].end).toBe(sorted[i + 1].start);
    }
  });

  it('edge case 18: after end, start on the same day creates a new work entry, previous entries unchanged', () => {
    const closedWork = entry({ id: 'w1', type: 'work', start: 1000, end: 2000 });
    const plan = planTransition([closedWork], 'start', 3000);
    expect(plan.create).toEqual({ type: 'work', start: 3000, end: null, createdAt: 3000, updatedAt: 3000 });
    expect(plan.close).toEqual([]);
  });
});

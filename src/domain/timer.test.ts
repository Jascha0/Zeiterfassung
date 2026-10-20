import { describe, expect, it } from 'vitest';
import {
  InvalidTimerActionError,
  allowedActions,
  deriveTimerStatus,
  planTransition,
} from './timer';
import type { Entry } from './types';
import { carryOverProjectId } from './timer';

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

describe('planTransition with projects (slice 3)', () => {
  it('switch closes the working entry and opens work with the target project at the same instant', () => {
    const w1 = entry({ id: 'w1', type: 'work', start: 1000, end: null, projectId: 'pA' });
    expect(planTransition([w1], 'switch', 5000, 'pC')).toEqual({
      close: [{ id: 'w1', end: 5000, updatedAt: 5000 }],
      create: { type: 'work', start: 5000, end: null, projectId: 'pC', createdAt: 5000, updatedAt: 5000 },
    });
  });

  it('start with a project creates work with that projectId', () => {
    expect(planTransition([], 'start', 1000, 'pA').create).toEqual({
      type: 'work', start: 1000, end: null, projectId: 'pA', createdAt: 1000, updatedAt: 1000,
    });
  });

  it('start without a project creates no projectId key (byte-identical to slice 1)', () => {
    const plan = planTransition([], 'start', 1000);
    expect(Object.keys(plan.create!)).toEqual(['type', 'start', 'end', 'createdAt', 'updatedAt']);
  });

  it('resume with a project creates work with that projectId and no note key', () => {
    const b1 = entry({ id: 'b1', type: 'break', start: 1000, end: null });
    const plan = planTransition([b1], 'resume', 2000, 'pA');
    expect(plan.create).toEqual({ type: 'work', start: 2000, end: null, projectId: 'pA', createdAt: 2000, updatedAt: 2000 });
    expect('note' in plan.create!).toBe(false);
  });

  it('pause ignores the projectId: break create has no projectId key', () => {
    const w1 = entry({ id: 'w1', type: 'work', start: 1000, end: null, projectId: 'pA' });
    const plan = planTransition([w1], 'pause', 2000, 'pA');
    expect(plan.create).toEqual({ type: 'break', start: 2000, end: null, createdAt: 2000, updatedAt: 2000 });
    expect('projectId' in plan.create!).toBe(false);
  });

  it('end ignores the projectId', () => {
    const w1 = entry({ id: 'w1', type: 'work', start: 1000, end: null, projectId: 'pA' });
    expect(planTransition([w1], 'end', 2000, 'pB')).toEqual({ close: [{ id: 'w1', end: 2000, updatedAt: 2000 }], create: null });
  });

  it('switch to Kein Projekt (undefined) from pA creates work without a projectId key', () => {
    const w1 = entry({ id: 'w1', type: 'work', start: 1000, end: null, projectId: 'pA' });
    const plan = planTransition([w1], 'switch', 5000);
    expect(plan.close).toEqual([{ id: 'w1', end: 5000, updatedAt: 5000 }]);
    expect(plan.create).toEqual({ type: 'work', start: 5000, end: null, createdAt: 5000, updatedAt: 5000 });
    expect('projectId' in plan.create!).toBe(false);
  });

  it('switch from no project to a project is allowed', () => {
    const w1 = entry({ id: 'w1', type: 'work', start: 1000, end: null });
    expect(planTransition([w1], 'switch', 5000, 'pB').create?.projectId).toBe('pB');
  });

  it('switch to the same project throws InvalidTimerActionError', () => {
    const withProject = entry({ id: 'w1', type: 'work', start: 1000, end: null, projectId: 'pA' });
    const withoutProject = entry({ id: 'w2', type: 'work', start: 1000, end: null });
    expect(() => planTransition([withProject], 'switch', 5000, 'pA')).toThrow(InvalidTimerActionError);
    expect(() => planTransition([withoutProject], 'switch', 5000)).toThrow(InvalidTimerActionError);
    try {
      planTransition([withProject], 'switch', 5000, 'pA');
    } catch (error) {
      expect(error).toMatchObject({ action: 'switch', state: 'working' });
    }
  });

  it('switch while idle or on break throws InvalidTimerActionError', () => {
    const closed = entry({ id: 'w1', type: 'work', start: 1000, end: 2000 });
    const b1 = entry({ id: 'b1', type: 'break', start: 1000, end: null });
    expect(() => planTransition([], 'switch', 5000, 'pA')).toThrow(InvalidTimerActionError);
    expect(() => planTransition([closed], 'switch', 5000, 'pA')).toThrow(InvalidTimerActionError);
    expect(() => planTransition([b1], 'switch', 5000, 'pA')).toThrow(InvalidTimerActionError);
    try {
      planTransition([b1], 'switch', 5000, 'pA');
    } catch (error) {
      expect(error).toMatchObject({ action: 'switch', state: 'onBreak' });
    }
  });

  it('switch under clock skew (now < start) closes and starts at start', () => {
    const w1 = entry({ id: 'w1', type: 'work', start: 9000, end: null, projectId: 'pA' });
    expect(planTransition([w1], 'switch', 5000, 'pC')).toEqual({
      close: [{ id: 'w1', end: 9000, updatedAt: 5000 }],
      create: { type: 'work', start: 9000, end: null, projectId: 'pC', createdAt: 5000, updatedAt: 5000 },
    });
  });

  it('switch keeps net work unchanged: closed + new block equals the unsplit duration', () => {
    const w1 = entry({ id: 'w1', type: 'work', start: 1000, end: null, projectId: 'pA' });
    const plan = planTransition([w1], 'switch', 5000, 'pC');
    const later = 12_000;
    const closedMs = plan.close[0].end - w1.start;
    const newMs = later - plan.create!.start;
    expect(closedMs + newMs).toBe(later - w1.start);
  });

  it('allowedActions never offers switch', () => {
    expect(allowedActions('idle')).not.toContain('switch');
    expect(allowedActions('working')).not.toContain('switch');
    expect(allowedActions('onBreak')).not.toContain('switch');
  });
});

describe('carryOverProjectId (slice 3)', () => {
  it('returns the projectId of a work entry', () => {
    expect(carryOverProjectId(entry({ id: 'w1', type: 'work', end: 100, projectId: 'pA', note: 'x' }))).toBe('pA');
  });

  it('returns undefined for a work entry without a project', () => {
    expect(carryOverProjectId(entry({ id: 'w1', type: 'work', end: 100 }))).toBeUndefined();
  });

  it('returns undefined for a break, even if it carries a projectId', () => {
    expect(carryOverProjectId(entry({ id: 'b1', type: 'break', end: 100, projectId: 'pA' }))).toBeUndefined();
  });

  it('returns undefined for null', () => {
    expect(carryOverProjectId(null)).toBeUndefined();
  });
});

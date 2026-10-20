import { compareByName } from './projects';
import { dayRange, entryDurationMs } from './totals';
import type { Entry, Project, TimeRange } from './types';

export type ProjectTotal =
  | { kind: 'project'; project: Project; workMs: number }
  | { kind: 'none'; workMs: number }
  | { kind: 'unknown'; workMs: number };

const KIND_RANK: Readonly<Record<ProjectTotal['kind'], number>> = { project: 0, none: 1, unknown: 2 };

function compareTotals(a: ProjectTotal, b: ProjectTotal): number {
  if (a.workMs !== b.workMs) return b.workMs - a.workMs;
  if (a.kind === 'project' && b.kind === 'project') return compareByName(a.project, b.project);
  return KIND_RANK[a.kind] - KIND_RANK[b.kind];
}

/** Work entries with start in dayRange(day) (same filter as dailyTotals), duration via entryDurationMs(entry, now).
 *  Grouped by projectId: no projectId → 'none'; id not in projectsById → one shared 'unknown' group.
 *  A group exists iff at least one counted entry belongs to it (a 0-ms running block still creates it).
 *  Sorted by workMs desc; ties: project groups by name ('de'), then id; then 'none'; then 'unknown'.
 *  Invariant: sum(workMs) === dailyTotals(entries, day, now).workMs. Breaks are never counted. */
export function projectDayTotals(
  entries: readonly Entry[],
  day: number,
  projectsById: ReadonlyMap<string, Project>,
  now: number,
): ProjectTotal[] {
  return projectRangeTotals(entries, dayRange(day), projectsById, now);
}

/** Same as projectDayTotals but for any [range.start, range.end) on entry.start.
 *  Invariant: sum(workMs) === sum of entryDurationMs(work entries starting in range, now). */
export function projectRangeTotals(
  entries: readonly Entry[],
  range: TimeRange,
  projectsById: ReadonlyMap<string, Project>,
  now: number,
): ProjectTotal[] {
  const byProject = new Map<string, { kind: 'project'; project: Project; workMs: number }>();
  let none: { kind: 'none'; workMs: number } | null = null;
  let unknown: { kind: 'unknown'; workMs: number } | null = null;
  for (const entry of entries) {
    if (entry.type !== 'work') continue;
    if (entry.start < range.start || entry.start >= range.end) continue;
    const duration = entryDurationMs(entry, now);
    if (entry.projectId === undefined) {
      none ??= { kind: 'none', workMs: 0 };
      none.workMs += duration;
      continue;
    }
    const project = projectsById.get(entry.projectId);
    if (project === undefined) {
      unknown ??= { kind: 'unknown', workMs: 0 };
      unknown.workMs += duration;
      continue;
    }
    let group = byProject.get(project.id);
    if (group === undefined) {
      group = { kind: 'project', project, workMs: 0 };
      byProject.set(project.id, group);
    }
    group.workMs += duration;
  }
  const totals: ProjectTotal[] = [...byProject.values()];
  if (none !== null) totals.push(none);
  if (unknown !== null) totals.push(unknown);
  return totals.sort(compareTotals);
}

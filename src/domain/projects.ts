import type { ProjectColor } from './palette';
import type { Project } from './types';

export const PROJECT_NAME_MAX_LENGTH = 40;

export type ProjectNameResult = { ok: true; name: string } | { ok: false; reason: 'empty' | 'tooLong' | 'duplicate' };

function nameKey(name: string): string {
  return name.trim().toLocaleLowerCase('de');
}

/** Trims; empty → 'empty'; length > 40 → 'tooLong'; equal (toLocaleLowerCase('de'), trimmed) to any project
 *  incl. archived, excluding id === selfId → 'duplicate'. Checks in this order. ok carries the trimmed name. */
export function validateProjectName(name: string, projects: readonly Project[], selfId?: string): ProjectNameResult {
  const trimmed = name.trim();
  if (trimmed === '') return { ok: false, reason: 'empty' };
  if (trimmed.length > PROJECT_NAME_MAX_LENGTH) return { ok: false, reason: 'tooLong' };
  const key = nameKey(trimmed);
  if (projects.some((p) => p.id !== selfId && nameKey(p.name) === key)) {
    return { ok: false, reason: 'duplicate' };
  }
  return { ok: true, name: trimmed };
}

export function compareByName(a: { id: string; name: string }, b: { id: string; name: string }): number {
  const byName = a.name.localeCompare(b.name, 'de');
  if (byName !== 0) return byName;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** New array sorted by name (localeCompare(…, 'de')), ties by id ascending. */
export function sortProjectsByName(projects: readonly Project[]): Project[] {
  return [...projects].sort(compareByName);
}

export function projectsById(projects: readonly Project[]): Map<string, Project> {
  return new Map(projects.map((p) => [p.id, p]));
}

export interface ProjectOption {
  id: string;
  name: string;
  color: ProjectColor;
  archived: boolean;
  known: boolean;
}

/** Non-archived projects sorted by name; plus the current project if it is archived (sorted in with the others);
 *  plus, at the end, { id: currentProjectId, name: '', color: 'gray', archived: false, known: false } if
 *  currentProjectId has no document. "Kein Projekt" is NOT included (the UI adds it first, value ''). */
export function projectPickerOptions(projects: readonly Project[], currentProjectId: string | undefined): ProjectOption[] {
  const listed = projects.filter((p) => !p.archived || p.id === currentProjectId);
  const options: ProjectOption[] = sortProjectsByName(listed).map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    archived: p.archived,
    known: true,
  }));
  if (currentProjectId !== undefined && !projects.some((p) => p.id === currentProjectId)) {
    options.push({ id: currentProjectId, name: '', color: 'gray', archived: false, known: false });
  }
  return options;
}

/** true if projectId is undefined, equals currentProjectId, or names an existing non-archived project. */
export function isSelectableProject(
  projectId: string | undefined,
  projects: readonly Project[],
  currentProjectId: string | undefined,
): boolean {
  if (projectId === undefined || projectId === currentProjectId) return true;
  return projects.some((p) => p.id === projectId && !p.archived);
}

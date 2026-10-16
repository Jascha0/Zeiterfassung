import { describe, expect, it } from 'vitest';
import type { Project } from './types';
import { isSelectableProject, projectPickerOptions, projectsById, sortProjectsByName, validateProjectName } from './projects';

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    name: 'Kunde A',
    color: 'blue',
    archived: false,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('validateProjectName', () => {
  it('rejects a case-insensitive duplicate of an archived project', () => {
    const projects = [project({ id: 'p1', name: 'Kunde A', archived: true })];
    expect(validateProjectName('  kunde a ', projects)).toEqual({ ok: false, reason: 'duplicate' });
  });

  it('rejects empty and whitespace-only names', () => {
    expect(validateProjectName('', [])).toEqual({ ok: false, reason: 'empty' });
    expect(validateProjectName('   ', [])).toEqual({ ok: false, reason: 'empty' });
  });

  it('accepts exactly 40 characters and rejects 41', () => {
    expect(validateProjectName('x'.repeat(40), [])).toEqual({ ok: true, name: 'x'.repeat(40) });
    expect(validateProjectName('x'.repeat(41), [])).toEqual({ ok: false, reason: 'tooLong' });
  });

  it('measures the length after trimming', () => {
    expect(validateProjectName(`  ${'x'.repeat(40)}  `, [])).toEqual({ ok: true, name: 'x'.repeat(40) });
  });

  it('returns the trimmed name', () => {
    expect(validateProjectName('  Kunde B  ', [project()])).toEqual({ ok: true, name: 'Kunde B' });
  });

  it('accepts renaming a project to its own name in a different case', () => {
    expect(validateProjectName('KUNDE A', [project({ id: 'p1' })], 'p1')).toEqual({ ok: true, name: 'KUNDE A' });
  });

  it('still rejects a duplicate of another project when renaming', () => {
    const projects = [project({ id: 'p1' }), project({ id: 'p2', name: 'Kunde B' })];
    expect(validateProjectName('kunde b', projects, 'p1')).toEqual({ ok: false, reason: 'duplicate' });
  });

  it('reports tooLong before duplicate', () => {
    const projects = [project({ name: 'x'.repeat(41) })];
    expect(validateProjectName('x'.repeat(41), projects)).toEqual({ ok: false, reason: 'tooLong' });
  });
});

describe('sortProjectsByName', () => {
  it('sorts with German collation', () => {
    const projects = [project({ id: '1', name: 'b' }), project({ id: '2', name: 'Ä' }), project({ id: '3', name: 'a' })];
    expect(sortProjectsByName(projects).map((p) => p.name)).toEqual(['a', 'Ä', 'b']);
  });

  it('breaks ties by id and does not mutate the input', () => {
    const projects = [project({ id: 'z', name: 'Same' }), project({ id: 'a', name: 'Same' })];
    expect(sortProjectsByName(projects).map((p) => p.id)).toEqual(['a', 'z']);
    expect(projects.map((p) => p.id)).toEqual(['z', 'a']);
  });
});

describe('projectsById', () => {
  it('maps ids to projects', () => {
    const a = project({ id: 'a' });
    const b = project({ id: 'b', name: 'B' });
    const map = projectsById([a, b]);
    expect(map.get('a')).toBe(a);
    expect(map.get('b')).toBe(b);
    expect(map.size).toBe(2);
  });
});

describe('projectPickerOptions', () => {
  const activeB = project({ id: 'pB', name: 'Beta', color: 'green' });
  const activeA = project({ id: 'pA', name: 'Alpha' });
  const archived = project({ id: 'pX', name: 'Archiv', color: 'red', archived: true });

  it('lists active projects sorted by name and excludes archived ones', () => {
    expect(projectPickerOptions([activeB, archived, activeA], undefined)).toEqual([
      { id: 'pA', name: 'Alpha', color: 'blue', archived: false, known: true },
      { id: 'pB', name: 'Beta', color: 'green', archived: false, known: true },
    ]);
  });

  it('includes an archived current project in sort order', () => {
    expect(projectPickerOptions([activeB, archived, activeA], 'pX')).toEqual([
      { id: 'pA', name: 'Alpha', color: 'blue', archived: false, known: true },
      { id: 'pX', name: 'Archiv', color: 'red', archived: true, known: true },
      { id: 'pB', name: 'Beta', color: 'green', archived: false, known: true },
    ]);
  });

  it('appends an unknown current project at the end', () => {
    expect(projectPickerOptions([activeB, activeA], 'ghost')).toEqual([
      { id: 'pA', name: 'Alpha', color: 'blue', archived: false, known: true },
      { id: 'pB', name: 'Beta', color: 'green', archived: false, known: true },
      { id: 'ghost', name: '', color: 'gray', archived: false, known: false },
    ]);
  });
});

describe('isSelectableProject', () => {
  const active = project({ id: 'pA' });
  const archived = project({ id: 'pX', name: 'Archiv', archived: true });
  const projects = [active, archived];

  it('allows no project', () => {
    expect(isSelectableProject(undefined, projects, undefined)).toBe(true);
  });

  it('allows an active project', () => {
    expect(isSelectableProject('pA', projects, undefined)).toBe(true);
  });

  it('rejects an archived project that is not the current one', () => {
    expect(isSelectableProject('pX', projects, undefined)).toBe(false);
    expect(isSelectableProject('pX', projects, 'pA')).toBe(false);
  });

  it('allows the archived current project', () => {
    expect(isSelectableProject('pX', projects, 'pX')).toBe(true);
  });

  it('rejects a missing id', () => {
    expect(isSelectableProject('ghost', projects, undefined)).toBe(false);
  });
});

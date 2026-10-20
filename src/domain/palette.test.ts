import { describe, expect, it } from 'vitest';
import { PROJECT_COLOR_LABELS, PROJECT_COLORS, defaultProjectColor, isProjectColor, type ProjectColor } from './palette';
import type { Project } from './types';

function project(id: string, color: ProjectColor, archived = false): Project {
  return { id, name: id, color, archived, createdAt: 0, updatedAt: 0 };
}

describe('palette', () => {
  it('has the eight keys in order with German labels', () => {
    expect(PROJECT_COLORS).toEqual(['blue', 'green', 'orange', 'red', 'purple', 'teal', 'yellow', 'gray']);
    expect(PROJECT_COLORS.map((c) => PROJECT_COLOR_LABELS[c])).toEqual([
      'Blau',
      'Grün',
      'Orange',
      'Rot',
      'Lila',
      'Türkis',
      'Gelb',
      'Grau',
    ]);
  });

  it('recognizes palette keys only', () => {
    expect(isProjectColor('blue')).toBe(true);
    expect(isProjectColor('gray')).toBe(true);
    expect(isProjectColor('pink')).toBe(false);
    expect(isProjectColor('Blue')).toBe(false);
    expect(isProjectColor(undefined)).toBe(false);
    expect(isProjectColor(3)).toBe(false);
  });
});

describe('defaultProjectColor', () => {
  it('is blue without projects', () => {
    expect(defaultProjectColor([])).toBe('blue');
  });

  it('is the first key not used by an active project', () => {
    expect(defaultProjectColor([project('a', 'blue'), project('b', 'green')])).toBe('orange');
  });

  it('treats a key used only by an archived project as unused', () => {
    expect(defaultProjectColor([project('a', 'blue', true), project('b', 'green')])).toBe('blue');
  });

  it('is blue when all eight keys are used by active projects', () => {
    expect(defaultProjectColor(PROJECT_COLORS.map((c) => project(c, c)))).toBe('blue');
  });
});

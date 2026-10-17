import { describe, expect, it } from 'vitest';
import * as messages from '../views/projectMessages';
import { ARCHIVED_SUFFIX, NONE_GROUP_LABEL, UNKNOWN_PROJECT_LABEL, projectGroupLabel } from './projectLabels';
import type { Project } from './types';

function project(archived: boolean): Project {
  return { id: 'pA', name: 'Kunde A', color: 'blue', archived, createdAt: 0, updatedAt: 0 };
}

describe('project labels', () => {
  it('have the exact German values', () => {
    expect(NONE_GROUP_LABEL).toBe('Ohne Projekt');
    expect(UNKNOWN_PROJECT_LABEL).toBe('Unbekanntes Projekt');
    expect(ARCHIVED_SUFFIX).toBe(' (archiviert)');
  });

  it('are re-exported unchanged from projectMessages', () => {
    expect(messages.NONE_GROUP_LABEL).toBe(NONE_GROUP_LABEL);
    expect(messages.UNKNOWN_PROJECT_LABEL).toBe(UNKNOWN_PROJECT_LABEL);
    expect(messages.ARCHIVED_SUFFIX).toBe(ARCHIVED_SUFFIX);
  });
});

describe('projectGroupLabel', () => {
  it('labels each kind of group', () => {
    expect(projectGroupLabel({ kind: 'project', project: project(false), workMs: 1 })).toBe('Kunde A');
    expect(projectGroupLabel({ kind: 'project', project: project(true), workMs: 1 })).toBe('Kunde A (archiviert)');
    expect(projectGroupLabel({ kind: 'none', workMs: 1 })).toBe('Ohne Projekt');
    expect(projectGroupLabel({ kind: 'unknown', workMs: 1 })).toBe('Unbekanntes Projekt');
  });
});

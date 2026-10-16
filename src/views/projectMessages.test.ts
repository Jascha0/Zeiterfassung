import { describe, expect, it } from 'vitest';
import {
  projectDisplayName,
  projectNameErrorMessage,
  projectOptionLabel,
} from './projectMessages';

describe('projectNameErrorMessage', () => {
  it('maps the three name reasons', () => {
    expect(projectNameErrorMessage('empty')).toBe('Bitte gib einen Projektnamen ein.');
    expect(projectNameErrorMessage('tooLong')).toBe('Der Projektname darf höchstens 40 Zeichen lang sein.');
    expect(projectNameErrorMessage('duplicate')).toBe('Es gibt bereits ein Projekt mit diesem Namen.');
  });
});

describe('projectDisplayName', () => {
  it('handles active, archived and unknown projects', () => {
    const base = { id: 'p', name: 'Kunde A', color: 'blue' as const, createdAt: 0, updatedAt: 0 };
    expect(projectDisplayName({ ...base, archived: false })).toBe('Kunde A');
    expect(projectDisplayName({ ...base, archived: true })).toBe('Kunde A (archiviert)');
    expect(projectDisplayName(undefined)).toBe('Unbekanntes Projekt');
  });
});

describe('projectOptionLabel', () => {
  it('labels known, archived and unknown options', () => {
    expect(projectOptionLabel({ id: 'a', name: 'Kunde A', color: 'blue', archived: false, known: true })).toBe(
      'Kunde A · Blau',
    );
    expect(projectOptionLabel({ id: 'a', name: 'Kunde A', color: 'gray', archived: true, known: true })).toBe(
      'Kunde A (archiviert) · Grau',
    );
    expect(projectOptionLabel({ id: 'x', name: '', color: 'gray', archived: false, known: false })).toBe(
      'Unbekanntes Projekt',
    );
  });
});

import { PROJECT_COLOR_LABELS } from '../domain/palette';
import type { ProjectOption } from '../domain/projects';
import type { Project } from '../domain/types';

export const NO_PROJECT_LABEL = 'Kein Projekt';
export const NONE_GROUP_LABEL = 'Ohne Projekt';
export const UNKNOWN_PROJECT_LABEL = 'Unbekanntes Projekt';
export const ARCHIVED_SUFFIX = ' (archiviert)';
export const NOTE_TOO_LONG_MESSAGE = 'Die Notiz darf höchstens 500 Zeichen lang sein.';
export const PROJECT_UNAVAILABLE_MESSAGE = 'Das gewählte Projekt ist nicht mehr verfügbar.';
export const BREAK_REMOVES_LABELS_NOTICE = 'Beim Speichern als Pause werden Projekt und Notiz entfernt.';
export const NO_PROJECTS_MESSAGE = 'Noch keine Projekte.';

export function projectNameErrorMessage(reason: 'empty' | 'tooLong' | 'duplicate'): string {
  switch (reason) {
    case 'empty':
      return 'Bitte gib einen Projektnamen ein.';
    case 'tooLong':
      return 'Der Projektname darf höchstens 40 Zeichen lang sein.';
    case 'duplicate':
      return 'Es gibt bereits ein Projekt mit diesem Namen.';
  }
}

export function projectDisplayName(project: Project | undefined): string {
  if (project === undefined) return UNKNOWN_PROJECT_LABEL;
  return project.archived ? `${project.name}${ARCHIVED_SUFFIX}` : project.name;
}

export function projectOptionLabel(option: ProjectOption): string {
  if (!option.known) return UNKNOWN_PROJECT_LABEL;
  return `${option.name}${option.archived ? ARCHIVED_SUFFIX : ''} · ${PROJECT_COLOR_LABELS[option.color]}`;
}

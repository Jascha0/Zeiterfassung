import type { ProjectTotal } from './projectTotals';

export const NONE_GROUP_LABEL = 'Ohne Projekt';
export const UNKNOWN_PROJECT_LABEL = 'Unbekanntes Projekt';
export const ARCHIVED_SUFFIX = ' (archiviert)';

/** 'project' → name (+ ARCHIVED_SUFFIX if archived); 'none' → NONE_GROUP_LABEL; 'unknown' → UNKNOWN_PROJECT_LABEL. */
export function projectGroupLabel(total: ProjectTotal): string {
  switch (total.kind) {
    case 'project':
      return total.project.archived ? `${total.project.name}${ARCHIVED_SUFFIX}` : total.project.name;
    case 'none':
      return NONE_GROUP_LABEL;
    case 'unknown':
      return UNKNOWN_PROJECT_LABEL;
  }
}

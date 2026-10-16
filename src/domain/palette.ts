import type { Project } from './types';

export const PROJECT_COLORS = ['blue', 'green', 'orange', 'red', 'purple', 'teal', 'yellow', 'gray'] as const;
export type ProjectColor = (typeof PROJECT_COLORS)[number];
export const PROJECT_COLOR_LABELS: Readonly<Record<ProjectColor, string>> = {
  blue: 'Blau',
  green: 'Grün',
  orange: 'Orange',
  red: 'Rot',
  purple: 'Lila',
  teal: 'Türkis',
  yellow: 'Gelb',
  gray: 'Grau',
};

export function isProjectColor(value: unknown): value is ProjectColor {
  return typeof value === 'string' && (PROJECT_COLORS as readonly string[]).includes(value);
}

/** First key of PROJECT_COLORS not used by a non-archived project; 'blue' if all are used. */
export function defaultProjectColor(projects: readonly Project[]): ProjectColor {
  const used = new Set(projects.filter((p) => !p.archived).map((p) => p.color));
  return PROJECT_COLORS.find((color) => !used.has(color)) ?? 'blue';
}

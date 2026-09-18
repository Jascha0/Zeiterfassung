export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'zeiterfassung.theme';

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function readLocalTheme(storage: Pick<Storage, 'getItem'>): ThemePreference {
  try {
    const value = storage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(value) ? value : 'system';
  } catch {
    return 'system';
  }
}

export function writeLocalTheme(storage: Pick<Storage, 'setItem'>, pref: ThemePreference): void {
  try {
    storage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // Private mode or quota: the remote preference still persists the choice.
  }
}

export function resolveTheme(pref: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (pref === 'system') return systemPrefersDark ? 'dark' : 'light';
  return pref;
}

export function applyTheme(resolved: ResolvedTheme, root: HTMLElement): void {
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
}

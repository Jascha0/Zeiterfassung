import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useServices } from '../app/ServicesContext';
import { useToast } from '../app/ToastContext';
import { mapWriteError } from '../data/writeErrors';
import {
  applyTheme,
  readLocalTheme,
  resolveTheme,
  writeLocalTheme,
  type ResolvedTheme,
  type ThemePreference,
} from './theme';

export interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference(pref: ThemePreference): void;
}

const DARK_QUERY = '(prefers-color-scheme: dark)';

const ThemeContext = createContext<ThemeContextValue | null>(null);

const unavailableStorage: Pick<Storage, 'getItem' | 'setItem'> = {
  getItem: () => null,
  setItem: () => undefined,
};

function localStore(): Pick<Storage, 'getItem' | 'setItem'> {
  try {
    return window.localStorage ?? unavailableStorage;
  } catch {
    return unavailableStorage;
  }
}

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY).matches : false;
}

export function ThemeProvider(props: { children: React.ReactNode }): React.JSX.Element {
  const { settings } = useServices();
  const { showToast } = useToast();
  const [preference, setPreferenceState] = useState<ThemePreference>(() => readLocalTheme(localStore()));
  const [prefersDark, setPrefersDark] = useState<boolean>(systemPrefersDark);

  const preferenceRef = useRef(preference);
  preferenceRef.current = preference;
  const resolved = resolveTheme(preference, prefersDark);

  useEffect(() => {
    applyTheme(resolved, document.documentElement);
  }, [resolved]);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(DARK_QUERY);
    const onChange = (event: MediaQueryListEvent) => setPrefersDark(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    return settings.subscribePreferences(
      (prefs) => {
        if (prefs === null || prefs.theme === preferenceRef.current) return;
        preferenceRef.current = prefs.theme;
        setPreferenceState(prefs.theme);
        writeLocalTheme(localStore(), prefs.theme);
        applyTheme(resolveTheme(prefs.theme, systemPrefersDark()), document.documentElement);
      },
      (error) => console.warn('Design-Einstellung konnte nicht geladen werden', error),
    );
  }, [settings]);

  const setPreference = useCallback(
    (pref: ThemePreference) => {
      preferenceRef.current = pref;
      setPreferenceState(pref);
      writeLocalTheme(localStore(), pref);
      applyTheme(resolveTheme(pref, systemPrefersDark()), document.documentElement);
      settings.savePreferences({ theme: pref }).catch((error: unknown) => showToast(mapWriteError(error)));
    },
    [settings, showToast],
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return <ThemeContext.Provider value={value}>{props.children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (value === null) throw new Error('useTheme must be used within ThemeProvider');
  return value;
}

import { useId } from 'react';
import type { ThemePreference } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';

const THEME_OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string }> = [
  { value: 'light', label: 'Hell' },
  { value: 'dark', label: 'Dunkel' },
  { value: 'system', label: 'System' },
];

const LOCAL_DATA_NOTICE =
  'Alle Daten liegen nur in diesem Browser auf diesem Gerät. Wenn du die Browserdaten löschst, sind sie weg. Eine Sicherung als Datei folgt im nächsten Schritt.';

export function SettingsView(): React.JSX.Element {
  const { preference, setPreference } = useTheme();
  const fieldId = useId();

  return (
    <main className="page">
      <section className="card">
        <h2>Einstellungen</h2>
        <fieldset className="theme-options">
          <legend>Design</legend>
          {THEME_OPTIONS.map((option) => (
            <label key={option.value} className="radio">
              <input
                type="radio"
                name={`${fieldId}-theme`}
                value={option.value}
                checked={preference === option.value}
                onChange={() => setPreference(option.value)}
              />
              {option.label}
            </label>
          ))}
        </fieldset>
        <p>{LOCAL_DATA_NOTICE}</p>
      </section>
    </main>
  );
}

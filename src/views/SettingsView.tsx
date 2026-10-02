import { useId, useRef, useState } from 'react';
import { useServices } from '../app/ServicesContext';
import { useToast } from '../app/ToastContext';
import { backupFileName, serializeBackup } from '../data/backupFile';
import type { ThemePreference } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';

const THEME_OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string }> = [
  { value: 'light', label: 'Hell' },
  { value: 'dark', label: 'Dunkel' },
  { value: 'system', label: 'System' },
];

const LOCAL_DATA_NOTICE =
  'Alle Daten liegen nur in diesem Browser auf diesem Gerät. Wenn du die Browserdaten löschst, sind sie weg. Lade dir deshalb regelmäßig eine Sicherung herunter.';
const BACKUP_HEADING = 'Sicherung';
const BACKUP_EXPLANATION =
  'Die Sicherung enthält alle Einträge und Einstellungen in einer Datei. Sie ist nicht verschlüsselt – bewahre sie an einem Ort auf, an den nur du herankommst.';
const IMPORT_HINT = 'Schließe vor dem Einlesen andere Tabs dieser App.';
const EXPORT_LABEL = 'Sicherung herunterladen';
const IMPORT_LABEL = 'Sicherung einlesen';
const NOT_LOADED = 'Die Daten sind nicht geladen. Es wurde keine Sicherung erstellt.';
const EXPORT_FAILED = 'Die Sicherung konnte nicht erstellt werden.';

function exportedMessage(fileName: string): string {
  return `Sicherung erstellt: ${fileName}`;
}

export function SettingsView(): React.JSX.Element {
  const { preference, setPreference } = useTheme();
  const { backup, files } = useServices();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const fieldId = useId();

  const handleExport = (): void => {
    if (busyRef.current) return;
    const snapshot = backup.readAll();
    if (snapshot === null) {
      showToast(NOT_LOADED);
      return;
    }
    const now = Date.now();
    const fileName = backupFileName(now);
    busyRef.current = true;
    setBusy(true);
    files
      .writeTextFile(fileName, serializeBackup(snapshot, now))
      .then(
        () => showToast(exportedMessage(fileName)),
        () => showToast(EXPORT_FAILED),
      )
      .finally(() => {
        busyRef.current = false;
        setBusy(false);
      });
  };

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
      <section className="card">
        <h3>{BACKUP_HEADING}</h3>
        <p>{BACKUP_EXPLANATION}</p>
        <div className="button-row">
          <button type="button" className="button-primary" disabled={busy} onClick={handleExport}>
            {EXPORT_LABEL}
          </button>
        </div>
        <div className="field">
          <label htmlFor={`${fieldId}-import`}>{IMPORT_LABEL}</label>
          <input id={`${fieldId}-import`} type="file" accept="application/json" disabled={busy} />
          <p>{IMPORT_HINT}</p>
        </div>
      </section>
    </main>
  );
}

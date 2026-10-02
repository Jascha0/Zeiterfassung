import { useId, useRef, useState } from 'react';
import { useServices } from '../app/ServicesContext';
import { useToast } from '../app/ToastContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import {
  backupFileName,
  parseBackup,
  preImportFileName,
  serializeBackup,
  type BackupContent,
} from '../data/backupFile';
import { STORE_FORMAT_VERSION, type StoredData } from '../data/persistence';
import { formatClock, formatShortDate } from '../domain/format';
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
const INVALID_FILE = 'Die Datei ist keine gültige Sicherung.';
const DIALOG_TITLE = 'Alle Daten ersetzen?';
const CONFIRM_LABEL = 'Ersetzen';
const CANCEL_LABEL = 'Abbrechen';
const NO_UNDO_LINE = 'Das kann nicht rückgängig gemacht werden.';
const PRE_IMPORT_LINE = 'Vorher wird automatisch eine Sicherung der aktuellen Daten heruntergeladen.';
const PRE_IMPORT_FAILED = 'Die Sicherung der aktuellen Daten ist fehlgeschlagen. Es wurde nichts ersetzt.';
const REPLACE_FAILED = 'Die Daten konnten nicht ersetzt werden. Es wurde nichts geändert.';

interface PendingImport {
  fileName: string;
  content: BackupContent;
  /** From the guarded read at file-pick time — never from a subscription (requirement 10). */
  currentCount: number;
  /** No entries and no preferences: nothing to lose, so line 6 is omitted and no pre-import file is written. */
  currentIsEmpty: boolean;
}

function exportedMessage(fileName: string): string {
  return `Sicherung erstellt: ${fileName}`;
}

function wrongVersionMessage(fileVersion: number): string {
  return `Diese Sicherung hat das Format ${fileVersion}. Diese App kann nur Format ${STORE_FORMAT_VERSION} lesen.`;
}

function importedMessage(count: number): string {
  return `${count} Einträge wurden eingelesen.`;
}

function dialogLines(pending: PendingImport): string[] {
  const lines = [
    `Datei: ${pending.fileName}`,
    `Erstellt am: ${formatShortDate(pending.content.exportedAt)}, ${formatClock(pending.content.exportedAt)}`,
    `Einträge in der Datei: ${pending.content.entries.length}`,
    `Einträge in dieser App: ${pending.currentCount} – sie werden gelöscht.`,
    NO_UNDO_LINE,
  ];
  if (!pending.currentIsEmpty) lines.push(PRE_IMPORT_LINE);
  return lines;
}

export function SettingsView(): React.JSX.Element {
  const { preference, setPreference } = useTheme();
  const { backup, files } = useServices();
  const { showToast } = useToast();
  const [pending, setPending] = useState<PendingImport | null>(null);
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

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const input = event.currentTarget;
    const selected = input.files;
    const file = selected !== null && selected.length > 0 ? selected[0] : null;
    input.value = ''; // so the same file can be picked again after Abbrechen (requirement 4)
    if (file === null || busyRef.current) return;
    const fileName = file.name;
    void file.text().then(
      (text) => {
        const result = parseBackup(text);
        if (!result.ok) {
          showToast(result.reason === 'wrong-version' ? wrongVersionMessage(result.fileVersion) : INVALID_FILE);
          return;
        }
        const snapshot = backup.readAll();
        if (snapshot === null) {
          showToast(NOT_LOADED);
          return;
        }
        setPending({
          fileName,
          content: result.content,
          currentCount: snapshot.entries.length,
          currentIsEmpty: snapshot.entries.length === 0 && snapshot.preferences === null,
        });
      },
      () => showToast(INVALID_FILE),
    );
  };

  const runImport = async (pendingImport: PendingImport, snapshot: StoredData): Promise<void> => {
    const nothingToLose = snapshot.entries.length === 0 && snapshot.preferences === null;
    if (!nothingToLose) {
      const now = Date.now();
      try {
        await files.writeTextFile(preImportFileName(now), serializeBackup(snapshot, now));
      } catch {
        showToast(PRE_IMPORT_FAILED);
        return;
      }
    }
    try {
      await backup.replaceAll({
        entries: pendingImport.content.entries,
        preferences: pendingImport.content.preferences,
      });
    } catch {
      showToast(REPLACE_FAILED);
      return;
    }
    showToast(importedMessage(pendingImport.content.entries.length));
  };

  const handleConfirm = (): void => {
    if (busyRef.current || pending === null) return;
    const snapshot = backup.readAll();
    if (snapshot === null) {
      setPending(null);
      showToast(PRE_IMPORT_FAILED);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    void runImport(pending, snapshot).finally(() => {
      busyRef.current = false;
      setBusy(false);
      setPending(null);
    });
  };

  const handleCancel = (): void => {
    if (busyRef.current) return;
    setPending(null);
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
          <input
            id={`${fieldId}-import`}
            type="file"
            accept="application/json"
            disabled={busy}
            onChange={handleFileChange}
          />
          <p>{IMPORT_HINT}</p>
        </div>
      </section>
      {pending !== null && (
        <ConfirmDialog
          title={DIALOG_TITLE}
          lines={dialogLines(pending)}
          confirmLabel={CONFIRM_LABEL}
          cancelLabel={CANCEL_LABEL}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </main>
  );
}

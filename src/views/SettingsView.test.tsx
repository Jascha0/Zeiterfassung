import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServicesProvider, type Services } from '../app/ServicesContext';
import { ToastProvider } from '../app/ToastContext';
import { parseBackup } from '../data/backupFile';
import { noopChannelFactory } from '../data/channel';
import { InMemoryAdapter } from '../data/inMemoryAdapter';
import { createLocalStore, type LocalStore } from '../data/localStore';
import { STORE_FORMAT_VERSION, type BackupData } from '../data/persistence';
import type { Entry } from '../domain/types';
import { createTestStore, type TestStoreSeed } from '../test/createTestStore';
import { servicesOf } from '../test/testServices';
import { ThemeProvider } from '../theme/ThemeContext';
import { SettingsView } from './SettingsView';

const NOTICE =
  'Alle Daten liegen nur in diesem Browser auf diesem Gerät. Wenn du die Browserdaten löschst, sind sie weg. Lade dir deshalb regelmäßig eine Sicherung herunter.';
const BACKUP_EXPLANATION =
  'Die Sicherung enthält alle Einträge und Einstellungen in einer Datei. Sie ist nicht verschlüsselt – bewahre sie an einem Ort auf, an den nur du herankommst.';
const IMPORT_HINT = 'Schließe vor dem Einlesen andere Tabs dieser App.';
const EXPORT_LABEL = 'Sicherung herunterladen';
const IMPORT_LABEL = 'Sicherung einlesen';
const NOT_LOADED = 'Die Daten sind nicht geladen. Es wurde keine Sicherung erstellt.';
const EXPORT_FAILED = 'Die Sicherung konnte nicht erstellt werden.';

const HOUR_MS = 60 * 60 * 1000;

const INVALID_FILE = 'Die Datei ist keine gültige Sicherung.';
const DIALOG_TITLE = 'Alle Daten ersetzen?';
const CONFIRM_LABEL = 'Ersetzen';
const CANCEL_LABEL = 'Abbrechen';
const NO_UNDO_LINE = 'Das kann nicht rückgängig gemacht werden.';
const PRE_IMPORT_LINE = 'Vorher wird automatisch eine Sicherung der aktuellen Daten heruntergeladen.';
const PRE_IMPORT_FAILED = 'Die Sicherung der aktuellen Daten ist fehlgeschlagen. Es wurde nichts ersetzt.';
const REPLACE_FAILED = 'Die Daten konnten nicht ersetzt werden. Es wurde nichts geändert.';

function backupFile(name: string, body: unknown): File {
  return new File([JSON.stringify(body)], name, { type: 'application/json' });
}

// A file's exportedAt is content, not behaviour, so it stays a literal.
const FILE_EXPORTED_AT = new Date(2026, 0, 2, 3, 4).getTime();

const FILE_ENTRY_A: Entry = {
  id: 'file-a',
  type: 'work',
  start: new Date(2026, 0, 1, 8, 0).getTime(),
  end: new Date(2026, 0, 1, 12, 0).getTime(),
  createdAt: new Date(2026, 0, 1, 8, 0).getTime(),
  updatedAt: new Date(2026, 0, 1, 12, 0).getTime(),
};

const FILE_ENTRY_B: Entry = {
  id: 'file-b',
  type: 'break',
  start: new Date(2026, 0, 1, 12, 0).getTime(),
  end: new Date(2026, 0, 1, 12, 30).getTime(),
  createdAt: new Date(2026, 0, 1, 12, 0).getTime(),
  updatedAt: new Date(2026, 0, 1, 12, 30).getTime(),
};

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    app: 'zeiterfassung',
    formatVersion: STORE_FORMAT_VERSION,
    exportedAt: FILE_EXPORTED_AT,
    entries: [FILE_ENTRY_A, FILE_ENTRY_B],
    preferences: null,
    ...overrides,
  };
}

/** Three entries plus a theme: what the user would lose. Behavioural dates derive from the clock. */
function seededEntries(): Entry[] {
  const now = Date.now();
  return [
    {
      id: 'seed-1',
      type: 'work',
      start: now - 9 * HOUR_MS,
      end: now - 8 * HOUR_MS,
      createdAt: now - 9 * HOUR_MS,
      updatedAt: now - 8 * HOUR_MS,
    },
    {
      id: 'seed-2',
      type: 'break',
      start: now - 8 * HOUR_MS,
      end: now - 7 * HOUR_MS,
      createdAt: now - 8 * HOUR_MS,
      updatedAt: now - 7 * HOUR_MS,
    },
    {
      id: 'seed-3',
      type: 'work',
      start: now - 7 * HOUR_MS,
      end: null,
      createdAt: now - 7 * HOUR_MS,
      updatedAt: now - 7 * HOUR_MS,
    },
  ];
}

function recordingWriter(written: Array<{ name: string; text: string }>): Partial<Services> {
  return {
    files: {
      writeTextFile: (name: string, text: string) => {
        written.push({ name, text });
        return Promise.resolve();
      },
    },
  };
}

function dialogParagraphs(): Array<string | null> {
  return Array.from(screen.getByRole('dialog').querySelectorAll('p')).map((paragraph) => paragraph.textContent);
}

/** Everything a settled import could still have queued on the store's persist chain has run by now. */
async function drainPersistChain(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });
}


function renderTree(services: Services): void {
  render(
    <ServicesProvider services={services}>
      <ToastProvider>
        <ThemeProvider>
          <SettingsView />
        </ThemeProvider>
      </ToastProvider>
    </ServicesProvider>,
  );
}

function renderSettings(seed: TestStoreSeed = {}, overrides: Partial<Services> = {}) {
  const { store, adapter } = createTestStore(seed);
  renderTree(servicesOf(store, overrides));
  return { store, adapter };
}

/** For the hand-built stores whose initial load fails or never settles. */
function renderSettingsWith(store: LocalStore, overrides: Partial<Services> = {}): void {
  renderTree(servicesOf(store, overrides));
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('SettingsView: content (B10)', () => {
  it('contains exactly the theme choice and the local-data notice', () => {
    renderSettings();
    expect(screen.getByRole('heading', { name: 'Einstellungen' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Design' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Hell' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Dunkel' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'System' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByText(NOTICE)).toBeInTheDocument();
    // Nothing from the deleted account view survives.
    expect(screen.queryByText('Anmeldemethoden')).not.toBeInTheDocument();
  });

  it('shows the Sicherung section after the theme choice and the notice (C1)', () => {
    renderSettings();
    expect(screen.getByRole('heading', { name: 'Sicherung' })).toBeInTheDocument();
    expect(screen.getByText(BACKUP_EXPLANATION)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: EXPORT_LABEL })).toBeInTheDocument();
    const fileInput = screen.getByLabelText(IMPORT_LABEL);
    expect(fileInput).toHaveProperty('type', 'file');
    expect(screen.getByText(IMPORT_HINT)).toBeInTheDocument();

    const text = screen.getByRole('main').textContent ?? '';
    expect(text.indexOf('Design')).toBeLessThan(text.indexOf(NOTICE));
    expect(text.indexOf(NOTICE)).toBeLessThan(text.indexOf('Die Sicherung enthält'));
  });
});

describe('SettingsView: export (C2)', () => {
  it('hands the seam a complete, parseable backup and reports the file name', async () => {
    const uiUser = userEvent.setup();
    const now = Date.now();
    const openWork: Entry = {
      id: 'e-open',
      type: 'work',
      start: now - 2 * HOUR_MS,
      end: null,
      createdAt: now - 2 * HOUR_MS,
      updatedAt: now - 2 * HOUR_MS,
    };
    const breakEntry: Entry = {
      id: 'e-break',
      type: 'break',
      start: now - 5 * HOUR_MS,
      end: now - 4 * HOUR_MS,
      createdAt: now - 5 * HOUR_MS,
      updatedAt: now - 4 * HOUR_MS,
    };
    const closedWorkWithExtras: Entry = {
      id: 'e-extras',
      type: 'work',
      start: now - 9 * HOUR_MS,
      end: now - 6 * HOUR_MS,
      projectId: 'p1',
      note: 'Kunde A',
      createdAt: now - 9 * HOUR_MS,
      updatedAt: now - 6 * HOUR_MS,
    };
    const written: Array<{ name: string; text: string }> = [];

    renderSettings(
      { entries: [openWork, breakEntry, closedWorkWithExtras], preferences: { theme: 'dark' } },
      {
        files: {
          writeTextFile: (name: string, text: string) => {
            written.push({ name, text });
            return Promise.resolve();
          },
        },
      },
    );

    await uiUser.click(screen.getByRole('button', { name: EXPORT_LABEL }));

    await waitFor(() => expect(written).toHaveLength(1));
    const file = written[0];
    expect(file.name).toMatch(/^zeiterfassung-sicherung-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);

    const parsed = parseBackup(file.text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('the written text does not parse as a backup');
    // readAll hands out entries sorted by start ascending.
    expect(parsed.content.entries).toEqual([closedWorkWithExtras, breakEntry, openWork]);
    expect(parsed.content.preferences).toEqual({ theme: 'dark' });

    const record = JSON.parse(file.text) as { formatVersion: unknown; exportedAt: unknown };
    expect(record.formatVersion).toBe(STORE_FORMAT_VERSION);
    expect(Number.isFinite(record.exportedAt)).toBe(true);

    expect(await screen.findByText(`Sicherung erstellt: ${file.name}`)).toBeInTheDocument();
  });
});

describe('SettingsView: the export refuses unless the data are loaded (C3)', () => {
  it('writes nothing after a failed initial load', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const uiUser = userEvent.setup();
    const writeTextFile = vi.fn((_name: string, _text: string) => Promise.resolve());
    const adapter = new InMemoryAdapter();
    adapter.failNextLoad(new Error('boom'));
    const store = createLocalStore({ adapter, navigator: null, channelFactory: noopChannelFactory });
    await store.whenReady();

    renderSettingsWith(store, { files: { writeTextFile } });
    await uiUser.click(screen.getByRole('button', { name: EXPORT_LABEL }));

    expect(writeTextFile).not.toHaveBeenCalled();
    expect(await screen.findByText(NOT_LOADED)).toBeInTheDocument();
  });

  // The held load never settles, so this case must not await whenReady() anywhere.
  it('writes nothing while the initial load is still running', async () => {
    const uiUser = userEvent.setup();
    const writeTextFile = vi.fn((_name: string, _text: string) => Promise.resolve());
    const adapter = new InMemoryAdapter();
    adapter.holdNextLoad();
    const store = createLocalStore({ adapter, navigator: null, channelFactory: noopChannelFactory });

    renderSettingsWith(store, { files: { writeTextFile } });
    await uiUser.click(screen.getByRole('button', { name: EXPORT_LABEL }));

    expect(writeTextFile).not.toHaveBeenCalled();
    expect(await screen.findByText(NOT_LOADED)).toBeInTheDocument();
  });
});

describe('SettingsView: a failing write seam (C4)', () => {
  it('reports the failure and leaves the button usable', async () => {
    const uiUser = userEvent.setup();
    renderSettings({}, { files: { writeTextFile: () => Promise.reject(new Error('kaputt')) } });

    const button = screen.getByRole('button', { name: EXPORT_LABEL });
    await uiUser.click(button);

    expect(await screen.findByText(EXPORT_FAILED)).toBeInTheDocument();
    await waitFor(() => expect(button).toBeEnabled());
  });
});

describe('SettingsView: theme', () => {
  it('reflects and changes the theme preference via radio buttons', async () => {
    const uiUser = userEvent.setup();
    const { store } = renderSettings();
    const dark = screen.getByRole('radio', { name: 'Dunkel' });
    expect(dark).not.toBeChecked();
    await uiUser.click(dark);
    expect(dark).toBeChecked();
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
    // The choice is persisted through the store, not only reflected in the DOM.
    await waitFor(() => expect(store.getPreferences()).toEqual({ theme: 'dark' }));
  });

  it('keeps "System" following the OS setting', async () => {
    const uiUser = userEvent.setup();
    vi.stubGlobal(
      'matchMedia',
      () =>
        ({
          matches: true,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        }) as unknown as MediaQueryList,
    );

    renderSettings();
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));

    await uiUser.click(screen.getByRole('radio', { name: 'Hell' }));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'));

    await uiUser.click(screen.getByRole('radio', { name: 'System' }));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
  });
});

describe('SettingsView: the import refuses an unusable file (C5, C6)', () => {
  it('reports an invalid file, opens no dialog and changes nothing', async () => {
    const uiUser = userEvent.setup();
    const written: Array<{ name: string; text: string }> = [];
    const { store, adapter } = renderSettings(
      { entries: seededEntries(), preferences: { theme: 'light' } },
      recordingWriter(written),
    );
    await waitFor(() => expect(store.readAll()).not.toBeNull());
    const before = adapter.storedEntries();

    // The accept filter of userEvent.upload drops a File without the matching MIME type.
    const notJson = new File(['kein json'], 'x.json', { type: 'application/json' });
    await uiUser.upload(screen.getByLabelText(IMPORT_LABEL), notJson);

    expect(await screen.findByText(INVALID_FILE)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(written).toHaveLength(0);
    expect(adapter.storedEntries()).toEqual(before);
  });

  it('names both format numbers when the file has another format version', async () => {
    const uiUser = userEvent.setup();
    const written: Array<{ name: string; text: string }> = [];
    const { store, adapter } = renderSettings(
      { entries: seededEntries(), preferences: { theme: 'light' } },
      recordingWriter(written),
    );
    await waitFor(() => expect(store.readAll()).not.toBeNull());
    const before = adapter.storedEntries();

    await uiUser.upload(
      screen.getByLabelText(IMPORT_LABEL),
      backupFile('sicherung.json', validBody({ formatVersion: 2 })),
    );

    expect(
      await screen.findByText(
        `Diese Sicherung hat das Format 2. Diese App kann nur Format ${STORE_FORMAT_VERSION} lesen.`,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(written).toHaveLength(0);
    expect(adapter.storedEntries()).toEqual(before);
  });

  it('refuses a file whose preferences are present but unreadable', async () => {
    const uiUser = userEvent.setup();
    const written: Array<{ name: string; text: string }> = [];
    const { store, adapter } = renderSettings(
      { entries: seededEntries(), preferences: { theme: 'light' } },
      recordingWriter(written),
    );
    await waitFor(() => expect(store.readAll()).not.toBeNull());
    const before = adapter.storedEntries();

    await uiUser.upload(
      screen.getByLabelText(IMPORT_LABEL),
      backupFile('sicherung.json', validBody({ preferences: { theme: 'purple' } })),
    );

    expect(await screen.findByText(INVALID_FILE)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(written).toHaveLength(0);
    expect(adapter.storedEntries()).toEqual(before);
    expect(adapter.storedPreferences()).toEqual({ theme: 'light' });
  });
});

describe('SettingsView: the confirmation dialog is the preview (C7)', () => {
  it('names the file, its date, both counts, the warning and the pre-import backup, in that order', async () => {
    const uiUser = userEvent.setup();
    const written: Array<{ name: string; text: string }> = [];
    const { store } = renderSettings({ entries: seededEntries() }, recordingWriter(written));
    await waitFor(() => expect(store.readAll()).not.toBeNull());

    await uiUser.upload(screen.getByLabelText(IMPORT_LABEL), backupFile('sicherung.json', validBody()));

    await screen.findByRole('dialog');
    expect(screen.getByRole('heading', { name: DIALOG_TITLE })).toBeInTheDocument();
    expect(dialogParagraphs()).toEqual([
      'Datei: sicherung.json',
      'Erstellt am: 02.01.2026, 03:04',
      'Einträge in der Datei: 2',
      'Einträge in dieser App: 3 – sie werden gelöscht.',
      NO_UNDO_LINE,
      PRE_IMPORT_LINE,
    ]);
    expect(screen.getByRole('button', { name: CONFIRM_LABEL })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: CANCEL_LABEL })).toBeInTheDocument();
    expect(written).toHaveLength(0);
  });

  it('changes nothing when the dialog is cancelled', async () => {
    const uiUser = userEvent.setup();
    const written: Array<{ name: string; text: string }> = [];
    const { store, adapter } = renderSettings({ entries: seededEntries() }, recordingWriter(written));
    await waitFor(() => expect(store.readAll()).not.toBeNull());
    const before = adapter.storedEntries();

    await uiUser.upload(screen.getByLabelText(IMPORT_LABEL), backupFile('sicherung.json', validBody()));
    await screen.findByRole('dialog');
    await uiUser.click(screen.getByRole('button', { name: CANCEL_LABEL }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(written).toHaveLength(0);
    expect(adapter.storedEntries()).toEqual(before);
    expect(adapter.replaceAllCount).toBe(0);
  });

  it('changes nothing when Escape closes the dialog (edge case 25)', async () => {
    const uiUser = userEvent.setup();
    const written: Array<{ name: string; text: string }> = [];
    const { store, adapter } = renderSettings({ entries: seededEntries() }, recordingWriter(written));
    await waitFor(() => expect(store.readAll()).not.toBeNull());
    const before = adapter.storedEntries();

    await uiUser.upload(screen.getByLabelText(IMPORT_LABEL), backupFile('sicherung.json', validBody()));
    await screen.findByRole('dialog');
    await uiUser.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(written).toHaveLength(0);
    expect(adapter.storedEntries()).toEqual(before);
    expect(adapter.replaceAllCount).toBe(0);
  });
});

describe('SettingsView: an empty store has nothing to lose (requirement 7 skip clause)', () => {
  it('omits the pre-import line, writes no pre-import file and still imports', async () => {
    const uiUser = userEvent.setup();
    const written: Array<{ name: string; text: string }> = [];
    const { store, adapter } = renderSettings({}, recordingWriter(written));
    await waitFor(() => expect(store.readAll()).not.toBeNull());

    await uiUser.upload(screen.getByLabelText(IMPORT_LABEL), backupFile('sicherung.json', validBody()));

    await screen.findByRole('dialog');
    const lines = dialogParagraphs();
    expect(lines).toContain('Einträge in dieser App: 0 – sie werden gelöscht.');
    expect(lines).not.toContain(PRE_IMPORT_LINE);
    expect(lines).toHaveLength(5);

    await uiUser.click(screen.getByRole('button', { name: CONFIRM_LABEL }));

    expect(await screen.findByText('2 Einträge wurden eingelesen.')).toBeInTheDocument();
    expect(written).toHaveLength(0);
    expect(adapter.storedEntries()).toEqual([FILE_ENTRY_A, FILE_ENTRY_B]);
  });
});

describe('SettingsView: the file input itself (C8)', () => {
  it('does nothing at all when the file picker was cancelled', async () => {
    const written: Array<{ name: string; text: string }> = [];
    const { store, adapter } = renderSettings({ entries: seededEntries() }, recordingWriter(written));
    await waitFor(() => expect(store.readAll()).not.toBeNull());
    const before = adapter.storedEntries();

    fireEvent.change(screen.getByLabelText(IMPORT_LABEL), { target: { files: [] } });
    await drainPersistChain();

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('');
    expect(written).toHaveLength(0);
    expect(adapter.storedEntries()).toEqual(before);
  });

  it('accepts the same File object again after Abbrechen', async () => {
    const uiUser = userEvent.setup();
    const written: Array<{ name: string; text: string }> = [];
    const { store } = renderSettings({ entries: seededEntries() }, recordingWriter(written));
    await waitFor(() => expect(store.readAll()).not.toBeNull());
    const input = screen.getByLabelText(IMPORT_LABEL);
    const file = backupFile('sicherung.json', validBody());

    await uiUser.upload(input, file);
    await screen.findByRole('dialog');
    await uiUser.click(screen.getByRole('button', { name: CANCEL_LABEL }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await uiUser.upload(input, file);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(written).toHaveLength(0);
  });
});

describe('SettingsView: the pre-import backup comes first (C9)', () => {
  it('writes the previous data to a file before it calls replaceAll', async () => {
    const uiUser = userEvent.setup();
    const calls: string[] = [];
    const written: Array<{ name: string; text: string }> = [];
    const seeded = seededEntries();
    const { store, adapter } = createTestStore({ entries: seeded, preferences: { theme: 'light' } });
    renderTree(
      servicesOf(store, {
        files: {
          writeTextFile: (name: string, text: string) => {
            calls.push(`file:${name}`);
            written.push({ name, text });
            return Promise.resolve();
          },
        },
        backup: {
          readAll: () => store.readAll(),
          replaceAll: (data: BackupData) => {
            calls.push('replaceAll');
            return store.replaceAll(data);
          },
        },
      }),
    );
    await waitFor(() => expect(store.readAll()).not.toBeNull());

    await uiUser.upload(screen.getByLabelText(IMPORT_LABEL), backupFile('sicherung.json', validBody()));
    await screen.findByRole('dialog');
    await uiUser.click(screen.getByRole('button', { name: CONFIRM_LABEL }));

    expect(await screen.findByText('2 Einträge wurden eingelesen.')).toBeInTheDocument();
    expect(written).toHaveLength(1);
    expect(calls).toEqual([`file:${written[0].name}`, 'replaceAll']);
    expect(written[0].name).toMatch(/^zeiterfassung-vor-import-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);

    const parsed = parseBackup(written[0].text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('the pre-import text does not parse as a backup');
    // The file holds what was there BEFORE the import, not what the import brought.
    expect(parsed.content.entries).toEqual(seeded);
    expect(parsed.content.preferences).toEqual({ theme: 'light' });
    expect(adapter.storedEntries()).toEqual([FILE_ENTRY_A, FILE_ENTRY_B]);
  });
});

describe('SettingsView: an unwritable pre-import backup aborts the import (C10)', () => {
  it('reports the failure, replaces nothing and notifies no subscriber', async () => {
    const uiUser = userEvent.setup();
    const { store, adapter } = renderSettings(
      { entries: seededEntries(), preferences: { theme: 'light' } },
      { files: { writeTextFile: () => Promise.reject(new Error('kaputt')) } },
    );
    await waitFor(() => expect(store.readAll()).not.toBeNull());
    const before = adapter.storedEntries();

    await uiUser.upload(screen.getByLabelText(IMPORT_LABEL), backupFile('sicherung.json', validBody()));
    await screen.findByRole('dialog');

    // Opened on a ready store, so the initial delivery arrives exactly once.
    const seen: Entry[][] = [];
    const unsubscribe = store.subscribeEntriesInRange(
      { start: 0, end: Number.MAX_SAFE_INTEGER },
      (entries) => seen.push(entries),
      () => undefined,
    );
    await waitFor(() => expect(seen).toHaveLength(1));
    const deliveries = seen.length;

    await uiUser.click(screen.getByRole('button', { name: CONFIRM_LABEL }));

    expect(await screen.findByText(PRE_IMPORT_FAILED)).toBeInTheDocument();
    expect(adapter.storedEntries()).toEqual(before);
    expect(adapter.storedPreferences()).toEqual({ theme: 'light' });
    expect(adapter.replaceAllCount).toBe(0);
    expect(seen).toHaveLength(deliveries);
    unsubscribe();
  });
});

describe('SettingsView: the import refuses unless the data are loaded (C11)', () => {
  // The held load never settles, so this case must not await whenReady() anywhere.
  it('opens no dialog while the initial load is still running', async () => {
    const uiUser = userEvent.setup();
    const writeTextFile = vi.fn((_name: string, _text: string) => Promise.resolve());
    const adapter = new InMemoryAdapter();
    adapter.holdNextLoad();
    const store = createLocalStore({ adapter, navigator: null, channelFactory: noopChannelFactory });

    renderSettingsWith(store, { files: { writeTextFile } });
    await uiUser.upload(screen.getByLabelText(IMPORT_LABEL), backupFile('sicherung.json', validBody()));

    expect(await screen.findByText(NOT_LOADED)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(writeTextFile).not.toHaveBeenCalled();
    expect(adapter.replaceAllCount).toBe(0);
  });

  // Only reachable with a full-arity double: in production the state never leaves 'ready'.
  it('aborts when the guarded read refuses at confirm time', async () => {
    const uiUser = userEvent.setup();
    const writeTextFile = vi.fn((_name: string, _text: string) => Promise.resolve());
    const { store, adapter } = createTestStore({ entries: seededEntries(), preferences: { theme: 'light' } });
    let reads = 0;
    renderTree(
      servicesOf(store, {
        files: { writeTextFile },
        backup: {
          readAll: () => (reads++ === 0 ? store.readAll() : null),
          replaceAll: (data: BackupData) => store.replaceAll(data),
        },
      }),
    );
    await waitFor(() => expect(store.readAll()).not.toBeNull());
    const before = adapter.storedEntries();

    await uiUser.upload(screen.getByLabelText(IMPORT_LABEL), backupFile('sicherung.json', validBody()));
    await screen.findByRole('dialog');
    // The dialog saw the real count, so the refusal happens at confirm time and not before.
    expect(dialogParagraphs()).toContain('Einträge in dieser App: 3 – sie werden gelöscht.');

    await uiUser.click(screen.getByRole('button', { name: CONFIRM_LABEL }));

    expect(await screen.findByText(PRE_IMPORT_FAILED)).toBeInTheDocument();
    expect(writeTextFile).not.toHaveBeenCalled();
    expect(adapter.storedEntries()).toEqual(before);
    expect(adapter.replaceAllCount).toBe(0);
  });
});

describe('SettingsView: a confirmed import replaces everything (C12, C13)', () => {
  it('stores the file entries and preferences and reports the count', async () => {
    const uiUser = userEvent.setup();
    const written: Array<{ name: string; text: string }> = [];
    const seeded = seededEntries();
    const { store, adapter } = renderSettings(
      { entries: seeded, preferences: { theme: 'light' } },
      recordingWriter(written),
    );
    await waitFor(() => expect(store.readAll()).not.toBeNull());

    await uiUser.upload(
      screen.getByLabelText(IMPORT_LABEL),
      backupFile('sicherung.json', validBody({ preferences: { theme: 'dark' } })),
    );
    await screen.findByRole('dialog');
    await uiUser.click(screen.getByRole('button', { name: CONFIRM_LABEL }));

    expect(await screen.findByText('2 Einträge wurden eingelesen.')).toBeInTheDocument();
    expect(adapter.storedEntries()).toEqual([FILE_ENTRY_A, FILE_ENTRY_B]);
    expect(adapter.storedPreferences()).toEqual({ theme: 'dark' });
    for (const entry of seeded) {
      expect(adapter.storedEntries().some((stored) => stored.id === entry.id)).toBe(false);
    }
    expect(written).toHaveLength(1);
  });

  it('clears the stored preferences when the file has none, through to a fresh store', async () => {
    const uiUser = userEvent.setup();
    const written: Array<{ name: string; text: string }> = [];
    const { store, adapter } = renderSettings(
      { entries: seededEntries(), preferences: { theme: 'light' } },
      recordingWriter(written),
    );
    await waitFor(() => expect(store.readAll()).not.toBeNull());

    await uiUser.upload(screen.getByLabelText(IMPORT_LABEL), backupFile('sicherung.json', validBody()));
    await screen.findByRole('dialog');
    await uiUser.click(screen.getByRole('button', { name: CONFIRM_LABEL }));

    expect(await screen.findByText('2 Einträge wurden eingelesen.')).toBeInTheDocument();
    expect(adapter.storedPreferences()).toBeNull();

    const fresh = createLocalStore({ adapter, navigator: null, channelFactory: noopChannelFactory });
    await fresh.whenReady();
    expect(fresh.getPreferences()).toBeNull();
    fresh.close();
  });

  it('empties the store when the file has no entries (edge case 9)', async () => {
    const uiUser = userEvent.setup();
    const written: Array<{ name: string; text: string }> = [];
    const { store, adapter } = renderSettings(
      { entries: seededEntries(), preferences: { theme: 'light' } },
      recordingWriter(written),
    );
    await waitFor(() => expect(store.readAll()).not.toBeNull());

    await uiUser.upload(
      screen.getByLabelText(IMPORT_LABEL),
      backupFile('sicherung.json', validBody({ entries: [] })),
    );
    await screen.findByRole('dialog');
    const lines = dialogParagraphs();
    expect(lines).toContain('Einträge in der Datei: 0');
    expect(lines).toContain('Einträge in dieser App: 3 – sie werden gelöscht.');

    await uiUser.click(screen.getByRole('button', { name: CONFIRM_LABEL }));

    expect(await screen.findByText('0 Einträge wurden eingelesen.')).toBeInTheDocument();
    expect(adapter.storedEntries()).toEqual([]);
    expect(adapter.storedPreferences()).toBeNull();
    expect(written).toHaveLength(1);
  });
});

describe('SettingsView: a failed replace changes nothing (C14)', () => {
  it('reports the failure and leaves entries and preferences exactly as they were', async () => {
    const uiUser = userEvent.setup();
    const written: Array<{ name: string; text: string }> = [];
    const { store, adapter } = renderSettings(
      { entries: seededEntries(), preferences: { theme: 'light' } },
      recordingWriter(written),
    );
    await waitFor(() => expect(store.readAll()).not.toBeNull());
    const before = adapter.storedEntries();
    adapter.failNextReplaceAll(new Error('boom'));

    await uiUser.upload(screen.getByLabelText(IMPORT_LABEL), backupFile('sicherung.json', validBody()));
    await screen.findByRole('dialog');
    await uiUser.click(screen.getByRole('button', { name: CONFIRM_LABEL }));

    expect(await screen.findByText(REPLACE_FAILED)).toBeInTheDocument();
    expect(adapter.storedEntries()).toEqual(before);
    expect(adapter.storedPreferences()).toEqual({ theme: 'light' });
    // The order held: the pre-import file exists even though the replace failed.
    expect(written).toHaveLength(1);
  });
});

describe('SettingsView: a second confirm cannot double-import (C17)', () => {
  it('reaches the adapter exactly once and writes exactly one pre-import file', async () => {
    const uiUser = userEvent.setup();
    const written: Array<{ name: string; text: string }> = [];
    const { store, adapter } = renderSettings(
      { entries: seededEntries(), preferences: { theme: 'light' } },
      recordingWriter(written),
    );
    await waitFor(() => expect(store.readAll()).not.toBeNull());

    await uiUser.upload(screen.getByLabelText(IMPORT_LABEL), backupFile('sicherung.json', validBody()));
    await screen.findByRole('dialog');

    const release = adapter.holdNextReplaceAll();
    await uiUser.click(screen.getByRole('button', { name: CONFIRM_LABEL }));
    await waitFor(() => expect(adapter.replaceAllCount).toBe(1)); // the first call reached the adapter, held
    const confirm = screen.queryByRole('button', { name: CONFIRM_LABEL });
    if (confirm !== null) {
      await uiUser.click(confirm);
      fireEvent.click(confirm);
    }
    release();
    await screen.findByText('2 Einträge wurden eingelesen.');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // Drain: whatever a second activation queued on persistChain has run by now.
    await act(async () => {
      for (let i = 0; i < 20; i += 1) await Promise.resolve();
    });
    expect(adapter.replaceAllCount).toBe(1);
    expect(written).toHaveLength(1); // exactly one pre-import file, not two
    expect(adapter.storedEntries()).toEqual([FILE_ENTRY_A, FILE_ENTRY_B]);
  });
});

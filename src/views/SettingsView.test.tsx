import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServicesProvider, type Services } from '../app/ServicesContext';
import { ToastProvider } from '../app/ToastContext';
import { parseBackup } from '../data/backupFile';
import { noopChannelFactory } from '../data/channel';
import { InMemoryAdapter } from '../data/inMemoryAdapter';
import { createLocalStore, type LocalStore } from '../data/localStore';
import { STORE_FORMAT_VERSION } from '../data/persistence';
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

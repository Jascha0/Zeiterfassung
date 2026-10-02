/**
 * Slice-level behaviour of the shell that no single view's test can see: routing and the store
 * together (a deep link that arrives while the initial load is still running, a hash change while a
 * view is mid-load), the theme now being subscribed in *every* state because the auth gate is gone,
 * the shell's toast wiring, a write that outlives the view that started it, and a failing initial
 * load on the day and settings routes (the timer route is `App.test.tsx`'s B19 case).
 *
 * Every store is built with `channelFactory: noopChannelFactory` (Node 24 has a real
 * BroadcastChannel and the store never closes it). Every behavioural date derives from `Date.now()`.
 */
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { noopChannelFactory } from './data/channel';
import { InMemoryAdapter } from './data/inMemoryAdapter';
import { createLocalStore, type LocalStore } from './data/localStore';
import { formatLongDate } from './domain/format';
import { dayStartFromKey, toDateKey, toMonthKey } from './domain/routing';
import type { Entry, EntryType } from './domain/types';
import { createTestStore } from './test/createTestStore';
import { servicesOf } from './test/testServices';
import { THEME_STORAGE_KEY } from './theme/theme';

const DAY_MS = 24 * 60 * 60 * 1000;

const LOAD_ERROR = 'Daten konnten nicht geladen werden.';
const WRITE_ERROR = 'Die Änderung konnte nicht gespeichert werden.';
const MULTIPLE_OPEN_WARNING = 'Es gibt mehrere offene Einträge. Aktionen betreffen den zuletzt gestarteten Eintrag.';
const LOCAL_DATA_NOTICE =
  'Alle Daten liegen nur in diesem Browser auf diesem Gerät. Wenn du die Browserdaten löschst, sind sie weg. Lade dir deshalb regelmäßig eine Sicherung herunter.';

function dateKeyDaysFromToday(offset: number): string {
  return toDateKey(Date.now() + offset * DAY_MS);
}

/** Wall-clock instant on the given day key — DST-safe, unlike dayStart + hours * 3600_000. */
function at(dateKey: string, hours: number, minutes = 0): number {
  const day = new Date(dayStartFromKey(dateKey));
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes, 0, 0).getTime();
}

function timeText(instant: number): string {
  const date = new Date(instant);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function entryOn(id: string, type: EntryType, dateKey: string, from: number, to: number | null): Entry {
  const start = at(dateKey, from);
  const end = to === null ? null : at(dateKey, to);
  return { id, type, start, end, createdAt: start, updatedAt: end ?? start };
}

function renderApp(store: LocalStore) {
  return { store, ...render(<App services={servicesOf(store)} />) };
}

/** A store whose initial load is still in flight; the returned release lets it settle. */
function storeWithHeldLoad(entries: readonly Entry[] = []) {
  const adapter = new InMemoryAdapter({ entries });
  const release = adapter.holdNextLoad();
  const store = createLocalStore({ adapter, navigator: null, channelFactory: noopChannelFactory });
  return { adapter, release, store };
}

/** A store whose initial load fails — the only way to reach the load-error state (src/data/ is frozen). */
function storeWithFailingLoad() {
  const adapter = new InMemoryAdapter();
  adapter.failNextLoad(new Error('boom'));
  return { adapter, store: createLocalStore({ adapter, navigator: null, channelFactory: noopChannelFactory }) };
}

beforeEach(() => {
  window.location.hash = '';
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('App: a deep link that arrives while the initial load is still running', () => {
  it('opens the linked day with "Lädt…" and no entry data, then fills it in when the load settles', async () => {
    const yesterday = dateKeyDaysFromToday(-1);
    const { release, store } = storeWithHeldLoad([entryOn('w1', 'work', yesterday, 9, 12)]);
    window.location.hash = `#/tag/${yesterday}`;
    renderApp(store);

    // The route comes from the hash alone, so the day is already identified while the store loads.
    expect(screen.getByRole('heading', { name: formatLongDate(dayStartFromKey(yesterday)) })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kalender' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Lädt…')).toBeInTheDocument();
    expect(screen.queryByText('Keine Einträge an diesem Tag.')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Gearbeitet /)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eintrag hinzufügen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await act(async () => {
      release();
      await Promise.resolve();
    });

    expect(await screen.findByText(/Arbeit 09:00–12:00 \(3:00:00\)/)).toBeInTheDocument();
    expect(screen.getByText('Gearbeitet 3:00:00')).toBeInTheDocument();
    expect(screen.queryByText('Lädt…')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eintrag hinzufügen' })).toBeEnabled();
  });
});

describe('App: a hash change that arrives while a view is still loading', () => {
  it('switches to the calendar mid-load and releases the timer subscriptions the late load would have fed', async () => {
    const today = dateKeyDaysFromToday(0);
    const { release, store } = storeWithHeldLoad([entryOn('w1', 'work', today, 9, 10)]);
    renderApp(store);
    expect(await screen.findByRole('heading', { name: 'Arbeitszeit' })).toBeInTheDocument();
    expect(screen.getByText('Lädt…')).toBeInTheDocument();

    window.location.hash = `#/kalender/${toMonthKey(Date.now())}`;
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Arbeitszeit' })).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Kalender' })).toHaveAttribute('aria-current', 'page');

    await act(async () => {
      release();
      await Promise.resolve();
    });

    expect(await screen.findByRole('grid', { name: 'Monatskalender' })).toBeInTheDocument();
    expect(screen.getByText('Monatssumme 1:00:00')).toBeInTheDocument();
    // 1 calendar range subscription + 1 calendar open-entries subscription + 1 theme preference:
    // the timer's two are gone although its load was in flight when it unmounted.
    await waitFor(() => expect(store.listenerCount()).toBe(3));
  });
});

describe('App: a failing initial load on the day route (edge case 17)', () => {
  it('shows the load error, no day data and a usable nav, and the calendar shows the same error instead of a grid', async () => {
    const uiUser = userEvent.setup();
    const yesterday = dateKeyDaysFromToday(-1);
    const { store } = storeWithFailingLoad();
    window.location.hash = `#/tag/${yesterday}`;
    renderApp(store);

    expect(await screen.findByRole('alert')).toHaveTextContent(LOAD_ERROR);
    expect(screen.getByRole('heading', { name: formatLongDate(dayStartFromKey(yesterday)) })).toBeInTheDocument();
    expect(screen.queryByText('Lädt…')).not.toBeInTheDocument();
    expect(screen.queryByText('Keine Einträge an diesem Tag.')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Gearbeitet /)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eintrag hinzufügen' })).not.toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Hauptnavigation' });
    expect(within(nav).getAllByRole('button')).toHaveLength(3);

    await uiUser.click(within(nav).getByRole('button', { name: 'Kalender' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(LOAD_ERROR);
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    expect(screen.queryByText('Lädt…')).not.toBeInTheDocument();
  });
});

describe('App: a failing initial load on the settings route (edge case 17)', () => {
  it('still renders the whole settings view, and a theme change reports its failed save as a toast', async () => {
    const uiUser = userEvent.setup();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { store } = storeWithFailingLoad();
    window.location.hash = '#/einstellungen';
    renderApp(store);

    expect(await screen.findByRole('heading', { name: 'Einstellungen' })).toBeInTheDocument();
    expect(screen.getByText(LOCAL_DATA_NOTICE)).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    // The settings view reads no entry data, so the load failure produces no error text here.
    expect(screen.queryByText(LOAD_ERROR)).not.toBeInTheDocument();

    await act(async () => {
      await store.whenReady();
    });
    await uiUser.click(screen.getByRole('radio', { name: 'Dunkel' }));

    // The choice still applies locally …
    expect(screen.getByRole('radio', { name: 'Dunkel' })).toBeChecked();
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
    // … and the shell's toast region reports that it could not be stored. Nothing fails silently.
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(WRITE_ERROR));
    expect(store.getPreferences()).toBeNull();
  });
});

describe('App: the theme is subscribed in every state, not only on the settings route', () => {
  it('applies a stored dark preference on the timer route and mirrors it into localStorage', async () => {
    const { store } = createTestStore({ preferences: { theme: 'dark' } });
    renderApp(store);

    expect(await screen.findByText('Nicht gestartet')).toBeInTheDocument();
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    // Reached without ever opening the settings view: the provider wraps the whole shell now.
    expect(screen.getByRole('button', { name: 'Timer' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });
});

describe('App: navigating away while a write is pending', () => {
  it('lets the write finish, reports nothing to the user and shows the entry when the day is reopened', async () => {
    const uiUser = userEvent.setup();
    const yesterday = dateKeyDaysFromToday(-1);
    const { store, adapter } = createTestStore();
    window.location.hash = `#/tag/${yesterday}`;
    renderApp(store);

    await uiUser.click(await screen.findByRole('button', { name: 'Eintrag hinzufügen' }));
    await uiUser.type(screen.getByLabelText('Start'), '09:00');
    await uiUser.type(screen.getByLabelText('Ende'), '12:00');
    const release = adapter.holdNextApply();
    await uiUser.click(screen.getByRole('button', { name: 'Speichern' }));

    // Leave the day detail while its write is still in flight.
    await uiUser.click(screen.getByRole('button', { name: 'Timer' }));
    expect(await screen.findByText('Nicht gestartet')).toBeInTheDocument();

    await act(async () => {
      release();
      await Promise.resolve();
    });

    await waitFor(() => expect(adapter.storedEntries()).toHaveLength(1));
    expect(adapter.storedEntries()[0]).toMatchObject({
      type: 'work',
      start: at(yesterday, 9),
      end: at(yesterday, 12),
    });
    expect(screen.queryByText(WRITE_ERROR)).not.toBeInTheDocument();

    await act(async () => {
      window.location.hash = `#/tag/${yesterday}`;
    });
    expect(await screen.findByText(/Arbeit 09:00–12:00 \(3:00:00\)/)).toBeInTheDocument();
  });
});

describe('App: the oldest open entry is resolved in its own day (B6 end to end)', () => {
  it('follows the link across the day boundary, closes the entry there and drops the warning on the timer', async () => {
    const uiUser = userEvent.setup();
    const now = Date.now();
    const todayStart = dayStartFromKey(toDateKey(now));
    // Anchored to local midnight, so the oldest open entry really lies on the previous day: an
    // implementation linking to the newest open entry would route to a different day and fail here.
    const oldestStart = todayStart - 2 * 60 * 60 * 1000;
    const newerStart = todayStart + Math.floor((now - todayStart) / 2);
    const { store } = createTestStore({
      entries: [
        { id: 'old', type: 'work', start: oldestStart, end: null, createdAt: oldestStart, updatedAt: oldestStart },
        { id: 'new', type: 'work', start: newerStart, end: null, createdAt: newerStart, updatedAt: newerStart },
      ],
    });
    renderApp(store);

    expect(await screen.findByText(MULTIPLE_OPEN_WARNING)).toBeInTheDocument();
    await uiUser.click(screen.getByRole('button', { name: 'Ältesten offenen Eintrag öffnen' }));

    expect(window.location.hash).toBe(`#/tag/${toDateKey(oldestStart)}`);
    expect(await screen.findByRole('heading', { name: formatLongDate(oldestStart) })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`Arbeit ${timeText(oldestStart)}–läuft`))).toBeInTheDocument();

    const end = oldestStart + 30 * 60 * 1000;
    await uiUser.click(screen.getByRole('button', { name: 'Bearbeiten' }));
    await uiUser.type(screen.getByLabelText('Ende'), timeText(end));
    await uiUser.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(
      await screen.findByText(new RegExp(`Arbeit ${timeText(oldestStart)}–${timeText(end)} \\(0:30:00\\)`)),
    ).toBeInTheDocument();

    await uiUser.click(screen.getByRole('button', { name: 'Timer' }));
    expect(await screen.findByText(/^Arbeitet seit/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(MULTIPLE_OPEN_WARNING)).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Ältesten offenen Eintrag öffnen' })).not.toBeInTheDocument();
  });
});

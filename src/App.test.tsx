import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import App from './App';
import { noopChannelFactory } from './data/channel';
import { InMemoryAdapter } from './data/inMemoryAdapter';
import { createLocalStore, type LocalStore } from './data/localStore';
import { formatLongDate } from './domain/format';
import { dayStartFromKey, toDateKey, toMonthKey } from './domain/routing';
import { createTestStore } from './test/createTestStore';
import { servicesOf } from './test/testServices';

function renderApp(store: LocalStore = createTestStore().store) {
  return { store, ...render(<App services={servicesOf(store)} />) };
}

beforeEach(() => {
  window.location.hash = '';
  localStorage.clear();
});

describe('App: the shell starts on the timer (B1)', () => {
  it('renders the timer view with the three nav items and nothing auth-related', async () => {
    renderApp();
    expect(await screen.findByRole('navigation', { name: 'Hauptnavigation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Timer' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Kalender' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('button', { name: 'Einstellungen' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('heading', { name: 'Arbeitszeit' })).toBeInTheDocument();
    expect(await screen.findByText('Nicht gestartet')).toBeInTheDocument();

    expect(screen.queryByText('Anmelden')).not.toBeInTheDocument();
    expect(screen.queryByText('Registrieren')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Anmeldung' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'E-Mail-Bestätigung' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Konto' })).not.toBeInTheDocument();
    // Targets the deleted ConfigMissing view. The name of the removed backend must NOT appear in this
    // file — it would break task 1's scoped and task 2's unrestricted B3 gate for the rest of the slice.
    expect(screen.queryByText(/nicht konfiguriert/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Offline/)).not.toBeInTheDocument();
  });
});

describe('App: hash routing (B2)', () => {
  it('opens September 2026 for #/kalender/2026-09 with Kalender current', async () => {
    window.location.hash = '#/kalender/2026-09';
    renderApp();
    expect(await screen.findByRole('heading', { name: 'September 2026' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kalender' })).toHaveAttribute('aria-current', 'page');
  });

  it('opens that day for #/tag/2026-09-18 with Kalender still current, and again after a remount', async () => {
    window.location.hash = '#/tag/2026-09-18';
    const first = renderApp();
    expect(await screen.findByRole('heading', { name: '18. September 2026' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kalender' })).toHaveAttribute('aria-current', 'page');

    // Standing in for a reload: the hash is the only source of the current view.
    first.unmount();
    renderApp();
    expect(await screen.findByRole('heading', { name: '18. September 2026' })).toBeInTheDocument();
  });

  it('opens the settings view for #/einstellungen with Einstellungen current', async () => {
    window.location.hash = '#/einstellungen';
    renderApp();
    expect(await screen.findByRole('heading', { name: 'Einstellungen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Einstellungen' })).toHaveAttribute('aria-current', 'page');
  });

  it.each(['#/foo', '#/konto', '#/offene-eintraege'])('falls back to the timer for %s', async (hash) => {
    window.location.hash = hash;
    renderApp();
    expect(await screen.findByRole('heading', { name: 'Arbeitszeit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Timer' })).toHaveAttribute('aria-current', 'page');
  });

  it('navigates calendar -> day -> back to the month', async () => {
    const uiUser = userEvent.setup();
    window.location.hash = '#/kalender/2026-09';
    renderApp();
    await screen.findByRole('heading', { name: 'September 2026' });

    await uiUser.click(screen.getByRole('button', { name: /^18\. September 2026/ }));
    expect(await screen.findByRole('heading', { name: '18. September 2026' })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/tag/2026-09-18');

    await uiUser.click(screen.getByRole('button', { name: 'Zurück zum Kalender' }));
    expect(await screen.findByRole('heading', { name: 'September 2026' })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/kalender/2026-09');
  });

  it('opens the current month when Kalender is clicked from the timer', async () => {
    const uiUser = userEvent.setup();
    renderApp();
    await screen.findByText('Nicht gestartet');
    await uiUser.click(screen.getByRole('button', { name: 'Kalender' }));
    await waitFor(() => expect(window.location.hash).toBe(`#/kalender/${toMonthKey(Date.now())}`));
    expect(await screen.findByRole('grid', { name: 'Monatskalender' })).toBeInTheDocument();
  });
});

describe('App: the timer links to the oldest open entry (B6)', () => {
  it("routes to that entry's day detail", async () => {
    const uiUser = userEvent.setup();
    const now = Date.now();
    const todayStart = dayStartFromKey(toDateKey(now));
    const oldestStart = todayStart - 2 * 60 * 60 * 1000;
    const newerStart = todayStart + Math.floor((now - todayStart) / 2);
    renderApp(
      createTestStore({
        entries: [
          { id: 'old', type: 'work', start: oldestStart, end: null, createdAt: oldestStart, updatedAt: oldestStart },
          { id: 'new', type: 'work', start: newerStart, end: null, createdAt: newerStart, updatedAt: newerStart },
        ],
      }).store,
    );

    await uiUser.click(await screen.findByRole('button', { name: 'Ältesten offenen Eintrag öffnen' }));
    expect(window.location.hash).toBe(`#/tag/${toDateKey(oldestStart)}`);
    expect(await screen.findByRole('heading', { name: formatLongDate(oldestStart) })).toBeInTheDocument();
  });
});

describe('App: subscriptions are released on navigation (B21)', () => {
  it('keeps the listener count at the timer plus theme level after calendar and back', async () => {
    const uiUser = userEvent.setup();
    const { store } = renderApp();
    await screen.findByText('Nicht gestartet');
    // 2 timer subscriptions + 1 theme preference subscription.
    await waitFor(() => expect(store.listenerCount()).toBe(3));

    await uiUser.click(screen.getByRole('button', { name: 'Kalender' }));
    await screen.findByRole('grid', { name: 'Monatskalender' });
    await waitFor(() => expect(store.listenerCount()).toBe(3));

    await uiUser.click(screen.getByRole('button', { name: 'Timer' }));
    await screen.findByText('Nicht gestartet');
    await waitFor(() => expect(store.listenerCount()).toBe(3));
  });
});

describe('App: a failing initial load (B19)', () => {
  it('shows the load error inside the shell, with no data and no blocking screen', async () => {
    const adapter = new InMemoryAdapter();
    adapter.failNextLoad(new Error('boom'));
    renderApp(createLocalStore({ adapter, navigator: null, channelFactory: noopChannelFactory }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Daten konnten nicht geladen werden.');
    expect(screen.getByRole('navigation', { name: 'Hauptnavigation' })).toBeInTheDocument();
    expect(within(screen.getByRole('navigation')).getAllByRole('button')).toHaveLength(3);
    expect(screen.queryByText('Nicht gestartet')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
  });
});

import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type { Services } from './app/ServicesContext';
import { AUTH_MESSAGES } from './auth/authErrors';
import type { AuthUser } from './auth/authTypes';
import { InMemoryRepository } from './data/inMemoryRepository';
import type { Entry } from './domain/types';
import { FakeAuthService } from './test/fakeAuthService';

function user(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    uid: 'u1',
    email: 'a@b.de',
    displayName: null,
    emailVerified: true,
    providerIds: ['password'],
    ...overrides,
  };
}

function makeServices(auth = new FakeAuthService()): Services {
  const repo = new InMemoryRepository();
  return { auth, entries: repo, settings: repo };
}

describe('App: auth gate (edge cases 3, 4)', () => {
  it('shows "Lädt…" before the first auth callback, no login or timer rendered', () => {
    render(<App services={makeServices()} />);
    expect(screen.getByText('Lädt…')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Anmeldung' })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('shows only LoginView (no nav/TimerView/AccountView) when signed out', async () => {
    render(<App services={makeServices()} />);
    expect(await screen.findByRole('heading', { name: 'Anmeldung' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByText('Arbeitszeit')).not.toBeInTheDocument();
    expect(screen.queryByText('Konto')).not.toBeInTheDocument();
  });

  it('shows the shell with Timer active by default after sign-in', async () => {
    const auth = new FakeAuthService();
    auth.setUser(user());
    render(<App services={makeServices(auth)} />);
    expect(await screen.findByRole('navigation', { name: 'Hauptnavigation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Timer' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Konto' })).not.toHaveAttribute('aria-current');
    expect(screen.getByText('Arbeitszeit')).toBeInTheDocument();
  });

  it('switches to AccountView when clicking "Konto"', async () => {
    const uiUser = userEvent.setup();
    const auth = new FakeAuthService();
    auth.setUser(user());
    render(<App services={makeServices(auth)} />);
    await screen.findByText('Arbeitszeit');
    await uiUser.click(screen.getByRole('button', { name: 'Konto' }));
    expect(screen.getByRole('heading', { name: 'Konto' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Konto' })).toHaveAttribute('aria-current', 'page');
  });
});

describe('App: sign-out (edge case 5)', () => {
  it('returns to LoginView after sign-out, and timer listeners are cleaned up', async () => {
    const uiUser = userEvent.setup();
    const auth = new FakeAuthService();
    const repo = new InMemoryRepository();
    auth.setUser(user());
    render(<App services={{ auth, entries: repo, settings: repo }} />);
    await screen.findByText('Arbeitszeit');
    await waitFor(() => expect(repo.listenerCount()).toBeGreaterThan(0));

    await uiUser.click(screen.getByRole('button', { name: 'Konto' }));
    await uiUser.click(screen.getByRole('button', { name: 'Abmelden' }));

    expect(await screen.findByRole('heading', { name: 'Anmeldung' })).toBeInTheDocument();
    await waitFor(() => expect(repo.listenerCount()).toBe(0));
  });
});

describe('App: redirect error while signed in (review fix — Shell-level notice)', () => {
  it('shows the mapped message when a signed-in user\'s completeRedirect rejects, and "Meldung schließen" removes it', async () => {
    const uiUser = userEvent.setup();
    const auth = new FakeAuthService();
    auth.completeRedirect.mockRejectedValueOnce({ code: 'auth/credential-already-in-use' });
    auth.setUser(user());
    render(<App services={makeServices(auth)} />);

    // Shell (nav) is rendered, not LoginView, proving the error surfaces for a signed-in user.
    expect(await screen.findByRole('navigation', { name: 'Hauptnavigation' })).toBeInTheDocument();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(AUTH_MESSAGES['credential-already-in-use']);

    await uiUser.click(screen.getByRole('button', { name: 'Meldung schließen' }));
    expect(screen.queryByText(AUTH_MESSAGES['credential-already-in-use'])).not.toBeInTheDocument();
  });

  it('does not show a stale link error on the login screen after sign-out', async () => {
    const auth = new FakeAuthService();
    auth.completeRedirect.mockRejectedValueOnce({ code: 'auth/credential-already-in-use' });
    auth.setUser(user());
    render(<App services={makeServices(auth)} />);
    await screen.findByRole('alert');

    act(() => auth.setUser(null));

    expect(await screen.findByRole('button', { name: 'Anmelden' })).toBeInTheDocument();
    expect(screen.queryByText(AUTH_MESSAGES['credential-already-in-use'])).not.toBeInTheDocument();
  });
});

describe('App: Kalender', () => {
  function at(day: number, hours: number, minutes = 0): number {
    return new Date(2026, 9, day, hours, minutes).getTime();
  }

  function openEntry(id: string, start: number): Entry {
    return { id, type: 'work', start, end: null, createdAt: start, updatedAt: start };
  }

  function renderSignedIn(repo: InMemoryRepository) {
    const auth = new FakeAuthService();
    auth.setUser(user());
    render(<App services={{ auth, entries: repo, settings: repo }} />);
  }

  function itemFor(text: string | RegExp): HTMLElement {
    const item = screen.getByText(text).closest('li');
    if (!item) throw new Error('list item missing');
    return item;
  }

  async function typeInto(ui: ReturnType<typeof userEvent.setup>, label: string, value: string) {
    const input = screen.getByLabelText(label);
    await ui.clear(input);
    await ui.type(input, value);
  }

  async function openDay(ui: ReturnType<typeof userEvent.setup>, name: RegExp) {
    await ui.click(screen.getByRole('button', { name: 'Kalender' }));
    await ui.click(await screen.findByRole('button', { name }));
  }

  // `delay: null` on every `userEvent.setup()` below disables user-event's own real
  // (setTimeout-based) pacing between keystrokes/clicks. `Date` is faked here but
  // `setTimeout` is not, so without this the long interaction chains in this block
  // depend on real wall-clock time elapsing promptly — under CPU contention (parallel
  // test files) that occasionally exceeded the default findBy/waitFor timeout and
  // made one test flaky (observed 1/23 full-suite runs). This removes that dependency
  // without changing any assertion.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date(2026, 9, 16, 15, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows Timer, Kalender, Projekte, Konto in order and opens the current month with today marked', async () => {
    const ui = userEvent.setup({ delay: null });
    renderSignedIn(new InMemoryRepository());
    const nav = await screen.findByRole('navigation', { name: 'Hauptnavigation' });
    expect(within(nav).getAllByRole('button').map((b) => b.textContent)).toEqual(['Timer', 'Kalender', 'Projekte', 'Konto']);

    await ui.click(screen.getByRole('button', { name: 'Kalender' }));
    expect(screen.getByRole('heading', { name: 'Oktober 2026' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kalender' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Timer' })).not.toHaveAttribute('aria-current');
    const today = await screen.findByRole('button', { name: /^Freitag, 16\. Oktober 2026/ });
    expect(today).toHaveAttribute('aria-current', 'date');
  });

  it('adds an entry in the day detail, then edits it; the calendar follows', async () => {
    const ui = userEvent.setup({ delay: null });
    renderSignedIn(new InMemoryRepository());
    await screen.findByText('Arbeitszeit');

    await openDay(ui, /^Mittwoch, 14\. Oktober 2026/);
    expect(screen.getByRole('heading', { name: 'Mittwoch, 14. Oktober 2026' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kalender' })).toHaveAttribute('aria-current', 'page');
    await screen.findByText('Keine Einträge an diesem Tag.');
    await ui.click(screen.getByRole('button', { name: 'Eintrag hinzufügen' }));
    await typeInto(ui, 'Beginn', '08:00');
    await typeInto(ui, 'Ende', '12:00');
    await ui.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByText('Arbeit 08:00 – 12:00 (4:00)')).toBeInTheDocument();

    await ui.click(screen.getByRole('button', { name: 'Zurück zum Kalender' }));
    expect(screen.getByRole('heading', { name: 'Oktober 2026' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /^Mittwoch, 14\. Oktober 2026/ })).toHaveAccessibleName(
      /4:00 gearbeitet/,
    );

    await ui.click(screen.getByRole('button', { name: /^Mittwoch, 14\. Oktober 2026/ }));
    await ui.click(within(await waitFor(() => itemFor('Arbeit 08:00 – 12:00 (4:00)'))).getByRole('button', { name: 'Bearbeiten' }));
    await typeInto(ui, 'Ende', '13:00');
    await ui.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByText('Arbeit 08:00 – 13:00 (5:00)')).toBeInTheDocument();

    await ui.click(screen.getByRole('button', { name: 'Zurück zum Kalender' }));
    expect(await screen.findByRole('button', { name: /^Mittwoch, 14\. Oktober 2026/ })).toHaveAccessibleName(
      /5:00 gearbeitet/,
    );
  });

  it('resolves two open entries from the timer warning; the newer one keeps running', async () => {
    const ui = userEvent.setup({ delay: null });
    const repo = new InMemoryRepository();
    repo.seedEntries('u1', [openEntry('old', at(12, 8)), openEntry('new', at(16, 14))]);
    renderSignedIn(repo);

    expect(await screen.findByText(/mehrere offene Einträge/)).toBeInTheDocument();
    await ui.click(screen.getByRole('button', { name: 'Offene Einträge bereinigen' }));
    expect(screen.getByRole('heading', { name: 'Offene Einträge bereinigen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Timer' })).toHaveAttribute('aria-current', 'page');

    const item = (await screen.findByText('12.10.2026 · Arbeit ab 08:00')).closest('li');
    if (!item) throw new Error('list item missing');
    await ui.click(within(item).getByRole('button', { name: 'Beenden um …' }));
    const form = await screen.findByRole('form', { name: 'Eintrag beenden' });
    const submit = within(form).getByRole('button', { name: 'Beenden' });
    await waitFor(() => expect(submit).toBeEnabled());
    await ui.click(submit);
    expect(await screen.findByText('Es gibt keine älteren offenen Einträge mehr.')).toBeInTheDocument();

    await ui.click(screen.getByRole('button', { name: 'Zurück zum Timer' }));
    expect(await screen.findByText('Arbeitet seit 14:00')).toBeInTheDocument();
    expect(screen.queryByText(/mehrere offene Einträge/)).not.toBeInTheDocument();
    expect(repo.getEntries('u1').filter((e) => e.end === null).map((e) => e.id)).toEqual(['new']);
  });

  it('editing the active entry start in the day detail updates the timer', async () => {
    const ui = userEvent.setup({ delay: null });
    const repo = new InMemoryRepository();
    repo.seedEntries('u1', [openEntry('run', at(16, 14))]);
    renderSignedIn(repo);
    expect(await screen.findByText('Arbeitet seit 14:00')).toBeInTheDocument();

    await openDay(ui, /^Freitag, 16\. Oktober 2026/);
    await ui.click(within(await waitFor(() => itemFor(/^Arbeit 14:00 – läuft/))).getByRole('button', { name: 'Bearbeiten' }));
    await typeInto(ui, 'Beginn', '13:00');
    await ui.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByText(/^Arbeit 13:00 – läuft/)).toBeInTheDocument();

    await ui.click(screen.getByRole('button', { name: 'Timer' }));
    expect(await screen.findByText('Arbeitet seit 13:00')).toBeInTheDocument();
  });

  it('deleting the active entry in the day detail makes the timer idle', async () => {
    const ui = userEvent.setup({ delay: null });
    const repo = new InMemoryRepository();
    repo.seedEntries('u1', [openEntry('run', at(16, 14))]);
    renderSignedIn(repo);
    expect(await screen.findByText('Arbeitet seit 14:00')).toBeInTheDocument();

    await openDay(ui, /^Freitag, 16\. Oktober 2026/);
    await ui.click(within(await waitFor(() => itemFor(/^Arbeit 14:00 – läuft/))).getByRole('button', { name: 'Löschen' }));
    await ui.click(screen.getByRole('button', { name: 'Ja, löschen' }));
    expect(await screen.findByText('Keine Einträge an diesem Tag.')).toBeInTheDocument();

    await ui.click(screen.getByRole('button', { name: 'Timer' }));
    expect(await screen.findByText('Nicht gestartet')).toBeInTheDocument();
  });
});

describe('App: verification banner', () => {
  it('shows the banner for an unverified password user', async () => {
    const auth = new FakeAuthService();
    auth.setUser(user({ emailVerified: false, providerIds: ['password'] }));
    render(<App services={makeServices(auth)} />);
    expect(await screen.findByRole('region', { name: 'E-Mail-Bestätigung' })).toBeInTheDocument();
  });

  it('does not show the banner for a verified user', async () => {
    const auth = new FakeAuthService();
    auth.setUser(user({ emailVerified: true, providerIds: ['password'] }));
    render(<App services={makeServices(auth)} />);
    await screen.findByText('Arbeitszeit');
    expect(screen.queryByRole('region', { name: 'E-Mail-Bestätigung' })).not.toBeInTheDocument();
  });

  it('does not show the banner for a Google-only user (edge case 35)', async () => {
    const auth = new FakeAuthService();
    auth.setUser(user({ emailVerified: false, providerIds: ['google.com'] }));
    render(<App services={makeServices(auth)} />);
    await screen.findByText('Arbeitszeit');
    expect(screen.queryByRole('region', { name: 'E-Mail-Bestätigung' })).not.toBeInTheDocument();
  });
});

describe('App: Projekte (slice 3)', () => {
  it('opens the project view from the nav and marks only "Projekte" as current (edge case 30)', async () => {
    const ui = userEvent.setup();
    const auth = new FakeAuthService();
    const repo = new InMemoryRepository();
    auth.setUser(user());
    render(<App services={{ auth, entries: repo, settings: repo, projects: repo }} />);
    await screen.findByText('Arbeitszeit');

    await ui.click(screen.getByRole('button', { name: 'Projekte' }));

    expect(screen.getByRole('heading', { name: 'Projekte' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Projekte' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Timer' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('button', { name: 'Kalender' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('button', { name: 'Konto' })).not.toHaveAttribute('aria-current');
    expect(await screen.findByText('Noch keine Projekte.')).toBeInTheDocument();
  });
});

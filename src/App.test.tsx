import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from './App';
import type { Services } from './app/ServicesContext';
import { AUTH_MESSAGES } from './auth/authErrors';
import type { AuthUser } from './auth/authTypes';
import { createTestStore } from './test/createTestStore';
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
  const store = createTestStore().store;
  return { auth, entries: store, settings: store };
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
    const { store } = createTestStore();
    auth.setUser(user());
    render(<App services={{ auth, entries: store, settings: store }} />);
    await screen.findByText('Arbeitszeit');
    await waitFor(() => expect(store.listenerCount()).toBeGreaterThan(0));

    await uiUser.click(screen.getByRole('button', { name: 'Konto' }));
    await uiUser.click(screen.getByRole('button', { name: 'Abmelden' }));

    expect(await screen.findByRole('heading', { name: 'Anmeldung' })).toBeInTheDocument();
    await waitFor(() => expect(store.listenerCount()).toBe(0));
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

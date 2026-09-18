import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ServicesProvider, type Services } from '../app/ServicesContext';
import { ToastProvider } from '../app/ToastContext';
import { AuthError } from '../auth/authTypes';
import type { AuthUser } from '../auth/authTypes';
import { InMemoryRepository } from '../data/inMemoryRepository';
import { FakeAuthService } from '../test/fakeAuthService';
import { ThemeProvider } from '../theme/ThemeContext';
import { AccountView } from './AccountView';

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

function renderAccountView(authUser: AuthUser, auth = new FakeAuthService()) {
  const repo = new InMemoryRepository();
  const services: Services = { auth, entries: repo, settings: repo };
  render(
    <ServicesProvider services={services}>
      <ToastProvider>
        <ThemeProvider uid={authUser.uid}>
          <AccountView user={authUser} />
        </ThemeProvider>
      </ToastProvider>
    </ServicesProvider>,
  );
  return { auth, repo };
}

describe('AccountView: linking buttons (edge case 13/14)', () => {
  it('offers "Google verknüpfen" when Google is not linked, and links successfully', async () => {
    const uiUser = userEvent.setup();
    const { auth } = renderAccountView(user({ providerIds: ['password'] }));
    const button = screen.getByRole('button', { name: 'Google verknüpfen' });
    await uiUser.click(button);
    await waitFor(() => expect(auth.linkGoogle).toHaveBeenCalled());
    expect(await screen.findByText('Google wurde verknüpft.')).toBeInTheDocument();
  });

  it('shows "Google: verknüpft" and no button when already linked', () => {
    renderAccountView(user({ providerIds: ['password', 'google.com'] }));
    expect(screen.getByText('Google: verknüpft')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Google verknüpfen' })).not.toBeInTheDocument();
  });

  it('shows "Passwort: festgelegt" and no form when password is already linked', () => {
    renderAccountView(user({ providerIds: ['password', 'google.com'] }));
    expect(screen.getByText('Passwort: festgelegt')).toBeInTheDocument();
    expect(screen.queryByLabelText('Neues Passwort')).not.toBeInTheDocument();
  });

  it('offers a "Passwort festlegen" form when only Google is linked, validates and links', async () => {
    const uiUser = userEvent.setup();
    const { auth } = renderAccountView(user({ providerIds: ['google.com'] }));

    await uiUser.type(screen.getByLabelText('Neues Passwort'), '1234567');
    await uiUser.type(screen.getByLabelText('Passwort bestätigen'), '1234567');
    await uiUser.click(screen.getByRole('button', { name: 'Passwort festlegen' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Das Passwort muss mindestens 8 Zeichen lang sein.');
    expect(auth.linkPassword).not.toHaveBeenCalled();

    await uiUser.type(screen.getByLabelText('Neues Passwort'), '8');
    await uiUser.type(screen.getByLabelText('Passwort bestätigen'), '8');
    await uiUser.click(screen.getByRole('button', { name: 'Passwort festlegen' }));
    await waitFor(() => expect(auth.linkPassword).toHaveBeenCalledWith('12345678'));
    expect(
      await screen.findByText('Passwort wurde festgelegt. Du kannst dich jetzt auch mit E-Mail und Passwort anmelden.'),
    ).toBeInTheDocument();
  });

  it('maps link errors to German messages without crashing (edge case 13)', async () => {
    const uiUser = userEvent.setup();
    const auth = new FakeAuthService();
    auth.linkGoogle.mockRejectedValueOnce(
      new AuthError('credential-already-in-use', 'Dieses Google-Konto ist bereits mit einem anderen Zeiterfassungs-Konto verknüpft.'),
    );
    renderAccountView(user({ providerIds: ['password'] }), auth);
    await uiUser.click(screen.getByRole('button', { name: 'Google verknüpfen' }));
    expect(
      await screen.findByText('Dieses Google-Konto ist bereits mit einem anderen Zeiterfassungs-Konto verknüpft.'),
    ).toBeInTheDocument();
  });

  it('shows no message for a cancelled link error', async () => {
    const uiUser = userEvent.setup();
    const auth = new FakeAuthService();
    auth.linkGoogle.mockRejectedValueOnce({ code: 'auth/popup-closed-by-user' });
    renderAccountView(user({ providerIds: ['password'] }), auth);
    await uiUser.click(screen.getByRole('button', { name: 'Google verknüpfen' }));
    await waitFor(() => expect(auth.linkGoogle).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('AccountView: theme', () => {
  it('reflects and changes the theme preference via radio buttons', async () => {
    const uiUser = userEvent.setup();
    const { repo } = renderAccountView(user());
    const dark = screen.getByRole('radio', { name: 'Dunkel' });
    expect(dark).not.toBeChecked();
    await uiUser.click(dark);
    expect(dark).toBeChecked();
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
    await waitFor(() => expect(repo.getEntries).toBeDefined()); // sanity: repo usable
  });
});

describe('AccountView: sign-out', () => {
  it('calls auth.signOut when clicking "Abmelden"', async () => {
    const uiUser = userEvent.setup();
    const { auth } = renderAccountView(user());
    await uiUser.click(screen.getByRole('button', { name: 'Abmelden' }));
    await waitFor(() => expect(auth.signOut).toHaveBeenCalled());
  });
});

describe('AccountView: account info', () => {
  it('shows email and displayName when present', () => {
    renderAccountView(user({ displayName: 'Alex' }));
    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.getByText('a@b.de')).toBeInTheDocument();
  });
});

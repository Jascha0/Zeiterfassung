import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ServicesProvider, type Services } from '../app/ServicesContext';
import type { AuthUser } from '../auth/authTypes';
import { createTestStore } from '../test/createTestStore';
import { FakeAuthService } from '../test/fakeAuthService';
import { VerificationBanner } from './VerificationBanner';

function user(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    uid: 'u1',
    email: 'a@b.de',
    displayName: null,
    emailVerified: false,
    providerIds: ['password'],
    ...overrides,
  };
}

function renderBanner(authUser: AuthUser, auth = new FakeAuthService()) {
  const { store } = createTestStore();
  const services: Services = { auth, entries: store, settings: store };
  render(
    <ServicesProvider services={services}>
      <VerificationBanner user={authUser} />
    </ServicesProvider>,
  );
  return { auth };
}

beforeEach(() => {
  sessionStorage.clear();
});

describe('VerificationBanner: dismiss (edge case 35)', () => {
  it('hides the banner for the session after clicking "Hinweis schließen"', async () => {
    const usr = userEvent.setup();
    renderBanner(user());
    expect(screen.getByRole('region', { name: 'E-Mail-Bestätigung' })).toBeInTheDocument();

    await usr.click(screen.getByRole('button', { name: 'Hinweis schließen' }));
    expect(screen.queryByRole('region', { name: 'E-Mail-Bestätigung' })).not.toBeInTheDocument();
    expect(sessionStorage.getItem('zeiterfassung.verifyBannerDismissed.u1')).toBe('1');
  });

  it('stays hidden on remount for the same uid because of the sessionStorage flag', async () => {
    sessionStorage.setItem('zeiterfassung.verifyBannerDismissed.u1', '1');
    renderBanner(user());
    expect(screen.queryByRole('region', { name: 'E-Mail-Bestätigung' })).not.toBeInTheDocument();
  });
});

describe('VerificationBanner: "erneut senden" (edge case 35)', () => {
  it('shows the success message when the resend succeeds', async () => {
    const usr = userEvent.setup();
    const { auth } = renderBanner(user());
    await usr.click(screen.getByRole('button', { name: 'erneut senden' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Bestätigungs-E-Mail wurde gesendet.'),
    );
    expect(auth.resendVerificationEmail).toHaveBeenCalledTimes(1);
  });

  it('shows the mapped message for too-many-requests', async () => {
    const usr = userEvent.setup();
    const { auth } = renderBanner(user());
    auth.resendVerificationEmail.mockRejectedValueOnce({ code: 'auth/too-many-requests' });

    await usr.click(screen.getByRole('button', { name: 'erneut senden' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Zu viele Versuche. Bitte warte einen Moment und versuche es erneut.',
      ),
    );
  });
});

describe('VerificationBanner: visibility', () => {
  it('does not render for a verified user', () => {
    renderBanner(user({ emailVerified: true }));
    expect(screen.queryByRole('region', { name: 'E-Mail-Bestätigung' })).not.toBeInTheDocument();
  });

  it('does not render for a Google-only user', () => {
    renderBanner(user({ providerIds: ['google.com'] }));
    expect(screen.queryByRole('region', { name: 'E-Mail-Bestätigung' })).not.toBeInTheDocument();
  });
});

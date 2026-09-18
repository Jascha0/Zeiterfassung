import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ServicesProvider, type Services } from '../app/ServicesContext';
import { AuthProvider } from '../auth/AuthContext';
import { AuthError } from '../auth/authTypes';
import { InMemoryRepository } from '../data/inMemoryRepository';
import { FakeAuthService } from '../test/fakeAuthService';
import { LoginView } from './LoginView';

function renderLoginView(auth = new FakeAuthService()) {
  const repo = new InMemoryRepository();
  const services: Services = { auth, entries: repo, settings: repo };
  render(
    <ServicesProvider services={services}>
      <AuthProvider>
        <LoginView />
      </AuthProvider>
    </ServicesProvider>,
  );
  return { auth };
}

describe('LoginView: happy path', () => {
  it('signs in with trimmed email and the given password', async () => {
    const user = userEvent.setup();
    const { auth } = renderLoginView();
    await user.type(screen.getByLabelText('E-Mail'), '  a@b.de  ');
    await user.type(screen.getByLabelText('Passwort'), 'secret123');
    await user.click(screen.getByRole('button', { name: 'Anmelden' }));
    await waitFor(() => expect(auth.signInWithEmail).toHaveBeenCalledWith('a@b.de', 'secret123'));
  });
});

describe('LoginView: client validation (edge case 6)', () => {
  it('shows an error and makes no service call for empty email', async () => {
    const user = userEvent.setup();
    const { auth } = renderLoginView();
    await user.click(screen.getByRole('button', { name: 'Anmelden' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Bitte gib deine E-Mail-Adresse ein.');
    expect(auth.signInWithEmail).not.toHaveBeenCalled();
  });

  it('shows an error for empty password on sign-in', async () => {
    const user = userEvent.setup();
    const { auth } = renderLoginView();
    await user.type(screen.getByLabelText('E-Mail'), 'a@b.de');
    await user.click(screen.getByRole('button', { name: 'Anmelden' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Bitte gib dein Passwort ein.');
    expect(auth.signInWithEmail).not.toHaveBeenCalled();
  });

  it('register: rejects a 7-char password, accepts 8 (boundary)', async () => {
    const user = userEvent.setup();
    const { auth } = renderLoginView();
    await user.click(screen.getByRole('button', { name: 'Neues Konto erstellen' }));
    await user.type(screen.getByLabelText('E-Mail'), 'a@b.de');
    await user.type(screen.getByLabelText('Passwort'), '1234567');
    await user.type(screen.getByLabelText('Passwort bestätigen'), '1234567');
    await user.click(screen.getByRole('button', { name: 'Registrieren' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Das Passwort muss mindestens 8 Zeichen lang sein.');
    expect(auth.registerWithEmail).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Passwort'), '8');
    await user.type(screen.getByLabelText('Passwort bestätigen'), '8');
    await user.click(screen.getByRole('button', { name: 'Registrieren' }));
    await waitFor(() => expect(auth.registerWithEmail).toHaveBeenCalledWith('a@b.de', '12345678'));
  });

  it('register: rejects mismatching password confirmation', async () => {
    const user = userEvent.setup();
    const { auth } = renderLoginView();
    await user.click(screen.getByRole('button', { name: 'Neues Konto erstellen' }));
    await user.type(screen.getByLabelText('E-Mail'), 'a@b.de');
    await user.type(screen.getByLabelText('Passwort'), 'password1');
    await user.type(screen.getByLabelText('Passwort bestätigen'), 'password2');
    await user.click(screen.getByRole('button', { name: 'Registrieren' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Die Passwörter stimmen nicht überein.');
    expect(auth.registerWithEmail).not.toHaveBeenCalled();
  });
});

describe('LoginView: password reset (edge case 8)', () => {
  it('shows the neutral success message after requesting a reset', async () => {
    const user = userEvent.setup();
    renderLoginView();
    await user.click(screen.getByRole('button', { name: 'Passwort vergessen?' }));
    await user.type(screen.getByLabelText('E-Mail'), 'unknown@b.de');
    await user.click(screen.getByRole('button', { name: 'Link zum Zurücksetzen senden' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Falls ein Konto mit dieser E-Mail-Adresse existiert, wurde eine E-Mail zum Zurücksetzen des Passworts gesendet.',
    );
  });
});

describe('LoginView: error mapping', () => {
  it('shows the mapped German message for a service error', async () => {
    const user = userEvent.setup();
    const auth = new FakeAuthService();
    auth.signInWithEmail.mockRejectedValueOnce(new AuthError('wrong-password', 'Das Passwort ist falsch.'));
    renderLoginView(auth);
    await user.type(screen.getByLabelText('E-Mail'), 'a@b.de');
    await user.type(screen.getByLabelText('Passwort'), 'x');
    await user.click(screen.getByRole('button', { name: 'Anmelden' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Das Passwort ist falsch.');
  });

  it('shows no message for a cancelled error (edge case 10)', async () => {
    const user = userEvent.setup();
    const auth = new FakeAuthService();
    auth.signInWithGoogle.mockRejectedValueOnce({ code: 'auth/popup-closed-by-user' });
    renderLoginView(auth);
    await user.click(screen.getByRole('button', { name: 'Mit Google anmelden' }));
    await waitFor(() => expect(auth.signInWithGoogle).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('LoginView: double submit / busy state (edge case 15)', () => {
  it('disables the submit and Google buttons while a request is pending, and only calls the service once', async () => {
    const user = userEvent.setup();
    const auth = new FakeAuthService();
    let resolveSignIn: () => void = () => {};
    auth.signInWithEmail.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveSignIn = resolve;
        }),
    );
    renderLoginView(auth);
    await user.type(screen.getByLabelText('E-Mail'), 'a@b.de');
    await user.type(screen.getByLabelText('Passwort'), 'secret123');
    const submitButton = screen.getByRole('button', { name: 'Anmelden' });
    await user.click(submitButton);
    expect(submitButton).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Mit Google anmelden' })).toBeDisabled();

    await user.click(submitButton); // second click while busy must not fire again
    expect(auth.signInWithEmail).toHaveBeenCalledTimes(1);

    resolveSignIn();
    await waitFor(() => expect(submitButton).not.toBeDisabled());
  });
});

describe('LoginView: mode switching', () => {
  it('clears messages when switching mode', async () => {
    const user = userEvent.setup();
    renderLoginView();
    await user.click(screen.getByRole('button', { name: 'Anmelden' })); // triggers validation error
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Neues Konto erstellen' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the register heading and password confirmation field only in register mode', async () => {
    const user = userEvent.setup();
    renderLoginView();
    expect(screen.queryByLabelText('Passwort bestätigen')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Neues Konto erstellen' }));
    expect(screen.getByRole('heading', { name: 'Registrierung' })).toBeInTheDocument();
    expect(screen.getByLabelText('Passwort bestätigen')).toBeInTheDocument();
  });

  it('hides the password field and Google button in reset mode', async () => {
    const user = userEvent.setup();
    renderLoginView();
    await user.click(screen.getByRole('button', { name: 'Passwort vergessen?' }));
    expect(screen.queryByLabelText('Passwort')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mit Google anmelden' })).not.toBeInTheDocument();
  });
});

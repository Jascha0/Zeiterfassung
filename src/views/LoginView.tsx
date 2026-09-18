import { useId, useState } from 'react';
import { useServices } from '../app/ServicesContext';
import { useAuth } from '../auth/AuthContext';
import { mapAuthError } from '../auth/authErrors';
import { validateNewPassword } from '../auth/passwordValidation';

type Mode = 'signIn' | 'register' | 'reset';

const RESET_SUCCESS_MESSAGE =
  'Falls ein Konto mit dieser E-Mail-Adresse existiert, wurde eine E-Mail zum Zurücksetzen des Passworts gesendet.';

export function LoginView(): React.JSX.Element {
  const { auth } = useServices();
  const { redirectError, clearRedirectError } = useAuth();
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const fieldId = useId();

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setInfo(null);
    setPassword('');
    setConfirmation('');
    clearRedirectError();
  };

  const run = async (action: () => Promise<void>, successMessage: string | null) => {
    setBusy(true);
    setError(null);
    setInfo(null);
    clearRedirectError();
    try {
      await action();
      if (successMessage !== null) setInfo(successMessage);
    } catch (e) {
      const mapped = mapAuthError(e);
      if (mapped.code !== 'cancelled') setError(mapped.message);
    } finally {
      setBusy(false);
    }
  };

  const validate = (trimmedEmail: string): string | null => {
    if (trimmedEmail === '') return 'Bitte gib deine E-Mail-Adresse ein.';
    if (mode === 'signIn' && password === '') return 'Bitte gib dein Passwort ein.';
    if (mode === 'register') return validateNewPassword(password, confirmation);
    return null;
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const trimmedEmail = email.trim();
    const validationError = validate(trimmedEmail);
    if (validationError !== null) {
      setInfo(null);
      setError(validationError);
      return;
    }
    if (mode === 'signIn') void run(() => auth.signInWithEmail(trimmedEmail, password), null);
    else if (mode === 'register') void run(() => auth.registerWithEmail(trimmedEmail, password), null);
    else void run(() => auth.sendPasswordReset(trimmedEmail), RESET_SUCCESS_MESSAGE);
  };

  const handleGoogle = () => {
    if (busy) return;
    void run(() => auth.signInWithGoogle(), null);
  };

  const submitLabel = mode === 'signIn' ? 'Anmelden' : mode === 'register' ? 'Registrieren' : 'Link zum Zurücksetzen senden';
  const heading = mode === 'signIn' ? 'Anmeldung' : mode === 'register' ? 'Registrierung' : 'Passwort zurücksetzen';
  const shownError = error ?? redirectError?.message ?? null;

  return (
    <main className="page narrow">
      <h1>Zeiterfassung</h1>
      <section className="card">
        <h2>{heading}</h2>
        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor={`${fieldId}-email`}>E-Mail</label>
            <input
              id={`${fieldId}-email`}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          {mode !== 'reset' && (
            <div className="field">
              <label htmlFor={`${fieldId}-password`}>Passwort</label>
              <input
                id={`${fieldId}-password`}
                type="password"
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
          )}
          {mode === 'register' && (
            <div className="field">
              <label htmlFor={`${fieldId}-confirm`}>Passwort bestätigen</label>
              <input
                id={`${fieldId}-confirm`}
                type="password"
                autoComplete="new-password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </div>
          )}
          {shownError !== null && shownError !== '' && <p role="alert">{shownError}</p>}
          {info !== null && <p role="status">{info}</p>}
          <button type="submit" className="button-primary" disabled={busy}>
            {submitLabel}
          </button>
        </form>

        {mode !== 'reset' && (
          <button type="button" className="button-google" disabled={busy} onClick={handleGoogle}>
            Mit Google anmelden
          </button>
        )}

        <div className="button-row mode-switch">
          {mode === 'signIn' && (
            <>
              <button type="button" className="button-link" onClick={() => switchMode('reset')}>
                Passwort vergessen?
              </button>
              <button type="button" className="button-link" onClick={() => switchMode('register')}>
                Neues Konto erstellen
              </button>
            </>
          )}
          {mode !== 'signIn' && (
            <button type="button" className="button-link" onClick={() => switchMode('signIn')}>
              Zurück zur Anmeldung
            </button>
          )}
        </div>
      </section>
    </main>
  );
}

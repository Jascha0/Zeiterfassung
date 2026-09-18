import { useId, useState } from 'react';
import { useServices } from '../app/ServicesContext';
import { mapAuthError } from '../auth/authErrors';
import type { AuthUser } from '../auth/authTypes';
import { validateNewPassword } from '../auth/passwordValidation';
import type { ThemePreference } from '../theme/theme';
import { useTheme } from '../theme/ThemeContext';

const THEME_OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string }> = [
  { value: 'light', label: 'Hell' },
  { value: 'dark', label: 'Dunkel' },
  { value: 'system', label: 'System' },
];

export function AccountView(props: { user: AuthUser }): React.JSX.Element {
  const { user } = props;
  const { auth } = useServices();
  const { preference, setPreference } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const fieldId = useId();

  const googleLinked = user.providerIds.includes('google.com');
  const passwordLinked = user.providerIds.includes('password');

  const run = async (action: () => Promise<void>, successMessage: string | null, onSuccess?: () => void) => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await action();
      onSuccess?.();
      if (successMessage !== null) setInfo(successMessage);
    } catch (e) {
      const mapped = mapAuthError(e);
      if (mapped.code !== 'cancelled') setError(mapped.message);
    } finally {
      setBusy(false);
    }
  };

  const handleLinkGoogle = () => {
    if (busy) return;
    void run(() => auth.linkGoogle(), 'Google wurde verknüpft.');
  };

  const handleSetPassword = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const validationError = validateNewPassword(password, confirmation);
    if (validationError !== null) {
      setInfo(null);
      setError(validationError);
      return;
    }
    void run(
      () => auth.linkPassword(password),
      'Passwort wurde festgelegt. Du kannst dich jetzt auch mit E-Mail und Passwort anmelden.',
      () => {
        setPassword('');
        setConfirmation('');
      },
    );
  };

  const handleSignOut = () => {
    if (busy) return;
    void run(() => auth.signOut(), null);
  };

  return (
    <main className="page">
      <section className="card">
        <h2>Konto</h2>
        <dl className="account-info">
          {user.displayName !== null && (
            <div>
              <dt>Name</dt>
              <dd>{user.displayName}</dd>
            </div>
          )}
          {user.email !== null && (
            <div>
              <dt>E-Mail-Adresse</dt>
              <dd>{user.email}</dd>
            </div>
          )}
        </dl>

        <h3>Anmeldemethoden</h3>
        <div className="method">
          {googleLinked ? (
            <p>Google: verknüpft</p>
          ) : (
            <button type="button" disabled={busy} onClick={handleLinkGoogle}>
              Google verknüpfen
            </button>
          )}
        </div>
        <div className="method">
          {passwordLinked ? (
            <p>Passwort: festgelegt</p>
          ) : (
            user.email !== null && (
              <form onSubmit={handleSetPassword} noValidate>
                <div className="field">
                  <label htmlFor={`${fieldId}-password`}>Neues Passwort</label>
                  <input
                    id={`${fieldId}-password`}
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>
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
                <button type="submit" disabled={busy}>
                  Passwort festlegen
                </button>
              </form>
            )
          )}
        </div>
        {error !== null && <p role="alert">{error}</p>}
        {info !== null && <p role="status">{info}</p>}
      </section>

      <section className="card">
        <fieldset className="theme-options">
          <legend>Design</legend>
          {THEME_OPTIONS.map((option) => (
            <label key={option.value} className="radio">
              <input
                type="radio"
                name={`${fieldId}-theme`}
                value={option.value}
                checked={preference === option.value}
                onChange={() => setPreference(option.value)}
              />
              {option.label}
            </label>
          ))}
        </fieldset>
      </section>

      <section className="card">
        <button type="button" className="button-secondary" disabled={busy} onClick={handleSignOut}>
          Abmelden
        </button>
      </section>
    </main>
  );
}

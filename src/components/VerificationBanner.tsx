import { useState } from 'react';
import { useServices } from '../app/ServicesContext';
import { mapAuthError } from '../auth/authErrors';
import type { AuthUser } from '../auth/authTypes';

function dismissKey(uid: string): string {
  return `zeiterfassung.verifyBannerDismissed.${uid}`;
}

function readDismissed(uid: string): boolean {
  try {
    return window.sessionStorage.getItem(dismissKey(uid)) === '1';
  } catch {
    return false;
  }
}

function writeDismissed(uid: string): void {
  try {
    window.sessionStorage.setItem(dismissKey(uid), '1');
  } catch {
    // Without sessionStorage the banner stays hidden until the next remount only.
  }
}

export function VerificationBanner(props: { user: AuthUser }): React.JSX.Element | null {
  const { user } = props;
  const { auth } = useServices();
  const [dismissedUid, setDismissedUid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dismissed = dismissedUid === user.uid || readDismissed(user.uid);
  if (!user.providerIds.includes('password') || user.emailVerified || dismissed) return null;

  const run = async (action: () => Promise<void>, successMessage: string | null) => {
    setBusy(true);
    setInfo(null);
    setError(null);
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

  const dismiss = () => {
    writeDismissed(user.uid);
    setDismissedUid(user.uid);
  };

  return (
    <div role="region" aria-label="E-Mail-Bestätigung" className="banner">
      <p>Bitte bestätige deine E-Mail-Adresse. Wir haben dir einen Link gesendet.</p>
      <div className="button-row">
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => auth.resendVerificationEmail(), 'Bestätigungs-E-Mail wurde gesendet.')}
        >
          erneut senden
        </button>
        <button type="button" disabled={busy} onClick={() => void run(() => auth.reloadUser(), null)}>
          Status prüfen
        </button>
        <button type="button" className="button-link" onClick={dismiss}>
          Hinweis schließen
        </button>
      </div>
      {info !== null && <p role="status">{info}</p>}
      {error !== null && <p role="alert">{error}</p>}
    </div>
  );
}

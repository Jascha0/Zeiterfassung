import { useState } from 'react';
import { ServicesProvider, type Services } from './app/ServicesContext';
import { ToastProvider } from './app/ToastContext';
import { AuthProvider, useAuth } from './auth/AuthContext';
import type { AuthUser } from './auth/authTypes';
import { OnlineIndicator } from './components/OnlineIndicator';
import { VerificationBanner } from './components/VerificationBanner';
import { ThemeProvider } from './theme/ThemeContext';
import { AccountView } from './views/AccountView';
import { LoginView } from './views/LoginView';
import { TimerView } from './views/TimerView';

type View = 'timer' | 'account';

function Shell(props: { user: AuthUser }): React.JSX.Element {
  const { user } = props;
  const { redirectError, clearRedirectError } = useAuth();
  const [view, setView] = useState<View>('timer');

  return (
    <div className="shell">
      <header className="app-header">
        <h1>Zeiterfassung</h1>
        <OnlineIndicator />
        <nav aria-label="Hauptnavigation" className="main-nav">
          <button
            type="button"
            aria-current={view === 'timer' ? 'page' : undefined}
            onClick={() => setView('timer')}
          >
            Timer
          </button>
          <button
            type="button"
            aria-current={view === 'account' ? 'page' : undefined}
            onClick={() => setView('account')}
          >
            Konto
          </button>
        </nav>
      </header>
      {redirectError !== null && redirectError.message !== '' && (
        <div className="banner">
          <p role="alert">{redirectError.message}</p>
          <button type="button" className="button-link" onClick={clearRedirectError}>
            Meldung schließen
          </button>
        </div>
      )}
      <VerificationBanner user={user} />
      {view === 'timer' ? <TimerView /> : <AccountView user={user} />}
    </div>
  );
}

function Gate(): React.JSX.Element {
  const { user, loading } = useAuth();

  if (loading) return <p className="loading">Lädt…</p>;

  if (user === null) {
    return (
      <ThemeProvider>
        <LoginView />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider key={user.uid}>
      <Shell user={user} />
    </ThemeProvider>
  );
}

export default function App(props: { services: Services }): React.JSX.Element {
  return (
    <ServicesProvider services={props.services}>
      <ToastProvider>
        <AuthProvider>
          <Gate />
        </AuthProvider>
      </ToastProvider>
    </ServicesProvider>
  );
}

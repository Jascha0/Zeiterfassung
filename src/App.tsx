import { useState } from 'react';
import { ServicesProvider, type Services } from './app/ServicesContext';
import { ToastProvider } from './app/ToastContext';
import { AuthProvider, useAuth } from './auth/AuthContext';
import type { AuthUser } from './auth/authTypes';
import { OnlineIndicator } from './components/OnlineIndicator';
import { VerificationBanner } from './components/VerificationBanner';
import { monthStartOf } from './domain/calendar';
import { ThemeProvider } from './theme/ThemeContext';
import { AccountView } from './views/AccountView';
import { CalendarView } from './views/CalendarView';
import { DayDetailView } from './views/DayDetailView';
import { LoginView } from './views/LoginView';
import { ResolveView } from './views/ResolveView';
import { TimerView } from './views/TimerView';

type View =
  | { name: 'timer' }
  | { name: 'account' }
  | { name: 'calendar'; monthStart: number }
  | { name: 'day'; dayStart: number }
  | { name: 'resolve' };

function renderView(view: View, user: AuthUser, setView: (view: View) => void): React.JSX.Element {
  switch (view.name) {
    case 'timer':
      return <TimerView uid={user.uid} onResolveOpenEntries={() => setView({ name: 'resolve' })} />;
    case 'account':
      return <AccountView user={user} />;
    case 'calendar':
      return (
        <CalendarView
          uid={user.uid}
          monthStart={view.monthStart}
          onMonthChange={(monthStart) => setView({ name: 'calendar', monthStart })}
          onOpenDay={(dayStart) => setView({ name: 'day', dayStart })}
        />
      );
    case 'day':
      return (
        <DayDetailView
          key={view.dayStart}
          uid={user.uid}
          dayStart={view.dayStart}
          onDayChange={(dayStart) => setView({ name: 'day', dayStart })}
          onBack={() => setView({ name: 'calendar', monthStart: monthStartOf(view.dayStart) })}
        />
      );
    case 'resolve':
      return <ResolveView uid={user.uid} onBack={() => setView({ name: 'timer' })} />;
  }
}

function Shell(props: { user: AuthUser }): React.JSX.Element {
  const { user } = props;
  const { redirectError, clearRedirectError } = useAuth();
  const [view, setView] = useState<View>({ name: 'timer' });
  const timerActive = view.name === 'timer' || view.name === 'resolve';
  const calendarActive = view.name === 'calendar' || view.name === 'day';

  return (
    <div className="shell">
      <header className="app-header">
        <h1>Zeiterfassung</h1>
        <OnlineIndicator />
        <nav aria-label="Hauptnavigation" className="main-nav">
          <button
            type="button"
            aria-current={timerActive ? 'page' : undefined}
            onClick={() => setView({ name: 'timer' })}
          >
            Timer
          </button>
          <button
            type="button"
            aria-current={calendarActive ? 'page' : undefined}
            onClick={() => setView({ name: 'calendar', monthStart: monthStartOf(Date.now()) })}
          >
            Kalender
          </button>
          <button
            type="button"
            aria-current={view.name === 'account' ? 'page' : undefined}
            onClick={() => setView({ name: 'account' })}
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
      {renderView(view, user, setView)}
    </div>
  );
}

function Gate(): React.JSX.Element {
  const { user, loading } = useAuth();

  if (loading) return <p className="loading">Lädt…</p>;

  if (user === null) {
    return (
      <ThemeProvider uid={null}>
        <LoginView />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider key={user.uid} uid={user.uid}>
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

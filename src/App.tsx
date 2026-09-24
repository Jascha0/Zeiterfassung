import { ServicesProvider, type Services } from './app/ServicesContext';
import { ToastProvider } from './app/ToastContext';
import { monthKeyOfDateKey, toMonthKey } from './domain/routing';
import { useRoute } from './hooks/useRoute';
import { ThemeProvider } from './theme/ThemeContext';
import { CalendarView } from './views/CalendarView';
import { DayDetailView } from './views/DayDetailView';
import { SettingsView } from './views/SettingsView';
import { TimerView } from './views/TimerView';

function Shell(): React.JSX.Element {
  const { route, navigate } = useRoute();
  const calendarCurrent = route.kind === 'calendar' || route.kind === 'day';

  return (
    <div className="shell">
      <header className="app-header">
        <h1>Zeiterfassung</h1>
        <nav aria-label="Hauptnavigation" className="main-nav">
          <button
            type="button"
            aria-current={route.kind === 'timer' ? 'page' : undefined}
            onClick={() => navigate({ kind: 'timer' })}
          >
            Timer
          </button>
          <button
            type="button"
            aria-current={calendarCurrent ? 'page' : undefined}
            onClick={() => navigate({ kind: 'calendar', monthKey: toMonthKey(Date.now()) })}
          >
            Kalender
          </button>
          <button
            type="button"
            aria-current={route.kind === 'settings' ? 'page' : undefined}
            onClick={() => navigate({ kind: 'settings' })}
          >
            Einstellungen
          </button>
        </nav>
      </header>
      {route.kind === 'timer' && <TimerView onOpenDay={(dateKey) => navigate({ kind: 'day', dateKey })} />}
      {route.kind === 'calendar' && (
        <CalendarView
          monthKey={route.monthKey}
          onSelectMonth={(monthKey) => navigate({ kind: 'calendar', monthKey })}
          onOpenDay={(dateKey) => navigate({ kind: 'day', dateKey })}
        />
      )}
      {route.kind === 'day' && (
        <DayDetailView
          dateKey={route.dateKey}
          onBack={() => navigate({ kind: 'calendar', monthKey: monthKeyOfDateKey(route.dateKey) })}
        />
      )}
      {route.kind === 'settings' && <SettingsView />}
    </div>
  );
}

export default function App(props: { services: Services }): React.JSX.Element {
  return (
    <ServicesProvider services={props.services}>
      <ToastProvider>
        <ThemeProvider>
          <Shell />
        </ThemeProvider>
      </ToastProvider>
    </ServicesProvider>
  );
}

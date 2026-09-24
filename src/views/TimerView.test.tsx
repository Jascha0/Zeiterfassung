import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServicesProvider, type Services } from '../app/ServicesContext';
import { ToastProvider } from '../app/ToastContext';
import { noopChannelFactory } from '../data/channel';
import { InMemoryAdapter } from '../data/inMemoryAdapter';
import { createLocalStore, LocalStore } from '../data/localStore';
import { dayStartFromKey, toDateKey } from '../domain/routing';
import { createTestStore } from '../test/createTestStore';
import type { TransitionPlan } from '../domain/timer';
import { TimerView } from './TimerView';

function renderTimer(store: LocalStore, onOpenDay: (dateKey: string) => void = vi.fn()) {
  const services: Services = { entries: store, settings: store };
  return render(
    <ServicesProvider services={services}>
      <ToastProvider>
        <TimerView onOpenDay={onOpenDay} />
      </ToastProvider>
    </ServicesProvider>,
  );
}

describe('TimerView: happy path', () => {
  it('Start -> Pause -> Weiter -> Arbeitstag beenden updates status, totals and the entry list', async () => {
    const user = userEvent.setup();
    renderTimer(createTestStore().store);

    expect(await screen.findByText('Nicht gestartet')).toBeInTheDocument();
    expect(screen.getByText('Heute noch keine Einträge.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(await screen.findByText(/^Arbeitet seit/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Arbeitstag beenden' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Pause' }));
    expect(await screen.findByText(/^Pause seit/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Weiter' })).toBeInTheDocument();
    expect(screen.getByText('Aktuelle Pause')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Weiter' }));
    expect(await screen.findByText(/^Arbeitet seit/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Arbeitstag beenden' }));
    expect(await screen.findByText('Nicht gestartet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3); // work, break, work
    expect(items[0]).toHaveTextContent('Arbeit');
    expect(items[1]).toHaveTextContent('Pause');
    expect(items[2]).toHaveTextContent('Arbeit');
  });
});

describe('TimerView: loading state (edge case 20)', () => {
  it('shows "Lädt…" and no action buttons before subscriptions deliver', () => {
    renderTimer(createTestStore().store);
    expect(screen.getByText('Lädt…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
    expect(screen.queryByText('Heute noch keine Einträge.')).not.toBeInTheDocument();
  });
});

describe('TimerView: reload while working (edge case 19)', () => {
  it('derives the running state and a non-zero elapsed time from the stored start', async () => {
    const start = Date.now() - 5 * 60 * 1000; // started 5 minutes ago
    const { store } = createTestStore({
      entries: [{ id: 'w1', type: 'work', start, end: null, createdAt: start, updatedAt: start }],
    });
    renderTimer(store);

    expect(await screen.findByText(/^Arbeitet seit/)).toBeInTheDocument();
    const workedDd = screen.getByText('Heute gearbeitet').nextElementSibling;
    expect(workedDd?.textContent).not.toBe('0:00:00');
  });
});

describe('TimerView: warnings', () => {
  it('shows the multiple-open-entries warning when 2+ entries are open (edge case 24)', async () => {
    const now = Date.now();
    const { store } = createTestStore({
      entries: [
        { id: 'w1', type: 'work', start: now - 60_000, end: null, createdAt: now, updatedAt: now },
        { id: 'w2', type: 'work', start: now - 30_000, end: null, createdAt: now, updatedAt: now },
      ],
    });
    renderTimer(store);
    await waitFor(() => expect(screen.getByText(/mehrere offene Einträge/)).toBeInTheDocument());
  });

  it('shows the >12h warning for an open work block running over the threshold (edge case 25)', async () => {
    const now = Date.now();
    const start = now - (12 * 60 * 60 * 1000 + 60_000);
    const { store } = createTestStore({
      entries: [{ id: 'w1', type: 'work', start, end: null, createdAt: start, updatedAt: start }],
    });
    renderTimer(store);
    await waitFor(() => expect(screen.getByText(/läuft seit mehr als 12 Stunden/)).toBeInTheDocument());
  });

  it('does not show the >12h warning for an open break, even past the threshold (edge case 25)', async () => {
    const now = Date.now();
    const start = now - 13 * 60 * 60 * 1000;
    const { store } = createTestStore({
      entries: [{ id: 'b1', type: 'break', start, end: null, createdAt: start, updatedAt: start }],
    });
    renderTimer(store);
    await screen.findByText(/^Pause seit/);
    expect(screen.queryByText(/läuft seit mehr als 12 Stunden/)).not.toBeInTheDocument();
  });
});

describe('TimerView: write rejected (edge case 22)', () => {
  it('shows a toast and rolls back local state when the local write fails', async () => {
    const user = userEvent.setup();
    const { store, adapter } = createTestStore();
    renderTimer(store);
    await screen.findByText('Nicht gestartet');

    adapter.failNextApply(Object.assign(new Error('denied'), { name: 'AbortError' }));
    await user.click(screen.getByRole('button', { name: 'Start' }));

    const toastRegion = screen.getByRole('status');
    await waitFor(() =>
      expect(within(toastRegion).getByText('Die Änderung konnte nicht gespeichert werden.')).toBeInTheDocument(),
    );
    // Rolled back to idle; buttons re-enabled.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled());
  });
});

describe('TimerView: subscription error (edge case 23)', () => {
  it('shows the load-error message and does not crash', async () => {
    const adapter = new InMemoryAdapter();
    adapter.failNextLoad(new Error('boom'));
    renderTimer(createLocalStore({ adapter, navigator: null, channelFactory: noopChannelFactory }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Daten konnten nicht geladen werden.');
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
  });
});

describe('TimerView: double click / rapid submit (edge case 15, review fix)', () => {
  /**
   * LocalStore's own applyTransition settles (and re-notifies openEntries) almost immediately,
   * which would flip `pending` back to false before a second synthetic click could land. To
   * actually observe the disabled window, this store records calls but never resolves or
   * re-notifies, so the component's `pending` state stays true for the whole test.
   */
  class StuckStore extends LocalStore {
    applyTransitionCalls = 0;
    override applyTransition(_plan: TransitionPlan): Promise<void> {
      this.applyTransitionCalls += 1;
      return new Promise(() => {});
    }
  }

  it('disables the action buttons while a write is pending, and applyTransition runs once on a double click', async () => {
    const user = userEvent.setup();
    const store = new StuckStore({ adapter: new InMemoryAdapter(), navigator: null, channelFactory: noopChannelFactory });
    renderTimer(store);
    await screen.findByText('Nicht gestartet');

    const startButton = screen.getByRole('button', { name: 'Start' });
    expect(startButton).toBeEnabled();

    await user.click(startButton);
    expect(startButton).toBeDisabled();
    expect(store.applyTransitionCalls).toBe(1);

    // Second click while pending: the button is disabled, so no click event is dispatched
    // and no second transition is planned/applied.
    await user.click(startButton);
    expect(store.applyTransitionCalls).toBe(1);
    expect(startButton).toBeDisabled();
  });
});

describe('TimerView: midnight rollover (edge case 28, review fix)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resets totals and the entry list, keeps the listener count at 2, and keeps showing an entry still open from yesterday', async () => {
    const beforeMidnight = new Date('2026-01-15T23:59:58+01:00').getTime();
    vi.setSystemTime(beforeMidnight);

    const closedStart = new Date('2026-01-15T09:00:00+01:00').getTime();
    const closedEnd = new Date('2026-01-15T17:00:00+01:00').getTime();
    const openStart = new Date('2026-01-15T23:00:00+01:00').getTime();
    const { store } = createTestStore({
      entries: [
        { id: 'w1', type: 'work', start: closedStart, end: closedEnd, createdAt: closedStart, updatedAt: closedEnd },
        { id: 'w2', type: 'work', start: openStart, end: null, createdAt: openStart, updatedAt: openStart },
      ],
    });

    renderTimer(store);

    expect(await screen.findByText('Arbeitet seit 23:00')).toBeInTheDocument();
    const workedBefore = screen.getByText('Heute gearbeitet').nextElementSibling;
    expect(workedBefore?.textContent).not.toBe('0:00:00');
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0);
    expect(store.listenerCount()).toBe(2);

    // Cross midnight: ticking useNow's 1s interval forward through 00:00 re-keys useTimerData.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });

    await waitFor(() => expect(screen.queryByText('Lädt…')).not.toBeInTheDocument());
    expect(store.listenerCount()).toBe(2);
    // Still shows the entry open since yesterday: status is day-independent.
    expect(screen.getByText('Arbeitet seit 23:00')).toBeInTheDocument();
    await waitFor(() => {
      const workedAfter = screen.getByText('Heute gearbeitet').nextElementSibling;
      expect(workedAfter?.textContent).toBe('0:00:00');
    });
    expect(screen.getByText('Heute noch keine Einträge.')).toBeInTheDocument();
  });
});

describe('TimerView: multiple open entries link to the oldest one (B6)', () => {
  it('shows the new warning with a link to the oldest open entry, and drops the warning once it is closed', async () => {
    const uiUser = userEvent.setup();
    const now = Date.now();
    const todayStart = dayStartFromKey(toDateKey(now));
    const oldestStart = todayStart - 2 * 60 * 60 * 1000;
    const newerStart = todayStart + Math.floor((now - todayStart) / 2);
    const { store } = createTestStore({
      entries: [
        { id: 'old', type: 'work', start: oldestStart, end: null, createdAt: oldestStart, updatedAt: oldestStart },
        { id: 'new', type: 'work', start: newerStart, end: null, createdAt: newerStart, updatedAt: newerStart },
      ],
    });
    const onOpenDay = vi.fn();
    renderTimer(store, onOpenDay);

    expect(
      await screen.findByText('Es gibt mehrere offene Einträge. Aktionen betreffen den zuletzt gestarteten Eintrag.'),
    ).toBeInTheDocument();
    await uiUser.click(screen.getByRole('button', { name: 'Ältesten offenen Eintrag öffnen' }));
    expect(onOpenDay).toHaveBeenCalledWith(toDateKey(oldestStart));

    // Closing the oldest entry — what the day detail does — makes the warning disappear.
    // React may print an "update was not wrapped in act(…)" warning here: the store notifies
    // synchronously. That is expected noise; the waitFor below wraps in act itself. Do not "fix" it by
    // weakening an assertion.
    await store.updateEntry('old', { end: oldestStart + 60 * 60 * 1000, updatedAt: Date.now() });
    await waitFor(() =>
      expect(
        screen.queryByText('Es gibt mehrere offene Einträge. Aktionen betreffen den zuletzt gestarteten Eintrag.'),
      ).not.toBeInTheDocument(),
    );
  });
});

describe('TimerView: after the running entry has been closed (B22)', () => {
  it('shows "Nicht gestartet" with Start available once the only open entry has an end', async () => {
    const start = Date.now() - 2 * 60 * 60 * 1000;
    const { store } = createTestStore({
      entries: [{ id: 'w1', type: 'work', start, end: null, createdAt: start, updatedAt: start }],
    });
    renderTimer(store);
    expect(await screen.findByText(/^Arbeitet seit/)).toBeInTheDocument();

    // Exactly what the day detail does when its end is set: one updateEntry, never applyTransition.
    // An "update was not wrapped in act(…)" warning here is expected noise (the store notifies
    // synchronously); findByText below wraps in act. Do not silence it by changing an assertion.
    await store.updateEntry('w1', { end: start + 60 * 60 * 1000, updatedAt: Date.now() });

    expect(await screen.findByText('Nicht gestartet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument();
  });
});

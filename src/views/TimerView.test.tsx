import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServicesProvider, type Services } from '../app/ServicesContext';
import { ToastProvider } from '../app/ToastContext';
import { InMemoryRepository } from '../data/inMemoryRepository';
import { FakeAuthService } from '../test/fakeAuthService';
import type { Entry, Project, TimeRange } from '../domain/types';
import type { TransitionPlan } from '../domain/timer';
import type { Unsubscribe } from '../auth/authTypes';
import { TimerView } from './TimerView';

const UID = 'u1';

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => queueMicrotask(resolve));
}

function renderTimer(repo: InMemoryRepository) {
  const services: Services = { auth: new FakeAuthService(), entries: repo, settings: repo };
  return render(
    <ServicesProvider services={services}>
      <ToastProvider>
        <TimerView uid={UID} />
      </ToastProvider>
    </ServicesProvider>,
  );
}

describe('TimerView: happy path', () => {
  it('Start -> Pause -> Weiter -> Arbeitstag beenden updates status, totals and the entry list', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    renderTimer(repo);

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
    const repo = new InMemoryRepository();
    renderTimer(repo);
    expect(screen.getByText('Lädt…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
    expect(screen.queryByText('Heute noch keine Einträge.')).not.toBeInTheDocument();
  });
});

describe('TimerView: reload while working (edge case 19)', () => {
  it('derives the running state and a non-zero elapsed time from the stored start', async () => {
    const repo = new InMemoryRepository();
    const start = Date.now() - 5 * 60 * 1000; // started 5 minutes ago
    repo.seedEntries(UID, [{ id: 'w1', type: 'work', start, end: null, createdAt: start, updatedAt: start }]);
    renderTimer(repo);

    expect(await screen.findByText(/^Arbeitet seit/)).toBeInTheDocument();
    const workedDd = screen.getByText('Heute gearbeitet').nextElementSibling;
    expect(workedDd?.textContent).not.toBe('0:00:00');
  });
});

describe('TimerView: warnings', () => {
  it('shows the multiple-open-entries warning when 2+ entries are open (edge case 24)', async () => {
    const repo = new InMemoryRepository();
    const now = Date.now();
    repo.seedEntries(UID, [
      { id: 'w1', type: 'work', start: now - 60_000, end: null, createdAt: now, updatedAt: now },
      { id: 'w2', type: 'work', start: now - 30_000, end: null, createdAt: now, updatedAt: now },
    ]);
    renderTimer(repo);
    await waitFor(() =>
      expect(screen.getByText(/mehrere offene Einträge/)).toBeInTheDocument(),
    );
  });

  it('shows the >12h warning for an open work block running over the threshold (edge case 25)', async () => {
    const repo = new InMemoryRepository();
    const now = Date.now();
    const start = now - (12 * 60 * 60 * 1000 + 60_000);
    repo.seedEntries(UID, [{ id: 'w1', type: 'work', start, end: null, createdAt: start, updatedAt: start }]);
    renderTimer(repo);
    await waitFor(() =>
      expect(screen.getByText(/läuft seit mehr als 12 Stunden/)).toBeInTheDocument(),
    );
  });

  it('does not show the >12h warning for an open break, even past the threshold (edge case 25)', async () => {
    const repo = new InMemoryRepository();
    const now = Date.now();
    const start = now - (13 * 60 * 60 * 1000);
    repo.seedEntries(UID, [{ id: 'b1', type: 'break', start, end: null, createdAt: start, updatedAt: start }]);
    renderTimer(repo);
    await screen.findByText(/^Pause seit/);
    expect(screen.queryByText(/läuft seit mehr als 12 Stunden/)).not.toBeInTheDocument();
  });
});

describe('TimerView: resolve open entries entry point', () => {
  function seedTwoOpen(repo: InMemoryRepository) {
    const now = Date.now();
    repo.seedEntries(UID, [
      { id: 'w1', type: 'work', start: now - 60_000, end: null, createdAt: now, updatedAt: now },
      { id: 'w2', type: 'work', start: now - 30_000, end: null, createdAt: now, updatedAt: now },
    ]);
  }

  it('offers "Offene Einträge bereinigen" with two open entries and calls the callback', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    seedTwoOpen(repo);
    const spy = vi.fn();
    const services: Services = { auth: new FakeAuthService(), entries: repo, settings: repo };
    render(
      <ServicesProvider services={services}>
        <ToastProvider>
          <TimerView uid={UID} onResolveOpenEntries={spy} />
        </ToastProvider>
      </ServicesProvider>,
    );

    const warning = await screen.findByText(/mehrere offene Einträge/);
    expect(warning).toHaveTextContent('Bitte beende oder lösche die älteren offenen Einträge.');
    expect(warning).not.toHaveTextContent('Eine Bereinigung ist in einer späteren Version möglich.');
    await user.click(screen.getByRole('button', { name: 'Offene Einträge bereinigen' }));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does not render the button without the callback prop', async () => {
    const repo = new InMemoryRepository();
    seedTwoOpen(repo);
    renderTimer(repo);
    await screen.findByText(/mehrere offene Einträge/);
    expect(screen.queryByRole('button', { name: 'Offene Einträge bereinigen' })).not.toBeInTheDocument();
  });
});

describe('TimerView: offline (edge case 21)', () => {
  it('updates the UI immediately while offline; the write stays pending and no error toast appears', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    repo.setOffline(true);
    renderTimer(repo);
    await screen.findByText('Nicht gestartet');

    await user.click(screen.getByRole('button', { name: 'Start' }));
    // Local state updates immediately from the synchronous notify.
    expect(await screen.findByText(/^Arbeitet seit/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/Speichern fehlgeschlagen/)).not.toBeInTheDocument();

    await act(async () => {
      repo.setOffline(false);
      await flushMicrotasks();
    });
    expect(screen.queryByText(/Speichern fehlgeschlagen/)).not.toBeInTheDocument();
  });
});

describe('TimerView: write rejected (edge case 22)', () => {
  it('shows a toast and rolls back local state on permission-denied', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    renderTimer(repo);
    await screen.findByText('Nicht gestartet');

    repo.failNextWrite(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    await user.click(screen.getByRole('button', { name: 'Start' }));

    const toastRegion = screen.getByRole('status');
    await waitFor(() =>
      expect(within(toastRegion).getByText('Speichern fehlgeschlagen: keine Berechtigung.')).toBeInTheDocument(),
    );
    // Rolled back to idle; buttons re-enabled.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled());
  });
});

describe('TimerView: subscription error (edge case 23)', () => {
  it('shows the load-error message and does not crash', async () => {
    class FailingRepo extends InMemoryRepository {
      override subscribeEntriesInRange(
        _uid: string,
        _range: TimeRange,
        _onChange: (entries: Entry[]) => void,
        onError: (error: Error) => void,
      ): Unsubscribe {
        queueMicrotask(() => onError(new Error('boom')));
        return () => {};
      }
      override subscribeOpenEntries(
        _uid: string,
        _onChange: (entries: Entry[]) => void,
        onError: (error: Error) => void,
      ): Unsubscribe {
        queueMicrotask(() => onError(new Error('boom')));
        return () => {};
      }
    }
    renderTimer(new FailingRepo());
    expect(await screen.findByRole('alert')).toHaveTextContent('Daten konnten nicht geladen werden.');
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
  });
});

describe('TimerView: double click / rapid submit (edge case 15, review fix)', () => {
  /**
   * InMemoryRepository's own applyTransition settles (and re-notifies openEntries) almost
   * immediately, which would flip `pending` back to false before a second synthetic click
   * could land. To actually observe the disabled window, this repo records calls but never
   * resolves or re-notifies, so the component's `pending` state stays true for the whole test.
   */
  class StuckRepo extends InMemoryRepository {
    applyTransitionCalls = 0;
    override applyTransition(_uid: string, _plan: TransitionPlan): Promise<void> {
      this.applyTransitionCalls += 1;
      return new Promise(() => {});
    }
  }

  it('disables the action buttons while a write is pending, and applyTransition runs once on a double click', async () => {
    const user = userEvent.setup();
    const repo = new StuckRepo();
    renderTimer(repo);
    await screen.findByText('Nicht gestartet');

    const startButton = screen.getByRole('button', { name: 'Start' });
    expect(startButton).toBeEnabled();

    await user.click(startButton);
    expect(startButton).toBeDisabled();
    expect(repo.applyTransitionCalls).toBe(1);

    // Second click while pending: the button is disabled, so no click event is dispatched
    // and no second transition is planned/applied.
    await user.click(startButton);
    expect(repo.applyTransitionCalls).toBe(1);
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

    const repo = new InMemoryRepository();
    const closedStart = new Date('2026-01-15T09:00:00+01:00').getTime();
    const closedEnd = new Date('2026-01-15T17:00:00+01:00').getTime();
    const openStart = new Date('2026-01-15T23:00:00+01:00').getTime();
    repo.seedEntries(UID, [
      { id: 'w1', type: 'work', start: closedStart, end: closedEnd, createdAt: closedStart, updatedAt: closedEnd },
      { id: 'w2', type: 'work', start: openStart, end: null, createdAt: openStart, updatedAt: openStart },
    ]);

    renderTimer(repo);

    expect(await screen.findByText('Arbeitet seit 23:00')).toBeInTheDocument();
    const workedBefore = screen.getByText('Heute gearbeitet').nextElementSibling;
    expect(workedBefore?.textContent).not.toBe('0:00:00');
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0);
    expect(repo.listenerCount()).toBe(2);

    // Cross midnight: ticking useNow's 1s interval forward through 00:00 re-keys useTimerData.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });

    await waitFor(() => expect(screen.queryByText('Lädt…')).not.toBeInTheDocument());
    expect(repo.listenerCount()).toBe(2);
    // Still shows the entry open since yesterday: status is day-independent.
    expect(screen.getByText('Arbeitet seit 23:00')).toBeInTheDocument();
    await waitFor(() => {
      const workedAfter = screen.getByText('Heute gearbeitet').nextElementSibling;
      expect(workedAfter?.textContent).toBe('0:00:00');
    });
    expect(screen.getByText('Heute noch keine Einträge.')).toBeInTheDocument();
  });
});

describe('TimerView: projects (slice 3)', () => {
  function project(id: string, name: string, color: Project['color'] = 'blue', archived = false): Project {
    return { id, name, color, archived, createdAt: 0, updatedAt: 0 };
  }

  function renderWithProjects(repo: InMemoryRepository) {
    const services: Services = { auth: new FakeAuthService(), entries: repo, settings: repo, projects: repo };
    return render(
      <ServicesProvider services={services}>
        <ToastProvider>
          <TimerView uid={UID} />
        </ToastProvider>
      </ServicesProvider>,
    );
  }

  function openEntry(repo: InMemoryRepository): Entry | undefined {
    return repo.getEntries(UID).find((entry) => entry.end === null);
  }

  it('idle: Start with Kunde A creates a work entry with projectId and resets the selection', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    repo.seedProjects(UID, [project('pA', 'Kunde A')]);
    renderWithProjects(repo);
    await screen.findByText('Nicht gestartet');

    await user.selectOptions(screen.getByLabelText('Projekt'), 'pA');
    await user.click(screen.getByRole('button', { name: 'Start' }));
    await screen.findByText(/^Arbeitet seit/);
    expect(openEntry(repo)?.projectId).toBe('pA');

    await user.click(screen.getByRole('button', { name: 'Arbeitstag beenden' }));
    await screen.findByText('Nicht gestartet');
    expect(screen.getByLabelText('Projekt')).toHaveValue('');
  });

  it('idle: lists "Kein Projekt" first, then active projects by name with "Name · Farbe", no archived ones (edges 8, 9)', async () => {
    const repo = new InMemoryRepository();
    repo.seedProjects(UID, [
      project('pB', 'Kunde B', 'green'),
      project('pA', 'Kunde A'),
      project('pX', 'Alt', 'red', true),
    ]);
    renderWithProjects(repo);
    await screen.findByText('Nicht gestartet');
    const options = within(screen.getByLabelText('Projekt')).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(['Kein Projekt', 'Kunde A · Blau', 'Kunde B · Grün']);
  });

  it('idle: a selection archived remotely before Start falls back to "Kein Projekt" (edge 15)', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    repo.seedProjects(UID, [project('pA', 'Kunde A')]);
    renderWithProjects(repo);
    await screen.findByText('Nicht gestartet');

    await user.selectOptions(screen.getByLabelText('Projekt'), 'pA');
    act(() => repo.seedProjects(UID, [project('pA', 'Kunde A', 'blue', true)]));
    expect(screen.getByLabelText('Projekt')).toHaveValue('');

    await user.click(screen.getByRole('button', { name: 'Start' }));
    await screen.findByText(/^Arbeitet seit/);
    const open = openEntry(repo);
    expect(open).toBeDefined();
    expect(open !== undefined && 'projectId' in open).toBe(false);
  });

  it('idle: Start with "Kein Projekt" creates an entry without a projectId key (edge 14)', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    repo.seedProjects(UID, [project('pA', 'Kunde A')]);
    renderWithProjects(repo);
    await screen.findByText('Nicht gestartet');
    await user.click(screen.getByRole('button', { name: 'Start' }));
    await screen.findByText(/^Arbeitet seit/);
    const open = openEntry(repo);
    expect(open).toBeDefined();
    expect(open !== undefined && 'projectId' in open).toBe(false);
  });

  it('working: changing the picker relabels the running entry with only projectId + updatedAt (edge 16)', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    const start = Date.now() - 10 * 60 * 1000;
    repo.seedProjects(UID, [project('pA', 'Kunde A'), project('pB', 'Kunde B', 'green')]);
    repo.seedEntries(UID, [
      { id: 'w1', type: 'work', start, end: null, projectId: 'pA', createdAt: start, updatedAt: start },
    ]);
    const updateSpy = vi.spyOn(repo, 'updateEntry');
    const transitionSpy = vi.spyOn(repo, 'applyTransition');
    renderWithProjects(repo);
    const statusBefore = (await screen.findByText(/^Arbeitet seit/)).textContent;
    expect(screen.getByLabelText('Projekt')).toHaveValue('pA');

    await user.selectOptions(screen.getByLabelText('Projekt'), 'pB');

    expect(updateSpy).toHaveBeenCalledTimes(1);
    const [uid, id, changes] = updateSpy.mock.calls[0];
    expect(uid).toBe(UID);
    expect(id).toBe('w1');
    expect(Object.keys(changes)).toEqual(['projectId', 'updatedAt']);
    expect(changes.projectId).toEqual({ kind: 'set', value: 'pB' });
    expect(transitionSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByLabelText('Projekt')).toHaveValue('pB'));
    const stored = repo.getEntries(UID).find((entry) => entry.id === 'w1');
    expect(stored?.start).toBe(start);
    expect(stored?.end).toBeNull();
    expect(stored?.projectId).toBe('pB');
    expect(screen.getByText(/^Arbeitet seit/).textContent).toBe(statusBefore);
  });

  it('working: choosing "Kein Projekt" removes the projectId key', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    const start = Date.now() - 60_000;
    repo.seedProjects(UID, [project('pA', 'Kunde A')]);
    repo.seedEntries(UID, [
      { id: 'w1', type: 'work', start, end: null, projectId: 'pA', createdAt: start, updatedAt: start },
    ]);
    renderWithProjects(repo);
    await screen.findByText(/^Arbeitet seit/);
    await user.selectOptions(screen.getByLabelText('Projekt'), '');
    await waitFor(() => expect('projectId' in repo.getEntries(UID)[0]).toBe(false));
    expect(screen.getByLabelText('Projekt')).toHaveValue('');
  });

  it('working: the picker keeps an archived current project selected and selectable (edge 8)', async () => {
    const repo = new InMemoryRepository();
    const start = Date.now() - 60_000;
    repo.seedProjects(UID, [project('pA', 'Kunde A', 'blue', true), project('pB', 'Kunde B', 'green')]);
    repo.seedEntries(UID, [
      { id: 'w1', type: 'work', start, end: null, projectId: 'pA', createdAt: start, updatedAt: start },
    ]);
    renderWithProjects(repo);
    await screen.findByText(/^Arbeitet seit/);
    const select = screen.getByLabelText('Projekt');
    expect(select).toHaveValue('pA');
    expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Kein Projekt',
      'Kunde A (archiviert) · Blau',
      'Kunde B · Grün',
    ]);
  });

  it('working: a rejected relabel shows the toast and the picker reverts (edge 37)', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    const start = Date.now() - 60_000;
    repo.seedProjects(UID, [project('pA', 'Kunde A'), project('pB', 'Kunde B', 'green')]);
    repo.seedEntries(UID, [
      { id: 'w1', type: 'work', start, end: null, projectId: 'pA', createdAt: start, updatedAt: start },
    ]);
    renderWithProjects(repo);
    await screen.findByText(/^Arbeitet seit/);
    repo.failNextWrite(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    await user.selectOptions(screen.getByLabelText('Projekt'), 'pB');
    const toastRegion = screen.getByRole('status');
    await waitFor(() =>
      expect(within(toastRegion).getByText('Speichern fehlgeschlagen: keine Berechtigung.')).toBeInTheDocument(),
    );
    await waitFor(() => expect(screen.getByLabelText('Projekt')).toHaveValue('pA'));
  });

  it('on break: no "Projekt" select (edge 24, picker part)', async () => {
    const repo = new InMemoryRepository();
    const start = Date.now() - 60_000;
    repo.seedProjects(UID, [project('pA', 'Kunde A')]);
    repo.seedEntries(UID, [{ id: 'b1', type: 'break', start, end: null, createdAt: start, updatedAt: start }]);
    renderWithProjects(repo);
    await screen.findByText(/^Pause seit/);
    expect(screen.queryByLabelText('Projekt')).not.toBeInTheDocument();
  });

  it('"Heutige Einträge" shows the project name as text for work entries, none for breaks (edge 35)', async () => {
    const repo = new InMemoryRepository();
    const now = Date.now();
    const t0 = now - 3 * 60 * 1000;
    const t1 = now - 2 * 60 * 1000;
    const t2 = now - 60 * 1000;
    repo.seedProjects(UID, [project('pA', 'Kunde A', 'orange')]);
    repo.seedEntries(UID, [
      { id: 'w1', type: 'work', start: t0, end: t1, projectId: 'pA', createdAt: t0, updatedAt: t1 },
      { id: 'b1', type: 'break', start: t1, end: t2, createdAt: t1, updatedAt: t2 },
      { id: 'w2', type: 'work', start: t2, end: null, createdAt: t2, updatedAt: t2 },
    ]);
    renderWithProjects(repo);
    await screen.findByText(/^Arbeitet seit/);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByText('Kunde A')).toBeInTheDocument();
    expect(items[0].querySelector('.project-dot.project-color-orange')).not.toBeNull();
    expect(items[1].querySelector('.project-label')).toBeNull();
    expect(items[2].querySelector('.project-label')).toBeNull();
  });

  it('a project renamed on another device updates the list without any entry write (edge 27)', async () => {
    const repo = new InMemoryRepository();
    const now = Date.now();
    const t0 = now - 2 * 60 * 1000;
    const t1 = now - 60 * 1000;
    repo.seedProjects(UID, [project('pA', 'Kunde A')]);
    repo.seedEntries(UID, [
      { id: 'w1', type: 'work', start: t0, end: t1, projectId: 'pA', createdAt: t0, updatedAt: t1 },
    ]);
    const updateSpy = vi.spyOn(repo, 'updateEntry');
    const transitionSpy = vi.spyOn(repo, 'applyTransition');
    const createSpy = vi.spyOn(repo, 'createEntry');
    renderWithProjects(repo);
    const item = (await screen.findAllByRole('listitem'))[0];
    expect(within(item).getByText('Kunde A')).toBeInTheDocument();
    act(() => repo.seedProjects(UID, [project('pA', 'Kunde Alpha', 'red')]));
    expect(within(item).getByText('Kunde Alpha')).toBeInTheDocument();
    expect(item.querySelector('.project-color-red')).not.toBeNull();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(transitionSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('a projects subscription error shows the alert; the timer and list still work (edge 38)', async () => {
    class FailingProjectsRepo extends InMemoryRepository {
      override subscribeProjects(
        _uid: string,
        _onChange: (projects: Project[]) => void,
        onError: (error: Error) => void,
      ): Unsubscribe {
        queueMicrotask(() => onError(new Error('boom')));
        return () => {};
      }
    }
    const user = userEvent.setup();
    const repo = new FailingProjectsRepo();
    const now = Date.now();
    const t0 = now - 2 * 60 * 1000;
    const t1 = now - 60 * 1000;
    repo.seedEntries(UID, [
      { id: 'w1', type: 'work', start: t0, end: t1, projectId: 'pA', createdAt: t0, updatedAt: t1 },
    ]);
    renderWithProjects(repo);
    expect(await screen.findByRole('alert')).toHaveTextContent('Daten konnten nicht geladen werden.');
    const item = screen.getAllByRole('listitem')[0];
    expect(within(item).getByText('Unbekanntes Projekt')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(await screen.findByText(/^Arbeitet seit/)).toBeInTheDocument();
  });
});

describe('TimerView: projects (slice 3) — switch, note, carry-over', () => {
  function project(id: string, name: string, color: Project['color'] = 'blue', archived = false): Project {
    return { id, name, color, archived, createdAt: 0, updatedAt: 0 };
  }

  function renderWithProjects(repo: InMemoryRepository) {
    const services: Services = { auth: new FakeAuthService(), entries: repo, settings: repo, projects: repo };
    return render(
      <ServicesProvider services={services}>
        <ToastProvider>
          <TimerView uid={UID} />
        </ToastProvider>
      </ServicesProvider>,
    );
  }

  function openEntry(repo: InMemoryRepository): Entry | undefined {
    return repo.getEntries(UID).find((entry) => entry.end === null);
  }

  it('Weiter carries the project of the block before the break, never the note', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    const now = Date.now();
    const t0 = now - 20 * 60 * 1000;
    const t1 = now - 10 * 60 * 1000;
    repo.seedProjects(UID, [project('pA', 'Kunde A')]);
    repo.seedEntries(UID, [
      { id: 'w1', type: 'work', start: t0, end: t1, projectId: 'pA', note: 'n', createdAt: t0, updatedAt: t1 },
      { id: 'b1', type: 'break', start: t1, end: null, createdAt: t1, updatedAt: t1 },
    ]);
    renderWithProjects(repo);
    await screen.findByText(/^Pause seit/);

    await user.click(screen.getByRole('button', { name: 'Weiter' }));
    await screen.findByText(/^Arbeitet seit/);
    const open = openEntry(repo);
    expect(open?.type).toBe('work');
    expect(open?.projectId).toBe('pA');
    expect(open !== undefined && 'note' in open).toBe(false);
  });

  function seedWorking(repo: InMemoryRepository, start: number, labels: { projectId?: string; note?: string } = {}) {
    repo.seedEntries(UID, [{ id: 'w1', type: 'work', start, end: null, ...labels, createdAt: start, updatedAt: start }]);
  }

  function workedText(): string | null | undefined {
    return screen.getByText('Heute gearbeitet').nextElementSibling?.textContent;
  }

  it('"Projekt wechseln" to Kunde C closes the block at T and opens one with pC and no note; worked total unchanged (edge 17)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const T = new Date('2026-03-10T11:00:00+01:00').getTime();
      vi.setSystemTime(T);
      const user = userEvent.setup();
      const repo = new InMemoryRepository();
      repo.seedProjects(UID, [project('pA', 'Kunde A'), project('pC', 'Kunde C', 'green')]);
      seedWorking(repo, T - 60 * 60 * 1000, { projectId: 'pA', note: 'n' });
      renderWithProjects(repo);
      await screen.findByText('Arbeitet seit 10:00');
      const workedBefore = workedText();

      const select = screen.getByLabelText('Wechseln zu');
      expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual([
        'Kein Projekt',
        'Kunde C · Grün',
      ]);
      await user.selectOptions(select, 'pC');
      await user.click(screen.getByRole('button', { name: 'Projekt wechseln' }));

      expect(await screen.findByText('Arbeitet seit 11:00')).toBeInTheDocument();
      const old = repo.getEntries(UID).find((entry) => entry.id === 'w1');
      expect(old?.end).toBe(T);
      expect(old?.projectId).toBe('pA');
      expect(old?.note).toBe('n');
      const open = openEntry(repo);
      expect(open?.type).toBe('work');
      expect(open?.start).toBe(T);
      expect(open?.projectId).toBe('pC');
      expect(open !== undefined && 'note' in open).toBe(false);
      expect(workedText()).toBe(workedBefore);
      expect(screen.getByLabelText('Projekt')).toHaveValue('pC');
    } finally {
      vi.useRealTimers();
    }
  });

  it('"Projekt wechseln" to "Kein Projekt" from Kunde A opens a block without a projectId key (edge 18)', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    repo.seedProjects(UID, [project('pA', 'Kunde A')]);
    seedWorking(repo, Date.now() - 60_000, { projectId: 'pA' });
    renderWithProjects(repo);
    await screen.findByText(/^Arbeitet seit/);
    expect(screen.getByLabelText('Wechseln zu')).toHaveValue('');

    await user.click(screen.getByRole('button', { name: 'Projekt wechseln' }));
    await waitFor(() => expect(repo.getEntries(UID)).toHaveLength(2));
    const open = openEntry(repo);
    expect(open?.id).not.toBe('w1');
    expect(open !== undefined && 'projectId' in open).toBe(false);
  });

  it('switch options never contain the current project; "Kein Projekt" only when a project is set (edge 19)', async () => {
    const repo = new InMemoryRepository();
    repo.seedProjects(UID, [project('pA', 'Kunde A'), project('pB', 'Kunde B', 'green')]);
    seedWorking(repo, Date.now() - 60_000);
    renderWithProjects(repo);
    await screen.findByText(/^Arbeitet seit/);
    const select = screen.getByLabelText('Wechseln zu');
    expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Kunde A · Blau',
      'Kunde B · Grün',
    ]);
    expect(select).toHaveValue('pA');
  });

  it('no switch control when the block has no project and there are no active projects (edge 19)', async () => {
    const repo = new InMemoryRepository();
    repo.seedProjects(UID, [project('pX', 'Alt', 'red', true)]);
    seedWorking(repo, Date.now() - 60_000);
    renderWithProjects(repo);
    await screen.findByText(/^Arbeitet seit/);
    expect(screen.queryByLabelText('Wechseln zu')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Projekt wechseln' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Notiz')).toBeInTheDocument();
  });

  it('switch is disabled while pending and applies once on a double click', async () => {
    class StuckRepo extends InMemoryRepository {
      applyTransitionCalls = 0;
      override applyTransition(_uid: string, _plan: TransitionPlan): Promise<void> {
        this.applyTransitionCalls += 1;
        return new Promise(() => {});
      }
    }
    const user = userEvent.setup();
    const repo = new StuckRepo();
    repo.seedProjects(UID, [project('pA', 'Kunde A')]);
    seedWorking(repo, Date.now() - 60_000);
    renderWithProjects(repo);
    await screen.findByText(/^Arbeitet seit/);
    const button = screen.getByRole('button', { name: 'Projekt wechseln' });
    await user.click(button);
    expect(button).toBeDisabled();
    await user.click(button);
    expect(repo.applyTransitionCalls).toBe(1);
  });

  it('offline switch shows the new block immediately with no toast, also after reconnecting (edge 36)', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    repo.seedProjects(UID, [project('pA', 'Kunde A'), project('pB', 'Kunde B', 'green')]);
    seedWorking(repo, Date.now() - 60_000, { projectId: 'pA' });
    repo.setOffline(true);
    renderWithProjects(repo);
    await screen.findByText(/^Arbeitet seit/);

    await user.selectOptions(screen.getByLabelText('Wechseln zu'), 'pB');
    await user.click(screen.getByRole('button', { name: 'Projekt wechseln' }));
    await waitFor(() => expect(screen.getByLabelText('Projekt')).toHaveValue('pB'));
    expect(openEntry(repo)?.projectId).toBe('pB');
    expect(screen.queryByText(/Speichern fehlgeschlagen/)).not.toBeInTheDocument();

    await act(async () => {
      repo.setOffline(false);
      await flushMicrotasks();
    });
    expect(screen.queryByText(/Speichern fehlgeschlagen/)).not.toBeInTheDocument();
  });

  it('typing in the note never writes; "Notiz speichern" writes exactly once with note set (edge 21)', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    seedWorking(repo, Date.now() - 60_000);
    const updateSpy = vi.spyOn(repo, 'updateEntry');
    renderWithProjects(repo);
    await screen.findByText(/^Arbeitet seit/);

    await user.type(screen.getByLabelText('Notiz'), '  Review  ');
    expect(updateSpy).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Notiz speichern' }));

    expect(updateSpy).toHaveBeenCalledTimes(1);
    const [, id, changes] = updateSpy.mock.calls[0];
    expect(id).toBe('w1');
    expect(Object.keys(changes)).toEqual(['note', 'updatedAt']);
    expect(changes.note).toEqual({ kind: 'set', value: 'Review' });
    expect(repo.getEntries(UID)[0].note).toBe('Review');
    expect(screen.getByLabelText('Notiz')).toHaveValue('Review');
  });

  it('blur saves the note once; a following click on "Notiz speichern" does not write again (edge 22)', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    seedWorking(repo, Date.now() - 60_000);
    const updateSpy = vi.spyOn(repo, 'updateEntry');
    renderWithProjects(repo);
    await screen.findByText(/^Arbeitet seit/);

    await user.type(screen.getByLabelText('Notiz'), 'a');
    await user.tab();
    expect(updateSpy).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Notiz speichern' }));
    expect(updateSpy).toHaveBeenCalledTimes(1);

    await user.type(screen.getByLabelText('Notiz'), 'b');
    await user.click(screen.getByRole('button', { name: 'Notiz speichern' }));
    expect(updateSpy).toHaveBeenCalledTimes(2);
    expect(repo.getEntries(UID)[0].note).toBe('ab');
  });

  it('a 500-char note is saved; 501 shows the error and does not write (edge 20)', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    seedWorking(repo, Date.now() - 60_000);
    const updateSpy = vi.spyOn(repo, 'updateEntry');
    renderWithProjects(repo);
    await screen.findByText(/^Arbeitet seit/);
    const textarea = screen.getByLabelText('Notiz');

    await user.click(textarea);
    await user.paste('x'.repeat(501));
    await user.click(screen.getByRole('button', { name: 'Notiz speichern' }));
    expect(updateSpy).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Die Notiz darf höchstens 500 Zeichen lang sein.');
    expect(textarea).toHaveValue('x'.repeat(501));
    expect(textarea).toHaveAttribute('aria-invalid', 'true');

    await user.clear(textarea);
    await user.paste('y'.repeat(500));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Notiz speichern' }));
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(repo.getEntries(UID)[0].note).toBe('y'.repeat(500));
  });

  it('a whitespace-only note removes the note key; without an existing note nothing is written (edge 20)', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    seedWorking(repo, Date.now() - 60_000, { note: 'alt' });
    const updateSpy = vi.spyOn(repo, 'updateEntry');
    renderWithProjects(repo);
    await screen.findByText(/^Arbeitet seit/);
    const textarea = screen.getByLabelText('Notiz');
    expect(textarea).toHaveValue('alt');

    await user.clear(textarea);
    await user.type(textarea, '   ');
    await user.click(screen.getByRole('button', { name: 'Notiz speichern' }));
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy.mock.calls[0][2].note).toEqual({ kind: 'remove' });
    expect('note' in repo.getEntries(UID)[0]).toBe(false);

    await user.type(screen.getByLabelText('Notiz'), '  ');
    await user.click(screen.getByRole('button', { name: 'Notiz speichern' }));
    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  it('a rejected note save shows the toast and the note reverts (edge 37)', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    seedWorking(repo, Date.now() - 60_000, { note: 'alt' });
    renderWithProjects(repo);
    await screen.findByText(/^Arbeitet seit/);
    repo.failNextWrite(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    await user.type(screen.getByLabelText('Notiz'), '!');
    await user.click(screen.getByRole('button', { name: 'Notiz speichern' }));
    const toastRegion = screen.getByRole('status');
    await waitFor(() =>
      expect(within(toastRegion).getByText('Speichern fehlgeschlagen: keine Berechtigung.')).toBeInTheDocument(),
    );
    await waitFor(() => expect(screen.getByLabelText('Notiz')).toHaveValue('alt'));
  });

  it('on break: no "Projekt", no "Wechseln zu", no "Notiz" (edge 24)', async () => {
    const repo = new InMemoryRepository();
    const start = Date.now() - 60_000;
    repo.seedProjects(UID, [project('pA', 'Kunde A')]);
    repo.seedEntries(UID, [{ id: 'b1', type: 'break', start, end: null, createdAt: start, updatedAt: start }]);
    renderWithProjects(repo);
    await screen.findByText(/^Pause seit/);
    expect(screen.queryByLabelText('Projekt')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Wechseln zu')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Notiz')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Notiz speichern' })).not.toBeInTheDocument();
  });

  it('Kunde A + note -> Pause -> Weiter: the new block has pA and no note (edge 23)', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    repo.seedProjects(UID, [project('pA', 'Kunde A')]);
    renderWithProjects(repo);
    await screen.findByText('Nicht gestartet');

    await user.selectOptions(screen.getByLabelText('Projekt'), 'pA');
    await user.click(screen.getByRole('button', { name: 'Start' }));
    await user.type(await screen.findByLabelText('Notiz'), 'Konzept');
    await user.click(screen.getByRole('button', { name: 'Notiz speichern' }));
    await user.click(screen.getByRole('button', { name: 'Pause' }));
    await screen.findByText(/^Pause seit/);
    await user.click(screen.getByRole('button', { name: 'Weiter' }));
    await screen.findByText(/^Arbeitet seit/);

    const open = openEntry(repo);
    expect(open?.projectId).toBe('pA');
    expect(open !== undefined && 'note' in open).toBe(false);
    expect(screen.getByLabelText('Notiz')).toHaveValue('');
    expect(repo.getEntries(UID).filter((entry) => entry.note === 'Konzept')).toHaveLength(1);
  });

  it('Weiter after a block without project creates no projectId key (edge 25)', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    const now = Date.now();
    const t0 = now - 20 * 60 * 1000;
    const t1 = now - 10 * 60 * 1000;
    repo.seedEntries(UID, [
      { id: 'w1', type: 'work', start: t0, end: t1, createdAt: t0, updatedAt: t1 },
      { id: 'b1', type: 'break', start: t1, end: null, createdAt: t1, updatedAt: t1 },
    ]);
    renderWithProjects(repo);
    await screen.findByText(/^Pause seit/);
    await user.click(screen.getByRole('button', { name: 'Weiter' }));
    await screen.findByText(/^Arbeitet seit/);
    const open = openEntry(repo);
    expect(open !== undefined && 'projectId' in open).toBe(false);
  });

  it('Weiter still carries a project archived meanwhile (edge 25)', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    const now = Date.now();
    const t0 = now - 20 * 60 * 1000;
    const t1 = now - 10 * 60 * 1000;
    repo.seedProjects(UID, [project('pA', 'Kunde A', 'blue', true)]);
    repo.seedEntries(UID, [
      { id: 'w1', type: 'work', start: t0, end: t1, projectId: 'pA', createdAt: t0, updatedAt: t1 },
      { id: 'b1', type: 'break', start: t1, end: null, createdAt: t1, updatedAt: t1 },
    ]);
    renderWithProjects(repo);
    await screen.findByText(/^Pause seit/);
    await user.click(screen.getByRole('button', { name: 'Weiter' }));
    await screen.findByText(/^Arbeitet seit/);
    expect(openEntry(repo)?.projectId).toBe('pA');
  });

  describe('carry-over across midnight (edge 26)', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('(a) break open since 23:50 yesterday, now 00:10: Weiter carries pA', async () => {
      vi.setSystemTime(new Date('2026-01-16T00:10:00+01:00').getTime());
      const user = userEvent.setup();
      const repo = new InMemoryRepository();
      const w0 = new Date('2026-01-15T22:00:00+01:00').getTime();
      const b0 = new Date('2026-01-15T23:50:00+01:00').getTime();
      repo.seedProjects(UID, [project('pA', 'Kunde A')]);
      repo.seedEntries(UID, [
        { id: 'w1', type: 'work', start: w0, end: b0, projectId: 'pA', note: 'spät', createdAt: w0, updatedAt: b0 },
        { id: 'b1', type: 'break', start: b0, end: null, createdAt: b0, updatedAt: b0 },
      ]);
      renderWithProjects(repo);
      expect(await screen.findByText('Pause seit 23:50')).toBeInTheDocument();
      expect(screen.getByText('Heute noch keine Einträge.')).toBeInTheDocument();

      const weiter = screen.getByRole('button', { name: 'Weiter' });
      await waitFor(() => expect(weiter).toBeEnabled());
      await user.click(weiter);
      await screen.findByText('Arbeitet seit 00:10');
      const open = openEntry(repo);
      expect(open?.projectId).toBe('pA');
      expect(open !== undefined && 'note' in open).toBe(false);
    });

    it('(b) work 23:00 yesterday to 00:20 today, break since 00:20, now 00:40: Weiter carries pA', async () => {
      vi.setSystemTime(new Date('2026-01-16T00:40:00+01:00').getTime());
      const user = userEvent.setup();
      const repo = new InMemoryRepository();
      const w0 = new Date('2026-01-15T23:00:00+01:00').getTime();
      const b0 = new Date('2026-01-16T00:20:00+01:00').getTime();
      repo.seedProjects(UID, [project('pA', 'Kunde A')]);
      repo.seedEntries(UID, [
        { id: 'w1', type: 'work', start: w0, end: b0, projectId: 'pA', createdAt: w0, updatedAt: b0 },
        { id: 'b1', type: 'break', start: b0, end: null, createdAt: b0, updatedAt: b0 },
      ]);
      renderWithProjects(repo);
      expect(await screen.findByText('Pause seit 00:20')).toBeInTheDocument();

      const weiter = screen.getByRole('button', { name: 'Weiter' });
      await waitFor(() => expect(weiter).toBeEnabled());
      await user.click(weiter);
      await screen.findByText('Arbeitet seit 00:40');
      expect(openEntry(repo)?.projectId).toBe('pA');
    });

    it('a break today with an earlier entry today opens no lookup subscription', async () => {
      vi.setSystemTime(new Date('2026-01-16T10:30:00+01:00').getTime());
      const repo = new InMemoryRepository();
      const lookupSpy = vi.spyOn(repo, 'subscribeLastEntryBefore');
      const w0 = new Date('2026-01-16T09:00:00+01:00').getTime();
      const b0 = new Date('2026-01-16T10:00:00+01:00').getTime();
      repo.seedEntries(UID, [
        { id: 'w1', type: 'work', start: w0, end: b0, createdAt: w0, updatedAt: b0 },
        { id: 'b1', type: 'break', start: b0, end: null, createdAt: b0, updatedAt: b0 },
      ]);
      renderWithProjects(repo);
      await screen.findByText('Pause seit 10:00');
      expect(screen.getByRole('button', { name: 'Weiter' })).toBeEnabled();
      expect(lookupSpy).not.toHaveBeenCalled();
    });
  });

  it('Weiter is disabled while the lookup is still loading; "Arbeitstag beenden" stays enabled', async () => {
    class SilentLookupRepo extends InMemoryRepository {
      override subscribeLastEntryBefore(): Unsubscribe {
        return () => {};
      }
    }
    const repo = new SilentLookupRepo();
    const start = Date.now() - 60_000;
    repo.seedEntries(UID, [{ id: 'b1', type: 'break', start, end: null, createdAt: start, updatedAt: start }]);
    renderWithProjects(repo);
    await screen.findByText(/^Pause seit/);
    expect(screen.getByRole('button', { name: 'Weiter' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Arbeitstag beenden' })).toBeEnabled();
  });

  it('a lookup error shows the load-error alert; Weiter is enabled and resumes without a project', async () => {
    class FailingLookupRepo extends InMemoryRepository {
      override subscribeLastEntryBefore(
        _uid: string,
        _before: number,
        _onChange: (entry: Entry | null) => void,
        onError: (error: Error) => void,
      ): Unsubscribe {
        queueMicrotask(() => onError(new Error('boom')));
        return () => {};
      }
    }
    const user = userEvent.setup();
    const repo = new FailingLookupRepo();
    const start = Date.now() - 60_000;
    repo.seedEntries(UID, [{ id: 'b1', type: 'break', start, end: null, createdAt: start, updatedAt: start }]);
    renderWithProjects(repo);
    expect(await screen.findByRole('alert')).toHaveTextContent('Daten konnten nicht geladen werden.');
    const weiter = screen.getByRole('button', { name: 'Weiter' });
    expect(weiter).toBeEnabled();
    await user.click(weiter);
    await screen.findByText(/^Arbeitet seit/);
    const open = openEntry(repo);
    expect(open !== undefined && 'projectId' in open).toBe(false);
  });
});

// Tester finding (gap, deferred minor from the slice-3 review): the entries subscription and the
// projects subscription each render their own load-error alert, so a simultaneous failure of both
// produces two identical alerts instead of one. Not a crash and no spec edge case requires a single
// alert, but it is worth a regression test so a future change does not silently duplicate further.
describe('TimerView: duplicate load-error alert on a double subscription failure (tester finding)', () => {
  function project(id: string, name: string, color: Project['color'] = 'blue', archived = false): Project {
    return { id, name, color, archived, createdAt: 0, updatedAt: 0 };
  }

  it('renders two identical "Daten konnten nicht geladen werden." alerts when entries and projects both fail', async () => {
    class DoubleFailingRepo extends InMemoryRepository {
      override subscribeEntriesInRange(
        _uid: string,
        _range: TimeRange,
        _onChange: (entries: Entry[]) => void,
        onError: (error: Error) => void,
      ): Unsubscribe {
        queueMicrotask(() => onError(new Error('boom')));
        return () => {};
      }
      override subscribeOpenEntries(
        _uid: string,
        _onChange: (entries: Entry[]) => void,
        onError: (error: Error) => void,
      ): Unsubscribe {
        queueMicrotask(() => onError(new Error('boom')));
        return () => {};
      }
      override subscribeProjects(
        _uid: string,
        _onChange: (projects: Project[]) => void,
        onError: (error: Error) => void,
      ): Unsubscribe {
        queueMicrotask(() => onError(new Error('boom')));
        return () => {};
      }
    }
    const repo = new DoubleFailingRepo();
    repo.seedProjects(UID, [project('pA', 'Kunde A')]);
    const services: Services = { auth: new FakeAuthService(), entries: repo, settings: repo, projects: repo };
    render(
      <ServicesProvider services={services}>
        <ToastProvider>
          <TimerView uid={UID} />
        </ToastProvider>
      </ServicesProvider>,
    );

    const alerts = await waitFor(() => {
      const found = screen.getAllByRole('alert');
      expect(found.length).toBeGreaterThanOrEqual(2);
      return found;
    });
    expect(alerts).toHaveLength(2);
    for (const alert of alerts) expect(alert).toHaveTextContent('Daten konnten nicht geladen werden.');
  });
});

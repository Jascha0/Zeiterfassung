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

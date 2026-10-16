import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServicesProvider, type Services } from '../app/ServicesContext';
import { ToastProvider } from '../app/ToastContext';
import type { Unsubscribe } from '../auth/authTypes';
import { InMemoryRepository } from '../data/inMemoryRepository';
import type { Entry, Project, TimeRange } from '../domain/types';
import { FakeAuthService } from '../test/fakeAuthService';
import { EntryForm, type EntryFormMode } from './EntryForm';

const UID = 'u1';
const DAY = new Date(2026, 9, 14).getTime();
const TODAY = new Date(2026, 9, 16).getTime();

function at(day: number, month: number, hours: number, minutes = 0, seconds = 0): number {
  return new Date(2026, month - 1, day, hours, minutes, seconds).getTime();
}

function entry(id: string, type: Entry['type'], start: number, end: number | null): Entry {
  return { id, type, start, end, createdAt: start, updatedAt: start };
}

function renderForm(
  repo: InMemoryRepository,
  mode: EntryFormMode,
  baseEntries: readonly Entry[] = [],
  openEntries: readonly Entry[] = [],
) {
  const onDone = vi.fn();
  const services: Services = { auth: new FakeAuthService(), entries: repo, settings: repo };
  render(
    <ServicesProvider services={services}>
      <ToastProvider>
        <EntryForm uid={UID} mode={mode} baseEntries={baseEntries} openEntries={openEntries} onDone={onDone} />
      </ToastProvider>
    </ServicesProvider>,
  );
  return { onDone };
}

async function typeInto(user: ReturnType<typeof userEvent.setup>, label: string, value: string) {
  const input = screen.getByLabelText(label);
  await user.clear(input);
  await user.type(input, value);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 16, 15, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('EntryForm: add mode', () => {
  it('creates one closed work entry 08:00–12:00 and calls onDone once', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    const { onDone } = renderForm(repo, { kind: 'add', dayStart: DAY });

    expect(screen.getByRole('form', { name: 'Neuer Eintrag' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Arbeit' }));
    await typeInto(user, 'Beginn', '08:00');
    await typeInto(user, 'Ende', '12:00');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    const stored = repo.getEntries(UID);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ type: 'work', start: at(14, 10, 8), end: at(14, 10, 12) });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('rejects an overlap with an existing entry and writes nothing', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    const existing = entry('e1', 'work', at(14, 10, 9), at(14, 10, 10));
    repo.seedEntries(UID, [existing]);
    const { onDone } = renderForm(repo, { kind: 'add', dayStart: DAY }, [existing]);

    await typeInto(user, 'Beginn', '08:00');
    await typeInto(user, 'Ende', '12:00');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Überschneidet sich mit: Arbeit 14.10.2026 09:00–10:00.');
    expect(repo.getEntries(UID)).toEqual([existing]);
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Beginn')).toHaveAttribute('aria-describedby', screen.getByRole('alert').id);
  });

  it('rejects an end before the start', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    const { onDone } = renderForm(repo, { kind: 'add', dayStart: DAY });

    await typeInto(user, 'Beginn', '12:00');
    await typeInto(user, 'Ende', '08:00');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Das Ende muss nach dem Beginn liegen.');
    expect(repo.getEntries(UID)).toHaveLength(0);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('rejects a start in the future', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    renderForm(repo, { kind: 'add', dayStart: TODAY });

    await typeInto(user, 'Beginn', '16:00');
    await typeInto(user, 'Ende', '17:00');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Der Beginn darf nicht in der Zukunft liegen.');
    expect(repo.getEntries(UID)).toHaveLength(0);
  });

  it('rejects 02:30 on 2026-03-29 (DST gap)', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    renderForm(repo, { kind: 'add', dayStart: new Date(2026, 2, 29).getTime() });

    await typeInto(user, 'Beginn', '02:30');
    await typeInto(user, 'Ende', '04:00');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Diese Uhrzeit gibt es am 29.03.2026 wegen der Zeitumstellung nicht.',
    );
    expect(repo.getEntries(UID)).toHaveLength(0);
  });

  it('shows a toast and rolls back the created entry when the write is rejected', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    renderForm(repo, { kind: 'add', dayStart: DAY });

    await typeInto(user, 'Beginn', '08:00');
    await typeInto(user, 'Ende', '12:00');
    repo.failNextWrite(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    const toastRegion = screen.getByRole('status');
    await waitFor(() =>
      expect(within(toastRegion).getByText('Speichern fehlgeschlagen: keine Berechtigung.')).toBeInTheDocument(),
    );
    expect(repo.getEntries(UID)).toHaveLength(0);
  });
});

describe('EntryForm: edit mode', () => {
  it('keeps the stored 08:00:37 start when only the end is changed', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    const original = entry('e1', 'work', at(14, 10, 8, 0, 37), at(14, 10, 12));
    repo.seedEntries(UID, [original]);
    const { onDone } = renderForm(repo, { kind: 'edit', dayStart: DAY, entry: original }, [original]);

    expect(screen.getByRole('form', { name: 'Eintrag bearbeiten' })).toBeInTheDocument();
    await typeInto(user, 'Ende', '13:00');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    const [stored] = repo.getEntries(UID);
    expect(stored?.start).toBe(at(14, 10, 8, 0, 37));
    expect(stored?.end).toBe(at(14, 10, 13));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('for the active open entry shows Beginn, Projekt and Notiz (not Ende/Typ) and writes only the start', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    const active = entry('a1', 'work', at(16, 10, 14), null);
    repo.seedEntries(UID, [active]);
    const updateSpy = vi.spyOn(repo, 'updateEntry');
    const { onDone } = renderForm(repo, { kind: 'edit', dayStart: TODAY, entry: active }, [active], [active]);

    expect(screen.getByText('Dieser Eintrag läuft. Nur Beginn, Projekt und Notiz können geändert werden.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Ende')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Typ' })).not.toBeInTheDocument();

    await typeInto(user, 'Beginn', '13:00');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(updateSpy).toHaveBeenCalledTimes(1);
    const [, id, changes] = updateSpy.mock.calls[0]!;
    expect(id).toBe('a1');
    expect(Object.keys(changes).sort()).toEqual(['start', 'updatedAt']);
    expect(changes.start).toBe(at(16, 10, 13));
    expect(repo.getEntries(UID)[0]).toMatchObject({ start: at(16, 10, 13), end: null });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('keeps the exact stored multi-day end (incl. seconds) when only the start is touched in \'date\' mode', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    // end >= shiftDay(dayStart, 2) => endInputKindFor picks 'date' mode, not the next-day checkbox.
    const original = entry('m1', 'work', at(14, 10, 22, 0, 15), at(16, 10, 2, 0, 45));
    repo.seedEntries(UID, [original]);
    const { onDone } = renderForm(repo, { kind: 'edit', dayStart: DAY, entry: original }, [original]);

    expect(screen.getByLabelText('Enddatum')).toHaveValue('2026-10-16');
    expect(screen.getByLabelText('Ende')).toHaveValue('02:00');
    expect(screen.queryByText('endet am Folgetag')).not.toBeInTheDocument();

    const submit = screen.getByRole('button', { name: 'Speichern' });
    await waitFor(() => expect(submit).toBeEnabled());
    await typeInto(user, 'Beginn', '21:00');
    await user.click(submit);

    const [stored] = repo.getEntries(UID);
    expect(stored?.start).toBe(at(14, 10, 21));
    expect(stored?.end).toBe(at(16, 10, 2, 0, 45));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('disables submit and shows the load error when the extended (\'date\'-mode) window subscription fails', async () => {
    class FailingRangeRepository extends InMemoryRepository {
      override subscribeEntriesInRange(
        _uid: string,
        _range: TimeRange,
        _onChange: (entries: Entry[]) => void,
        onError: (error: Error) => void,
      ): Unsubscribe {
        queueMicrotask(() => onError(new Error('permission-denied')));
        return () => {};
      }
    }
    const repo = new FailingRangeRepository();
    const original = entry('m1', 'work', at(14, 10, 22), at(16, 10, 2));
    repo.seedEntries(UID, [original]);
    renderForm(repo, { kind: 'edit', dayStart: DAY, entry: original }, [original]);

    const submit = screen.getByRole('button', { name: 'Speichern' });
    expect(submit).toBeDisabled();
    expect(await screen.findByRole('alert')).toHaveTextContent('Daten konnten nicht geladen werden.');
    expect(submit).toBeDisabled();
  });
});

describe('EntryForm: resolve mode', () => {
  const old = entry('old', 'work', at(12, 10, 8), null);
  const active = entry('new', 'work', at(16, 10, 14), null);
  const defaultEnd = at(13, 10, 9, 0, 15);

  it('prefills the end and writes exactly defaultEnd when untouched', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    repo.seedEntries(UID, [old, active]);
    const { onDone } = renderForm(repo, { kind: 'resolve', entry: old, defaultEnd }, [], [old, active]);

    expect(screen.getByRole('form', { name: 'Eintrag beenden' })).toBeInTheDocument();
    expect(screen.getByText('Beginn: 12.10.2026 08:00')).toBeInTheDocument();
    expect(screen.getByLabelText('Enddatum')).toHaveValue('2026-10-13');
    expect(screen.getByLabelText('Ende')).toHaveValue('09:00');

    const submit = screen.getByRole('button', { name: 'Beenden' });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    expect(repo.getEntries(UID).find((e) => e.id === 'old')?.end).toBe(defaultEnd);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('rejects an end that overlaps a later day entry', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    const next = entry('next', 'work', defaultEnd, at(13, 10, 10));
    repo.seedEntries(UID, [old, next, active]);
    const { onDone } = renderForm(repo, { kind: 'resolve', entry: old, defaultEnd }, [], [old, active]);

    const submit = screen.getByRole('button', { name: 'Beenden' });
    await waitFor(() => expect(submit).toBeEnabled());
    await typeInto(user, 'Enddatum', '2026-10-15');
    await user.click(submit);

    expect(screen.getByRole('alert')).toHaveTextContent('Überschneidet sich mit: Arbeit 13.10.2026 09:00–10:00.');
    expect(repo.getEntries(UID).find((e) => e.id === 'old')?.end).toBeNull();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('adds the "Löschen" hint when another entry covers the open entry start', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    const covering = entry('cover', 'work', at(12, 10, 7), at(12, 10, 9));
    repo.seedEntries(UID, [covering, old, active]);
    renderForm(repo, { kind: 'resolve', entry: old, defaultEnd }, [], [old, active]);

    const submit = screen.getByRole('button', { name: 'Beenden' });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    expect(screen.getByRole('alert')).toHaveTextContent('bitte lösche diesen offenen Eintrag mit „Löschen“');
    expect(repo.getEntries(UID).find((e) => e.id === 'old')?.end).toBeNull();
  });
});

describe('EntryForm: project and note (slice 3)', () => {
  function project(id: string, name: string, overrides: Partial<Project> = {}): Project {
    return { id, name, color: 'blue', archived: false, createdAt: 0, updatedAt: 0, ...overrides };
  }

  function renderWithProjects(
    repo: InMemoryRepository,
    mode: EntryFormMode,
    projects: readonly Project[],
    baseEntries: readonly Entry[] = [],
    openEntries: readonly Entry[] = [],
  ) {
    const onDone = vi.fn();
    const services: Services = { auth: new FakeAuthService(), entries: repo, settings: repo, projects: repo };
    const view = render(
      <ServicesProvider services={services}>
        <ToastProvider>
          <EntryForm
            uid={UID}
            mode={mode}
            baseEntries={baseEntries}
            openEntries={openEntries}
            projects={projects}
            onDone={onDone}
          />
        </ToastProvider>
      </ServicesProvider>,
    );
    const rerenderWith = (next: readonly Project[]) =>
      view.rerender(
        <ServicesProvider services={services}>
          <ToastProvider>
            <EntryForm
              uid={UID}
              mode={mode}
              baseEntries={baseEntries}
              openEntries={openEntries}
              projects={next}
              onDone={onDone}
            />
          </ToastProvider>
        </ServicesProvider>,
      );
    return { onDone, rerenderWith };
  }

  const kundeA = project('pA', 'Kunde A');

  it('adds a work entry 08:00–12:00 with project and note', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    const { onDone } = renderWithProjects(repo, { kind: 'add', dayStart: DAY }, [kundeA]);

    await typeInto(user, 'Beginn', '08:00');
    await typeInto(user, 'Ende', '12:00');
    await user.selectOptions(screen.getByLabelText('Projekt'), 'pA');
    await user.type(screen.getByLabelText('Notiz'), 'Kundentermin');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    const stored = repo.getEntries(UID);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      type: 'work',
      start: at(14, 10, 8),
      end: at(14, 10, 12),
      projectId: 'pA',
      note: 'Kundentermin',
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  function labelled(id: string, type: Entry['type'], start: number, end: number | null, labels: Partial<Entry>): Entry {
    return { ...entry(id, type, start, end), ...labels };
  }

  async function pasteInto(user: ReturnType<typeof userEvent.setup>, label: string, value: string) {
    const field = screen.getByLabelText(label);
    await user.clear(field);
    if (value !== '') {
      await user.click(field);
      await user.paste(value);
    }
  }

  it('adds with "Kein Projekt" and an empty note without projectId/note keys', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    renderWithProjects(repo, { kind: 'add', dayStart: DAY }, [kundeA]);

    expect(screen.getByLabelText('Projekt')).toHaveValue('');
    await typeInto(user, 'Beginn', '08:00');
    await typeInto(user, 'Ende', '12:00');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    const [stored] = repo.getEntries(UID);
    expect(stored).toBeDefined();
    expect('projectId' in stored!).toBe(false);
    expect('note' in stored!).toBe(false);
  });

  it('lists "Kein Projekt" first, then active projects by German collation labelled "Name · Farbe"', () => {
    const repo = new InMemoryRepository();
    const projects = [
      project('pB', 'b', { color: 'green' }),
      project('pX', 'Ärger', { color: 'red' }),
      project('pY', 'Alt', { archived: true }),
      project('pZ', 'a', { color: 'teal' }),
    ];
    renderWithProjects(repo, { kind: 'add', dayStart: DAY }, projects);

    const options = within(screen.getByLabelText('Projekt')).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Kein Projekt', 'a · Türkis', 'Ärger · Rot', 'b · Grün']);
    expect(options.map((o) => (o as HTMLOptionElement).value)).toEqual(['', 'pZ', 'pX', 'pB']);
  });

  it('edit with an archived project keeps it selected and writes nothing when unchanged', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    const original = labelled('e1', 'work', at(14, 10, 8), at(14, 10, 12), { projectId: 'pA' });
    repo.seedEntries(UID, [original]);
    const updateSpy = vi.spyOn(repo, 'updateEntry');
    const archived = project('pA', 'Kunde A', { archived: true });
    const { onDone } = renderWithProjects(repo, { kind: 'edit', dayStart: DAY, entry: original }, [archived], [original]);

    const select = screen.getByLabelText('Projekt');
    expect(select).toHaveValue('pA');
    expect(within(select).getByRole('option', { selected: true })).toHaveTextContent('Kunde A (archiviert) · Blau');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(updateSpy).not.toHaveBeenCalled();
    expect(repo.getEntries(UID)[0]).toEqual(original);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('rejects a project archived on another device while the form is open', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    const original = entry('e1', 'work', at(14, 10, 8), at(14, 10, 12));
    repo.seedEntries(UID, [original]);
    const updateSpy = vi.spyOn(repo, 'updateEntry');
    const { onDone, rerenderWith } = renderWithProjects(
      repo,
      { kind: 'edit', dayStart: DAY, entry: original },
      [kundeA],
      [original],
    );

    await user.selectOptions(screen.getByLabelText('Projekt'), 'pA');
    rerenderWith([project('pA', 'Kunde A', { archived: true })]);
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Das gewählte Projekt ist nicht mehr verfügbar.');
    expect(updateSpy).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('edit: "Kein Projekt" and an emptied note remove both keys', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    const original = labelled('e1', 'work', at(14, 10, 8), at(14, 10, 12), { projectId: 'pA', note: 'alt' });
    repo.seedEntries(UID, [original]);
    const updateSpy = vi.spyOn(repo, 'updateEntry');
    renderWithProjects(repo, { kind: 'edit', dayStart: DAY, entry: original }, [kundeA], [original]);

    expect(screen.getByLabelText('Notiz')).toHaveValue('alt');
    await user.selectOptions(screen.getByLabelText('Projekt'), '');
    await user.clear(screen.getByLabelText('Notiz'));
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy.mock.calls[0]![2]).toEqual({
      projectId: { kind: 'remove' },
      note: { kind: 'remove' },
      updatedAt: Date.now(),
    });
    const [stored] = repo.getEntries(UID);
    expect('projectId' in stored!).toBe(false);
    expect('note' in stored!).toBe(false);
  });

  it('changing to Pause shows the notice, hides the fields and removes project and note in one write', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    const original = labelled('e1', 'work', at(14, 10, 8), at(14, 10, 12), { projectId: 'pA', note: 'x' });
    repo.seedEntries(UID, [original]);
    const updateSpy = vi.spyOn(repo, 'updateEntry');
    renderWithProjects(repo, { kind: 'edit', dayStart: DAY, entry: original }, [kundeA], [original]);

    const notice = 'Beim Speichern als Pause werden Projekt und Notiz entfernt.';
    expect(screen.queryByText(notice)).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Pause' }));

    expect(screen.getByText(notice)).toBeInTheDocument();
    expect(screen.queryByLabelText('Projekt')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Notiz')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy.mock.calls[0]![2]).toEqual({
      type: 'break',
      projectId: { kind: 'remove' },
      note: { kind: 'remove' },
      updatedAt: Date.now(),
    });
    const [stored] = repo.getEntries(UID);
    expect(stored?.type).toBe('break');
    expect('projectId' in stored!).toBe(false);
    expect('note' in stored!).toBe(false);
  });

  it('shows no break notice for a work entry without project and note', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    const original = entry('e1', 'work', at(14, 10, 8), at(14, 10, 12));
    renderWithProjects(repo, { kind: 'edit', dayStart: DAY, entry: original }, [kundeA], [original]);

    await user.click(screen.getByRole('radio', { name: 'Pause' }));
    expect(screen.queryByText('Beim Speichern als Pause werden Projekt und Notiz entfernt.')).not.toBeInTheDocument();
  });

  it('saves a project-only edit of an entry that overlaps another entry (0030)', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    const original = entry('e1', 'work', at(14, 10, 8), at(14, 10, 12));
    const overlapping = entry('e2', 'work', at(14, 10, 10), at(14, 10, 11));
    repo.seedEntries(UID, [original, overlapping]);
    const updateSpy = vi.spyOn(repo, 'updateEntry');
    const { onDone } = renderWithProjects(
      repo,
      { kind: 'edit', dayStart: DAY, entry: original },
      [kundeA],
      [original, overlapping],
    );

    await user.selectOptions(screen.getByLabelText('Projekt'), 'pA');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy.mock.calls[0]![2]).toEqual({ projectId: { kind: 'set', value: 'pA' }, updatedAt: Date.now() });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('still validates when the time changes together with the project', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    const original = entry('e1', 'work', at(14, 10, 8), at(14, 10, 12));
    const overlapping = entry('e2', 'work', at(14, 10, 10), at(14, 10, 11));
    repo.seedEntries(UID, [original, overlapping]);
    const updateSpy = vi.spyOn(repo, 'updateEntry');
    renderWithProjects(repo, { kind: 'edit', dayStart: DAY, entry: original }, [kundeA], [original, overlapping]);

    await user.selectOptions(screen.getByLabelText('Projekt'), 'pA');
    await typeInto(user, 'Ende', '12:30');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Überschneidet sich mit: Arbeit 14.10.2026 10:00–11:00.');
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('closes an unchanged edit without validating or writing (OQ 8)', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    const original = entry('e1', 'work', at(14, 10, 8), at(14, 10, 12));
    const overlapping = entry('e2', 'work', at(14, 10, 10), at(14, 10, 11));
    repo.seedEntries(UID, [original, overlapping]);
    const updateSpy = vi.spyOn(repo, 'updateEntry');
    const { onDone } = renderWithProjects(
      repo,
      { kind: 'edit', dayStart: DAY, entry: original },
      [kundeA],
      [original, overlapping],
    );

    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('active open entry: shows Projekt and Notiz, and a project-only change writes projectId + updatedAt', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    const active = entry('a1', 'work', at(16, 10, 14), null);
    repo.seedEntries(UID, [active]);
    const updateSpy = vi.spyOn(repo, 'updateEntry');
    renderWithProjects(repo, { kind: 'edit', dayStart: TODAY, entry: active }, [kundeA], [active], [active]);

    expect(screen.getByText('Dieser Eintrag läuft. Nur Beginn, Projekt und Notiz können geändert werden.')).toBeInTheDocument();
    expect(screen.getByLabelText('Projekt')).toBeInTheDocument();
    expect(screen.getByLabelText('Notiz')).toBeInTheDocument();
    expect(screen.queryByLabelText('Ende')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Typ' })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Projekt'), 'pA');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(Object.keys(updateSpy.mock.calls[0]![2])).toEqual(['projectId', 'updatedAt']);
    expect(repo.getEntries(UID)[0]).toMatchObject({ projectId: 'pA', end: null });
  });

  it('accepts a 500-char note and rejects a 501-char note inline', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    const original = entry('e1', 'work', at(14, 10, 8), at(14, 10, 12));
    repo.seedEntries(UID, [original]);
    const updateSpy = vi.spyOn(repo, 'updateEntry');
    const { onDone } = renderWithProjects(repo, { kind: 'edit', dayStart: DAY, entry: original }, [kundeA], [original]);

    await pasteInto(user, 'Notiz', 'x'.repeat(501));
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Die Notiz darf höchstens 500 Zeichen lang sein.');
    expect(screen.getByLabelText('Notiz')).toHaveAttribute('aria-describedby', alert.id);
    expect(updateSpy).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();

    await pasteInto(user, 'Notiz', 'x'.repeat(500));
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(repo.getEntries(UID)[0]?.note).toBe('x'.repeat(500));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('stores a whitespace-only note as no note (removes an existing one)', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    const original = labelled('e1', 'work', at(14, 10, 8), at(14, 10, 12), { note: 'alt' });
    repo.seedEntries(UID, [original]);
    renderWithProjects(repo, { kind: 'edit', dayStart: DAY, entry: original }, [kundeA], [original]);

    await pasteInto(user, 'Notiz', '   \n  ');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect('note' in repo.getEntries(UID)[0]!).toBe(false);
  });

  it('stores the note trimmed when adding', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    renderWithProjects(repo, { kind: 'add', dayStart: DAY }, [kundeA]);

    await typeInto(user, 'Beginn', '08:00');
    await typeInto(user, 'Ende', '12:00');
    await pasteInto(user, 'Notiz', '  Kundentermin  ');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(repo.getEntries(UID)[0]?.note).toBe('Kundentermin');
  });

  it('keeps an unknown projectId as "Unbekanntes Projekt" and does not remove it on save', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    const original = labelled('e1', 'work', at(14, 10, 8), at(14, 10, 12), { projectId: 'ghost' });
    repo.seedEntries(UID, [original]);
    const updateSpy = vi.spyOn(repo, 'updateEntry');
    renderWithProjects(repo, { kind: 'edit', dayStart: DAY, entry: original }, [kundeA], [original]);

    const select = screen.getByLabelText('Projekt');
    expect(select).toHaveValue('ghost');
    expect(within(select).getByRole('option', { selected: true })).toHaveTextContent('Unbekanntes Projekt');
    await typeInto(user, 'Ende', '13:00');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy.mock.calls[0]![2]).toEqual({ end: at(14, 10, 13), updatedAt: Date.now() });
    expect(repo.getEntries(UID)[0]?.projectId).toBe('ghost');
  });

  it('shows the toast and reverts when a project edit is rejected', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    const original = entry('e1', 'work', at(14, 10, 8), at(14, 10, 12));
    repo.seedEntries(UID, [original]);
    renderWithProjects(repo, { kind: 'edit', dayStart: DAY, entry: original }, [kundeA], [original]);

    await user.selectOptions(screen.getByLabelText('Projekt'), 'pA');
    repo.failNextWrite(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    const toastRegion = screen.getByRole('status');
    await waitFor(() =>
      expect(within(toastRegion).getByText('Speichern fehlgeschlagen: keine Berechtigung.')).toBeInTheDocument(),
    );
    expect('projectId' in repo.getEntries(UID)[0]!).toBe(false);
  });
});

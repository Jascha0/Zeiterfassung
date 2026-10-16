import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServicesProvider, type Services } from '../app/ServicesContext';
import { ToastProvider } from '../app/ToastContext';
import { InMemoryRepository } from '../data/inMemoryRepository';
import type { Entry } from '../domain/types';
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

  it('for the active open entry shows only "Beginn" and writes only the start', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    const active = entry('a1', 'work', at(16, 10, 14), null);
    repo.seedEntries(UID, [active]);
    const updateSpy = vi.spyOn(repo, 'updateEntry');
    const { onDone } = renderForm(repo, { kind: 'edit', dayStart: TODAY, entry: active }, [active], [active]);

    expect(screen.getByText('Dieser Eintrag läuft. Nur der Beginn kann geändert werden.')).toBeInTheDocument();
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

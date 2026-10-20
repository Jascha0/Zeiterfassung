import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServicesProvider, type Services } from '../app/ServicesContext';
import { ToastProvider } from '../app/ToastContext';
import type { Unsubscribe } from '../auth/authTypes';
import { InMemoryRepository } from '../data/inMemoryRepository';
import { shiftDay } from '../domain/calendar';
import { truncateNote } from '../domain/notes';
import type { Entry, Project, TimeRange } from '../domain/types';
import { FakeAuthService } from '../test/fakeAuthService';
import { DayDetailView } from './DayDetailView';

const UID = 'u1';
const DAY = new Date(2026, 9, 14).getTime();
const TODAY = new Date(2026, 9, 16).getTime();

function at(day: number, month: number, hours: number, minutes = 0): number {
  return new Date(2026, month - 1, day, hours, minutes).getTime();
}

function entry(id: string, type: Entry['type'], start: number, end: number | null): Entry {
  return { id, type, start, end, createdAt: start, updatedAt: start };
}

class FailingRepository extends InMemoryRepository {
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

function view(repo: InMemoryRepository, dayStart: number, onDayChange: () => void, onBack: () => void) {
  const services: Services = { auth: new FakeAuthService(), entries: repo, settings: repo };
  return (
    <ServicesProvider services={services}>
      <ToastProvider>
        <DayDetailView uid={UID} dayStart={dayStart} onDayChange={onDayChange} onBack={onBack} />
      </ToastProvider>
    </ServicesProvider>
  );
}

function renderDay(repo: InMemoryRepository, dayStart: number = DAY) {
  const onDayChange = vi.fn();
  const onBack = vi.fn();
  const result = render(view(repo, dayStart, onDayChange, onBack));
  return {
    onDayChange,
    onBack,
    rerenderDay: (next: number) => result.rerender(view(repo, next, onDayChange, onBack)),
  };
}

function totalValue(term: string): HTMLElement {
  const value = screen.getByText(term).parentElement?.querySelector('dd');
  if (!value) throw new Error(`${term} value missing`);
  return value;
}

function itemFor(text: string | RegExp): HTMLElement {
  const item = screen.getByText(text).closest('li');
  if (!item) throw new Error('list item missing');
  return item;
}

async function typeInto(user: ReturnType<typeof userEvent.setup>, label: string, value: string) {
  const input = screen.getByLabelText(label);
  await user.clear(input);
  await user.type(input, value);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(new Date(2026, 9, 16, 15, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('DayDetailView', () => {
  it('lists the day entries in start order with totals', async () => {
    const repo = new InMemoryRepository();
    repo.seedEntries(UID, [
      entry('b', 'break', at(14, 10, 12), at(14, 10, 12, 30)),
      entry('w', 'work', at(14, 10, 8), at(14, 10, 12)),
    ]);
    renderDay(repo);

    expect(screen.getByRole('heading', { name: 'Mittwoch, 14. Oktober 2026' })).toBeInTheDocument();
    const list = await screen.findByRole('list');
    const lines = within(list)
      .getAllByRole('listitem')
      .map((item) => item.querySelector('span')?.textContent);
    expect(lines).toEqual(['Arbeit 08:00 – 12:00 (4:00)', 'Pause 12:00 – 12:30 (0:30)']);
    expect(totalValue('Gearbeitet')).toHaveTextContent('4:00');
    expect(totalValue('Pausen')).toHaveTextContent('0:30');
  });

  it('shows the empty state and does not list an entry from the previous day', async () => {
    const repo = new InMemoryRepository();
    repo.seedEntries(UID, [entry('prev', 'work', at(13, 10, 23), at(14, 10, 1))]);
    renderDay(repo);

    expect(await screen.findByText('Keine Einträge an diesem Tag.')).toBeInTheDocument();
    expect(screen.queryByText(/23:00/)).not.toBeInTheDocument();
    expect(totalValue('Gearbeitet')).toHaveTextContent('0:00');
  });

  it('wires the day navigation and the back button', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    const { onDayChange, onBack, rerenderDay } = renderDay(repo);
    await screen.findByText('Keine Einträge an diesem Tag.');

    expect(screen.getByRole('button', { name: 'Nächster Tag' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Vorheriger Tag' }));
    expect(onDayChange).toHaveBeenCalledWith(shiftDay(DAY, -1));
    await user.click(screen.getByRole('button', { name: 'Nächster Tag' }));
    expect(onDayChange).toHaveBeenLastCalledWith(shiftDay(DAY, 1));
    await user.click(screen.getByRole('button', { name: 'Zurück zum Kalender' }));
    expect(onBack).toHaveBeenCalledTimes(1);

    rerenderDay(TODAY);
    expect(screen.getByRole('button', { name: 'Nächster Tag' })).toBeDisabled();
  });

  it('deletes only after confirmation', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    repo.seedEntries(UID, [entry('w', 'work', at(14, 10, 8), at(14, 10, 12))]);
    renderDay(repo);

    const item = await waitFor(() => itemFor('Arbeit 08:00 – 12:00 (4:00)'));
    await user.click(within(item).getByRole('button', { name: 'Löschen' }));
    const confirm = screen.getByRole('group', { name: 'Löschen bestätigen' });
    expect(within(confirm).getByText('Eintrag wirklich löschen?')).toBeInTheDocument();
    await user.click(within(confirm).getByRole('button', { name: 'Abbrechen' }));
    expect(screen.queryByRole('group', { name: 'Löschen bestätigen' })).not.toBeInTheDocument();
    expect(repo.getEntries(UID)).toHaveLength(1);
    expect(screen.getByText('Arbeit 08:00 – 12:00 (4:00)')).toBeInTheDocument();

    await user.click(within(itemFor('Arbeit 08:00 – 12:00 (4:00)')).getByRole('button', { name: 'Löschen' }));
    await user.click(screen.getByRole('button', { name: 'Ja, löschen' }));
    expect(await screen.findByText('Keine Einträge an diesem Tag.')).toBeInTheDocument();
    expect(repo.getEntries(UID)).toHaveLength(0);
  });

  it('edits the end of an entry and updates the list line', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    repo.seedEntries(UID, [entry('w', 'work', at(14, 10, 8), at(14, 10, 12))]);
    renderDay(repo);

    const item = await waitFor(() => itemFor('Arbeit 08:00 – 12:00 (4:00)'));
    await user.click(within(item).getByRole('button', { name: 'Bearbeiten' }));
    expect(screen.getByRole('form', { name: 'Eintrag bearbeiten' })).toBeInTheDocument();
    await typeInto(user, 'Ende', '13:00');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(await screen.findByText('Arbeit 08:00 – 13:00 (5:00)')).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Eintrag bearbeiten' })).not.toBeInTheDocument();
    expect(totalValue('Gearbeitet')).toHaveTextContent('5:00');
  });

  it('marks the older of two open entries as inactive, not the active one', async () => {
    const repo = new InMemoryRepository();
    repo.seedEntries(UID, [entry('old', 'work', at(12, 10, 8), null), entry('new', 'work', at(16, 10, 14), null)]);
    const { rerenderDay } = renderDay(repo, new Date(2026, 9, 12).getTime());

    const oldItem = await waitFor(() => itemFor(/^Arbeit 08:00 – läuft/));
    expect(within(oldItem).getByText('offen – nicht aktiv')).toBeInTheDocument();

    rerenderDay(TODAY);
    const newItem = await waitFor(() => itemFor(/^Arbeit 14:00 – läuft/));
    expect(within(newItem).queryByText('offen – nicht aktiv')).not.toBeInTheDocument();
  });

  it('deleting the active open entry makes the other open entry active', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    repo.seedEntries(UID, [entry('old', 'work', at(16, 10, 9), null), entry('new', 'break', at(16, 10, 14), null)]);
    renderDay(repo, TODAY);

    const oldItem = await waitFor(() => itemFor(/^Arbeit 09:00 – läuft/));
    expect(within(oldItem).getByText('offen – nicht aktiv')).toBeInTheDocument();
    expect(within(itemFor(/^Pause 14:00 – läuft/)).queryByText('offen – nicht aktiv')).not.toBeInTheDocument();

    await user.click(within(itemFor(/^Pause 14:00 – läuft/)).getByRole('button', { name: 'Löschen' }));
    await user.click(screen.getByRole('button', { name: 'Ja, löschen' }));

    await waitFor(() => expect(screen.queryByText(/^Pause 14:00/)).not.toBeInTheDocument());
    expect(screen.queryByText('offen – nicht aktiv')).not.toBeInTheDocument();
    await user.click(within(itemFor(/^Arbeit 09:00 – läuft/)).getByRole('button', { name: 'Bearbeiten' }));
    expect(screen.getByText('Dieser Eintrag läuft. Nur Beginn, Projekt und Notiz können geändert werden.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Ende')).not.toBeInTheDocument();
    expect(repo.getEntries(UID).map((e) => e.id)).toEqual(['old']);
  });

  it('deleting the only open entry leaves no open entry', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    repo.seedEntries(UID, [entry('open', 'work', at(16, 10, 14), null)]);
    renderDay(repo, TODAY);

    await user.click(within(await waitFor(() => itemFor(/^Arbeit 14:00 – läuft/))).getByRole('button', { name: 'Löschen' }));
    await user.click(screen.getByRole('button', { name: 'Ja, löschen' }));

    expect(await screen.findByText('Keine Einträge an diesem Tag.')).toBeInTheDocument();
    expect(repo.getEntries(UID).filter((e) => e.end === null)).toHaveLength(0);
  });

  it('adds an entry offline: listed immediately, no toast', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    renderDay(repo);
    await screen.findByText('Keine Einträge an diesem Tag.');

    repo.setOffline(true);
    await user.click(screen.getByRole('button', { name: 'Eintrag hinzufügen' }));
    expect(screen.getByRole('heading', { name: 'Neuer Eintrag' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eintrag hinzufügen' })).not.toBeInTheDocument();
    await typeInto(user, 'Beginn', '08:00');
    await typeInto(user, 'Ende', '12:00');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(await screen.findByText('Arbeit 08:00 – 12:00 (4:00)')).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Neuer Eintrag' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Eintrag hinzufügen' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('shows a toast and restores the entry when the delete is rejected', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    repo.seedEntries(UID, [entry('w', 'work', at(14, 10, 8), at(14, 10, 12))]);
    renderDay(repo);

    await user.click(within(await waitFor(() => itemFor('Arbeit 08:00 – 12:00 (4:00)'))).getByRole('button', { name: 'Löschen' }));
    repo.failNextWrite(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    await user.click(screen.getByRole('button', { name: 'Ja, löschen' }));

    await waitFor(() => expect(screen.getByRole('status')).not.toBeEmptyDOMElement());
    expect(await screen.findByText('Arbeit 08:00 – 12:00 (4:00)')).toBeInTheDocument();
    expect(repo.getEntries(UID)).toHaveLength(1);
  });

  it('shows the load error in an alert', async () => {
    renderDay(new FailingRepository());
    expect(await screen.findByRole('alert')).toHaveTextContent('Daten konnten nicht geladen werden.');
    expect(screen.queryByText('Lädt…')).not.toBeInTheDocument();
  });

  it('closes the edit form and the delete confirmation when their entry is deleted remotely (edge case 41)', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    const target = entry('w', 'work', at(14, 10, 8), at(14, 10, 12));
    const other = entry('o', 'work', at(14, 10, 13), at(14, 10, 14));
    repo.seedEntries(UID, [target, other]);
    renderDay(repo);

    await user.click(within(await waitFor(() => itemFor('Arbeit 08:00 – 12:00 (4:00)'))).getByRole('button', { name: 'Bearbeiten' }));
    expect(screen.getByRole('form', { name: 'Eintrag bearbeiten' })).toBeInTheDocument();

    await act(async () => {
      await repo.deleteEntry(UID, 'w');
    });

    await waitFor(() => expect(screen.queryByRole('form', { name: 'Eintrag bearbeiten' })).not.toBeInTheDocument());
    expect(screen.queryByText('Arbeit 08:00 – 12:00 (4:00)')).not.toBeInTheDocument();
    expect(screen.getByText('Arbeit 13:00 – 14:00 (1:00)')).toBeInTheDocument();

    await user.click(within(itemFor('Arbeit 13:00 – 14:00 (1:00)')).getByRole('button', { name: 'Löschen' }));
    expect(screen.getByRole('group', { name: 'Löschen bestätigen' })).toBeInTheDocument();

    await act(async () => {
      await repo.deleteEntry(UID, 'o');
    });

    await waitFor(() => expect(screen.queryByRole('group', { name: 'Löschen bestätigen' })).not.toBeInTheDocument());
    expect(await screen.findByText('Keine Einträge an diesem Tag.')).toBeInTheDocument();
  });

  it('renders and sums pre-existing overlapping entries without crashing; a non-overlapping edit still succeeds (edge case 13)', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    const a = entry('a', 'work', at(14, 10, 8), at(14, 10, 9));
    const b = entry('b', 'work', at(14, 10, 8, 30), at(14, 10, 9, 30));
    const c = entry('c', 'work', at(14, 10, 10), at(14, 10, 11));
    repo.seedEntries(UID, [a, b, c]);
    renderDay(repo);

    expect(await waitFor(() => itemFor('Arbeit 08:00 – 09:00 (1:00)'))).toBeInTheDocument();
    expect(itemFor('Arbeit 08:30 – 09:30 (1:00)')).toBeInTheDocument();
    expect(itemFor('Arbeit 10:00 – 11:00 (1:00)')).toBeInTheDocument();
    expect(totalValue('Gearbeitet')).toHaveTextContent('3:00');

    await user.click(within(itemFor('Arbeit 10:00 – 11:00 (1:00)')).getByRole('button', { name: 'Bearbeiten' }));
    await typeInto(user, 'Ende', '11:30');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(await screen.findByText('Arbeit 10:00 – 11:30 (1:30)')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(totalValue('Gearbeitet')).toHaveTextContent('3:30');
  });
});

describe('DayDetailView: projects (slice 3)', () => {
  function project(id: string, name: string, color: Project['color'] = 'blue', archived = false): Project {
    return { id, name, color, archived, createdAt: 0, updatedAt: 0 };
  }

  function labelled(id: string, type: Entry['type'], start: number, end: number | null, labels: { projectId?: string; note?: string } = {}): Entry {
    return { ...entry(id, type, start, end), ...labels };
  }

  function renderWithProjects(repo: InMemoryRepository, dayStart: number = DAY) {
    const services: Services = { auth: new FakeAuthService(), entries: repo, settings: repo, projects: repo };
    return render(
      <ServicesProvider services={services}>
        <ToastProvider>
          <DayDetailView uid={UID} dayStart={dayStart} onDayChange={vi.fn()} onBack={vi.fn()} />
        </ToastProvider>
      </ServicesProvider>,
    );
  }

  function projectTotalRows(): Array<[string | null | undefined, string | null | undefined]> {
    const group = screen.getByRole('group', { name: 'Arbeitszeit nach Projekt' });
    return Array.from(group.querySelectorAll('dl > div')).map((row) => [
      row.querySelector('dt')?.textContent,
      row.querySelector('dd')?.textContent,
    ]);
  }

  it('shows per-project totals', async () => {
    const repo = new InMemoryRepository();
    repo.seedProjects(UID, [project('pA', 'Kunde A')]);
    repo.seedEntries(UID, [
      labelled('w1', 'work', at(14, 10, 8), at(14, 10, 11), { projectId: 'pA' }),
      labelled('b1', 'break', at(14, 10, 11), at(14, 10, 11, 15)),
      labelled('w2', 'work', at(14, 10, 11, 15), at(14, 10, 12, 15)),
    ]);
    renderWithProjects(repo);

    await screen.findByRole('group', { name: 'Arbeitszeit nach Projekt' });
    expect(projectTotalRows()).toEqual([
      ['Kunde A', '3:00'],
      ['Ohne Projekt', '1:00'],
    ]);
    expect(totalValue('Gearbeitet')).toHaveTextContent('4:00');
  });

  it('break is excluded and the groups sum to "Gearbeitet" (edge 31)', async () => {
    const repo = new InMemoryRepository();
    repo.seedProjects(UID, [project('pA', 'Kunde A'), project('pB', 'Kunde B', 'green')]);
    repo.seedEntries(UID, [
      labelled('w1', 'work', at(14, 10, 8), at(14, 10, 9, 30), { projectId: 'pB' }),
      labelled('b1', 'break', at(14, 10, 9, 30), at(14, 10, 10)),
      labelled('w2', 'work', at(14, 10, 10), at(14, 10, 12), { projectId: 'pA' }),
      labelled('w3', 'work', at(14, 10, 13), at(14, 10, 13, 30)),
    ]);
    renderWithProjects(repo);

    await screen.findByRole('group', { name: 'Arbeitszeit nach Projekt' });
    expect(projectTotalRows()).toEqual([
      ['Kunde A', '2:00'],
      ['Kunde B', '1:30'],
      ['Ohne Projekt', '0:30'],
    ]);
    expect(totalValue('Gearbeitet')).toHaveTextContent('4:00');
    expect(totalValue('Pausen')).toHaveTextContent('0:30');
  });

  it('counts a running block up live (edge 32)', async () => {
    const repo = new InMemoryRepository();
    repo.seedProjects(UID, [project('pA', 'Kunde A')]);
    repo.seedEntries(UID, [labelled('w', 'work', at(16, 10, 14), null, { projectId: 'pA' })]);
    renderWithProjects(repo, TODAY);

    await screen.findByRole('group', { name: 'Arbeitszeit nach Projekt' });
    expect(projectTotalRows()).toEqual([['Kunde A', '1:00']]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(projectTotalRows()).toEqual([['Kunde A', '1:01']]);
    expect(totalValue('Gearbeitet')).toHaveTextContent('1:01');
  });

  it('shows an unknown projectId as "Unbekanntes Projekt" in the list and the totals (edge 33)', async () => {
    const repo = new InMemoryRepository();
    repo.seedProjects(UID, [project('pA', 'Kunde A')]);
    repo.seedEntries(UID, [labelled('w', 'work', at(14, 10, 8), at(14, 10, 10), { projectId: 'ghost' })]);
    renderWithProjects(repo);

    const item = await waitFor(() => itemFor('Arbeit 08:00 – 10:00 (2:00)'));
    expect(within(item).getByText('Unbekanntes Projekt')).toBeInTheDocument();
    expect(item.querySelector('.project-dot')).toHaveClass('project-color-gray');
    expect(projectTotalRows()).toEqual([['Unbekanntes Projekt', '2:00']]);
    const group = screen.getByRole('group', { name: 'Arbeitszeit nach Projekt' });
    expect(group.querySelector('.project-dot')).toHaveClass('project-color-gray');
  });

  it('shows no per-project group for a day with only breaks (edge 34)', async () => {
    const repo = new InMemoryRepository();
    repo.seedProjects(UID, [project('pA', 'Kunde A')]);
    repo.seedEntries(UID, [labelled('b', 'break', at(14, 10, 12), at(14, 10, 12, 30))]);
    renderWithProjects(repo);

    await waitFor(() => itemFor('Pause 12:00 – 12:30 (0:30)'));
    expect(screen.queryByRole('group', { name: 'Arbeitszeit nach Projekt' })).not.toBeInTheDocument();
    expect(screen.queryByText('Nach Projekt')).not.toBeInTheDocument();
  });

  it('shows no per-project group for a day without entries (edge 34)', async () => {
    const repo = new InMemoryRepository();
    repo.seedProjects(UID, [project('pA', 'Kunde A')]);
    renderWithProjects(repo);

    await screen.findByText('Keine Einträge an diesem Tag.');
    expect(screen.queryByRole('group', { name: 'Arbeitszeit nach Projekt' })).not.toBeInTheDocument();
  });

  it('lists the project name as text next to the dot and the truncated note with the full note in title (edge 35)', async () => {
    const longNote = 'Abstimmung mit dem Kunden über die neue Schnittstelle und die offenen Punkte der Abnahme';
    const repo = new InMemoryRepository();
    repo.seedProjects(UID, [project('pA', 'Kunde A', 'orange')]);
    repo.seedEntries(UID, [
      labelled('w', 'work', at(14, 10, 8), at(14, 10, 12), { projectId: 'pA', note: longNote }),
      labelled('b', 'break', at(14, 10, 12), at(14, 10, 12, 30)),
    ]);
    renderWithProjects(repo);

    const item = await waitFor(() => itemFor('Arbeit 08:00 – 12:00 (4:00)'));
    expect(item.querySelector('span')?.textContent).toBe('Arbeit 08:00 – 12:00 (4:00)');
    expect(within(item).getByText('Kunde A')).toBeInTheDocument();
    expect(item.querySelector('.project-dot')).toHaveClass('project-color-orange');
    expect(truncateNote(longNote)).not.toBe(longNote);
    const note = within(item).getByText(truncateNote(longNote));
    expect(note).toHaveClass('entry-note');
    expect(note).toHaveAttribute('title', longNote);

    const breakItem = itemFor('Pause 12:00 – 12:30 (0:30)');
    expect(breakItem.querySelector('.project-label')).toBeNull();
    expect(breakItem.querySelector('.entry-note')).toBeNull();
  });

  it('shows archived projects with "(archiviert)", hides them from the picker of another entry, and restores them (edge 8)', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    repo.seedProjects(UID, [project('pA', 'Kunde A', 'blue', true), project('pB', 'Kunde B', 'green')]);
    repo.seedEntries(UID, [
      labelled('w1', 'work', at(14, 10, 8), at(14, 10, 10), { projectId: 'pA' }),
      labelled('w2', 'work', at(14, 10, 10), at(14, 10, 11)),
    ]);
    renderWithProjects(repo);

    const item = await waitFor(() => itemFor('Arbeit 08:00 – 10:00 (2:00)'));
    expect(within(item).getByText('Kunde A (archiviert)')).toBeInTheDocument();
    const group = screen.getByRole('group', { name: 'Arbeitszeit nach Projekt' });
    expect(within(group).getByText('Kunde A (archiviert)')).toBeInTheDocument();

    await user.click(within(itemFor('Arbeit 10:00 – 11:00 (1:00)')).getByRole('button', { name: 'Bearbeiten' }));
    const optionTexts = () =>
      within(screen.getByLabelText('Projekt'))
        .getAllByRole('option')
        .map((option) => option.textContent);
    expect(optionTexts()).toEqual(['Kein Projekt', 'Kunde B · Grün']);

    act(() => {
      repo.seedProjects(UID, [project('pA', 'Kunde A'), project('pB', 'Kunde B', 'green')]);
    });
    await waitFor(() => expect(optionTexts()).toEqual(['Kein Projekt', 'Kunde A · Blau', 'Kunde B · Grün']));
    expect(within(itemFor('Arbeit 08:00 – 10:00 (2:00)')).getByText('Kunde A')).toBeInTheDocument();
  });

  it('updates labels and totals after a rename/recolor on another device without writing entries (edge 27)', async () => {
    const repo = new InMemoryRepository();
    repo.seedProjects(UID, [project('pA', 'Kunde A')]);
    repo.seedEntries(UID, [labelled('w', 'work', at(14, 10, 8), at(14, 10, 10), { projectId: 'pA' })]);
    const updateSpy = vi.spyOn(repo, 'updateEntry');
    const transitionSpy = vi.spyOn(repo, 'applyTransition');
    const createSpy = vi.spyOn(repo, 'createEntry');
    renderWithProjects(repo);

    const item = await waitFor(() => itemFor('Arbeit 08:00 – 10:00 (2:00)'));
    expect(within(item).getByText('Kunde A')).toBeInTheDocument();

    act(() => {
      repo.seedProjects(UID, [project('pA', 'Kunde Alpha', 'red')]);
    });

    await waitFor(() => expect(within(itemFor('Arbeit 08:00 – 10:00 (2:00)')).getByText('Kunde Alpha')).toBeInTheDocument());
    expect(itemFor('Arbeit 08:00 – 10:00 (2:00)').querySelector('.project-dot')).toHaveClass('project-color-red');
    expect(projectTotalRows()).toEqual([['Kunde Alpha', '2:00']]);
    const group = screen.getByRole('group', { name: 'Arbeitszeit nach Projekt' });
    expect(group.querySelector('.project-dot')).toHaveClass('project-color-red');
    expect(screen.queryByText('Kunde A')).not.toBeInTheDocument();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(transitionSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it('shows the load alert on a projects subscription error, still lists entries, labels as "Unbekanntes Projekt" (edge 38)', async () => {
    class FailingProjectsRepository extends InMemoryRepository {
      override subscribeProjects(
        _uid: string,
        _onChange: (projects: Project[]) => void,
        onError: (error: Error) => void,
      ): Unsubscribe {
        queueMicrotask(() => onError(new Error('permission-denied')));
        return () => {};
      }
    }
    const repo = new FailingProjectsRepository();
    repo.seedEntries(UID, [
      labelled('w1', 'work', at(14, 10, 8), at(14, 10, 10), { projectId: 'pA' }),
      labelled('w2', 'work', at(14, 10, 10), at(14, 10, 11)),
    ]);
    renderWithProjects(repo);

    expect(await screen.findByRole('alert')).toHaveTextContent('Daten konnten nicht geladen werden.');
    const item = await waitFor(() => itemFor('Arbeit 08:00 – 10:00 (2:00)'));
    expect(within(item).getByText('Unbekanntes Projekt')).toBeInTheDocument();
    expect(itemFor('Arbeit 10:00 – 11:00 (1:00)')).toBeInTheDocument();
    expect(screen.queryByText('Lädt…')).not.toBeInTheDocument();
  });
});

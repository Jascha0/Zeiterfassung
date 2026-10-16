import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServicesProvider, type Services } from '../app/ServicesContext';
import { ToastProvider } from '../app/ToastContext';
import type { Unsubscribe } from '../auth/authTypes';
import { InMemoryRepository } from '../data/inMemoryRepository';
import { shiftDay } from '../domain/calendar';
import type { Entry, TimeRange } from '../domain/types';
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
    expect(screen.getByText('Dieser Eintrag läuft. Nur der Beginn kann geändert werden.')).toBeInTheDocument();
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
});

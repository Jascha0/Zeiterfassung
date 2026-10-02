import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServicesProvider } from '../app/ServicesContext';
import { ToastProvider } from '../app/ToastContext';
import type { LocalStore } from '../data/localStore';
import { formatLongDate, formatShortDate } from '../domain/format';
import { dayStartFromKey, toDateKey } from '../domain/routing';
import type { Entry, EntryType } from '../domain/types';
import { createTestStore } from '../test/createTestStore';
import { servicesOf } from '../test/testServices';
import { DayDetailView } from './DayDetailView';

const DAY_MS = 24 * 60 * 60 * 1000;

function dateKeyDaysFromToday(offset: number): string {
  return toDateKey(Date.now() + offset * DAY_MS);
}

/** Wall-clock instant on the given day key — DST-safe, unlike dayStart + hours * 3600_000. */
function at(dateKey: string, hours: number, minutes = 0): number {
  const day = new Date(dayStartFromKey(dateKey));
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes, 0, 0).getTime();
}

function entryOn(id: string, type: EntryType, dateKey: string, from: number, to: number | null): Entry {
  const start = at(dateKey, from);
  const end = to === null ? null : at(dateKey, to);
  return { id, type, start, end, createdAt: start, updatedAt: end ?? start };
}

/** The autumn DST fall-back day (last Sunday in October) of last year: always in the past, and the only
 *  kind of day on which a form entry can exceed 24 h (a 25-hour day in Europe/Berlin). */
function lastYearsDstFallbackDateKey(): string {
  const lastYear = new Date(Date.now()).getFullYear() - 1;
  const october31 = new Date(lastYear, 9, 31);
  october31.setDate(31 - october31.getDay());
  return toDateKey(october31.getTime());
}

function renderDayDetail(store: LocalStore, dateKey: string, onBack: () => void = vi.fn()) {
  const services = servicesOf(store);
  return render(
    <ServicesProvider services={services}>
      <ToastProvider>
        <DayDetailView dateKey={dateKey} onBack={onBack} />
      </ToastProvider>
    </ServicesProvider>,
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe('DayDetailView: adding, editing and deleting entries', () => {
  it('adds "Arbeit 09:00–12:00" to a past day and shows it in the list and the day total', async () => {
    const user = userEvent.setup();
    const yesterday = dateKeyDaysFromToday(-1);
    renderDayDetail(createTestStore().store, yesterday);

    expect(await screen.findByText('Keine Einträge an diesem Tag.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Eintrag hinzufügen' }));
    await user.type(screen.getByLabelText('Start'), '09:00');
    await user.type(screen.getByLabelText('Ende'), '12:00');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(await screen.findByText(/Arbeit 09:00–12:00/)).toBeInTheDocument();
    expect(screen.getByText('Gearbeitet 3:00:00')).toBeInTheDocument();
  });

  it('edits an entry: moving the end to 13:00 updates the list entry and the day total', async () => {
    const user = userEvent.setup();
    const yesterday = dateKeyDaysFromToday(-1);
    renderDayDetail(createTestStore({ entries: [entryOn('w1', 'work', yesterday, 9, 12)] }).store, yesterday);

    await user.click(await screen.findByRole('button', { name: 'Bearbeiten' }));
    await user.clear(screen.getByLabelText('Ende'));
    await user.type(screen.getByLabelText('Ende'), '13:00');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(await screen.findByText(/Arbeit 09:00–13:00/)).toBeInTheDocument();
    expect(screen.getByText('Gearbeitet 4:00:00')).toBeInTheDocument();
  });

  it('cancelling the delete dialog keeps the entry and both totals', async () => {
    const uiUser = userEvent.setup();
    const yesterday = dateKeyDaysFromToday(-1);
    renderDayDetail(
      createTestStore({
        entries: [entryOn('w1', 'work', yesterday, 9, 12), entryOn('b1', 'break', yesterday, 12, 13)],
      }).store,
      yesterday,
    );

    await screen.findByText(/Pause 12:00–13:00/);
    const breakItem = screen.getByText(/Pause 12:00–13:00/).closest('li') as HTMLElement;
    await uiUser.click(within(breakItem).getByRole('button', { name: 'Löschen' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Eintrag löschen?')).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        `Pause 12:00–13:00 am ${formatShortDate(at(yesterday, 12))} wird endgültig gelöscht.`,
      ),
    ).toBeInTheDocument();

    await uiUser.click(within(dialog).getByRole('button', { name: 'Abbrechen' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText(/Pause 12:00–13:00/)).toBeInTheDocument();
    expect(screen.getByText('Pausen 1:00:00')).toBeInTheDocument();
  });

  it('confirming the delete dialog removes the entry and updates both totals', async () => {
    const uiUser = userEvent.setup();
    const yesterday = dateKeyDaysFromToday(-1);
    renderDayDetail(
      createTestStore({
        entries: [entryOn('w1', 'work', yesterday, 9, 12), entryOn('b1', 'break', yesterday, 12, 13)],
      }).store,
      yesterday,
    );

    await screen.findByText(/Pause 12:00–13:00/);
    const breakItem = screen.getByText(/Pause 12:00–13:00/).closest('li') as HTMLElement;
    await uiUser.click(within(breakItem).getByRole('button', { name: 'Löschen' }));
    await uiUser.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Löschen' }));

    await waitFor(() => expect(screen.queryByText(/Pause 12:00–13:00/)).not.toBeInTheDocument());
    expect(screen.getByText('Pausen 0:00:00')).toBeInTheDocument();
    expect(screen.getByText('Gearbeitet 3:00:00')).toBeInTheDocument();
  });
});

describe('DayDetailView: validation of the entry form', () => {
  it('rejects an empty start with the time-format message on the start field', async () => {
    const user = userEvent.setup();
    const yesterday = dateKeyDaysFromToday(-1);
    renderDayDetail(createTestStore().store, yesterday);

    await user.click(await screen.findByRole('button', { name: 'Eintrag hinzufügen' }));
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Bitte eine Uhrzeit im Format HH:MM eingeben.');
    expect(screen.getByLabelText('Start')).toHaveAttribute('aria-invalid', 'true');
  });

  it('rejects a malformed end with the time-format message on the end field', async () => {
    const user = userEvent.setup();
    const yesterday = dateKeyDaysFromToday(-1);
    renderDayDetail(createTestStore().store, yesterday);

    await user.click(await screen.findByRole('button', { name: 'Eintrag hinzufügen' }));
    await user.type(screen.getByLabelText('Start'), '09:00');
    await user.type(screen.getByLabelText('Ende'), '9');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Bitte eine Uhrzeit im Format HH:MM eingeben.');
    expect(screen.getByLabelText('Ende')).toHaveAttribute('aria-invalid', 'true');
  });

  it('rejects an end equal to the start', async () => {
    const user = userEvent.setup();
    const yesterday = dateKeyDaysFromToday(-1);
    renderDayDetail(createTestStore().store, yesterday);

    await user.click(await screen.findByRole('button', { name: 'Eintrag hinzufügen' }));
    await user.type(screen.getByLabelText('Start'), '09:00');
    await user.type(screen.getByLabelText('Ende'), '09:00');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Das Ende muss nach dem Start liegen.');
    expect(screen.getByLabelText('Ende')).toHaveAttribute('aria-invalid', 'true');
  });

  it('rejects an entry that overlaps an existing one', async () => {
    const user = userEvent.setup();
    const yesterday = dateKeyDaysFromToday(-1);
    renderDayDetail(createTestStore({ entries: [entryOn('w1', 'work', yesterday, 9, 12)] }).store, yesterday);

    await user.click(await screen.findByRole('button', { name: 'Eintrag hinzufügen' }));
    await user.type(screen.getByLabelText('Start'), '11:00');
    await user.type(screen.getByLabelText('Ende'), '13:00');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Der Eintrag überschneidet sich mit einem anderen Eintrag.',
    );
    expect(screen.getByLabelText('Start')).toHaveAttribute('aria-invalid', 'true');
  });

  it('rejects a time in the future on today', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const today = dateKeyDaysFromToday(0);
    vi.setSystemTime(at(today, 8));
    renderDayDetail(createTestStore().store, today);

    await user.click(await screen.findByRole('button', { name: 'Eintrag hinzufügen' }));
    await user.type(screen.getByLabelText('Start'), '23:00');
    await user.type(screen.getByLabelText('Ende'), '23:30');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Zeiten in der Zukunft sind nicht möglich.');
    expect(screen.getByLabelText('Start')).toHaveAttribute('aria-invalid', 'true');
  });

  it('rejects an entry longer than 24 hours', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const dst = lastYearsDstFallbackDateKey();
    vi.setSystemTime(dayStartFromKey(dst) + 3 * DAY_MS);
    renderDayDetail(createTestStore().store, dst);

    await user.click(await screen.findByRole('button', { name: 'Eintrag hinzufügen' }));
    // 25-hour day: 01:00 CEST -> next-day 00:30 CET is 24.5 h, the only way past the 24 h cap.
    await user.type(screen.getByLabelText('Start'), '01:00');
    await user.type(screen.getByLabelText('Ende'), '00:30');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Ein Eintrag darf höchstens 24 Stunden dauern.');
    expect(screen.getByLabelText('Ende')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('DayDetailView: day character, navigation and markers', () => {
  it('offers no add action on a future day', async () => {
    const tomorrow = dateKeyDaysFromToday(1);
    renderDayDetail(createTestStore().store, tomorrow);

    expect(await screen.findByText('Keine Einträge an diesem Tag.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      formatLongDate(dayStartFromKey(tomorrow)),
    );
    expect(screen.queryByRole('button', { name: 'Eintrag hinzufügen' })).not.toBeInTheDocument();
  });

  it('calls onBack when the back link is used', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    const yesterday = dateKeyDaysFromToday(-1);
    renderDayDetail(createTestStore().store, yesterday, onBack);

    await user.click(await screen.findByRole('button', { name: 'Zurück zum Kalender' }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('marks an entry longer than twelve hours and shows no overlap marker', async () => {
    const yesterday = dateKeyDaysFromToday(-1);
    renderDayDetail(createTestStore({ entries: [entryOn('w1', 'work', yesterday, 2, 20)] }).store, yesterday);

    expect(await screen.findByText('Mehr als 12 Stunden')).toBeInTheDocument();
    expect(screen.queryByText('Überschneidung')).not.toBeInTheDocument();
  });

  it('marks both entries of an overlapping pair and shows no long-running marker', async () => {
    const yesterday = dateKeyDaysFromToday(-1);
    renderDayDetail(
      createTestStore({
        entries: [entryOn('w1', 'work', yesterday, 9, 12), entryOn('w2', 'work', yesterday, 11, 13)],
      }).store,
      yesterday,
    );

    await screen.findByText(/Arbeit 09:00–12:00/);
    expect(screen.getAllByText('Überschneidung')).toHaveLength(2);
    expect(screen.queryByText('Mehr als 12 Stunden')).not.toBeInTheDocument();
  });
});

describe('DayDetailView: the running entry', () => {
  it('corrects the start of the running entry and keeps the elapsed time live', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const today = dateKeyDaysFromToday(0);
    vi.setSystemTime(at(today, 12));
    renderDayDetail(createTestStore({ entries: [entryOn('w1', 'work', today, 10, null)] }).store, today);

    expect(await screen.findByText(/Arbeit 10:00–läuft \(2:00:00\)/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Bearbeiten' }));
    await user.clear(screen.getByLabelText('Start'));
    await user.type(screen.getByLabelText('Start'), '09:00');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(await screen.findByText(/Arbeit 09:00–läuft \(3:00:00\)/)).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByText(/Arbeit 09:00–läuft \(3:00:01\)/)).toBeInTheDocument();
  });

  it('closes the running entry when an end is set', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const today = dateKeyDaysFromToday(0);
    vi.setSystemTime(at(today, 12));
    renderDayDetail(createTestStore({ entries: [entryOn('w1', 'work', today, 10, null)] }).store, today);

    await user.click(await screen.findByRole('button', { name: 'Bearbeiten' }));
    await user.type(screen.getByLabelText('Ende'), '11:30');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(await screen.findByText(/Arbeit 10:00–11:30 \(1:30:00\)/)).toBeInTheDocument();
    expect(screen.queryByText(/läuft/)).not.toBeInTheDocument();
  });
});

describe('DayDetailView: Escape precedence and failing writes', () => {
  it('Escape closes the dialog, then the form, and only then leaves the day', async () => {
    const uiUser = userEvent.setup();
    const onBack = vi.fn();
    const yesterday = dateKeyDaysFromToday(-1);
    renderDayDetail(
      createTestStore({ entries: [entryOn('w1', 'work', yesterday, 9, 12)] }).store,
      yesterday,
      onBack,
    );

    await uiUser.click(await screen.findByRole('button', { name: 'Eintrag hinzufügen' }));
    await uiUser.click(screen.getByRole('button', { name: 'Löschen' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await uiUser.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();

    await uiUser.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: 'Speichern' })).not.toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();

    await uiUser.keyboard('{Escape}');
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('shows a toast and changes nothing when the write is rejected', async () => {
    const user = userEvent.setup();
    const yesterday = dateKeyDaysFromToday(-1);
    const { store, adapter } = createTestStore();
    renderDayDetail(store, yesterday);

    await user.click(await screen.findByRole('button', { name: 'Eintrag hinzufügen' }));
    await user.type(screen.getByLabelText('Start'), '09:00');
    await user.type(screen.getByLabelText('Ende'), '12:00');
    adapter.failNextApply(Object.assign(new Error('denied'), { name: 'AbortError' }));
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Die Änderung konnte nicht gespeichert werden.'),
    );
    expect(screen.getByText('Keine Einträge an diesem Tag.')).toBeInTheDocument();
  });
});

describe('DayDetailView: a pending and a rejected delete (edge cases 14, 16)', () => {
  it('disables every action while the delete is in flight and re-enables them when it settles', async () => {
    const uiUser = userEvent.setup();
    const yesterday = dateKeyDaysFromToday(-1);
    const { store, adapter } = createTestStore({
      entries: [entryOn('w1', 'work', yesterday, 9, 12), entryOn('b1', 'break', yesterday, 12, 13)],
    });
    renderDayDetail(store, yesterday);

    await screen.findByText(/Pause 12:00–13:00/);
    const breakItem = screen.getByText(/Pause 12:00–13:00/).closest('li') as HTMLElement;
    const release = adapter.holdNextApply();
    await uiUser.click(within(breakItem).getByRole('button', { name: 'Löschen' }));
    await uiUser.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Löschen' }));

    // The optimistic delete already removed the break, so the work entry is the only one left.
    const workItem = screen.getByText(/Arbeit 09:00–12:00/).closest('li') as HTMLElement;
    expect(within(workItem).getByRole('button', { name: 'Bearbeiten' })).toBeDisabled();
    expect(within(workItem).getByRole('button', { name: 'Löschen' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Eintrag hinzufügen' })).toBeDisabled();

    await act(async () => {
      release();
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByRole('button', { name: 'Eintrag hinzufügen' })).toBeEnabled());
    expect(within(workItem).getByRole('button', { name: 'Bearbeiten' })).toBeEnabled();
    expect(screen.queryByText(/Pause 12:00–13:00/)).not.toBeInTheDocument();
    expect(adapter.storedEntries()).toHaveLength(1);
  });

  it('shows the storage-full toast and keeps the entry when the delete is rejected', async () => {
    const uiUser = userEvent.setup();
    const yesterday = dateKeyDaysFromToday(-1);
    const { store, adapter } = createTestStore({ entries: [entryOn('w1', 'work', yesterday, 9, 12)] });
    renderDayDetail(store, yesterday);

    await screen.findByText(/Arbeit 09:00–12:00/);
    const workItem = screen.getByText(/Arbeit 09:00–12:00/).closest('li') as HTMLElement;
    adapter.failNextApply(Object.assign(new Error('full'), { name: 'QuotaExceededError' }));
    await uiUser.click(within(workItem).getByRole('button', { name: 'Löschen' }));
    await uiUser.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Löschen' }));

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Der Speicher ist voll. Die Änderung wurde nicht gespeichert.',
      ),
    );
    // The store rolled the optimistic delete back: entry, total and stored data are unchanged.
    expect(screen.getByText(/Arbeit 09:00–12:00/)).toBeInTheDocument();
    expect(screen.getByText('Gearbeitet 3:00:00')).toBeInTheDocument();
    expect(adapter.storedEntries()).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Eintrag hinzufügen' })).toBeEnabled();
  });
});

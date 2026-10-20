import { act, render, screen, within } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServicesProvider, type Services } from '../app/ServicesContext';
import { ToastProvider } from '../app/ToastContext';
import type { Unsubscribe } from '../auth/authTypes';
import { InMemoryRepository } from '../data/inMemoryRepository';
import type { Entry, TimeRange } from '../domain/types';
import { FakeAuthService } from '../test/fakeAuthService';
import { CalendarView } from './CalendarView';

const UID = 'u1';
const OCTOBER = new Date(2026, 9, 1).getTime();

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

function renderCalendar(repo: InMemoryRepository) {
  const onMonthChange = vi.fn();
  const onOpenDay = vi.fn();
  const services: Services = { auth: new FakeAuthService(), entries: repo, settings: repo };
  render(
    <ServicesProvider services={services}>
      <ToastProvider>
        <CalendarView uid={UID} monthStart={OCTOBER} onMonthChange={onMonthChange} onOpenDay={onOpenDay} />
      </ToastProvider>
    </ServicesProvider>,
  );
  return { onMonthChange, onOpenDay };
}

function monthTotal(): HTMLElement {
  const term = screen.getByText('Monat gesamt');
  const value = term.parentElement?.querySelector('dd');
  if (!value) throw new Error('Monat gesamt value missing');
  return value;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(new Date(2026, 9, 16, 15, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CalendarView', () => {
  it('renders the month heading and Monday-first column headers', async () => {
    renderCalendar(new InMemoryRepository());
    expect(screen.getByRole('heading', { name: 'Oktober 2026' })).toBeInTheDocument();
    await screen.findByRole('table');
    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Mo',
      'Di',
      'Mi',
      'Do',
      'Fr',
      'Sa',
      'So',
    ]);
  });

  it('shows work time per day without breaks and the month total', async () => {
    const repo = new InMemoryRepository();
    repo.seedEntries(UID, [
      entry('w', 'work', new Date(2026, 9, 14, 8, 0).getTime(), new Date(2026, 9, 14, 12, 0).getTime()),
      entry('b', 'break', new Date(2026, 9, 14, 12, 0).getTime(), new Date(2026, 9, 14, 12, 30).getTime()),
    ]);
    renderCalendar(repo);
    const day = await screen.findByRole('button', { name: /Mittwoch, 14\. Oktober 2026, 4:00 gearbeitet/ });
    expect(within(day).getByText('4:00')).toBeInTheDocument();
    expect(monthTotal()).toHaveTextContent('4:00');
  });

  it('marks today, and offers no buttons for future or adjacent-month days', async () => {
    renderCalendar(new InMemoryRepository());
    const today = await screen.findByRole('button', { name: /16\. Oktober 2026/ });
    expect(today).toHaveAttribute('aria-current', 'date');
    expect(screen.getByRole('button', { name: /15\. Oktober 2026, 0:00 gearbeitet/ })).not.toHaveAttribute(
      'aria-current',
    );
    expect(screen.queryByRole('button', { name: /17\. Oktober 2026/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /30\. September 2026/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /1\. November 2026/ })).not.toBeInTheDocument();
  });

  it('calls the navigation callbacks with the right instants', async () => {
    const { onMonthChange, onOpenDay } = renderCalendar(new InMemoryRepository());
    fireEvent.click(await screen.findByRole('button', { name: /14\. Oktober 2026/ }));
    expect(onOpenDay).toHaveBeenCalledWith(new Date(2026, 9, 14).getTime());

    fireEvent.click(screen.getByRole('button', { name: 'Vorheriger Monat' }));
    expect(onMonthChange).toHaveBeenLastCalledWith(new Date(2026, 8, 1).getTime());
    fireEvent.click(screen.getByRole('button', { name: 'Nächster Monat' }));
    expect(onMonthChange).toHaveBeenLastCalledWith(new Date(2026, 10, 1).getTime());
    fireEvent.click(screen.getByRole('button', { name: 'Heute' }));
    expect(onMonthChange).toHaveBeenLastCalledWith(new Date(2026, 9, 1).getTime());
  });

  it('grows today and the month total while a work entry runs', async () => {
    const repo = new InMemoryRepository();
    repo.seedEntries(UID, [entry('open', 'work', new Date(2026, 9, 16, 14, 0).getTime(), null)]);
    renderCalendar(repo);
    const today = await screen.findByRole('button', { name: /16\. Oktober 2026, 1:00 gearbeitet/ });
    expect(within(today).getByText('1:00')).toBeInTheDocument();
    expect(monthTotal()).toHaveTextContent('1:00');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(within(today).getByText('1:01')).toBeInTheDocument();
    expect(today).toHaveAccessibleName(/1:01 gearbeitet/);
    expect(monthTotal()).toHaveTextContent('1:01');
  });

  it('shows the load error in an alert', async () => {
    renderCalendar(new FailingRepository());
    expect(await screen.findByRole('alert')).toHaveTextContent('Daten konnten nicht geladen werden.');
    expect(screen.queryByText('Lädt…')).not.toBeInTheDocument();
  });
});

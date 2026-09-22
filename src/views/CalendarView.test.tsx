import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ServicesProvider, type Services } from '../app/ServicesContext';
import { ToastProvider } from '../app/ToastContext';
import { InMemoryRepository } from '../data/inMemoryRepository';
import { FakeAuthService } from '../test/fakeAuthService';
import type { Entry, EntryType } from '../domain/types';
import { CalendarView } from './CalendarView';

const UID = 'u1';

function entry(id: string, type: EntryType, from: string, to: string): Entry {
  const start = new Date(`2026-09-18T${from}:00+02:00`).getTime();
  const end = new Date(`2026-09-18T${to}:00+02:00`).getTime();
  return { id, type, start, end, createdAt: start, updatedAt: end };
}

function renderCalendar(repo: InMemoryRepository, onOpenDay: (dateKey: string) => void = vi.fn()) {
  const services: Services = { auth: new FakeAuthService(), entries: repo, settings: repo };
  return render(
    <ServicesProvider services={services}>
      <ToastProvider>
        <CalendarView uid={UID} monthKey="2026-09" onSelectMonth={vi.fn()} onOpenDay={onOpenDay} />
      </ToastProvider>
    </ServicesProvider>,
  );
}

describe('CalendarView: month grid', () => {
  it('shows the month heading, the work-only month total and the day cell with its accessible name', async () => {
    const repo = new InMemoryRepository();
    repo.seedEntries(UID, [
      entry('w1', 'work', '09:00', '10:00'),
      entry('b1', 'break', '10:00', '10:30'),
      entry('w2', 'work', '11:00', '12:00'),
      entry('b2', 'break', '12:00', '13:00'),
      entry('w3', 'work', '14:00', '15:00'),
    ]);
    renderCalendar(repo);

    expect(await screen.findByRole('heading', { name: 'September 2026' })).toBeInTheDocument();
    expect(screen.getByText('Monatssumme 3:00:00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '18. September 2026, 3 Std. 0 Min.' })).toBeInTheDocument();
  });
});

describe('CalendarView: keyboard', () => {
  it('is one tab stop and moves the focused day with Arrow, Home, End and Enter', async () => {
    // Faking setTimeout/setImmediate as well would stall React's scheduler and waitFor (see TimerView.test.tsx).
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date(2026, 8, 10, 12, 0));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onOpenDay = vi.fn();
    const repo = new InMemoryRepository();
    repo.seedEntries(UID, []);
    renderCalendar(repo, onOpenDay);
    const grid = await screen.findByRole('grid', { name: 'Monatskalender' });

    expect(grid.querySelectorAll('[tabindex="0"]')).toHaveLength(1);

    screen.getByRole('button', { name: 'Nächster Monat' }).focus();
    await user.tab();
    expect(document.activeElement).toHaveAttribute('data-date', '2026-09-10');

    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toHaveAttribute('data-date', '2026-09-11');
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toHaveAttribute('data-date', '2026-09-18');
    await user.keyboard('{Home}');
    expect(document.activeElement).toHaveAttribute('data-date', '2026-09-01');
    await user.keyboard('{End}');
    expect(document.activeElement).toHaveAttribute('data-date', '2026-09-30');
    await user.keyboard('{Enter}');
    expect(onOpenDay).toHaveBeenCalledWith('2026-09-30');
    vi.useRealTimers();
  });
});

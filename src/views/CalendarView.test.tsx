import { render, screen } from '@testing-library/react';
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

function renderCalendar(repo: InMemoryRepository) {
  const services: Services = { auth: new FakeAuthService(), entries: repo, settings: repo };
  return render(
    <ServicesProvider services={services}>
      <ToastProvider>
        <CalendarView uid={UID} monthKey="2026-09" onSelectMonth={vi.fn()} onOpenDay={vi.fn()} />
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

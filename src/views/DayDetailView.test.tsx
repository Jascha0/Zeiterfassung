import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ServicesProvider, type Services } from '../app/ServicesContext';
import { ToastProvider } from '../app/ToastContext';
import { InMemoryRepository } from '../data/inMemoryRepository';
import { FakeAuthService } from '../test/fakeAuthService';
import { DayDetailView } from './DayDetailView';

const UID = 'u1';

function renderDayDetail(repo: InMemoryRepository) {
  const services: Services = { auth: new FakeAuthService(), entries: repo, settings: repo };
  return render(
    <ServicesProvider services={services}>
      <ToastProvider>
        <DayDetailView uid={UID} dateKey="2026-09-18" onBack={vi.fn()} onResolveOpenEntries={vi.fn()} />
      </ToastProvider>
    </ServicesProvider>,
  );
}

describe('DayDetailView: add an entry to a past day', () => {
  it('adds "Arbeit 09:00–12:00" to a past day and shows it in the list and the day total', async () => {
    const user = userEvent.setup();
    renderDayDetail(new InMemoryRepository());

    expect(await screen.findByText('Keine Einträge an diesem Tag.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Eintrag hinzufügen' }));
    await user.type(screen.getByLabelText('Start'), '09:00');
    await user.type(screen.getByLabelText('Ende'), '12:00');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByText(/Arbeit 09:00–12:00/)).toBeInTheDocument();
    expect(screen.getByText('Gearbeitet 3:00:00')).toBeInTheDocument();
  });
});

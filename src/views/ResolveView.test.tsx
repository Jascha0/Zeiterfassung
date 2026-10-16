import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServicesProvider, type Services } from '../app/ServicesContext';
import { ToastProvider } from '../app/ToastContext';
import type { Unsubscribe } from '../auth/authTypes';
import { InMemoryRepository } from '../data/inMemoryRepository';
import type { Entry } from '../domain/types';
import { FakeAuthService } from '../test/fakeAuthService';
import { ResolveView } from './ResolveView';

const UID = 'u1';

function at(day: number, hours: number, minutes = 0): number {
  return new Date(2026, 9, day, hours, minutes).getTime();
}

function entry(id: string, type: Entry['type'], start: number, end: number | null): Entry {
  return { id, type, start, end, createdAt: start, updatedAt: start };
}

const OLD = entry('old', 'work', at(12, 8), null);
const NEW = entry('new', 'work', at(16, 14), null);
const NEXT = entry('next', 'work', at(13, 9), at(13, 10));

function renderResolve(repo: InMemoryRepository) {
  const onBack = vi.fn();
  const services: Services = { auth: new FakeAuthService(), entries: repo, settings: repo };
  render(
    <ServicesProvider services={services}>
      <ToastProvider>
        <ResolveView uid={UID} onBack={onBack} />
      </ToastProvider>
    </ServicesProvider>,
  );
  return { onBack };
}

function stored(repo: InMemoryRepository, id: string): Entry | undefined {
  return repo.getEntries(UID).find((e) => e.id === id);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 16, 15, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ResolveView', () => {
  it('lists only the older open entry, prefills the next entry start and ends it there', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    repo.seedEntries(UID, [OLD, NEW, NEXT]);
    renderResolve(repo);

    const item = (await screen.findByText('12.10.2026 · Arbeit ab 08:00')).closest('li');
    if (!item) throw new Error('list item missing');
    expect(screen.queryByText('16.10.2026 · Arbeit ab 14:00')).not.toBeInTheDocument();
    expect(screen.getByText('Aktiver Eintrag: Arbeit seit 16.10.2026 14:00')).toBeInTheDocument();

    await user.click(within(item).getByRole('button', { name: 'Beenden um …' }));
    const form = await screen.findByRole('form', { name: 'Eintrag beenden' });
    expect(within(form).getByLabelText('Enddatum')).toHaveValue('2026-10-13');
    expect(within(form).getByLabelText('Ende')).toHaveValue('09:00');

    const submit = within(form).getByRole('button', { name: 'Beenden' });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    expect(stored(repo, 'old')?.end).toBe(NEXT.start);
    expect(await screen.findByText('Es gibt keine älteren offenen Einträge mehr.')).toBeInTheDocument();
    expect(stored(repo, 'new')?.end).toBeNull();
  });

  it('deletes the older open entry after confirmation', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    repo.seedEntries(UID, [OLD, NEW, NEXT]);
    renderResolve(repo);

    const item = (await screen.findByText('12.10.2026 · Arbeit ab 08:00')).closest('li');
    if (!item) throw new Error('list item missing');
    await user.click(within(item).getByRole('button', { name: 'Löschen' }));
    const confirm = screen.getByRole('group', { name: 'Löschen bestätigen' });
    expect(within(confirm).getByText('Eintrag wirklich löschen?')).toBeInTheDocument();
    await user.click(within(confirm).getByRole('button', { name: 'Ja, löschen' }));

    expect(stored(repo, 'old')).toBeUndefined();
    expect(stored(repo, 'new')?.end).toBeNull();
    expect(await screen.findByText('Es gibt keine älteren offenen Einträge mehr.')).toBeInTheDocument();
  });

  it('prefills now when the next-entry lookup finds nothing', async () => {
    class NoNextRepository extends InMemoryRepository {
      override subscribeFirstEntryAfter(
        _uid: string,
        _after: number,
        onChange: (entry: Entry | null) => void,
        _onError: (error: Error) => void,
      ): Unsubscribe {
        queueMicrotask(() => onChange(null));
        return () => {};
      }
    }
    const user = userEvent.setup();
    const repo = new NoNextRepository();
    repo.seedEntries(UID, [OLD, NEW]);
    renderResolve(repo);

    const item = (await screen.findByText('12.10.2026 · Arbeit ab 08:00')).closest('li');
    if (!item) throw new Error('list item missing');
    await user.click(within(item).getByRole('button', { name: 'Beenden um …' }));
    const form = await screen.findByRole('form', { name: 'Eintrag beenden' });
    expect(within(form).getByLabelText('Enddatum')).toHaveValue('2026-10-16');
    expect(within(form).getByLabelText('Ende')).toHaveValue('15:00');
  });

  it('rejects an end past a later entry with an overlap message and writes nothing', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    repo.seedEntries(UID, [OLD, NEW, NEXT]);
    const updateSpy = vi.spyOn(repo, 'updateEntry');
    renderResolve(repo);

    const item = (await screen.findByText('12.10.2026 · Arbeit ab 08:00')).closest('li');
    if (!item) throw new Error('list item missing');
    await user.click(within(item).getByRole('button', { name: 'Beenden um …' }));
    const form = await screen.findByRole('form', { name: 'Eintrag beenden' });
    const endDate = within(form).getByLabelText('Enddatum');
    await user.clear(endDate);
    await user.type(endDate, '2026-10-14');

    const submit = within(form).getByRole('button', { name: 'Beenden' });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);

    expect(within(form).getByRole('alert')).toHaveTextContent('Überschneidet sich mit: Arbeit 13.10.2026 09:00–10:00.');
    expect(updateSpy).not.toHaveBeenCalled();
    expect(stored(repo, 'old')?.end).toBeNull();
  });

  it('"Zurück zum Timer" calls onBack', async () => {
    const user = userEvent.setup();
    const repo = new InMemoryRepository();
    repo.seedEntries(UID, [OLD, NEW]);
    const { onBack } = renderResolve(repo);

    await screen.findByText('12.10.2026 · Arbeit ab 08:00');
    await user.click(screen.getByRole('button', { name: 'Zurück zum Timer' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

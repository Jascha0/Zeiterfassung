import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type { Services } from './app/ServicesContext';
import { InMemoryRepository } from './data/inMemoryRepository';
import { renderPdf } from './export/pdfRenderer';
import { FakeAuthService } from './test/fakeAuthService';

vi.mock('./export/pdfRenderer', () => ({ renderPdf: vi.fn(async () => new Blob(['x'])) }));
vi.mock('./export/download', () => ({ downloadBlob: vi.fn(), downloadText: vi.fn() }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(new Date(2026, 9, 16, 15, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('App: export', () => {
  it('passes the signed-in user e-mail to the calendar PDF export', async () => {
    const ui = userEvent.setup({ delay: null });
    const auth = new FakeAuthService();
    auth.setUser({ uid: 'u1', email: 'a@b.de', displayName: null, emailVerified: true, providerIds: ['password'] });
    const repo = new InMemoryRepository();
    const start = new Date(2026, 9, 6, 8, 0).getTime();
    repo.seedEntries('u1', [
      { id: 'w', type: 'work', start, end: new Date(2026, 9, 6, 16, 0).getTime(), createdAt: start, updatedAt: start },
    ]);
    const services: Services = { auth, entries: repo, settings: repo, projects: repo };
    render(<App services={services} />);
    await ui.click(await screen.findByRole('button', { name: 'Kalender' }));
    const pdfButton = await screen.findByRole('button', { name: 'PDF exportieren' });
    await waitFor(() => expect(pdfButton).toBeEnabled());
    await ui.click(pdfButton);
    await waitFor(() => expect(renderPdf).toHaveBeenCalledTimes(1));
    expect(vi.mocked(renderPdf).mock.calls[0][0].headerLines[0]).toBe('a@b.de');
  });
});

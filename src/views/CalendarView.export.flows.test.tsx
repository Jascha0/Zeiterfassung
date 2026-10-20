import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServicesProvider, type Services } from '../app/ServicesContext';
import { ToastProvider } from '../app/ToastContext';
import { InMemoryRepository } from '../data/inMemoryRepository';
import { CSV_HEADER } from '../domain/csv';
import type { Entry } from '../domain/types';
import { downloadBlob, downloadText } from '../export/download';
import { renderPdf } from '../export/pdfRenderer';
import { FakeAuthService } from '../test/fakeAuthService';
import { CalendarView } from './CalendarView';

vi.mock('../export/download', () => ({ downloadBlob: vi.fn(), downloadText: vi.fn() }));
vi.mock('../export/pdfRenderer', () => ({ renderPdf: vi.fn() }));

const UID = 'u1';
const OCTOBER = new Date(2026, 9, 1).getTime();

function work(id: string, day: number, fromHour: number, toHour: number | null, projectId?: string): Entry {
  return {
    id,
    type: 'work',
    start: new Date(2026, 9, day, fromHour, 0).getTime(),
    end: toHour === null ? null : new Date(2026, 9, day, toHour, 0).getTime(),
    ...(projectId === undefined ? {} : { projectId }),
    createdAt: 0,
    updatedAt: 0,
  };
}

function view(): React.JSX.Element {
  return <CalendarView uid={UID} monthStart={OCTOBER} onMonthChange={() => {}} onOpenDay={() => {}} email="a@b.de" />;
}

function renderWith(services: Services) {
  return render(
    <ServicesProvider services={services}>
      <ToastProvider>{view()}</ToastProvider>
    </ServicesProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(new Date(2026, 9, 16, 15, 0));
  vi.mocked(downloadText).mockReset();
  vi.mocked(downloadBlob).mockReset();
  vi.mocked(renderPdf).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('CalendarView export flows across tasks', () => {
  it('exports with the real report pipeline when Services.projects is undefined, treating project ids as unknown', async () => {
    const ui = userEvent.setup({ delay: null });
    const repo = new InMemoryRepository();
    repo.seedEntries(UID, [work('w', 6, 8, 16, 'p1'), work('r', 16, 9, null)]);
    renderWith({ auth: new FakeAuthService(), entries: repo, settings: repo });
    const csvButton = screen.getByRole('button', { name: 'CSV exportieren' });
    await waitFor(() => expect(csvButton).toBeEnabled());
    expect(screen.getByRole('status', { name: 'Exportstatus' })).toHaveTextContent(
      '1 laufender Eintrag ist nicht enthalten.',
    );
    await ui.click(csvButton);
    expect(downloadText).toHaveBeenCalledTimes(1);
    const [text, mime, fileName] = vi.mocked(downloadText).mock.calls[0] ?? [];
    expect(mime).toBe('text/csv;charset=utf-8');
    expect(fileName).toBe('zeiterfassung-2026-10.csv');
    expect(String(text).split('\r\n')).toEqual([
      '﻿' + CSV_HEADER,
      '06.10.2026;Arbeit;08:00;16:00;8:00;8,00;Unbekanntes Projekt;',
      '',
    ]);
  });

  it('repeated CSV clicks download the identical file each time and keep the button enabled', async () => {
    const ui = userEvent.setup({ delay: null });
    const repo = new InMemoryRepository();
    repo.seedEntries(UID, [work('w', 6, 8, 16)]);
    renderWith({ auth: new FakeAuthService(), entries: repo, settings: repo, projects: repo });
    const csvButton = screen.getByRole('button', { name: 'CSV exportieren' });
    await waitFor(() => expect(csvButton).toBeEnabled());
    await ui.click(csvButton);
    await ui.click(csvButton);
    await ui.click(csvButton);
    expect(downloadText).toHaveBeenCalledTimes(3);
    const calls = vi.mocked(downloadText).mock.calls;
    expect(calls[1]).toEqual(calls[0]);
    expect(calls[2]).toEqual(calls[0]);
    expect(csvButton).toBeEnabled();
  });

  it('does not crash or log errors when the view unmounts while the PDF renders; the file is still delivered', async () => {
    const ui = userEvent.setup({ delay: null });
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    let resolve: (blob: Blob) => void = () => {};
    vi.mocked(renderPdf).mockImplementation(
      () =>
        new Promise<Blob>((r) => {
          resolve = r;
        }),
    );
    const repo = new InMemoryRepository();
    repo.seedEntries(UID, [work('w', 6, 8, 16)]);
    const { unmount } = renderWith({ auth: new FakeAuthService(), entries: repo, settings: repo, projects: repo });
    const pdfButton = screen.getByRole('button', { name: 'PDF exportieren' });
    await waitFor(() => expect(pdfButton).toBeEnabled());
    await ui.click(pdfButton);
    expect(renderPdf).toHaveBeenCalledTimes(1);
    unmount();
    const blob = new Blob(['pdf']);
    await act(async () => {
      resolve(blob);
    });
    expect(downloadBlob).toHaveBeenCalledTimes(1);
    expect(downloadBlob).toHaveBeenCalledWith(blob, 'zeiterfassung-2026-10.pdf');
    expect(errorLog).not.toHaveBeenCalled();
  });

  it('does not crash when the view unmounts and the PDF render then fails', async () => {
    const ui = userEvent.setup({ delay: null });
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    let reject: (error: Error) => void = () => {};
    vi.mocked(renderPdf).mockImplementation(
      () =>
        new Promise<Blob>((_resolve, r) => {
          reject = r;
        }),
    );
    const repo = new InMemoryRepository();
    repo.seedEntries(UID, [work('w', 6, 8, 16)]);
    const { unmount } = renderWith({ auth: new FakeAuthService(), entries: repo, settings: repo, projects: repo });
    const pdfButton = screen.getByRole('button', { name: 'PDF exportieren' });
    await waitFor(() => expect(pdfButton).toBeEnabled());
    await ui.click(pdfButton);
    unmount();
    await act(async () => {
      reject(new Error('chunk load failed'));
    });
    expect(downloadBlob).not.toHaveBeenCalled();
    expect(errorLog).not.toHaveBeenCalled();
  });
});

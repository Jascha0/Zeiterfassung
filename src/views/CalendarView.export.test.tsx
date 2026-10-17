import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServicesProvider, type Services } from '../app/ServicesContext';
import { ToastProvider } from '../app/ToastContext';
import type { Unsubscribe } from '../auth/authTypes';
import { InMemoryRepository } from '../data/inMemoryRepository';
import { monthReportCsv } from '../domain/csv';
import { monthReportPdfContent } from '../domain/pdfContent';
import { buildMonthReport } from '../domain/report';
import type { Entry, Project, TimeRange } from '../domain/types';
import { downloadBlob, downloadText } from '../export/download';
import { renderPdf } from '../export/pdfRenderer';
import { FakeAuthService } from '../test/fakeAuthService';
import { CalendarView } from './CalendarView';

vi.mock('../export/download', () => ({ downloadBlob: vi.fn(), downloadText: vi.fn() }));
vi.mock('../export/pdfRenderer', () => ({ renderPdf: vi.fn() }));

const UID = 'u1';
const OCTOBER = new Date(2026, 9, 1).getTime();
const SEPTEMBER = new Date(2026, 8, 1).getTime();

function entry(id: string, type: Entry['type'], start: number, end: number | null): Entry {
  return { id, type, start, end, createdAt: start, updatedAt: start };
}

function work(id: string, day: number, fromHour: number, toHour: number | null, month = 9): Entry {
  return entry(
    id,
    'work',
    new Date(2026, month, day, fromHour, 0).getTime(),
    toHour === null ? null : new Date(2026, month, day, toHour, 0).getTime(),
  );
}

class FailingEntriesRepository extends InMemoryRepository {
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

class PendingEntriesRepository extends InMemoryRepository {
  override subscribeEntriesInRange(): Unsubscribe {
    return () => {};
  }
}

class PendingProjectsRepository extends InMemoryRepository {
  override subscribeProjects(): Unsubscribe {
    return () => {};
  }
}

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

const originalOnLine = window.navigator.onLine;

function setOnline(value: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value });
}

function Harness(): React.JSX.Element {
  const [monthStart, setMonthStart] = useState(OCTOBER);
  return (
    <CalendarView
      uid={UID}
      monthStart={monthStart}
      onMonthChange={setMonthStart}
      onOpenDay={() => {}}
      email="jascha@example.com"
    />
  );
}

function renderHarness(repo: InMemoryRepository) {
  const services: Services = { auth: new FakeAuthService(), entries: repo, settings: repo, projects: repo };
  render(
    <ServicesProvider services={services}>
      <ToastProvider>
        <Harness />
      </ToastProvider>
    </ServicesProvider>,
  );
}

function csvButton(): HTMLElement {
  return screen.getByRole('button', { name: 'CSV exportieren' });
}

function pdfButton(): HTMLElement {
  return screen.getByRole('button', { name: 'PDF exportieren' });
}

function statusLines(): string[] {
  const region = screen.getByRole('status', { name: 'Exportstatus' });
  return Array.from(region.querySelectorAll('p'), (p) => p.textContent ?? '');
}

function exportArea(): HTMLElement {
  const area = screen.getByRole('heading', { name: 'Exportieren' }).parentElement;
  if (!area) throw new Error('export area missing');
  return area;
}

async function waitForEnabled(): Promise<void> {
  await waitFor(() => expect(csvButton()).toBeEnabled());
}

function pendingRenderPdf(): { resolve: (blob: Blob) => void } {
  const handle = { resolve: (_blob: Blob) => {} };
  vi.mocked(renderPdf).mockImplementation(
    () =>
      new Promise<Blob>((resolve) => {
        handle.resolve = resolve;
      }),
  );
  return handle;
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
  setOnline(originalOnLine);
});

describe('CalendarView export', () => {
  it('exports the CSV of September after navigating back from October', async () => {
    const ui = userEvent.setup({ delay: null });
    const repo = new InMemoryRepository();
    repo.seedEntries(UID, [
      entry('s', 'work', new Date(2026, 8, 15, 8, 0).getTime(), new Date(2026, 8, 15, 16, 0).getTime()),
    ]);
    renderHarness(repo);
    await ui.click(screen.getByRole('button', { name: 'Vorheriger Monat' }));
    await screen.findByRole('heading', { name: 'September 2026' });
    const csvButton = await screen.findByRole('button', { name: 'CSV exportieren' });
    await waitFor(() => expect(csvButton).toBeEnabled());
    await ui.click(csvButton);
    expect(downloadText).toHaveBeenCalledTimes(1);
    expect(downloadText).toHaveBeenCalledWith(
      monthReportCsv(buildMonthReport(repo.getEntries(UID), new Map(), SEPTEMBER), new Map()),
      'text/csv;charset=utf-8',
      'zeiterfassung-2026-09.csv',
    );
  });

  it('shows the heading and both buttons while loading, with the nav unchanged', () => {
    renderHarness(new PendingEntriesRepository());
    expect(screen.getByText('Lädt…')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Exportieren' })).toBeInTheDocument();
    expect(csvButton()).toBeDisabled();
    expect(pdfButton()).toBeDisabled();
    expect(statusLines()).toEqual([]);
    for (const name of ['Vorheriger Monat', 'Heute', 'Nächster Monat']) {
      expect(screen.getByRole('button', { name })).toBeEnabled();
    }
  });

  it('disables the buttons with an entries error and shows only the calendar alert', async () => {
    renderHarness(new FailingEntriesRepository());
    expect(await screen.findByRole('alert')).toHaveTextContent('Daten konnten nicht geladen werden.');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Exportieren' })).toBeInTheDocument();
    expect(csvButton()).toBeDisabled();
    expect(pdfButton()).toBeDisabled();
    expect(statusLines()).toEqual([]);
  });

  it('disables the buttons while projects are loading', async () => {
    const repo = new PendingProjectsRepository();
    repo.seedEntries(UID, [work('w', 6, 8, 16)]);
    renderHarness(repo);
    await screen.findByRole('table');
    expect(screen.getByRole('heading', { name: 'Exportieren' })).toBeInTheDocument();
    expect(csvButton()).toBeDisabled();
    expect(pdfButton()).toBeDisabled();
  });

  it('shows a projects-only load error inside the export area and keeps the calendar', async () => {
    const repo = new FailingProjectsRepository();
    repo.seedEntries(UID, [work('w', 6, 8, 16)]);
    renderHarness(repo);
    const alert = await within(exportArea()).findByRole('alert');
    expect(alert).toHaveTextContent('Daten konnten nicht geladen werden.');
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(csvButton()).toBeDisabled();
    expect(pdfButton()).toBeDisabled();
  });

  it('disables the buttons for an empty month and says so', async () => {
    renderHarness(new InMemoryRepository());
    await screen.findByRole('table');
    await waitFor(() => expect(statusLines()).toEqual(['Keine Einträge in diesem Monat.']));
    expect(csvButton()).toBeDisabled();
    expect(pdfButton()).toBeDisabled();
  });

  it('lists offline, empty and running lines in that order', async () => {
    setOnline(false);
    const repo = new InMemoryRepository();
    repo.seedEntries(UID, [work('r1', 15, 8, null), work('r2', 16, 9, null)]);
    renderHarness(repo);
    await screen.findByRole('table');
    await waitFor(() =>
      expect(statusLines()).toEqual([
        'Offline: Der Export enthält nur die auf diesem Gerät gespeicherten Daten.',
        'Keine Einträge in diesem Monat.',
        '2 laufende Einträge sind nicht enthalten.',
      ]),
    );
    expect(csvButton()).toBeDisabled();
    expect(pdfButton()).toBeDisabled();
  });

  it('enables the buttons with one running and one closed entry and shows the singular line', async () => {
    const repo = new InMemoryRepository();
    repo.seedEntries(UID, [work('c', 6, 8, 16), work('r', 16, 9, null)]);
    renderHarness(repo);
    await waitForEnabled();
    expect(pdfButton()).toBeEnabled();
    expect(statusLines()).toEqual(['1 laufender Eintrag ist nicht enthalten.']);
  });

  it('exports CSV and PDF while offline', async () => {
    setOnline(false);
    const ui = userEvent.setup({ delay: null });
    const blob = new Blob(['pdf']);
    vi.mocked(renderPdf).mockResolvedValue(blob);
    const repo = new InMemoryRepository();
    repo.seedEntries(UID, [work('c', 6, 8, 16)]);
    renderHarness(repo);
    await waitForEnabled();
    expect(statusLines()).toEqual(['Offline: Der Export enthält nur die auf diesem Gerät gespeicherten Daten.']);
    await ui.click(csvButton());
    expect(downloadText).toHaveBeenCalledTimes(1);
    await ui.click(pdfButton());
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(blob, 'zeiterfassung-2026-10.pdf'));
  });

  it('renders the PDF once from the content model and blocks a second click while busy', async () => {
    const ui = userEvent.setup({ delay: null });
    const pending = pendingRenderPdf();
    const repo = new InMemoryRepository();
    repo.seedEntries(UID, [work('c', 6, 8, 16)]);
    renderHarness(repo);
    await waitForEnabled();
    await ui.click(pdfButton());
    expect(renderPdf).toHaveBeenCalledTimes(1);
    const report = buildMonthReport(repo.getEntries(UID), new Map(), OCTOBER);
    expect(renderPdf).toHaveBeenCalledWith(
      monthReportPdfContent(report, { email: 'jascha@example.com', createdAt: Date.now() }),
    );
    expect(pdfButton()).toBeDisabled();
    expect(csvButton()).toBeEnabled();
    await ui.click(pdfButton());
    expect(renderPdf).toHaveBeenCalledTimes(1);
    const blob = new Blob(['pdf']);
    pending.resolve(blob);
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(blob, 'zeiterfassung-2026-10.pdf'));
    expect(downloadBlob).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(pdfButton()).toBeEnabled());
  });

  it('shows the failure toast when rendering the PDF fails and re-enables the button', async () => {
    const ui = userEvent.setup({ delay: null });
    vi.mocked(renderPdf).mockRejectedValue(new Error('chunk load failed'));
    const repo = new InMemoryRepository();
    repo.seedEntries(UID, [work('c', 6, 8, 16)]);
    renderHarness(repo);
    await waitForEnabled();
    await ui.click(pdfButton());
    expect(await screen.findByText('Export fehlgeschlagen.')).toBeInTheDocument();
    expect(downloadBlob).not.toHaveBeenCalled();
    await waitFor(() => expect(pdfButton()).toBeEnabled());
  });

  it('shows the failure toast when the CSV download throws', async () => {
    const ui = userEvent.setup({ delay: null });
    vi.mocked(downloadText).mockImplementation(() => {
      throw new Error('no download');
    });
    const repo = new InMemoryRepository();
    repo.seedEntries(UID, [work('c', 6, 8, 16)]);
    renderHarness(repo);
    await waitForEnabled();
    await ui.click(csvButton());
    expect(await screen.findByText('Export fehlgeschlagen.')).toBeInTheDocument();
  });

  it('keeps the September file name when navigating while the PDF renders', async () => {
    const ui = userEvent.setup({ delay: null });
    const pending = pendingRenderPdf();
    const repo = new InMemoryRepository();
    repo.seedEntries(UID, [work('s', 15, 8, 16, 8)]);
    renderHarness(repo);
    await ui.click(screen.getByRole('button', { name: 'Vorheriger Monat' }));
    await screen.findByRole('heading', { name: 'September 2026' });
    await waitForEnabled();
    await ui.click(pdfButton());
    expect(renderPdf).toHaveBeenCalledTimes(1);
    await ui.click(screen.getByRole('button', { name: 'Nächster Monat' }));
    await screen.findByRole('heading', { name: 'Oktober 2026' });
    const blob = new Blob(['pdf']);
    await act(async () => {
      pending.resolve(blob);
    });
    expect(downloadBlob).toHaveBeenCalledTimes(1);
    expect(downloadBlob).toHaveBeenCalledWith(blob, 'zeiterfassung-2026-09.pdf');
  });
});

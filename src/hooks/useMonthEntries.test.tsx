import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ServicesProvider, type Services } from '../app/ServicesContext';
import { ToastProvider } from '../app/ToastContext';
import { InMemoryRepository } from '../data/inMemoryRepository';
import { FakeAuthService } from '../test/fakeAuthService';
import { useMonthEntries } from './useMonthEntries';

const UID = 'u1';
const MONTH_START = new Date(2026, 8, 1).getTime();

function setNavigatorOnLine(value: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value });
}

function MonthProbe(): React.JSX.Element {
  const { loading, incomplete, entries } = useMonthEntries(UID, MONTH_START);
  return (
    <div>
      <p data-testid="loading">{String(loading)}</p>
      <p data-testid="incomplete">{String(incomplete)}</p>
      <p data-testid="count">{entries.length}</p>
    </div>
  );
}

function Probe(props: { repo: InMemoryRepository }): React.JSX.Element {
  const services: Services = { auth: new FakeAuthService(), entries: props.repo, settings: props.repo };
  return (
    <ServicesProvider services={services}>
      <ToastProvider>
        <MonthProbe />
      </ToastProvider>
    </ServicesProvider>
  );
}

describe('useMonthEntries: cache metadata (decision 0027)', () => {
  const originalOnLine = window.navigator.onLine;

  beforeEach(() => {
    setNavigatorOnLine(true);
  });

  afterEach(() => {
    setNavigatorOnLine(originalOnLine);
  });

  it('flags an offline cache delivery as incomplete but an empty online month as complete', async () => {
    const repo = new InMemoryRepository();
    repo.seedEntries('u1', []);
    setNavigatorOnLine(true);
    render(<Probe repo={repo} />);
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(screen.getByTestId('incomplete')).toHaveTextContent('false');

    act(() => {
      repo.setOffline(true);
      setNavigatorOnLine(false);
      window.dispatchEvent(new Event('offline'));
    });
    await waitFor(() => expect(screen.getByTestId('incomplete')).toHaveTextContent('true'));
    expect(screen.getByTestId('loading')).toHaveTextContent('false');
  });
});

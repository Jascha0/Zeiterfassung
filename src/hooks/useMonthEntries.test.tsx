import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ServicesProvider, type Services } from '../app/ServicesContext';
import { ToastProvider } from '../app/ToastContext';
import { noopChannelFactory } from '../data/channel';
import { InMemoryAdapter } from '../data/inMemoryAdapter';
import { createLocalStore, type LocalStore } from '../data/localStore';
import { createTestStore } from '../test/createTestStore';
import type { Entry } from '../domain/types';
import { useMonthEntries } from './useMonthEntries';

const MONTH_START = new Date(2026, 8, 1).getTime();
const IN_MONTH_START = new Date(2026, 8, 18, 9, 0).getTime();
const IN_MONTH_END = new Date(2026, 8, 18, 12, 0).getTime();

const IN_MONTH_ENTRY: Entry = {
  id: 'a',
  type: 'work',
  start: IN_MONTH_START,
  end: IN_MONTH_END,
  createdAt: IN_MONTH_START,
  updatedAt: IN_MONTH_END,
};

function MonthProbe(): React.JSX.Element {
  const { loading, error, entries } = useMonthEntries(MONTH_START);
  return (
    <div>
      <p data-testid="loading">{String(loading)}</p>
      <p data-testid="error">{String(error)}</p>
      <p data-testid="count">{entries.length}</p>
    </div>
  );
}

function Probe(props: { store: LocalStore }): React.JSX.Element {
  const services: Services = { entries: props.store, settings: props.store };
  return (
    <ServicesProvider services={services}>
      <ToastProvider>
        <MonthProbe />
      </ToastProvider>
    </ServicesProvider>
  );
}

describe('useMonthEntries: initial load', () => {
  it('reports loading until the initial local load resolves, then the month entries', async () => {
    const adapter = new InMemoryAdapter({ entries: [IN_MONTH_ENTRY] });
    const release = adapter.holdNextLoad();
    const store = createLocalStore({ adapter, navigator: null, channelFactory: noopChannelFactory });
    render(<Probe store={store} />);

    expect(screen.getByTestId('loading')).toHaveTextContent('true');
    expect(screen.getByTestId('count')).toHaveTextContent('0');

    await act(async () => {
      release();
      await store.whenReady();
    });

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(screen.getByTestId('count')).toHaveTextContent('1');
    expect(screen.getByTestId('error')).toHaveTextContent('null');
  });

  it('reports the load error and no entries when the initial load fails', async () => {
    const adapter = new InMemoryAdapter({ entries: [IN_MONTH_ENTRY] });
    adapter.failNextLoad(new Error('boom'));
    const store = createLocalStore({ adapter, navigator: null, channelFactory: noopChannelFactory });
    render(<Probe store={store} />);

    await waitFor(() =>
      expect(screen.getByTestId('error')).toHaveTextContent('Daten konnten nicht geladen werden.'),
    );
    expect(screen.getByTestId('count')).toHaveTextContent('0');
  });
});

describe('useMonthEntries: live reads (A10)', () => {
  it('picks up an entry created through the store without a reload', async () => {
    const { store } = createTestStore();
    render(<Probe store={store} />);

    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
    expect(screen.getByTestId('count')).toHaveTextContent('0');

    await act(async () => {
      await store.createEntry({
        type: 'work',
        start: IN_MONTH_START,
        end: IN_MONTH_END,
        createdAt: IN_MONTH_START,
        updatedAt: IN_MONTH_END,
      });
    });

    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'));
  });
});

import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ServicesProvider } from '../app/ServicesContext';
import { ToastProvider } from '../app/ToastContext';
import { noopChannelFactory } from '../data/channel';
import { InMemoryAdapter } from '../data/inMemoryAdapter';
import { createLocalStore, type LocalStore } from '../data/localStore';
import { createTestStore } from '../test/createTestStore';
import { servicesOf } from '../test/testServices';
import { THEME_STORAGE_KEY } from './theme';
import { ThemeProvider, useTheme } from './ThemeContext';

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => queueMicrotask(resolve));
}

function ThemeProbe(props: { onRender?: (pref: string) => void }): React.JSX.Element {
  const { preference, resolved, setPreference } = useTheme();
  useEffect(() => {
    props.onRender?.(preference);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preference]);
  return (
    <div>
      <p data-testid="preference">{preference}</p>
      <p data-testid="resolved">{resolved}</p>
      <button type="button" onClick={() => setPreference('dark')}>
        set dark
      </button>
      <button type="button" onClick={() => setPreference('light')}>
        set light
      </button>
    </div>
  );
}

function renderTheme(store: LocalStore, onRender?: (pref: string) => void) {
  const services = servicesOf(store);
  return render(
    <ServicesProvider services={services}>
      <ToastProvider>
        <ThemeProvider>
          <ThemeProbe onRender={onRender} />
        </ThemeProvider>
      </ToastProvider>
    </ServicesProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe('ThemeProvider: remote adoption (edge case 33, review fix)', () => {
  it('adopts a remote preference that differs from local, and stores it locally', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    const { store } = createTestStore({ preferences: { theme: 'dark' } });
    renderTheme(store);

    await waitFor(() => expect(screen.getByTestId('preference')).toHaveTextContent('dark'));
    expect(screen.getByTestId('resolved')).toHaveTextContent('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('keeps the local preference and does not save when the remote preference is null', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    const { store } = createTestStore();
    const saveSpy = vi.spyOn(store, 'savePreferences');
    renderTheme(store);

    // Let the (null) initial preferences snapshot arrive.
    await act(async () => {
      await store.whenReady();
      await flushMicrotasks();
    });
    expect(screen.getByTestId('preference')).toHaveTextContent('dark');
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('does not flip the preference when the remote echo of our own save arrives', async () => {
    const seen: string[] = [];
    const { store } = createTestStore();
    const user = userEvent.setup();
    renderTheme(store, (pref) => seen.push(pref));

    await waitFor(() => expect(seen).toContain('system'));
    await user.click(screen.getByRole('button', { name: 'set dark' }));
    await act(async () => {
      await flushMicrotasks();
      await flushMicrotasks();
    });

    expect(screen.getByTestId('preference')).toHaveTextContent('dark');
    // Only the local optimistic transition is recorded; the save's own echo causes no extra render.
    expect(seen).toEqual(['system', 'dark']);
  });

  it('shows a toast when saving the preference fails', async () => {
    const { store, adapter } = createTestStore();
    const user = userEvent.setup();
    renderTheme(store);
    await screen.findByTestId('preference');

    adapter.failNextApply(Object.assign(new Error('boom'), { name: 'AbortError' }));
    await user.click(screen.getByRole('button', { name: 'set dark' }));

    const toastRegion = screen.getByRole('status');
    await waitFor(() =>
      expect(within(toastRegion).getByText('Die Änderung konnte nicht gespeichert werden.')).toBeInTheDocument(),
    );
    // The optimistic local change still applied despite the failed save.
    expect(screen.getByTestId('preference')).toHaveTextContent('dark');
  });
});

describe('ThemeProvider: failed initial load (edge case 2, A15)', () => {
  it('stays subscribed, keeps the local preference and saves nothing', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    const adapter = new InMemoryAdapter({ preferences: { theme: 'light' } });
    adapter.failNextLoad(new Error('boom'));
    const store = createLocalStore({ adapter, navigator: null, channelFactory: noopChannelFactory });
    const saveSpy = vi.spyOn(store, 'savePreferences');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    renderTheme(store);

    await act(async () => {
      await store.whenReady();
      await flushMicrotasks();
    });

    // The preference subscription exists in every state now, a failed load included.
    expect(store.listenerCount()).toBe(1);
    expect(screen.getByTestId('preference')).toHaveTextContent('dark');
    expect(screen.getByTestId('resolved')).toHaveTextContent('dark');
    expect(saveSpy).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
    store.close();
  });
});

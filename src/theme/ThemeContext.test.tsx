import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ServicesProvider, type Services } from '../app/ServicesContext';
import { ToastProvider } from '../app/ToastContext';
import type { LocalStore } from '../data/localStore';
import { createTestStore } from '../test/createTestStore';
import { FakeAuthService } from '../test/fakeAuthService';
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
  const services: Services = { auth: new FakeAuthService(), entries: store, settings: store };
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

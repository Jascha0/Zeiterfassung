import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ServicesProvider, type Services } from '../app/ServicesContext';
import { ToastProvider } from '../app/ToastContext';
import { InMemoryRepository } from '../data/inMemoryRepository';
import { FakeAuthService } from '../test/fakeAuthService';
import { THEME_STORAGE_KEY } from './theme';
import { ThemeProvider, useTheme } from './ThemeContext';

const UID = 'u1';

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

function renderTheme(repo: InMemoryRepository, onRender?: (pref: string) => void) {
  const services: Services = { auth: new FakeAuthService(), entries: repo, settings: repo };
  return render(
    <ServicesProvider services={services}>
      <ToastProvider>
        <ThemeProvider uid={UID}>
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
    const repo = new InMemoryRepository();
    repo.seedPreferences(UID, { theme: 'dark' });
    renderTheme(repo);

    await waitFor(() => expect(screen.getByTestId('preference')).toHaveTextContent('dark'));
    expect(screen.getByTestId('resolved')).toHaveTextContent('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('keeps the local preference and does not save when the remote preference is null', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    const repo = new InMemoryRepository();
    const saveSpy = vi.spyOn(repo, 'savePreferences');
    renderTheme(repo);

    // Let the (null) initial preferences snapshot arrive.
    await act(async () => {
      await flushMicrotasks();
    });
    expect(screen.getByTestId('preference')).toHaveTextContent('dark');
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('does not flip the preference when the remote echo of our own save arrives', async () => {
    const seen: string[] = [];
    const repo = new InMemoryRepository();
    const user = userEvent.setup();
    renderTheme(repo, (pref) => seen.push(pref));

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
    const repo = new InMemoryRepository();
    const user = userEvent.setup();
    renderTheme(repo);
    await screen.findByTestId('preference');

    repo.failNextWrite(Object.assign(new Error('boom'), { code: 'permission-denied' }));
    await user.click(screen.getByRole('button', { name: 'set dark' }));

    const toastRegion = screen.getByRole('status');
    await waitFor(() =>
      expect(within(toastRegion).getByText('Speichern fehlgeschlagen: keine Berechtigung.')).toBeInTheDocument(),
    );
    // The optimistic local change still applied despite the failed save.
    expect(screen.getByTestId('preference')).toHaveTextContent('dark');
  });
});

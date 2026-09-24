import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServicesProvider, type Services } from '../app/ServicesContext';
import { ToastProvider } from '../app/ToastContext';
import { createTestStore } from '../test/createTestStore';
import { ThemeProvider } from '../theme/ThemeContext';
import { SettingsView } from './SettingsView';

const NOTICE =
  'Alle Daten liegen nur in diesem Browser auf diesem Gerät. Wenn du die Browserdaten löschst, sind sie weg. Eine Sicherung als Datei folgt im nächsten Schritt.';

function renderSettings() {
  const { store } = createTestStore();
  const services: Services = { entries: store, settings: store };
  render(
    <ServicesProvider services={services}>
      <ToastProvider>
        <ThemeProvider>
          <SettingsView />
        </ThemeProvider>
      </ToastProvider>
    </ServicesProvider>,
  );
  return { store };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('SettingsView: content (B10)', () => {
  it('contains exactly the theme choice and the local-data notice', () => {
    renderSettings();
    expect(screen.getByRole('heading', { name: 'Einstellungen' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Design' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Hell' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Dunkel' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'System' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByText(NOTICE)).toBeInTheDocument();
    // Nothing from the deleted account view survives, and the view has no button at all.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText('Anmeldemethoden')).not.toBeInTheDocument();
  });
});

describe('SettingsView: theme', () => {
  it('reflects and changes the theme preference via radio buttons', async () => {
    const uiUser = userEvent.setup();
    const { store } = renderSettings();
    const dark = screen.getByRole('radio', { name: 'Dunkel' });
    expect(dark).not.toBeChecked();
    await uiUser.click(dark);
    expect(dark).toBeChecked();
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
    // The choice is persisted through the store, not only reflected in the DOM.
    await waitFor(() => expect(store.getPreferences()).toEqual({ theme: 'dark' }));
  });

  it('keeps "System" following the OS setting', async () => {
    const uiUser = userEvent.setup();
    vi.stubGlobal(
      'matchMedia',
      () =>
        ({
          matches: true,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        }) as unknown as MediaQueryList,
    );

    renderSettings();
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));

    await uiUser.click(screen.getByRole('radio', { name: 'Hell' }));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'));

    await uiUser.click(screen.getByRole('radio', { name: 'System' }));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
  });
});

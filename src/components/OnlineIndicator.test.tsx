import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OnlineIndicator } from './OnlineIndicator';

function setNavigatorOnLine(value: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value });
}

describe('OnlineIndicator (edge case 21)', () => {
  const originalOnLine = window.navigator.onLine;

  beforeEach(() => {
    setNavigatorOnLine(true);
  });

  afterEach(() => {
    setNavigatorOnLine(originalOnLine);
  });

  it('shows "Online" initially when navigator.onLine is true', () => {
    render(<OnlineIndicator />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Online');
    expect(status).toHaveAttribute('data-online', 'true');
  });

  it('shows "Offline" initially when navigator.onLine is false', () => {
    setNavigatorOnLine(false);
    render(<OnlineIndicator />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Offline');
    expect(status).toHaveAttribute('data-online', 'false');
  });

  it('switches to "Offline" on the window "offline" event, and back to "Online" on "online"', () => {
    render(<OnlineIndicator />);
    expect(screen.getByRole('status')).toHaveTextContent('Online');

    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByRole('status')).toHaveTextContent('Offline');
    expect(screen.getByRole('status')).toHaveAttribute('data-online', 'false');

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.getByRole('status')).toHaveTextContent('Online');
    expect(screen.getByRole('status')).toHaveAttribute('data-online', 'true');
  });
});

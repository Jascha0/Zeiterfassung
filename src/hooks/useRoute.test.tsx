import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Route } from '../domain/routing';
import { useRoute } from './useRoute';

function RouteProbe(): React.JSX.Element {
  const { route, navigate } = useRoute();
  const label = `${route.kind}:${'monthKey' in route ? route.monthKey : 'dateKey' in route ? route.dateKey : ''}`;
  return (
    <div>
      <p data-testid="route">{label}</p>
      <button type="button" onClick={() => navigate({ kind: 'day', dateKey: '2026-09-18' } as Route)}>
        to day
      </button>
    </div>
  );
}

beforeEach(() => {
  window.location.hash = '';
});

describe('useRoute', () => {
  it('renders the route of the current hash and follows a browser back navigation', async () => {
    window.location.hash = '#/kalender/2026-09';
    render(<RouteProbe />);
    expect(screen.getByTestId('route')).toHaveTextContent('calendar:2026-09');

    await userEvent.setup().click(screen.getByRole('button', { name: 'to day' }));
    expect(screen.getByTestId('route')).toHaveTextContent('day:2026-09-18');
    expect(window.location.hash).toBe('#/tag/2026-09-18');

    window.history.back();
    await waitFor(() => expect(screen.getByTestId('route')).toHaveTextContent('calendar:2026-09'));
  });
});

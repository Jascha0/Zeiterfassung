import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Entry } from '../domain/types';
import { EntryForm } from './EntryForm';

describe('EntryForm: validation', () => {
  it('shows the overlap message on the start field and does not submit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const dayStart = new Date(2026, 8, 18).getTime();
    const existing: Entry = {
      id: 'e1',
      type: 'work',
      start: new Date(2026, 8, 18, 9, 0).getTime(),
      end: new Date(2026, 8, 18, 12, 0).getTime(),
      createdAt: 1,
      updatedAt: 1,
    };
    render(
      <EntryForm
        formLabel="Eintrag hinzufügen"
        dayStart={dayStart}
        entry={null}
        allowOpenEnd={false}
        comparisonEntries={[existing]}
        submitting={false}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );
    await user.type(screen.getByLabelText('Start'), '11:00');
    await user.type(screen.getByLabelText('Ende'), '13:00');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Der Eintrag überschneidet sich mit einem anderen Eintrag.',
    );
    expect(screen.getByLabelText('Start')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Start')).toHaveAttribute('aria-describedby', 'entry-form-error');
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

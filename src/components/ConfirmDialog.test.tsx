import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

function renderDialog(overrides: { onConfirm?: () => void; onCancel?: () => void } = {}) {
  const onConfirm = overrides.onConfirm ?? vi.fn();
  const onCancel = overrides.onCancel ?? vi.fn();
  const outerKeyDown = vi.fn();
  render(
    <div onKeyDown={outerKeyDown}>
      <ConfirmDialog
        title="Eintrag löschen?"
        lines={['Arbeit 09:00–12:00 am 18.09.2026 wird endgültig gelöscht.']}
        confirmLabel="Löschen"
        cancelLabel="Abbrechen"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    </div>,
  );
  return { onConfirm, onCancel, outerKeyDown };
}

describe('ConfirmDialog', () => {
  it('renders as a modal dialog labelled by its title and shows every line', () => {
    renderDialog();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('Eintrag löschen?');
    expect(dialog).toHaveTextContent('Arbeit 09:00–12:00 am 18.09.2026 wird endgültig gelöscht.');
  });

  it('focuses the confirm button on mount', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: 'Löschen' })).toHaveFocus();
  });

  it('calls onCancel on Escape without letting the event reach an outer handler', async () => {
    const user = userEvent.setup();
    const { onCancel, onConfirm, outerKeyDown } = renderDialog();
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(outerKeyDown).not.toHaveBeenCalled();
  });

  it('keeps Tab and Shift+Tab inside the dialog', async () => {
    const user = userEvent.setup();
    renderDialog();
    const confirm = screen.getByRole('button', { name: 'Löschen' });
    const cancel = screen.getByRole('button', { name: 'Abbrechen' });
    expect(confirm).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.tab();
    expect(confirm).toHaveFocus();
    await user.tab({ shift: true });
    expect(cancel).toHaveFocus();
  });

  it('calls onConfirm when the confirm button is activated', async () => {
    const user = userEvent.setup();
    const { onConfirm, onCancel } = renderDialog();
    await user.click(screen.getByRole('button', { name: 'Löschen' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });
});

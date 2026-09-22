import { useEffect, useRef } from 'react';

export interface ConfirmDialogProps {
  title: string;
  lines: readonly string[];
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog(props: ConfirmDialogProps): React.JSX.Element {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      props.onCancel();
      return;
    }
    if (event.key !== 'Tab') return;
    const dialog = dialogRef.current;
    if (dialog === null) return;
    const buttons = Array.from(dialog.querySelectorAll('button'));
    if (buttons.length === 0) return;
    event.preventDefault();
    const current = buttons.findIndex((button) => button === document.activeElement);
    const step = event.shiftKey ? -1 : 1;
    const next = (current + step + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };

  return (
    <div className="dialog-backdrop">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="dialog"
        ref={dialogRef}
        onKeyDown={onKeyDown}
      >
        <h2 id="confirm-dialog-title">{props.title}</h2>
        {props.lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
        <div className="button-row">
          <button type="button" className="button-primary" ref={confirmRef} onClick={props.onConfirm}>
            {props.confirmLabel}
          </button>
          <button type="button" className="button-secondary" onClick={props.onCancel}>
            {props.cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

export interface ToastApi {
  showToast(message: string): void;
}

interface Toast {
  id: number;
  message: string;
}

const TOAST_DURATION_MS = 5000;

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider(props: { children: React.ReactNode }): React.JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const visibleMessages = useRef(new Map<number, string>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) clearTimeout(timer);
    timers.current.delete(id);
    visibleMessages.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string) => {
      for (const visible of visibleMessages.current.values()) {
        if (visible === message) return;
      }
      const id = nextId.current++;
      visibleMessages.current.set(id, message);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), TOAST_DURATION_MS),
      );
      setToasts((current) => [...current, { id, message }]);
    },
    [dismiss],
  );

  useEffect(() => {
    const activeTimers = timers.current;
    return () => {
      for (const timer of activeTimers.values()) clearTimeout(timer);
      activeTimers.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={api}>
      {props.children}
      <div role="status" aria-live="polite" className="toast-region">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast">
            <span>{toast.message}</span>
            <button type="button" className="button-link" onClick={() => dismiss(toast.id)}>
              Schließen
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (api === null) throw new Error('useToast must be used within ToastProvider');
  return api;
}

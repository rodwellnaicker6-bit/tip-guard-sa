import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { ToastContext } from "./toastContext";
import type { ToastItem, ToastVariant } from "./toastTypes";

/** Toast UI + context provider only — import `useToast` from `./useToast` (Fast Refresh–safe). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message: string, variant: ToastVariant = "info") => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { id, message, variant }].slice(-5));
      window.setTimeout(() => dismiss(id), 6_000);
    },
    [dismiss],
  );

  const value = useMemo(
    () => ({
      push,
      success: (m: string) => push(m, "success"),
      error: (m: string) => push(m, "error"),
      info: (m: string) => push(m, "info"),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-host" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.variant}`} role="status">
            <span>{t.message}</span>
            <button type="button" className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

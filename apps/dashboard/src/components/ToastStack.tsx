import { useEffect } from "react";

export type ToastKind = "info" | "success" | "error" | "warning";

export type ToastItem = {
  id: string;
  kind: ToastKind;
  message: string;
  sticky?: boolean;
};

type ToastStackProps = {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
};

const AUTO_MS = 5200;

export const ToastStack = ({ toasts, onDismiss }: ToastStackProps) => {
  useEffect(() => {
    const timers = toasts
      .filter((t) => !t.sticky)
      .map((t) =>
        window.setTimeout(() => {
          onDismiss(t.id);
        }, AUTO_MS),
      );
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [toasts, onDismiss]);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-stack" aria-live="polite" aria-relevant="additions">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast-${toast.kind}`}
          role={toast.kind === "error" ? "alert" : "status"}
        >
          <p className="toast-message">{toast.message}</p>
          <button
            type="button"
            className="toast-dismiss"
            aria-label="Κλείσιμο"
            onClick={() => onDismiss(toast.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
};

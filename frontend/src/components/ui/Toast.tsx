import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { useI18n } from '../../i18n';
import { cn } from '../../utils/cn';

type ToastKind = 'success' | 'error' | 'info' | 'warning';
interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  body?: string;
}

interface ToastApi {
  success: (title: string, body?: string) => void;
  error: (title: string, body?: string) => void;
  info: (title: string, body?: string) => void;
  warning: (title: string, body?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const icons: Record<ToastKind, ReactNode> = {
  success: <CheckCircle2 className="h-5 w-5 text-emerald" aria-hidden />,
  error: <TriangleAlert className="h-5 w-5 text-earth" aria-hidden />,
  warning: <TriangleAlert className="h-5 w-5 text-warning" aria-hidden />,
  info: <Info className="h-5 w-5 text-info" aria-hidden />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);

  const push = useCallback(
    (kind: ToastKind, title: string, body?: string) => {
      const id = ++seq.current;
      setItems((xs) => [...xs.slice(-3), { id, kind, title, body }]);
      window.setTimeout(() => dismiss(id), kind === 'error' ? 8000 : 4500);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (a, b) => push('success', a, b),
      error: (a, b) => push('error', a, b),
      info: (a, b) => push('info', a, b),
      warning: (a, b) => push('warning', a, b),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-relevant="additions"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:bottom-4 sm:end-4 sm:start-auto sm:items-end"
      >
        {items.map((it) => (
          <div
            key={it.id}
            role={it.kind === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex w-full max-w-sm animate-reveal items-start gap-3 rounded-2xl border bg-surface px-4 py-3 shadow-pop',
              it.kind === 'error' ? 'border-earth/30' : 'border-line',
            )}
          >
            {icons[it.kind]}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">{it.title}</p>
              {it.body ? (
                <p className="mt-0.5 break-words text-sm text-muted" dir="auto">
                  {it.body}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => dismiss(it.id)}
              className="rounded-lg p-1 text-muted hover:bg-forest-50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
              aria-label={t('common.dismiss')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

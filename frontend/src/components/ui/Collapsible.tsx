import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../utils/cn';

export function Collapsible({
  title,
  icon,
  meta,
  children,
  defaultOpen = false,
  className,
}: {
  title: ReactNode;
  icon?: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className={cn('rounded-2xl border border-line bg-surface', className)}>
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal"
        >
          {icon ? <span className="text-forest-600" aria-hidden>{icon}</span> : null}
          <span className="flex-1 text-sm font-semibold text-ink">{title}</span>
          {meta ? <span className="text-xs text-muted">{meta}</span> : null}
          <ChevronDown className={cn('h-4 w-4 text-muted transition-transform', open && 'rotate-180')} aria-hidden />
        </button>
      </h3>
      {open ? (
        <div id={id} className="animate-page-in border-t border-line px-4 py-4">
          {children}
        </div>
      ) : null}
    </div>
  );
}

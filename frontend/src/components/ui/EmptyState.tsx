import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

/** Designed empty state: icon in a soft circle, a title, one hint line and a primary action. Never shows numbers. */
export function EmptyState({
  icon,
  title,
  hint,
  action,
  className,
  compact,
}: {
  icon: ReactNode;
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn('flex flex-col items-center text-center', compact ? 'px-4 py-8' : 'px-6 py-14', className)}>
      <div className="relative mb-4">
        <span className="absolute inset-0 -m-3 rounded-full bg-forest-50/70" aria-hidden />
        <span className="absolute inset-0 -m-1.5 rounded-full bg-forest-100/60" aria-hidden />
        <span
          className={cn(
            'relative inline-flex items-center justify-center rounded-full bg-surface text-forest-600 shadow-card ring-1 ring-line',
            compact ? 'h-12 w-12' : 'h-16 w-16',
          )}
          aria-hidden
        >
          {icon}
        </span>
      </div>
      <h3 className={cn('font-semibold text-ink', compact ? 'text-sm' : 'text-base')}>{title}</h3>
      {hint ? <p className="mt-1 max-w-md text-sm text-muted">{hint}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

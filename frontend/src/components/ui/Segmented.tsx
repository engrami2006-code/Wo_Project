import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

export function Segmented<K extends string>({
  options,
  value,
  onChange,
  label,
  className,
  size = 'md',
}: {
  options: { value: K; label: ReactNode }[];
  value: K;
  onChange: (v: K) => void;
  label: string;
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex rounded-xl border border-line bg-canvas p-1', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm',
              active ? 'bg-surface text-forest-700 shadow-sm' : 'text-muted hover:text-ink',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

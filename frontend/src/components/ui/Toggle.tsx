import { useId } from 'react';
import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled,
  className,
  size = 'md',
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const id = useId();
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? `${id}-d` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 inline-flex shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 disabled:opacity-50',
          size === 'sm' ? 'h-5 w-9' : 'h-6 w-11',
          checked ? 'bg-teal' : 'bg-[#CBD5CF]',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'inline-block rounded-full bg-white shadow transition-transform',
            size === 'sm' ? 'h-4 w-4' : 'h-5 w-5',
            checked
              ? size === 'sm'
                ? 'translate-x-[18px] rtl:-translate-x-[18px]'
                : 'translate-x-[22px] rtl:-translate-x-[22px]'
              : 'translate-x-0.5 rtl:-translate-x-0.5',
          )}
        />
      </button>
      <div className="min-w-0">
        <label htmlFor={id} className="cursor-pointer text-sm font-medium text-ink">
          {label}
        </label>
        {description ? (
          <p id={`${id}-d`} className="help mt-0.5">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}

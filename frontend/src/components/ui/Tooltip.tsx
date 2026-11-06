import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

/** Accessible tooltip: shown on hover and keyboard focus, wired through aria-describedby. */
export function Tooltip({ content, children, className, wide }: { content: ReactNode; children: ReactNode; className?: string; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span
      className={cn('relative inline-flex', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
      }}
      aria-describedby={open ? id : undefined}
    >
      {children}
      {open ? (
        <span
          id={id}
          role="tooltip"
          className={cn(
            'absolute bottom-full start-0 z-40 mb-2 animate-fade rounded-xl bg-forest-800 px-3 py-2 text-xs leading-relaxed text-white shadow-pop',
            wide ? 'w-72' : 'w-56',
          )}
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}

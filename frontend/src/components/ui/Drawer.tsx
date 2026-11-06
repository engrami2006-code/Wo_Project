import { useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useI18n } from '../../i18n';
import { cn } from '../../utils/cn';
import { IconButton } from './Button';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  side?: 'start' | 'end';
  width?: 'sm' | 'md' | 'lg' | 'xl';
}

const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

export function Drawer({ open, onClose, title, description, children, footer, side = 'end', width = 'lg' }: DrawerProps) {
  const { t, dir } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(ref, open, onClose);
  if (!open) return null;

  // In RTL the logical "end" edge is the physical left edge.
  const physicalRight = (side === 'end') === (dir === 'ltr');
  const from = physicalRight ? '100%' : '-100%';

  return createPortal(
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 animate-fade bg-forest-900/40" aria-hidden onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{ ['--drawer-from' as string]: from }}
        className={cn(
          'relative flex h-full w-full animate-drawer-in flex-col bg-surface shadow-pop',
          widths[width],
          physicalRight ? 'ml-auto' : 'mr-auto',
        )}
      >
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-semibold text-ink">
              {title}
            </h2>
            {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
          </div>
          <IconButton label={t('common.close')} size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </header>
        <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer ? <footer className="flex justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}

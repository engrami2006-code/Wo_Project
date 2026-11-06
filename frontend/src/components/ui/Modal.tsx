import { useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useI18n } from '../../i18n';
import { cn } from '../../utils/cn';
import { IconButton } from './Button';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** set false while a mutation is in flight so the dialog cannot be dismissed mid-request */
  dismissible?: boolean;
  role?: 'dialog' | 'alertdialog';
  icon?: ReactNode;
}

const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissible = true,
  role = 'dialog',
  icon,
}: ModalProps) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  useFocusTrap(ref, open, dismissible ? onClose : undefined);
  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div
        className="absolute inset-0 animate-fade bg-forest-900/45 backdrop-blur-[2px]"
        aria-hidden
        onClick={dismissible ? onClose : undefined}
      />
      <div
        ref={ref}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[92vh] w-full animate-scale-in flex-col overflow-hidden rounded-t-3xl bg-surface shadow-pop sm:rounded-3xl',
          widths[size],
        )}
      >
        <header className="flex items-start gap-3 border-b border-line px-5 py-4 sm:px-6">
          {icon ? (
            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-forest-50 text-forest-700">
              {icon}
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-semibold text-ink">
              {title}
            </h2>
            {description ? (
              <p id={descId} className="mt-0.5 text-sm text-muted">
                {description}
              </p>
            ) : null}
          </div>
          {dismissible ? (
            <IconButton label={t('common.close')} size="sm" onClick={onClose} className="-me-2">
              <X className="h-4 w-4" />
            </IconButton>
          ) : null}
        </header>
        <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer ? (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-canvas/60 px-5 py-3.5 sm:px-6">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

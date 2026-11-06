import { cloneElement, forwardRef, isValidElement, useId } from 'react';
import type { InputHTMLAttributes, ReactElement, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../utils/cn';

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  /** a single form control; it receives id / aria-describedby / aria-invalid */
  children: ReactElement;
  labelSuffix?: ReactNode;
  /** when the control is nested inside a wrapper, point the label at it explicitly */
  htmlFor?: string;
}

export function Field({ label, hint, error, required, className, children, labelSuffix, htmlFor }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const describedBy = [hint ? hintId : null, error ? errId : null].filter(Boolean).join(' ') || undefined;
  const control = htmlFor
    ? children
    : isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        id: (children.props as { id?: string }).id ?? id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        required: required || (children.props as { required?: boolean }).required,
      })
    : children;
  const controlId = htmlFor ?? (children.props as { id?: string }).id ?? id;
  return (
    <div className={cn('min-w-0', className)}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label htmlFor={controlId} className="label">
          {label}
          {required ? (
            <span className="ms-0.5 text-earth" aria-hidden>
              *
            </span>
          ) : null}
        </label>
        {labelSuffix}
      </div>
      {control}
      {hint && !error ? (
        <p id={hintId} className="help mt-1.5">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errId} className="mt-1.5 text-xs font-medium text-earth" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { suffix?: ReactNode }>(
  function Input({ className, suffix, ...rest }, ref) {
    if (!suffix) return <input ref={ref} className={cn('input', className)} {...rest} />;
    // The wrapper shares the input's direction so the unit sits at the input's own end edge.
    return (
      <div className="relative" dir={rest.dir}>
        <input ref={ref} className={cn('input pe-16', className)} {...rest} />
        <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-xs text-muted">{suffix}</span>
      </div>
    );
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <div className="relative">
      <select ref={ref} className={cn('input appearance-none pe-9', className)} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
    </div>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, rows = 3, ...rest },
  ref,
) {
  return <textarea ref={ref} rows={rows} className={cn('input resize-y leading-relaxed', className)} {...rest} />;
});

export function FormGrid({ children, cols = 2, className }: { children: ReactNode; cols?: 1 | 2 | 3 | 4; className?: string }) {
  return (
    <div
      className={cn(
        'grid gap-4',
        cols === 2 && 'sm:grid-cols-2',
        cols === 3 && 'sm:grid-cols-2 lg:grid-cols-3',
        cols === 4 && 'sm:grid-cols-2 lg:grid-cols-4',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function FormError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <div role="alert" className="rounded-xl border border-earth/30 bg-earth-50 px-4 py-3 text-sm text-earth-700">
      {children}
    </div>
  );
}

import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { LinkProps } from 'react-router-dom';
import { cn } from '../../utils/cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent' | 'subtle';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-55 active:translate-y-px';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-forest-700 text-white shadow-sm hover:bg-forest-600',
  accent: 'bg-teal text-white shadow-sm hover:bg-[#0B7F75]',
  secondary: 'border border-line bg-surface text-ink hover:border-forest-200 hover:bg-forest-50',
  ghost: 'text-forest-700 hover:bg-forest-50',
  subtle: 'bg-forest-50 text-forest-700 hover:bg-forest-100',
  danger: 'bg-earth text-white shadow-sm hover:bg-earth-700',
};

const sizes: Record<ButtonSize, string> = {
  xs: 'h-7 px-2.5 text-xs rounded-lg',
  sm: 'h-9 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-5 text-base',
};

export function buttonClasses(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string): string {
  return cn(base, variants[variant], sizes[size], className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  iconEnd?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, icon, iconEnd, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClasses(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner className="h-4 w-4" /> : icon}
      {children}
      {iconEnd}
    </button>
  );
});

export interface ButtonLinkProps extends LinkProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  iconEnd?: ReactNode;
}

export function ButtonLink({ variant = 'primary', size = 'md', icon, iconEnd, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonClasses(variant, size, typeof className === 'string' ? className : undefined)} {...rest}>
      {icon}
      {children}
      {iconEnd}
    </Link>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: 'sm' | 'md';
  tone?: 'default' | 'danger' | 'onDark';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = 'md', tone = 'default', className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal disabled:opacity-50',
        size === 'sm' ? 'h-8 w-8' : 'h-10 w-10',
        tone === 'default' && 'text-muted hover:bg-forest-50 hover:text-forest-700',
        tone === 'danger' && 'text-muted hover:bg-earth-50 hover:text-earth',
        tone === 'onDark' && 'text-forest-100 hover:bg-white/10 hover:text-white',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});

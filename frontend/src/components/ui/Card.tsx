import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../utils/cn';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: 'section' | 'article' | 'div' | 'aside';
  interactive?: boolean;
  padded?: boolean;
}

export function Card({ as: Tag = 'section', interactive, padded = true, className, children, ...rest }: CardProps) {
  return (
    <Tag className={cn('card', interactive && 'hover-lift', padded && 'p-5 sm:p-6', className)} {...rest}>
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  subtitle,
  icon,
  actions,
  className,
  titleId,
  level = 2,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
  titleId?: string;
  level?: 2 | 3;
}) {
  const H = level === 2 ? 'h2' : 'h3';
  return (
    <div className={cn('mb-4 flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-forest-50 text-forest-700">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <H id={titleId} className="text-base font-semibold leading-snug text-ink">
            {title}
          </H>
          {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

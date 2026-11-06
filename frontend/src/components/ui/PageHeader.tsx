import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../utils/cn';

export function PageHeader({
  title,
  description,
  actions,
  back,
  icon,
  className,
  meta,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { to: string; label: string };
  icon?: ReactNode;
  className?: string;
  meta?: ReactNode;
}) {
  return (
    <header className={cn('mb-6 sm:mb-8', className)}>
      {back ? (
        <nav aria-label="breadcrumb" className="mb-3">
          <Link to={back.to} className="inline-flex items-center gap-1 text-sm text-muted hover:text-forest-700">
            <ChevronRight className="flip-rtl h-4 w-4 rotate-180" aria-hidden />
            {back.label}
          </Link>
        </nav>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          {icon ? (
            <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-forest-700 text-white sm:inline-flex" aria-hidden>
              {icon}
            </span>
          ) : null}
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold leading-tight text-ink sm:text-[1.875rem]">{title}</h1>
            {description ? <p className="mt-1.5 max-w-3xl text-[0.9375rem] text-muted">{description}</p> : null}
            {meta ? <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div> : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

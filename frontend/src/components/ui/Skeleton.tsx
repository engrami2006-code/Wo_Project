import { cn } from '../../utils/cn';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className ?? 'h-4 w-full')} aria-hidden />;
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2.5', className)} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn('h-3.5', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 3, className, cardClass }: { count?: number; className?: string; cardClass?: string }) {
  return (
    <div className={cn('grid gap-4 sm:grid-cols-2 xl:grid-cols-3', className)} role="status" aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={cn('card p-5', cardClass)}>
          <Skeleton className="mb-4 h-10 w-10 rounded-xl" />
          <Skeleton className="mb-2 h-4 w-1/2" />
          <SkeletonText lines={2} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="card p-4" role="status" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-line/70 py-3 last:border-0">
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 w-1/5" />
          <Skeleton className="h-4 w-1/6" />
          <Skeleton className="ms-auto h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

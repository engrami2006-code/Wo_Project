import { cn } from '../../utils/cn';

/** WO mark: a droplet cut by three crop rows. */
export function LogoMark({ className, onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    <svg viewBox="0 0 40 40" className={cn('h-9 w-9', className)} aria-hidden>
      <rect width="40" height="40" rx="11" fill={onDark ? '#10B981' : '#0F3D2E'} />
      <path d="M20 7.5c-5 7-9.5 12-9.5 17.3a9.5 9.5 0 0 0 19 0C29.5 19.5 25 14.5 20 7.5Z" fill={onDark ? '#0F3D2E' : '#10B981'} />
      <path d="M13.2 24.2c4.4-1.6 9.2-1.6 13.6 0M12.6 28c4.8-1.7 10-1.7 14.8 0M15 31.4c3.3-1 6.7-1 10 0" stroke={onDark ? '#10B981' : '#0F3D2E'} strokeWidth="1.6" strokeLinecap="round" fill="none" opacity=".85" />
    </svg>
  );
}

export function Logo({ onDark = false, compact = false, subtitle }: { onDark?: boolean; compact?: boolean; subtitle?: string }) {
  return (
    <span className="inline-flex items-center gap-3">
      <LogoMark onDark={onDark} />
      {compact ? null : (
        <span className="flex flex-col leading-tight">
          <span className={cn('text-[1.05rem] font-semibold', onDark ? 'text-white' : 'text-forest-700')} dir="ltr">
            WO
          </span>
          <span className={cn('text-xs', onDark ? 'text-forest-100/80' : 'text-muted')}>{subtitle ?? 'Water Optimization'}</span>
        </span>
      )}
    </span>
  );
}

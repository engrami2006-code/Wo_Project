import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

export type BadgeTone =
  | 'neutral'
  | 'forest'
  | 'emerald'
  | 'teal'
  | 'water'
  | 'info'
  | 'warning'
  | 'critical'
  | 'violet'
  | 'outline';

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-[#EEF1EE] text-[#3E4D46]',
  forest: 'bg-forest-700 text-white',
  emerald: 'bg-[#E3F7EF] text-[#04664A]',
  teal: 'bg-[#E0F4F2] text-[#0B6B63]',
  water: 'bg-water-50 text-water-700',
  info: 'bg-water-50 text-water-700',
  warning: 'bg-[#FEF3E2] text-[#92400E]',
  critical: 'bg-earth-50 text-earth-700',
  violet: 'bg-[#F1ECFE] text-[#5B21B6]',
  outline: 'border border-line bg-surface text-muted',
};

const dots: Record<BadgeTone, string> = {
  neutral: 'bg-muted',
  forest: 'bg-emerald',
  emerald: 'bg-emerald',
  teal: 'bg-teal',
  water: 'bg-water',
  info: 'bg-info',
  warning: 'bg-warning',
  critical: 'bg-critical',
  violet: 'bg-[#7C3AED]',
  outline: 'bg-muted',
};

export function Badge({
  tone = 'neutral',
  dot,
  icon,
  className,
  children,
  title,
  size = 'sm',
}: {
  tone?: BadgeTone;
  dot?: boolean;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
  title?: string;
  size?: 'xs' | 'sm';
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-full font-medium',
        size === 'xs' ? 'px-2 py-0.5 text-2xs' : 'px-2.5 py-0.5 text-xs',
        tones[tone],
        className,
      )}
    >
      {dot ? <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dots[tone])} aria-hidden /> : null}
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

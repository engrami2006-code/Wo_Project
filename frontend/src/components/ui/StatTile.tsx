import type { ReactNode } from 'react';
import { useCountUp } from '../../hooks/useCountUp';
import { DASH, isNum } from '../../utils/format';
import { cn } from '../../utils/cn';

export type StatTone = 'forest' | 'emerald' | 'teal' | 'water' | 'earth' | 'warning';

const toneIcon: Record<StatTone, string> = {
  forest: 'bg-forest-50 text-forest-700',
  emerald: 'bg-[#E3F7EF] text-[#047857]',
  teal: 'bg-[#E0F4F2] text-[#0B6B63]',
  water: 'bg-water-50 text-water-700',
  earth: 'bg-earth-50 text-earth-700',
  warning: 'bg-[#FEF3E2] text-[#92400E]',
};

/**
 * KPI tile. `value` must be a real fetched number or null; null renders an em dash and
 * is never animated. Count-up runs only for real values and respects reduced motion.
 */
export function StatTile({
  label,
  value,
  format,
  icon,
  tone = 'forest',
  hint,
  unit,
  className,
}: {
  label: ReactNode;
  value: number | null | undefined;
  format: (v: number) => string;
  icon?: ReactNode;
  tone?: StatTone;
  hint?: ReactNode;
  unit?: ReactNode;
  className?: string;
}) {
  const animated = useCountUp(isNum(value) ? value : null);
  const shown = isNum(value) && animated !== null ? format(animated) : DASH;
  return (
    <div className={cn('card flex flex-col gap-3 p-4 sm:p-5', className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{label}</p>
        {icon ? (
          <span className={cn('inline-flex h-8 w-8 items-center justify-center rounded-lg', toneIcon[tone])} aria-hidden>
            {icon}
          </span>
        ) : null}
      </div>
      <p className="tabular text-2xl font-semibold leading-none text-ink sm:text-[1.7rem]">
        <span className="sr-only">{isNum(value) ? format(value) : DASH}</span>
        <span aria-hidden>{shown}</span>
        {unit && isNum(value) ? <span className="ms-1 text-sm font-medium text-muted">{unit}</span> : null}
      </p>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

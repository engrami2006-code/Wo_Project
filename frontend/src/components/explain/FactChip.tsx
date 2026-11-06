import { useI18n } from '../../i18n';
import type { SupportingFact } from '../../types/api';
import { fmtValue, humanize } from '../../utils/format';
import { cn } from '../../utils/cn';
import { Tooltip } from '../ui/Tooltip';

export function EvidenceList({ evidence, className }: { evidence: Record<string, unknown>; className?: string }) {
  const { lang } = useI18n();
  const entries = Object.entries(evidence ?? {});
  if (!entries.length) return null;
  return (
    <dl className={cn('grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5', className)} dir="ltr">
      {entries.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-mono opacity-75">{k}</dt>
          <dd className="font-mono break-all">{fmtValue(v, lang)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** symbol = T/F chip; derived facts use a dashed outline. Tooltip shows description + evidence. */
export function FactChip({ fact }: { fact: SupportingFact }) {
  const { t, bi } = useI18n();
  const description = fact.derived ? humanize(fact.symbol) : bi(fact.description_en, fact.description_ar);
  return (
    <Tooltip
      wide
      content={
        <span className="block space-y-1.5">
          <span className="block font-medium">{description}</span>
          {fact.derived ? (
            <span className="block text-forest-100">
              {t('xai.derivedBy', { rule: String(fact.evidence?.derived_by ?? '—') })}
            </span>
          ) : (
            <EvidenceList evidence={fact.evidence} className="text-[11px] text-forest-50" />
          )}
        </span>
      }
    >
      <button
        type="button"
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 font-mono text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal',
          fact.derived
            ? 'border-dashed border-teal/60 bg-[#F0FAF8] text-[#0B6B63]'
            : fact.value
              ? 'border-emerald/40 bg-[#ECFAF4] text-[#04664A]'
              : 'border-line bg-canvas text-muted',
          !fact.used && 'opacity-80',
        )}
        dir="ltr"
        aria-label={`${fact.symbol} = ${fact.value ? 'true' : 'false'}. ${description}`}
      >
        <span>{fact.symbol}</span>
        <span
          className={cn(
            'rounded px-1 text-[10px] font-semibold',
            fact.value ? 'bg-emerald/15 text-[#04664A]' : 'bg-[#E5E9E6] text-[#4B5A53]',
          )}
        >
          {fact.value ? 'T' : 'F'}
        </span>
      </button>
    </Tooltip>
  );
}

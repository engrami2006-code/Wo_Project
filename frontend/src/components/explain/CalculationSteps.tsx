import { useI18n } from '../../i18n';
import type { CalculationStep } from '../../types/api';
import { fmtValue } from '../../utils/format';
import { cn } from '../../utils/cn';

function ValuesList({ values }: { values: Record<string, unknown> }) {
  const { lang } = useI18n();
  const entries = Object.entries(values ?? {}).filter(([, v]) => v !== null && v !== '' && v !== undefined);
  if (!entries.length) return <span className="text-muted">—</span>;
  return (
    <span className="flex flex-wrap gap-1" dir="ltr">
      {entries.map(([k, v]) => (
        <span key={k} className="rounded-md bg-canvas px-1.5 py-0.5 font-mono text-[11px] text-ink">
          {k}={fmtValue(v, lang)}
        </span>
      ))}
    </span>
  );
}

/** FAO-56 calculation steps: name, formula (mono), values, result, unit, reference. */
export function CalculationSteps({ steps, className }: { steps: CalculationStep[]; className?: string }) {
  const { t, lang } = useI18n();
  return (
    <div className={cn('min-w-0', className)}>
      <div className="scrollbar-thin hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <caption className="sr-only">{t('calc.steps')}</caption>
          <thead>
            <tr className="text-xs text-muted">
              <th scope="col" className="w-8 px-2 py-2 text-start font-semibold">#</th>
              <th scope="col" className="px-2 py-2 text-start font-semibold">{t('calc.col.step')}</th>
              <th scope="col" className="px-2 py-2 text-start font-semibold">{t('calc.col.formula')}</th>
              <th scope="col" className="px-2 py-2 text-start font-semibold">{t('calc.col.values')}</th>
              <th scope="col" className="px-2 py-2 text-end font-semibold">{t('calc.col.result')}</th>
              <th scope="col" className="px-2 py-2 text-start font-semibold">{t('calc.col.reference')}</th>
            </tr>
          </thead>
          <tbody>
            {steps.map((s, i) => {
              const skipped = s.formula === 'skipped';
              return (
                <tr key={`${s.name}-${i}`} className={cn('border-t border-line/70 align-top', skipped && 'text-muted')}>
                  <td className="tabular px-2 py-2.5 text-xs text-muted">{i + 1}</td>
                  <td className="px-2 py-2.5 font-medium" dir="auto">{s.name}</td>
                  <td className="px-2 py-2.5">
                    {skipped ? <span className="text-xs italic">{t('calc.skipped')}</span> : <code className="formula text-xs">{s.formula}</code>}
                  </td>
                  <td className="px-2 py-2.5">
                    <ValuesList values={s.values} />
                  </td>
                  <td className="tabular whitespace-nowrap px-2 py-2.5 text-end font-semibold text-ink">
                    <span dir="ltr">
                      {s.result === null || s.result === undefined ? '—' : fmtValue(s.result, lang)}
                      {s.unit ? <span className="ms-1 text-xs font-normal text-muted">{s.unit}</span> : null}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-xs text-muted" dir="auto">{s.reference || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ol className="space-y-2 md:hidden">
        {steps.map((s, i) => (
          <li key={`${s.name}-${i}`} className="rounded-xl border border-line p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium" dir="auto">
                {i + 1}. {s.name}
              </span>
              <span className="tabular font-semibold" dir="ltr">
                {s.result === null || s.result === undefined ? '—' : fmtValue(s.result, lang)} {s.unit}
              </span>
            </div>
            {s.formula !== 'skipped' ? <code className="formula mt-1 block text-xs">{s.formula}</code> : null}
            <div className="mt-1.5">
              <ValuesList values={s.values} />
            </div>
            {s.reference ? <p className="mt-1 text-xs text-muted" dir="auto">{s.reference}</p> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

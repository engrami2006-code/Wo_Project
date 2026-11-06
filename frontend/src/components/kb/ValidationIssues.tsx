import { useState } from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { useI18n } from '../../i18n';
import type { ValidationReport } from '../../types/api';
import { cn } from '../../utils/cn';
import { fmtInt } from '../../utils/format';
import { labelCspStat } from '../../utils/labels';
import { Badge } from '../ui/Badge';

const sevIcon = {
  error: <AlertOctagon className="h-4 w-4 text-earth" aria-hidden />,
  warning: <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />,
  info: <Info className="h-4 w-4 text-info" aria-hidden />,
};

/** KB validation report: consistency, DPLL statistics and the issue list (conflicts, coverage, redundancy…). */
export function ValidationIssues({ report }: { report: ValidationReport }) {
  const { t, lang } = useI18n();
  const [openModel, setOpenModel] = useState<number | null>(null);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={report.ok ? 'emerald' : 'critical'} dot icon={report.ok ? <CheckCircle2 className="h-3 w-3" aria-hidden /> : undefined}>
          {report.ok ? t('kb.validate.ok') : t('kb.validate.notOk')}
        </Badge>
        <Badge tone={report.consistent ? 'emerald' : 'critical'} dot>
          {report.consistent ? t('kb.validate.consistent') : t('kb.validate.inconsistent')}
        </Badge>
        {Object.entries(report.stats ?? {}).map(([k, v]) => (
          <Badge key={k} tone="outline" size="xs">
            {labelCspStat(t, k)}: <span className="tabular ms-1 font-semibold">{fmtInt(v, lang)}</span>
          </Badge>
        ))}
      </div>
      {report.issues.length === 0 ? (
        <p className="text-sm text-muted">{t('kb.validate.noIssues')}</p>
      ) : (
        <ul className="space-y-2">
          {report.issues.map((issue, i) => (
            <li
              key={`${issue.code}-${i}`}
              className={cn(
                'rounded-xl border p-3 text-sm',
                issue.severity === 'error' ? 'border-earth/30 bg-earth-50/60' : issue.severity === 'warning' ? 'border-warning/30 bg-[#FFF9EF]' : 'border-line bg-surface',
              )}
            >
              <div className="flex items-start gap-2">
                {sevIcon[issue.severity as keyof typeof sevIcon] ?? sevIcon.info}
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-ink" dir="ltr">{issue.code}</span>
                    {issue.rules.map((r) => (
                      <Badge key={r} tone="outline" size="xs"><span dir="ltr">{r}</span></Badge>
                    ))}
                  </p>
                  <p className="mt-1 text-ink" dir="ltr" style={{ textAlign: 'start' }}>{issue.message}</p>
                  {issue.model ? (
                    <div className="mt-2">
                      <button type="button" className="text-xs font-medium text-teal hover:underline" aria-expanded={openModel === i} onClick={() => setOpenModel(openModel === i ? null : i)}>
                        {openModel === i ? t('kb.validate.hideModel') : t('kb.validate.showModel')}
                      </button>
                      {openModel === i ? (
                        <ul className="mt-2 flex flex-wrap gap-1" dir="ltr">
                          {Object.entries(issue.model).map(([s, v]) => (
                            <li key={s} className={cn('rounded-md px-1.5 py-0.5 font-mono text-[11px]', v ? 'bg-[#ECFAF4] text-[#04664A]' : 'bg-canvas text-muted')}>
                              {s}={v ? 'T' : 'F'}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

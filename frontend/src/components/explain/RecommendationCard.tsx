import { useId, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  BadgeCheck,
  Bell,
  Calculator,
  CircleHelp,
  Droplets,
  GitBranch,
  HelpCircle,
  Lightbulb,
  ListChecks,
  Route,
  ScrollText,
  Shuffle,
  Sparkle,
} from 'lucide-react';
import { useI18n } from '../../i18n';
import type { Alternative, Explanation } from '../../types/api';
import { cn } from '../../utils/cn';
import { fmtLitres, fmtNumber, fmtValue, humanize } from '../../utils/format';
import { labelCertainty, labelDataQuality, labelRuleRole, ruleRoleTone, severityTone, labelSeverity } from '../../utils/labels';
import { Badge } from '../ui/Badge';
import { Collapsible } from '../ui/Collapsible';
import { KeyValue } from '../ui/Table';
import { CalculationSteps } from './CalculationSteps';
import { FactChip } from './FactChip';
import { Formula, RuleFormula } from './Formula';
import { ProofTree } from './ProofTree';
import { ReasoningFlow } from './ReasoningFlow';
import { serverText } from '../../utils/serverText';

function Section({ icon, title, children, tone = 'default', count }: { icon: ReactNode; title: string; children: ReactNode; tone?: 'default' | 'warn'; count?: number }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="relative ps-10">
      <span
        className={cn(
          'absolute start-0 top-0 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border-2 bg-surface',
          tone === 'warn' ? 'border-warning text-[#92400E]' : 'border-forest-200 text-forest-700',
        )}
        aria-hidden
      >
        {icon}
      </span>
      <h3 id={id} className="flex items-center gap-2 pt-0.5 text-[0.9375rem] font-semibold text-ink">
        {title}
        {typeof count === 'number' ? <span className="tabular rounded-full bg-forest-50 px-1.5 text-2xs font-semibold text-forest-600">{count}</span> : null}
      </h3>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

function AlternativeItem({ alt }: { alt: Alternative }) {
  const { t, bi, lang } = useI18n();
  return (
    <li className="rounded-xl border border-line bg-surface p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-ink">{bi(alt.name_en, alt.name_ar)}</span>
        <span className="font-mono text-xs text-muted" dir="ltr">
          {alt.rule}
        </span>
        <Badge tone={alt.status === 'overridden' ? 'violet' : 'neutral'} size="xs">
          {alt.status === 'overridden' ? t('xai.alt.overridden') : t('xai.alt.notFired')}
        </Badge>
      </div>
      {alt.status === 'overridden' ? (
        <p className="mt-1.5 text-sm text-muted">
          {bi(alt.reason_en, alt.reason_ar)}
        </p>
      ) : null}
      {alt.blocking.length ? (
        <ul className="mt-2 space-y-1.5" aria-label={t('xai.alt.blocking')}>
          {alt.blocking.map((b) => {
            const unknown = b.state === 'unknown';
            return (
              <li key={b.literal} className="flex flex-wrap items-start gap-x-2 gap-y-1 text-sm">
                <Formula text={b.literal} className="rounded-md bg-canvas px-1.5 py-0.5 text-xs" />
                <Badge tone={unknown ? 'warning' : 'neutral'} size="xs">
                  {unknown ? t('xai.state.unknown') : b.state === 'false' ? t('xai.state.false') : t('xai.state.notDerived')}
                </Badge>
                <span className="min-w-0 flex-1 text-muted">{bi(b.description_en, b.description_ar)}</span>
                {b.flip_en ? (
                  <span className="w-full text-xs text-[#0B6B63] sm:w-auto">
                    {t('xai.alt.wouldHold', { condition: bi(b.flip_en, b.flip_ar) })}
                  </span>
                ) : null}
                {unknown && b.reason ? <span className="w-full text-xs text-[#92400E]" dir="auto">{serverText(b.reason, lang, t)}</span> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}

export interface RecommendationCardProps {
  explanation: Explanation;
  className?: string;
  showFlow?: boolean;
  /** extra controls rendered in the header (e.g. accept / dismiss) */
  actions?: ReactNode;
  subtitle?: ReactNode;
}

/**
 * The explainable recommendation: what, why, facts, rules, alternatives, what-if, missing data,
 * calculation and the full reasoning trace. Sections reveal in sequence (respecting reduced motion).
 */
export function RecommendationCard({ explanation: e, className, showFlow = true, actions, subtitle }: RecommendationCardProps) {
  const { t, bi, lang } = useI18n();
  const [allFacts, setAllFacts] = useState(false);
  const rec = e.recommendation;
  const insufficient = !rec || e.certainty === 'insufficient_data';

  const facts = useMemo(() => {
    const sorted = [...e.supporting_facts];
    return allFacts ? sorted : sorted.filter((f) => f.used);
  }, [e.supporting_facts, allFacts]);
  const unusedCount = e.supporting_facts.filter((f) => !f.used).length;

  const rules = useMemo(
    () => [...e.triggered_rules].sort((a, b) => (a.fired_order ?? 999) - (b.fired_order ?? 999)),
    [e.triggered_rules],
  );

  const hints = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const m of e.missing_data) {
      for (const h of m.hints) {
        const text = bi(h.en, h.ar);
        if (!seen.has(text)) {
          seen.add(text);
          out.push(text);
        }
      }
    }
    return out;
  }, [e.missing_data, bi]);

  const calc = e.calculation;
  const bc = e.trace?.backward_chaining ?? [];

  return (
    <article className={cn('card overflow-hidden', className)} aria-label={t('xai.cardLabel')}>
      {/* header */}
      <header
        className={cn(
          'flex flex-wrap items-start justify-between gap-4 border-b px-5 py-5 sm:px-6',
          insufficient ? 'border-warning/30 bg-[#FFF9EF]' : 'border-line bg-gradient-to-b from-forest-50/70 to-surface',
        )}
      >
        <div className="flex min-w-0 items-start gap-3.5">
          <span
            className={cn(
              'inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl',
              insufficient ? 'bg-[#FEF3E2] text-[#92400E]' : 'bg-forest-700 text-white',
            )}
            aria-hidden
          >
            {insufficient ? <CircleHelp className="h-6 w-6" /> : rec?.amount_l !== null ? <Droplets className="h-6 w-6" /> : <Lightbulb className="h-6 w-6" />}
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted">{insufficient ? t('xai.noRecommendation') : t('xai.recommendation')}</p>
            <h2 className="mt-0.5 text-xl font-semibold leading-snug text-ink">
              {insufficient ? t('xai.insufficient') : bi(rec?.title_en, rec?.title_ar)}
            </h2>
            {subtitle ? <div className="mt-1 text-sm text-muted">{subtitle}</div> : null}
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {rec ? (
                <Badge tone="outline" size="xs">
                  <span className="font-mono" dir="ltr">
                    {rec.rule}
                  </span>
                </Badge>
              ) : null}
              <Badge tone={insufficient ? 'warning' : 'emerald'} dot icon={insufficient ? undefined : <BadgeCheck className="h-3 w-3" aria-hidden />}>
                {labelCertainty(t, e.certainty)}
              </Badge>
              <Badge tone={e.data_quality === 'fresh' || e.data_quality === 'measured' ? 'water' : 'warning'} dot>
                {labelDataQuality(t, e.data_quality)}
              </Badge>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-3">
          {rec && rec.amount_l !== null && rec.amount_l !== undefined ? (
            <div className="text-end">
              <p className="text-xs text-muted">{t('xai.amount')}</p>
              <p className="tabular text-3xl font-semibold leading-none text-forest-700 sm:text-4xl">
                {fmtNumber(rec.amount_l, lang, 1)}
                <span className="ms-1.5 text-base font-medium text-muted">{lang === 'ar' ? 'لتر' : 'L'}</span>
              </p>
              {calc?.result?.gross_l !== undefined ? (
                <p className="mt-1 text-xs text-muted">
                  {t('xai.ofRequirement', { gross: fmtLitres(calc.result.gross_l as number, lang) })}
                </p>
              ) : null}
            </div>
          ) : null}
          {actions ? <div className="flex flex-wrap justify-end gap-2">{actions}</div> : null}
        </div>
      </header>

      {showFlow ? (
        <div className="border-b border-line bg-canvas/50 px-5 py-5 sm:px-6">
          <ReasoningFlow explanation={e} />
        </div>
      ) : null}

      <div className="stagger relative space-y-7 px-5 py-6 sm:px-6">
        {/* the rail joining the sections */}
        <span className="absolute bottom-8 start-[2.125rem] top-8 w-px bg-forest-100 sm:start-[2.375rem]" aria-hidden />

        <Section icon={<Lightbulb className="h-3.5 w-3.5" />} title={t('xai.section.recommendation')} tone={insufficient ? 'warn' : 'default'}>
          {rec ? (
            <p className="text-[0.9375rem] leading-relaxed text-ink">
              {bi(rec.text_en, rec.text_ar)}
            </p>
          ) : (
            <p className="text-[0.9375rem] leading-relaxed text-[#92400E]">{t('xai.insufficientDetail')}</p>
          )}
        </Section>

        {!insufficient ? (
          <Section icon={<HelpCircle className="h-3.5 w-3.5" />} title={t('xai.section.why')}>
            <p className="leading-relaxed text-ink">
              {bi(e.reason_en, e.reason_ar)}
            </p>
          </Section>
        ) : null}

        {insufficient || e.missing_data.length ? (
          <Section icon={<AlertTriangle className="h-3.5 w-3.5" />} title={t('xai.section.missing')} tone="warn" count={e.missing_data.length}>
            <div className="rounded-2xl border border-warning/30 bg-[#FFF9EF] p-4">
              <p className="font-medium text-[#7C2D12]">{t('xai.insufficient')}</p>
              {hints.length ? (
                <>
                  <p className="mt-2 text-sm text-[#92400E]">{t('xai.missing.provide')}</p>
                  <ul className="mt-1.5 list-disc space-y-1 ps-5 text-sm text-ink">
                    {hints.map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              {e.missing_data.length ? (
                <ul className="mt-3 flex flex-wrap gap-1.5" aria-label={t('xai.missing.symbols')}>
                  {e.missing_data.map((m) => (
                    <li key={m.symbol}>
                      <span
                        className="inline-flex items-center gap-1 rounded-lg border border-dashed border-warning/50 bg-surface px-2 py-0.5 font-mono text-xs text-[#92400E]"
                        dir="ltr"
                        title={m.reason ? serverText(m.reason, lang, t) : undefined}
                      >
                        {m.symbol} = ?
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </Section>
        ) : null}

        <Section icon={<ListChecks className="h-3.5 w-3.5" />} title={t('xai.section.facts')} count={e.supporting_facts.filter((f) => f.used).length}>
          {facts.length ? (
            <ul className="flex flex-wrap gap-1.5">
              {facts.map((f) => (
                <li key={`${f.symbol}-${f.derived}`}>
                  <FactChip fact={f} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">{t('xai.facts.none')}</p>
          )}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-4 rounded border border-emerald/40 bg-[#ECFAF4]" aria-hidden />
              {t('xai.facts.percept')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-4 rounded border border-dashed border-teal/60 bg-[#F0FAF8]" aria-hidden />
              {t('xai.facts.derived')}
            </span>
            {unusedCount ? (
              <button type="button" className="font-medium text-teal hover:underline" onClick={() => setAllFacts((v) => !v)} aria-expanded={allFacts}>
                {allFacts ? t('xai.facts.showUsed') : t('xai.facts.showAll', { n: e.supporting_facts.length })}
              </button>
            ) : null}
          </div>
        </Section>

        <Section icon={<ScrollText className="h-3.5 w-3.5" />} title={t('xai.section.rules')} count={rules.length}>
          {rules.length ? (
            <ol className="space-y-2">
              {rules.map((r) => (
                <li key={r.code} className="flex gap-3 rounded-xl border border-line bg-surface p-3">
                  <span
                    className="tabular inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-forest-700 text-xs font-semibold text-white"
                    title={t('xai.rules.order')}
                  >
                    {r.fired_order ?? '·'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-forest-700" dir="ltr">
                        {r.code}
                      </span>
                      <span className="text-sm font-medium text-ink">{bi(r.name_en, r.name_ar)}</span>
                      <Badge tone={ruleRoleTone(r.role)} size="xs">
                        {labelRuleRole(t, r.role)}
                      </Badge>
                    </div>
                    <RuleFormula antecedent={r.antecedent} consequent={r.consequent} className="mt-1.5 block text-xs" />
                    {bi(r.explanation_en, r.explanation_ar) ? (
                      <p className="mt-1.5 text-sm text-muted">
                        {bi(r.explanation_en, r.explanation_ar)}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted">{t('xai.rules.none')}</p>
          )}
        </Section>

        {e.advisories.length || e.alerts.length ? (
          <Section icon={<Bell className="h-3.5 w-3.5" />} title={t('xai.section.advisories')} count={e.advisories.length + e.alerts.length}>
            <ul className="space-y-2">
              {e.advisories.map((a) => (
                <li key={a.code} className="flex items-start gap-2.5 rounded-xl bg-[#F0FAF8] p-3 text-sm">
                  <Sparkle className="mt-0.5 h-4 w-4 shrink-0 text-teal" aria-hidden />
                  <div className="min-w-0">
                    <p className="font-medium text-ink">
                      {bi(a.name_en, a.name_ar)}{' '}
                      <span className="font-mono text-xs text-muted" dir="ltr">
                        {a.code}
                      </span>
                    </p>
                    <p className="mt-0.5 text-muted">
                      {bi(a.text_en, a.text_ar)}
                    </p>
                  </div>
                </li>
              ))}
              {e.alerts.map((a) => (
                <li key={a.code} className="flex items-start gap-2.5 rounded-xl border border-line p-3 text-sm">
                  <AlertTriangle className={cn('mt-0.5 h-4 w-4 shrink-0', a.severity === 'critical' ? 'text-earth' : a.severity === 'warning' ? 'text-warning' : 'text-info')} aria-hidden />
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                      {bi(a.title_en, a.title_ar)}
                      <Badge tone={severityTone(a.severity)} size="xs">
                        {labelSeverity(t, a.severity)}
                      </Badge>
                      <span className="font-mono text-xs text-muted" dir="ltr">
                        {a.code}
                      </span>
                    </p>
                    <p className="mt-0.5 text-muted">
                      {bi(a.message_en, a.message_ar)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {e.alternatives.length ? (
          <Section icon={<Shuffle className="h-3.5 w-3.5" />} title={t('xai.section.alternatives')} count={e.alternatives.length}>
            <ul className="space-y-2">
              {e.alternatives.map((a) => (
                <AlternativeItem key={a.rule} alt={a} />
              ))}
            </ul>
          </Section>
        ) : null}

        {e.what_could_change.length ? (
          <Section icon={<ArrowRightLeft className="h-3.5 w-3.5" />} title={t('xai.section.change')} count={e.what_could_change.length}>
            <ul className="space-y-2">
              {e.what_could_change.map((c, i) => (
                <li key={`${c.rule ?? i}`} className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-teal/40 bg-[#F7FCFB] px-3 py-2.5 text-sm">
                  <span className="text-muted">{t('xai.change.if')}</span>
                  <span className="font-medium text-ink">
                    {bi(c.condition_en, c.condition_ar)}
                  </span>
                  <span className="text-[#0B6B63]">
                    {bi(c.effect_en, c.effect_ar)}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {calc && calc.steps?.length ? (
          <Section icon={<Calculator className="h-3.5 w-3.5" />} title={t('xai.section.calculation')}>
            <Collapsible title={calc.method} meta={t('xai.calc.steps', { n: calc.steps.length })} icon={<Calculator className="h-4 w-4" />}>
              <KeyValue
                cols={3}
                className="mb-4"
                items={Object.entries(calc.inputs ?? {})
                  .filter(([, v]) => v !== null && v !== undefined)
                  .map(([k, v]) => ({
                    label: <span className="font-mono" dir="ltr">{k}</span>,
                    value: <span dir="auto">{fmtValue(v, lang)}</span>,
                  }))}
              />
              <CalculationSteps steps={calc.steps} />
            </Collapsible>
          </Section>
        ) : null}

        <Section icon={<Route className="h-3.5 w-3.5" />} title={t('xai.section.trace')}>
          <Collapsible title={t('xai.trace.title')} meta={e.trace?.engine ? humanize(e.trace.engine.split(' ')[0]) : undefined} icon={<GitBranch className="h-4 w-4" />}>
            <div className="space-y-6">
              <div>
                <h4 className="mb-2 text-sm font-semibold text-ink">{t('xai.trace.agenda')}</h4>
                <ol className="scrollbar-thin flex gap-1.5 overflow-x-auto pb-2" dir="ltr" aria-label={t('xai.trace.agenda')}>
                  {(e.trace?.agenda ?? []).map((a, i) => {
                    const derived = e.trace.fired.some((f) => f.conclusion === a);
                    return (
                      <li key={`${a}-${i}`} className="flex shrink-0 items-center gap-1.5">
                        <span
                          className={cn(
                            'whitespace-nowrap rounded-lg border px-2 py-1 font-mono text-[11px]',
                            derived ? 'border-teal/50 bg-[#F0FAF8] text-[#0B6B63]' : a.startsWith('~') ? 'border-line bg-canvas text-muted' : 'border-emerald/40 bg-[#ECFAF4] text-[#04664A]',
                          )}
                        >
                          <span className="me-1 text-[10px] opacity-60">{i + 1}</span>
                          {a.replace(/^~/, '¬')}
                        </span>
                        {i < e.trace.agenda.length - 1 ? <span className="text-forest-200" aria-hidden>›</span> : null}
                      </li>
                    );
                  })}
                </ol>
              </div>

              {e.trace?.fired?.length ? (
                <div>
                  <h4 className="mb-2 text-sm font-semibold text-ink">{t('xai.trace.fired')}</h4>
                  <ol className="space-y-1 text-xs" dir="ltr">
                    {e.trace.fired.map((f) => (
                      <li key={f.order} className="flex flex-wrap items-center gap-2 font-mono">
                        <span className="tabular w-5 text-end text-muted">{f.order}.</span>
                        <span className="font-semibold text-forest-700">{f.code}</span>
                        <span className="text-muted">{f.premises.map((p) => p.replace(/^~/, '¬')).join(' ∧ ')}</span>
                        <span className="text-teal">⇒</span>
                        <span className="text-ink">{f.conclusion}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}

              {e.trace?.conflict_resolution?.length ? (
                <div>
                  <h4 className="mb-2 text-sm font-semibold text-ink">{t('xai.trace.conflict')}</h4>
                  <ul className="space-y-2">
                    {e.trace.conflict_resolution.map((c) => (
                      <li key={c.group} className="rounded-xl border border-line p-3 text-sm">
                        <p className="font-mono text-xs text-muted" dir="ltr">
                          {c.group}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <span className="text-muted">{t('xai.trace.winner')}</span>
                          <Badge tone="forest" size="xs">
                            <span dir="ltr">{c.winner}</span>
                          </Badge>
                          <span className="text-muted">{t('xai.trace.candidates')}</span>
                          {c.candidates.map((x) => (
                            <Badge key={x} tone="outline" size="xs">
                              <span dir="ltr">{x}</span>
                            </Badge>
                          ))}
                          {c.overridden.length ? (
                            <>
                              <span className="text-muted">{t('xai.trace.overridden')}</span>
                              {c.overridden.map((x) => (
                                <Badge key={x} tone="violet" size="xs">
                                  <span dir="ltr">{x}</span>
                                </Badge>
                              ))}
                            </>
                          ) : null}
                        </div>
                        <p className="mt-1.5 text-xs text-muted">{t('xai.trace.conflictRule')}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {bc.map((b) => (
                <div key={b.goal}>
                  <h4 className="mb-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                    {t('xai.trace.backward')}
                    <code className="formula text-xs">{b.goal}</code>
                    {typeof b.goals_expanded === 'number' ? (
                      <span className="text-xs font-normal text-muted">{t('xai.trace.goalsExpanded', { n: b.goals_expanded })}</span>
                    ) : null}
                  </h4>
                  <div className="scrollbar-thin overflow-x-auto rounded-xl border border-line bg-canvas/40 p-3">
                    <ProofTree root={b.proof} />
                  </div>
                </div>
              ))}
            </div>
          </Collapsible>
        </Section>
      </div>
    </article>
  );
}

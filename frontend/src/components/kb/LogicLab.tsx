import { useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { BadgeCheck, Binary, CircleSlash, Eraser, FlaskConical, GitMerge, ListOrdered, Play, Split, Table2 } from 'lucide-react';
import { qk } from '../../hooks/queries';
import { useI18n } from '../../i18n';
import { kbService } from '../../services/kb';
import { RULE_CATEGORIES } from '../../types/api';
import type { LogicAskResponse, PerceptDef } from '../../types/api';
import { cn } from '../../utils/cn';
import { errorText } from '../../utils/errors';
import { fmtInt } from '../../utils/format';
import { labelPerceptCategory, labelProofStatus, labelRuleCategory, prettyFormula } from '../../utils/labels';
import { Formula } from '../explain/Formula';
import { ProofTree } from '../explain/ProofTree';
import { Badge, Button, Card, ErrorState, Field, FormError, Input, SkeletonTable, Toggle } from '../ui';
import { serverText } from '../../utils/serverText';

type Tri = 'unknown' | 'true' | 'false';

const EXAMPLES = ['irrigate_today', 'water_limited => ~action_full_irrigation', 'action_deficit_irrigation', 'alert_water_shortage', 'irrigation_needed & ~water_critical'];

/** A scenario a student can load to see all engines agree; it only sets truth values in this form. */
const LIMITED_WATER_SCENARIO: Record<string, boolean> = {
  et_demand_positive: true,
  rain_covers_demand: false,
  season_ended: false,
  not_yet_planted: false,
  water_sufficient: false,
  water_limited: true,
  water_critical: false,
};

function TriToggle({ value, onChange, label }: { value: Tri; onChange: (v: Tri) => void; label: string }) {
  const { t } = useI18n();
  const opts: { v: Tri; text: string; cls: string }[] = [
    { v: 'unknown', text: '?', cls: 'bg-surface text-[#92400E] shadow-sm' },
    { v: 'true', text: 'T', cls: 'bg-emerald text-white shadow-sm' },
    { v: 'false', text: 'F', cls: 'bg-[#5B6B63] text-white shadow-sm' },
  ];
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex shrink-0 rounded-lg bg-canvas p-0.5" dir="ltr">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          aria-label={o.v === 'unknown' ? t('lab.unknown') : o.v === 'true' ? t('lab.true') : t('lab.false')}
          onClick={() => onChange(o.v)}
          className={cn('h-6 w-6 rounded-md font-mono text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal', value === o.v ? o.cls : 'text-muted hover:text-ink')}
        >
          {o.text}
        </button>
      ))}
    </div>
  );
}

function EngineCard({ title, icon, entailed, children, note }: { title: string; icon: ReactNode; entailed: boolean | null | undefined; children: ReactNode; note?: string }) {
  const { t } = useI18n();
  return (
    <Card className="flex flex-col">
      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold text-ink">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-forest-50 text-forest-700" aria-hidden>{icon}</span>
          {title}
        </h3>
        {entailed === null || entailed === undefined ? (
          <Badge tone="neutral" size="xs">{t('lab.notApplicable')}</Badge>
        ) : entailed ? (
          <Badge tone="emerald" dot size="xs">{t('lab.entailed')}</Badge>
        ) : (
          <Badge tone="warning" dot size="xs">{t('lab.notEntailed')}</Badge>
        )}
      </div>
      <div className="min-w-0 flex-1 text-sm">{children}</div>
      {note ? <p className="mt-3 text-xs text-muted">{note}</p> : null}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg bg-canvas px-2.5 py-1.5">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="tabular font-semibold text-ink">{value}</dd>
    </div>
  );
}

function Assignment({ model }: { model: Record<string, boolean> }) {
  return (
    <ul className="flex flex-wrap gap-1" dir="ltr">
      {Object.entries(model).map(([k, v]) => (
        <li key={k} className={cn('rounded-md px-1.5 py-0.5 font-mono text-[11px]', v ? 'bg-[#ECFAF4] text-[#04664A]' : 'bg-canvas text-muted')}>
          {k}={v ? 'T' : 'F'}
        </li>
      ))}
    </ul>
  );
}

function Results({ r }: { r: LogicAskResponse }) {
  const { t, lang } = useI18n();
  const bcNote = 'note' in r.backward_chaining ? serverText(r.backward_chaining.note, lang, t) : undefined;
  const bc = r.backward_chaining;
  const bcApplicable = 'proof' in bc;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-4">
        <Badge tone={r.agreement ? 'emerald' : 'critical'} dot icon={r.agreement ? <BadgeCheck className="h-3 w-3" aria-hidden /> : undefined}>
          {r.agreement ? t('lab.agree') : t('lab.disagree')}
        </Badge>
        <span className="text-sm text-muted">{t('lab.query')}</span>
        <Formula text={r.query_ascii} className="rounded-md bg-canvas px-2 py-0.5" />
        <span className="text-sm text-muted">CNF</span>
        <code className="formula rounded-md bg-canvas px-2 py-0.5 text-xs">{r.query_cnf.join('  ∧  ')}</code>
        {r.relevant_rules.length ? (
          <span className="flex flex-wrap items-center gap-1">
            <span className="text-sm text-muted">{t('lab.relevantRules')}</span>
            {r.relevant_rules.map((c) => (
              <Badge key={c} tone="outline" size="xs"><span dir="ltr">{c}</span></Badge>
            ))}
          </span>
        ) : null}
      </div>
      <p className="text-xs text-muted" dir="auto">{serverText(r.note, lang, t)}</p>

      <div className="stagger grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        <EngineCard title={t('lab.fc')} icon={<ListOrdered className="h-4 w-4" />} entailed={r.forward_chaining.applicable ? r.forward_chaining.entailed : null} note={r.forward_chaining.applicable ? undefined : t('lab.fcNA')}>
          <p className="mb-1.5 text-xs text-muted">{t('xai.trace.agenda')}</p>
          <ol className="flex flex-wrap gap-1" dir="ltr">
            {r.forward_chaining.agenda.map((a, i) => (
              <li key={`${a}-${i}`} className={cn('rounded-md px-1.5 py-0.5 font-mono text-[11px]', r.forward_chaining.derived.includes(a) ? 'bg-[#F0FAF8] text-[#0B6B63] ring-1 ring-teal/40' : 'bg-canvas text-ink')}>
                <span className="me-1 opacity-50">{i + 1}</span>
                {a.replace(/^~/, '¬')}
              </li>
            ))}
          </ol>
          {r.forward_chaining.fired.length ? (
            <ol className="mt-3 space-y-1 text-xs" dir="ltr">
              {r.forward_chaining.fired.map((f) => (
                <li key={f.order} className="font-mono">
                  <span className="text-muted">{f.order}.</span> <span className="font-semibold text-forest-700">{f.code}</span> ⇒ {f.conclusion}
                </li>
              ))}
            </ol>
          ) : null}
        </EngineCard>

        <EngineCard
          title={t('lab.bc')}
          icon={<Split className="h-4 w-4" />}
          entailed={bcApplicable ? bc.status === 'proven' : null}
          note={bcApplicable ? undefined : bcNote}
        >
          {bcApplicable ? (
            <>
              <dl className="mb-3 grid grid-cols-2 gap-2">
                <Stat label={t('lab.status')} value={labelProofStatus(t, bc.status)} />
                <Stat label={t('lab.goalsExpanded')} value={fmtInt(bc.goals_expanded, lang)} />
              </dl>
              {bc.missing.length ? (
                <p className="mb-2 text-xs text-[#92400E]">
                  {t('lab.missing')} <span className="font-mono" dir="ltr">{bc.missing.join(', ')}</span>
                </p>
              ) : null}
              <div className="scrollbar-thin max-h-80 overflow-auto rounded-xl border border-line bg-canvas/40 p-2">
                <ProofTree root={bc.proof} defaultDepth={2} />
              </div>
            </>
          ) : null}
        </EngineCard>

        <EngineCard title={t('lab.tt')} icon={<Table2 className="h-4 w-4" />} entailed={r.model_checking.entailed}>
          <dl className="grid grid-cols-3 gap-2">
            <Stat label={t('lab.symbols')} value={fmtInt(r.model_checking.symbols.length, lang)} />
            <Stat label={t('lab.modelsChecked')} value={fmtInt(r.model_checking.models_checked, lang)} />
            <Stat label={t('lab.kbModels')} value={fmtInt(r.model_checking.kb_models, lang)} />
          </dl>
          {r.model_checking.counterexample ? (
            <div className="mt-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[#92400E]">
                <CircleSlash className="h-3.5 w-3.5" aria-hidden />
                {t('lab.counterexample')}
              </p>
              <Assignment model={r.model_checking.counterexample} />
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted">{t('lab.noCounterexample')}</p>
          )}
        </EngineCard>

        <EngineCard title={t('lab.dpll')} icon={<Binary className="h-4 w-4" />} entailed={r.dpll.entailed}>
          <dl className="grid grid-cols-2 gap-2">
            <Stat label={t('lab.calls')} value={fmtInt(r.dpll.calls, lang)} />
            <Stat label={t('lab.unitProps')} value={fmtInt(r.dpll.unit_propagations, lang)} />
            <Stat label={t('lab.pure')} value={fmtInt(r.dpll.pure_assignments, lang)} />
            <Stat label={t('lab.clauses')} value={fmtInt(r.dpll.clauses, lang)} />
          </dl>
          {r.dpll.counter_model ? (
            <div className="mt-3">
              <p className="mb-1.5 text-xs font-medium text-[#92400E]">{t('lab.counterModel')}</p>
              <Assignment model={r.dpll.counter_model} />
            </div>
          ) : null}
        </EngineCard>

        <EngineCard title={t('lab.resolution')} icon={<GitMerge className="h-4 w-4" />} entailed={r.resolution.entailed}>
          <dl className="mb-3 grid grid-cols-2 gap-2">
            <Stat label={t('lab.steps')} value={fmtInt(r.resolution.steps.length, lang)} />
            {typeof r.resolution.clauses_generated === 'number' ? <Stat label={t('lab.generated')} value={fmtInt(r.resolution.clauses_generated, lang)} /> : null}
          </dl>
          <ol className="scrollbar-thin max-h-72 space-y-2 overflow-auto text-[11px]" dir="ltr">
            {r.resolution.steps.map((s, i) => (
              <li key={i} className="rounded-lg bg-canvas p-2 font-mono">
                <p className="text-muted">{s.from}</p>
                <p className="mt-0.5 text-ink">⊢ {s.resolvent || '□'}</p>
              </li>
            ))}
          </ol>
          {r.resolution.limit_reached ? <p className="mt-2 text-xs text-[#92400E]">{t('lab.limit')}</p> : null}
        </EngineCard>
      </div>
    </div>
  );
}

export function LogicLab() {
  const { t, bi } = useI18n();
  const percepts = useQuery({ queryKey: qk.percepts, queryFn: kbService.percepts });
  const [facts, setFacts] = useState<Record<string, Tri>>({});
  const [query, setQuery] = useState('irrigate_today');
  const [categories, setCategories] = useState<string[]>(['irrigation', 'decision', 'advisory', 'alert']);
  const [axioms, setAxioms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LogicAskResponse | null>(null);

  const perceptList = percepts.data;
  const groups = useMemo(() => {
    const g: Record<string, PerceptDef[]> = {};
    for (const p of perceptList ?? []) (g[p.category] ??= []).push(p);
    return g;
  }, [perceptList]);
  const told = Object.entries(facts).filter(([, v]) => v !== 'unknown');

  const ask = useMutation({
    mutationFn: kbService.ask,
    onSuccess: (r) => {
      setResult(r);
      setError(null);
    },
    onError: (err) => {
      setResult(null);
      setError(errorText(err, t));
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return setError(t('lab.queryRequired'));
    ask.mutate({
      facts: Object.fromEntries(told.map(([k, v]) => [k, v === 'true'])),
      query: query.trim(),
      categories,
      include_axioms: axioms,
    });
  };

  if (percepts.isPending) return <SkeletonTable rows={6} />;
  if (percepts.isError) return <ErrorState error={percepts.error} onRetry={() => void percepts.refetch()} />;

  return (
    <div className="grid gap-6 2xl:grid-cols-[26rem_1fr]">
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-ink">{t('lab.tell')}</h3>
            <div className="flex gap-1">
              <Button variant="ghost" size="xs" icon={<FlaskConical className="h-3.5 w-3.5" aria-hidden />} onClick={() => setFacts(Object.fromEntries(Object.entries(LIMITED_WATER_SCENARIO).map(([k, v]) => [k, v ? 'true' : 'false'])))}>
                {t('lab.example')}
              </Button>
              <Button variant="ghost" size="xs" icon={<Eraser className="h-3.5 w-3.5" aria-hidden />} onClick={() => setFacts({})} disabled={!told.length}>
                {t('lab.clear')}
              </Button>
            </div>
          </div>
          <p className="mb-3 text-xs text-muted">{t('lab.tellHint', { n: told.length })}</p>
          <div className="scrollbar-thin max-h-[28rem] space-y-4 overflow-y-auto pe-1">
            {Object.entries(groups).map(([cat, list]) => (
              <fieldset key={cat}>
                <legend className="mb-1.5 text-xs font-semibold text-muted">{labelPerceptCategory(t, cat)}</legend>
                <ul className="space-y-1">
                  {list.map((p) => (
                    <li key={p.symbol} className="flex items-center justify-between gap-2 rounded-lg px-1.5 py-1 hover:bg-canvas">
                      <span className="min-w-0 truncate font-mono text-xs text-ink" dir="ltr" title={bi(p.description_en, p.description_ar)}>
                        {p.symbol}
                      </span>
                      <TriToggle label={p.symbol} value={facts[p.symbol] ?? 'unknown'} onChange={(v) => setFacts((f) => ({ ...f, [p.symbol]: v }))} />
                    </li>
                  ))}
                </ul>
              </fieldset>
            ))}
          </div>
        </Card>
        <Card>
          <h3 className="mb-3 font-semibold text-ink">{t('lab.ask')}</h3>
          <FormError>{error}</FormError>
          <Field label={t('lab.queryLabel')} hint={t('lab.queryHint')}>
            <Input dir="ltr" className="font-mono" value={query} onChange={(e) => setQuery(e.target.value)} />
          </Field>
          {query.trim() ? <p className="mt-2 text-xs text-muted">{t('lab.preview')} <code className="formula">{prettyFormula(query)}</code></p> : null}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" onClick={() => setQuery(ex)} className="rounded-lg border border-line bg-canvas px-2 py-1 font-mono text-[11px] text-ink hover:border-teal" dir="ltr">
                {ex}
              </button>
            ))}
          </div>
          <fieldset className="mt-4">
            <legend className="mb-1.5 text-xs font-semibold text-muted">{t('lab.categories')}</legend>
            <div className="flex flex-wrap gap-1.5">
              {RULE_CATEGORIES.map((c) => {
                const on = categories.includes(c);
                return (
                  <label key={c} className={cn('flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1 text-xs', on ? 'border-forest-700 bg-forest-50 text-forest-700' : 'border-line text-muted')}>
                    <input type="checkbox" className="h-3.5 w-3.5 accent-[#0F3D2E]" checked={on} onChange={(e) => setCategories((xs) => (e.target.checked ? [...xs, c] : xs.filter((x) => x !== c)))} />
                    {labelRuleCategory(t, c)}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <Toggle className="mt-4" size="sm" checked={axioms} onChange={setAxioms} label={t('lab.axioms')} description={t('lab.axiomsHint')} />
          <Button type="submit" className="mt-5 w-full" loading={ask.isPending} icon={<Play className="flip-rtl h-4 w-4" aria-hidden />}>
            {t('lab.run')}
          </Button>
        </Card>
      </form>
      <div className="min-w-0" aria-live="polite">
        {result ? (
          <Results r={result} />
        ) : (
          <Card className="flex h-full min-h-[20rem] flex-col items-center justify-center text-center">
            <span className="mb-3 inline-flex h-14 w-14 items-center justify-center rounded-full bg-forest-50 text-forest-700" aria-hidden>
              <Binary className="h-7 w-7" />
            </span>
            <h3 className="font-semibold text-ink">{t('lab.empty.title')}</h3>
            <p className="mt-1 max-w-md text-sm text-muted">{t('lab.empty.hint')}</p>
          </Card>
        )}
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Pencil, ShieldCheck, Sigma } from 'lucide-react';
import { qk } from '../../hooks/queries';
import { useAuth } from '../../hooks/useAuth';
import { useOnOpen } from '../../hooks/useOnOpen';
import { useI18n } from '../../i18n';
import { kbService } from '../../services/kb';
import type { Fact, PerceptDef, ValidationReport } from '../../types/api';
import { errorText } from '../../utils/errors';
import { fmtValue } from '../../utils/format';
import { factKindTone, labelFactKind, labelPerceptCategory } from '../../utils/labels';
import { Formula } from '../explain/Formula';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, FormError, IconButton, Input, Modal, SkeletonTable, Textarea, useToast } from '../ui';
import { ValidationIssues } from './ValidationIssues';

function FactModal({ fact, onClose }: { fact: Fact | null; onClose: () => void }) {
  const { t, bi } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [value, setValue] = useState('');
  const [source, setSource] = useState('');
  const [error, setError] = useState<string | null>(null);
  useOnOpen(!!fact, () => {
    setValue(fact ? (typeof fact.value === 'string' ? fact.value : JSON.stringify(fact.value)) : '');
    setSource(fact?.source ?? '');
    setError(null);
  });
  const mutation = useMutation({
    mutationFn: (v: unknown) => kbService.updateFact(fact!.id, v, source.trim() || null),
    onSuccess: (f) => {
      toast.success(t('kb.facts.toast.updated'), f.key);
      void qc.invalidateQueries({ queryKey: ['kb'] });
      onClose();
    },
    onError: (err) => setError(errorText(err, t)),
  });
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!fact) return;
    let parsed: unknown = value;
    if (fact.kind !== 'axiom') {
      try {
        parsed = JSON.parse(value);
      } catch {
        return setError(t('kb.facts.form.invalidJson'));
      }
    }
    if (fact.kind === 'scientific' && source.trim().length < 3) return setError(t('kb.facts.form.sourceRequired'));
    mutation.mutate(parsed);
  };
  return (
    <Modal
      open={!!fact}
      onClose={onClose}
      dismissible={!mutation.isPending}
      title={t('kb.facts.edit', { key: fact?.key ?? '' })}
      description={fact ? bi(fact.description_en, fact.description_ar) : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>{t('common.cancel')}</Button>
          <Button type="submit" form="fact-form" loading={mutation.isPending}>{t('common.saveChanges')}</Button>
        </>
      }
    >
      <form id="fact-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <FormError>{error}</FormError>
        <Field label={t('kb.facts.value')} hint={fact?.kind === 'axiom' ? t('kb.facts.form.axiomHint') : t('kb.facts.form.valueHint', { unit: fact?.unit ?? '—' })}>
          {fact?.kind === 'axiom' ? (
            <Textarea dir="ltr" className="font-mono" rows={3} value={value} onChange={(e) => setValue(e.target.value)} data-autofocus />
          ) : (
            <Input dir="ltr" className="font-mono" value={value} onChange={(e) => setValue(e.target.value)} data-autofocus />
          )}
        </Field>
        <Field label={t('kb.facts.source')} required={fact?.kind === 'scientific'}>
          <Input value={source} onChange={(e) => setSource(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

export function FactsTab() {
  const { t, bi } = useI18n();
  const { isSuperAdmin } = useAuth();
  const facts = useQuery({ queryKey: qk.facts, queryFn: kbService.facts });
  const [editing, setEditing] = useState<Fact | null>(null);
  const groups = useMemo(() => {
    const g: Record<string, Fact[]> = { scientific: [], policy: [], axiom: [] };
    for (const f of facts.data ?? []) (g[f.kind] ??= []).push(f);
    return g;
  }, [facts.data]);
  if (facts.isPending) return <SkeletonTable rows={6} />;
  if (facts.isError) return <ErrorState error={facts.error} onRetry={() => void facts.refetch()} />;

  const sectionIcon = { scientific: <BookOpen className="h-4 w-4" />, policy: <ShieldCheck className="h-4 w-4" />, axiom: <Sigma className="h-4 w-4" /> } as Record<string, ReactNode>;
  return (
    <div className="space-y-6">
      {Object.entries(groups).map(([kind, list]) =>
        list.length ? (
          <Card key={kind}>
            <CardHeader
              title={labelFactKind(t, kind)}
              subtitle={t(`kb.facts.kindHint.${kind}` as 'kb.facts.kindHint.policy')}
              icon={sectionIcon[kind]}
              actions={<Badge tone={factKindTone(kind)}>{list.length}</Badge>}
            />
            <ul className="divide-y divide-line">
              {list.map((f) => (
                <li key={f.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-ink" dir="ltr">{f.key}</span>
                      <Badge tone={factKindTone(f.kind)} size="xs">{f.kind === 'policy' ? t('kb.facts.operatorPolicy') : labelFactKind(t, f.kind)}</Badge>
                      <span className="text-xs text-muted">v{f.version}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted">{bi(f.description_en, f.description_ar)}</p>
                    {f.kind === 'axiom' ? (
                      <Formula text={String(f.value)} className="mt-2 block rounded-lg bg-canvas px-2.5 py-1.5" />
                    ) : (
                      <p className="mt-1.5 text-sm">
                        <span className="tabular rounded-md bg-forest-50 px-2 py-0.5 font-mono font-semibold text-forest-700" dir="ltr">{fmtValue(f.value, 'en')}</span>
                        {f.unit ? <span className="ms-1.5 text-xs text-muted">{f.unit}</span> : null}
                      </p>
                    )}
                    {f.source ? (
                      <p className="mt-1.5 flex items-start gap-1.5 text-xs text-muted">
                        <BookOpen className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                        <span dir="auto">{f.source}</span>
                      </p>
                    ) : null}
                  </div>
                  {isSuperAdmin ? (
                    <IconButton size="sm" label={t('common.edit')} onClick={() => setEditing(f)}>
                      <Pencil className="h-4 w-4" />
                    </IconButton>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        ) : null,
      )}
      <FactModal fact={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

export function PerceptsTab() {
  const { t, bi } = useI18n();
  const percepts = useQuery({ queryKey: qk.percepts, queryFn: kbService.percepts });
  const perceptList = percepts.data;
  const groups = useMemo(() => {
    const g: Record<string, PerceptDef[]> = {};
    for (const p of perceptList ?? []) (g[p.category] ??= []).push(p);
    return g;
  }, [perceptList]);
  if (percepts.isPending) return <SkeletonTable rows={6} />;
  if (percepts.isError) return <ErrorState error={percepts.error} onRetry={() => void percepts.refetch()} />;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <p className="text-sm text-muted lg:col-span-2">{t('kb.percepts.intro')}</p>
      {Object.entries(groups).map(([cat, list]) => (
        <Card key={cat}>
          <CardHeader title={labelPerceptCategory(t, cat)} actions={<Badge tone="outline">{list.length}</Badge>} />
          <ul className="space-y-3">
            {list.map((p) => (
              <li key={p.symbol} className="rounded-xl border border-line p-3">
                <p className="font-mono text-sm font-semibold text-forest-700" dir="ltr">{p.symbol}</p>
                <p className="mt-1 text-sm text-ink">{bi(p.description_en, p.description_ar)}</p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-muted">{t('kb.percepts.dependsOn')}</span>
                  {p.depends_on.map((d) => (
                    <Badge key={d} tone="water" size="xs"><span dir="ltr">{d}</span></Badge>
                  ))}
                  {p.threshold_key ? (
                    <>
                      <span className="ms-2 text-muted">{t('kb.percepts.threshold')}</span>
                      <Badge tone="warning" size="xs"><span dir="ltr">{p.threshold_key}</span></Badge>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

export function ValidateTab() {
  const { t } = useI18n();
  const [report, setReport] = useState<ValidationReport | null>(null);
  const toast = useToast();
  const run = useMutation({
    mutationFn: kbService.validate,
    onSuccess: (r) => {
      setReport(r);
      if (r.ok) toast.success(t('kb.validate.ok'));
      else toast.warning(t('kb.validate.notOk'));
    },
    onError: (err) => toast.error(t('kb.validate.failed'), errorText(err, t)),
  });
  return (
    <Card>
      <CardHeader
        title={t('kb.validate.title')}
        subtitle={t('kb.validate.subtitle')}
        actions={
          <Button loading={run.isPending} icon={<ShieldCheck className="h-4 w-4" aria-hidden />} onClick={() => run.mutate()}>
            {t('kb.validate.run')}
          </Button>
        }
      />
      {report ? <ValidationIssues report={report} /> : <EmptyState compact icon={<ShieldCheck className="h-6 w-6" />} title={t('kb.validate.empty')} hint={t('kb.validate.emptyHint')} />}
    </Card>
  );
}

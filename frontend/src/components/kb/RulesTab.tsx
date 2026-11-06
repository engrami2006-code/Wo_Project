import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History, Pencil, Plus, Power, ScrollText, Search } from 'lucide-react';
import { ApiError } from '../../services/api';
import { qk } from '../../hooks/queries';
import { useAuth } from '../../hooks/useAuth';
import { useOnOpen } from '../../hooks/useOnOpen';
import { useI18n } from '../../i18n';
import { kbService } from '../../services/kb';
import { RULE_CATEGORIES } from '../../types/api';
import type { Rule, RuleCategory, RuleInput, Severity, ValidationReport } from '../../types/api';
import { cn } from '../../utils/cn';
import { errorText } from '../../utils/errors';
import { fmtDateTime } from '../../utils/format';
import { labelRuleCategory, labelSeverity } from '../../utils/labels';
import { RuleFormula } from '../explain/Formula';
import {
  Badge,
  Button,
  Drawer,
  EmptyState,
  ErrorState,
  Field,
  FormError,
  FormGrid,
  IconButton,
  Input,
  Modal,
  Select,
  SkeletonTable,
  Textarea,
  Toggle,
  useToast,
} from '../ui';
import { ValidationIssues } from './ValidationIssues';

type RuleForm = Required<Omit<RuleInput, 'severity' | 'action_group' | 'source' | 'recommendation_en' | 'recommendation_ar'>> & {
  severity: Severity | '';
  action_group: string;
  source: string;
  recommendation_en: string;
  recommendation_ar: string;
};

function toForm(r?: Rule | null): RuleForm {
  return {
    code: r?.code ?? '',
    name_en: r?.name_en ?? '',
    name_ar: r?.name_ar ?? '',
    category: (r?.category as RuleCategory) ?? 'advisory',
    antecedent: r?.antecedent ?? '',
    consequent: r?.consequent ?? '',
    action_group: r?.action_group ?? '',
    priority: r?.priority ?? 50,
    severity: (r?.severity as Severity) ?? '',
    recommendation_en: r?.recommendation_en ?? '',
    recommendation_ar: r?.recommendation_ar ?? '',
    explanation_en: r?.explanation_en ?? '',
    explanation_ar: r?.explanation_ar ?? '',
    source: r?.source ?? '',
    is_active: r?.is_active ?? true,
  };
}

function RuleModal({ open, onClose, rule }: { open: boolean; onClose: () => void; rule: Rule | null }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState<RuleForm>(toForm(rule));
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ValidationReport | null>(null);
  useOnOpen(open, () => {
    setF(toForm(rule));
    setError(null);
    setReport(null);
  });
  const set = <K extends keyof RuleForm>(k: K, v: RuleForm[K]) => setF((x) => ({ ...x, [k]: v }));

  const mutation = useMutation({
    mutationFn: (payload: RuleInput) => (rule ? kbService.updateRule(rule.id, payload) : kbService.createRule(payload)),
    onSuccess: (saved) => {
      toast.success(rule ? t('kb.rules.toast.updated') : t('kb.rules.toast.created'), saved.code);
      void qc.invalidateQueries({ queryKey: ['kb'] });
      onClose();
    },
    onError: (err) => {
      setError(errorText(err, t));
      if (err instanceof ApiError && err.details && typeof err.details === 'object' && 'issues' in (err.details as object)) {
        setReport(err.details as ValidationReport);
      } else setReport(null);
    },
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setReport(null);
    if (!rule && !/^R-[A-Z]{3}-\d{3}$/.test(f.code)) return setError(t('kb.rules.form.codeRule'));
    if (!f.antecedent.trim() || !f.consequent.trim() || f.name_en.trim().length < 2 || f.name_ar.trim().length < 2 || f.explanation_en.trim().length < 2 || f.explanation_ar.trim().length < 2) {
      return setError(t('kb.rules.form.required'));
    }
    const payload: RuleInput = {
      name_en: f.name_en.trim(),
      name_ar: f.name_ar.trim(),
      antecedent: f.antecedent.trim(),
      consequent: f.consequent.trim(),
      action_group: f.action_group.trim() || null,
      priority: Number(f.priority),
      severity: f.severity || null,
      recommendation_en: f.recommendation_en.trim() || null,
      recommendation_ar: f.recommendation_ar.trim() || null,
      explanation_en: f.explanation_en.trim(),
      explanation_ar: f.explanation_ar.trim(),
      source: f.source.trim() || null,
      is_active: f.is_active,
    };
    if (!rule) {
      payload.code = f.code;
      payload.category = f.category;
    }
    mutation.mutate(payload);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!mutation.isPending}
      size="xl"
      icon={<ScrollText className="h-5 w-5" />}
      title={rule ? t('kb.rules.edit', { code: rule.code }) : t('kb.rules.create')}
      description={t('kb.rules.form.description')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>{t('common.cancel')}</Button>
          <Button type="submit" form="rule-form" loading={mutation.isPending}>{rule ? t('common.saveChanges') : t('kb.rules.create')}</Button>
        </>
      }
    >
      <form id="rule-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <FormError>{error}</FormError>
        {report ? <ValidationIssues report={report} /> : null}
        <FormGrid cols={3}>
          <Field label={t('kb.rules.col.code')} required={!rule} hint={t('kb.rules.form.codeHint')}>
            <Input dir="ltr" value={f.code} disabled={!!rule} onChange={(e) => set('code', e.target.value.toUpperCase())} data-autofocus />
          </Field>
          <Field label={t('kb.rules.col.category')} required>
            <Select value={f.category} disabled={!!rule} onChange={(e) => set('category', e.target.value as RuleCategory)}>
              {RULE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{labelRuleCategory(t, c)}</option>
              ))}
            </Select>
          </Field>
          <Field label={t('kb.rules.col.priority')} hint={t('kb.rules.form.priorityHint')}>
            <Input type="number" min={0} max={1000} value={f.priority} onChange={(e) => set('priority', Number(e.target.value))} />
          </Field>
          <Field label={t('crops.form.nameEn')} required>
            <Input dir="ltr" value={f.name_en} onChange={(e) => set('name_en', e.target.value)} />
          </Field>
          <Field label={t('crops.form.nameAr')} required>
            <Input dir="rtl" value={f.name_ar} onChange={(e) => set('name_ar', e.target.value)} />
          </Field>
          <Field label={t('kb.rules.col.group')} hint={t('kb.rules.form.groupHint')}>
            <Input dir="ltr" value={f.action_group} onChange={(e) => set('action_group', e.target.value)} />
          </Field>
        </FormGrid>
        <FormGrid>
          <Field label={t('kb.rules.form.antecedent')} required hint={t('kb.rules.form.antecedentHint')}>
            <Input dir="ltr" className="font-mono" value={f.antecedent} onChange={(e) => set('antecedent', e.target.value)} placeholder="irrigation_needed & ~water_critical" />
          </Field>
          <Field label={t('kb.rules.form.consequent')} required hint={t('kb.rules.form.consequentHint')}>
            <Input dir="ltr" className="font-mono" value={f.consequent} onChange={(e) => set('consequent', e.target.value)} placeholder="advise_example" />
          </Field>
        </FormGrid>
        {f.antecedent && f.consequent ? (
          <div className="rounded-xl bg-canvas px-3 py-2">
            <RuleFormula antecedent={f.antecedent} consequent={f.consequent} />
          </div>
        ) : null}
        <FormGrid>
          <Field label={t('kb.rules.form.explanationEn')} required>
            <Textarea dir="ltr" rows={2} value={f.explanation_en} onChange={(e) => set('explanation_en', e.target.value)} />
          </Field>
          <Field label={t('kb.rules.form.explanationAr')} required>
            <Textarea dir="rtl" rows={2} value={f.explanation_ar} onChange={(e) => set('explanation_ar', e.target.value)} />
          </Field>
          <Field label={t('kb.rules.form.recommendationEn')}>
            <Textarea dir="ltr" rows={2} value={f.recommendation_en} onChange={(e) => set('recommendation_en', e.target.value)} />
          </Field>
          <Field label={t('kb.rules.form.recommendationAr')}>
            <Textarea dir="rtl" rows={2} value={f.recommendation_ar} onChange={(e) => set('recommendation_ar', e.target.value)} />
          </Field>
          <Field label={t('kb.rules.form.severity')}>
            <Select value={f.severity} onChange={(e) => set('severity', e.target.value as Severity | '')}>
              <option value="">{t('common.none')}</option>
              {(['info', 'warning', 'critical'] as const).map((s) => (
                <option key={s} value={s}>{labelSeverity(t, s)}</option>
              ))}
            </Select>
          </Field>
          <Field label={t('kb.rules.form.source')}>
            <Input value={f.source} onChange={(e) => set('source', e.target.value)} />
          </Field>
        </FormGrid>
        <Toggle checked={f.is_active} onChange={(v) => set('is_active', v)} label={t('kb.rules.form.active')} />
      </form>
    </Modal>
  );
}

/** Rule texts are templates; {placeholders} are filled with real values at inference time. */
function TemplateText({ text }: { text: string }) {
  const parts = text.split(/(\{\w+\})/g);
  return (
    <>
      {parts.map((p, i) =>
        /^\{\w+\}$/.test(p) ? (
          <code key={i} className="mx-0.5 rounded bg-forest-50 px-1 font-mono text-[11px] text-forest-700" dir="ltr">
            {p.slice(1, -1)}
          </code>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function HistoryDrawer({ rule, onClose }: { rule: Rule | null; onClose: () => void }) {
  const { t, lang } = useI18n();
  const history = useQuery({ queryKey: qk.ruleHistory(rule?.id ?? 'none'), queryFn: () => kbService.history(rule!.id), enabled: !!rule });
  return (
    <Drawer open={!!rule} onClose={onClose} title={t('kb.rules.history', { code: rule?.code ?? '' })} width="md">
      {history.isPending ? (
        <SkeletonTable rows={3} />
      ) : history.isError ? (
        <ErrorState compact error={history.error} onRetry={() => void history.refetch()} />
      ) : history.data.length === 0 ? (
        <EmptyState compact icon={<History className="h-6 w-6" />} title={t('kb.rules.historyEmpty')} />
      ) : (
        <ol className="space-y-3">
          {history.data.map((h) => {
            const snap = h.snapshot as Partial<Rule>;
            return (
              <li key={h.id} className="rounded-xl border border-line p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="forest" size="xs">v{h.version}</Badge>
                  <Badge tone="outline" size="xs">{h.change_type}</Badge>
                  <span className="text-xs text-muted">{fmtDateTime(h.changed_at, lang)}</span>
                </div>
                {snap.antecedent && snap.consequent ? <RuleFormula antecedent={snap.antecedent} consequent={snap.consequent} className="mt-2 block text-xs" /> : null}
                {typeof snap.priority === 'number' ? <p className="mt-1 text-xs text-muted">{t('kb.rules.col.priority')}: {snap.priority} — {snap.is_active ? t('kb.rules.active') : t('kb.rules.inactive')}</p> : null}
              </li>
            );
          })}
        </ol>
      )}
    </Drawer>
  );
}

export function RulesTab() {
  const { t, bi } = useI18n();
  const { isSuperAdmin } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const rules = useQuery({ queryKey: qk.rules, queryFn: kbService.rules });
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Rule | null>(null);
  const [creating, setCreating] = useState(false);
  const [historyOf, setHistoryOf] = useState<Rule | null>(null);

  const toggle = useMutation({
    mutationFn: (r: Rule) => kbService.updateRule(r.id, { is_active: !r.is_active }),
    onSuccess: (r) => {
      toast.success(r.is_active ? t('kb.rules.toast.activated') : t('kb.rules.toast.deactivated'), r.code);
      void qc.invalidateQueries({ queryKey: ['kb'] });
    },
    onError: (err) => toast.error(t('kb.rules.toast.failed'), errorText(err, t)),
  });

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rules.data ?? []).filter(
      (r) => (!category || r.category === category) && (!q || [r.code, r.name_en, r.name_ar, r.antecedent, r.consequent].some((s) => s.toLowerCase().includes(q))),
    );
  }, [rules.data, category, search]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="relative block w-full max-w-xs">
          <span className="sr-only">{t('kb.rules.search')}</span>
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('kb.rules.search')} className="ps-9" />
        </label>
        <Field label={t('kb.rules.col.category')} className="w-48">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">{t('common.all')}</option>
            {RULE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{labelRuleCategory(t, c)}</option>
            ))}
          </Select>
        </Field>
        {isSuperAdmin ? (
          <Button className="ms-auto" icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setCreating(true)}>
            {t('kb.rules.create')}
          </Button>
        ) : null}
      </div>
      {rules.isPending ? (
        <SkeletonTable rows={6} />
      ) : rules.isError ? (
        <ErrorState error={rules.error} onRetry={() => void rules.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState compact icon={<Search className="h-6 w-6" />} title={t('common.noMatches')} hint={t('common.noMatchesHint')} />
      ) : (
        <ul className="space-y-2.5">
          {list.map((r) => (
            <li key={r.id} className={cn('rounded-2xl border border-line bg-surface p-4', !r.is_active && 'bg-canvas opacity-70')}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-forest-700" dir="ltr">{r.code}</span>
                    <span className="font-medium text-ink">{bi(r.name_en, r.name_ar)}</span>
                    <Badge tone="teal" size="xs">{labelRuleCategory(t, r.category)}</Badge>
                    {r.action_group ? <Badge tone="violet" size="xs"><span dir="ltr">{r.action_group}</span></Badge> : null}
                    {r.severity ? <Badge tone={r.severity === 'critical' ? 'critical' : r.severity === 'warning' ? 'warning' : 'info'} size="xs">{labelSeverity(t, r.severity)}</Badge> : null}
                    {!r.is_active ? <Badge tone="neutral" size="xs">{t('kb.rules.inactive')}</Badge> : null}
                  </div>
                  <RuleFormula antecedent={r.antecedent} consequent={r.consequent} className="mt-2 block" />
                  <p className="mt-1.5 text-sm text-muted">
                    <TemplateText text={bi(r.explanation_en, r.explanation_ar)} />
                  </p>
                  <p className="mt-1.5 text-xs text-muted">
                    {t('kb.rules.col.priority')} <span className="tabular font-medium text-ink">{r.priority}</span> — v{r.version}
                    {r.source ? <> — <span dir="auto">{r.source}</span></> : null}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <IconButton size="sm" label={t('kb.rules.historyButton')} onClick={() => setHistoryOf(r)}>
                    <History className="h-4 w-4" />
                  </IconButton>
                  {isSuperAdmin ? (
                    <>
                      <IconButton size="sm" label={t('common.edit')} onClick={() => setEditing(r)}>
                        <Pencil className="h-4 w-4" />
                      </IconButton>
                      <IconButton size="sm" tone={r.is_active ? 'danger' : 'default'} label={r.is_active ? t('kb.rules.deactivate') : t('kb.rules.activate')} onClick={() => toggle.mutate(r)} disabled={toggle.isPending}>
                        <Power className="h-4 w-4" />
                      </IconButton>
                    </>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <RuleModal open={creating} rule={null} onClose={() => setCreating(false)} />
      <RuleModal open={!!editing} rule={editing} onClose={() => setEditing(null)} />
      <HistoryDrawer rule={historyOf} onClose={() => setHistoryOf(null)} />
    </div>
  );
}

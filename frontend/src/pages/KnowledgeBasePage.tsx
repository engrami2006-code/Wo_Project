import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Binary, BookOpen, BrainCircuit, Eye, FileText, Layers, ScrollText, ShieldCheck } from 'lucide-react';
import { FactsTab, PerceptsTab, ValidateTab } from '../components/kb/FactsTabs';
import { LogicLab } from '../components/kb/LogicLab';
import { RulesTab } from '../components/kb/RulesTab';
import { Badge, Card, ErrorState, PageHeader, Skeleton, TabPanel, Tabs } from '../components/ui';
import { qk } from '../hooks/queries';
import { useAuth } from '../hooks/useAuth';
import { useI18n } from '../i18n';
import { kbService } from '../services/kb';
import { cn } from '../utils/cn';
import { fmtInt } from '../utils/format';
import { labelFactKind, labelRuleCategory } from '../utils/labels';

type TabKey = 'rules' | 'facts' | 'percepts' | 'validate' | 'lab';

const PIPELINE_KEYS = ['kb.pipe.event', 'kb.pipe.query', 'kb.pipe.context', 'kb.pipe.data', 'kb.pipe.perception', 'kb.pipe.kb', 'kb.pipe.inference', 'kb.pipe.conflict', 'kb.pipe.recommendation', 'kb.pipe.explanation'] as const;

function Overview() {
  const { t, lang } = useI18n();
  const ov = useQuery({ queryKey: qk.kbOverview, queryFn: kbService.overview });
  if (ov.isPending) return <Skeleton className="mb-6 h-48 w-full rounded-2xl" />;
  if (ov.isError) return <ErrorState error={ov.error} onRetry={() => void ov.refetch()} />;
  const d = ov.data;
  // The backend pipeline labels are English; show localised stage names when the stage count matches.
  const stages = d.pipeline.length === PIPELINE_KEYS.length ? PIPELINE_KEYS.map((k) => t(k)) : d.pipeline;
  return (
    <div className="mb-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="forest">{t('kb.version', { v: d.version })}</Badge>
          {d.action_groups.map((g) => (
            <Badge key={g} tone="violet" size="xs"><span dir="ltr">{g}</span></Badge>
          ))}
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-canvas p-3">
            <dt className="text-xs text-muted">{t('kb.stat.rules')}</dt>
            <dd className="tabular text-2xl font-semibold text-ink">{fmtInt(d.rules_active, lang)}<span className="text-sm font-normal text-muted"> / {fmtInt(d.rules_total, lang)}</span></dd>
          </div>
          <div className="rounded-xl bg-canvas p-3">
            <dt className="text-xs text-muted">{t('kb.stat.facts')}</dt>
            <dd className="tabular text-2xl font-semibold text-ink">{fmtInt(Object.values(d.facts_by_kind).reduce((a, b) => a + b, 0), lang)}</dd>
          </div>
          <div className="rounded-xl bg-canvas p-3">
            <dt className="text-xs text-muted">{t('kb.stat.percepts')}</dt>
            <dd className="tabular text-2xl font-semibold text-ink">{fmtInt(d.percepts, lang)}</dd>
          </div>
        </dl>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold text-muted">{t('kb.byCategory')}</p>
            <ul className="space-y-1.5 text-sm">
              {Object.entries(d.rules_by_category).map(([k, v]) => (
                <li key={k} className="flex items-center justify-between gap-2">
                  <span>{labelRuleCategory(t, k)}</span>
                  <span className="tabular font-semibold">{fmtInt(v, lang)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold text-muted">{t('kb.byKind')}</p>
            <ul className="space-y-1.5 text-sm">
              {Object.entries(d.facts_by_kind).map(([k, v]) => (
                <li key={k} className="flex items-center justify-between gap-2">
                  <span>{labelFactKind(t, k)}</span>
                  <span className="tabular font-semibold">{fmtInt(v, lang)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>
      <Card>
        <h2 className="text-base font-semibold text-ink">{t('kb.pipeline')}</h2>
        <p className="mt-0.5 text-sm text-muted">{t('kb.pipelineHint')}</p>
        <ol className="mt-5 grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-flow-col sm:grid-rows-5">
          {stages.map((s, i) => {
            const ai = i >= 4 && i <= 7;
            return (
              <li key={i} className="flex items-center gap-3">
                <span
                  className={cn(
                    'tabular inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                    ai ? 'bg-forest-700 text-white' : i >= 8 ? 'bg-emerald text-white' : 'bg-forest-50 text-forest-700',
                  )}
                >
                  {i + 1}
                </span>
                <span className={cn('text-sm', ai ? 'font-medium text-ink' : 'text-muted')}>{s}</span>
              </li>
            );
          })}
        </ol>
      </Card>
    </div>
  );
}

export default function KnowledgeBasePage() {
  const { t } = useI18n();
  const { isSuperAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const initial = params.get('tab');
  const [tab, setTabState] = useState<TabKey>(['rules', 'facts', 'percepts', 'validate', 'lab'].includes(initial ?? '') ? (initial as TabKey) : 'rules');
  const setTab = (k: TabKey) => {
    setTabState(k);
    setParams({ tab: k }, { replace: true });
  };
  const items = [
    { key: 'rules' as const, label: t('kb.tab.rules'), icon: <ScrollText className="h-4 w-4" aria-hidden /> },
    { key: 'facts' as const, label: t('kb.tab.facts'), icon: <BookOpen className="h-4 w-4" aria-hidden /> },
    { key: 'percepts' as const, label: t('kb.tab.percepts'), icon: <Eye className="h-4 w-4" aria-hidden /> },
    { key: 'validate' as const, label: t('kb.tab.validate'), icon: <ShieldCheck className="h-4 w-4" aria-hidden /> },
    { key: 'lab' as const, label: t('kb.tab.lab'), icon: <Binary className="h-4 w-4" aria-hidden /> },
  ];
  return (
    <div>
      <PageHeader
        icon={<BrainCircuit className="h-6 w-6" />}
        title={t('kb.title')}
        description={t('kb.description')}
        meta={isSuperAdmin ? <Badge tone="warning" icon={<Layers className="h-3 w-3" aria-hidden />}>{t('kb.adminMode')}</Badge> : <Badge tone="outline" icon={<FileText className="h-3 w-3" aria-hidden />}>{t('kb.readOnly')}</Badge>}
      />
      <Overview />
      <Tabs items={items} value={tab} onChange={setTab} label={t('kb.title')} idPrefix="kb" className="mb-6" />
      <TabPanel id="kb" tabKey="rules" active={tab === 'rules'}><RulesTab /></TabPanel>
      <TabPanel id="kb" tabKey="facts" active={tab === 'facts'}><FactsTab /></TabPanel>
      <TabPanel id="kb" tabKey="percepts" active={tab === 'percepts'}><PerceptsTab /></TabPanel>
      <TabPanel id="kb" tabKey="validate" active={tab === 'validate'}><ValidateTab /></TabPanel>
      <TabPanel id="kb" tabKey="lab" active={tab === 'lab'}><LogicLab /></TabPanel>
    </div>
  );
}

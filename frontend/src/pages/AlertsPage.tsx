import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellRing, Check, CheckCheck, ChevronDown, Play } from 'lucide-react';
import { EvidenceList } from '../components/explain/FactChip';
import { Badge, Button, EmptyState, ErrorState, Field, PageHeader, Pagination, Select, SkeletonTable, useToast } from '../components/ui';
import { qk } from '../hooks/queries';
import { useFarmContext } from '../hooks/useFarmContext';
import { useI18n } from '../i18n';
import { alertService } from '../services/alerts';
import type { Alert, AlertStatus, Severity } from '../types/api';
import { cn } from '../utils/cn';
import { errorText } from '../utils/errors';
import { fmtDateTime, fmtRelative } from '../utils/format';
import { labelAlertStatus, labelSeverity, severityStripe, severityTone } from '../utils/labels';

const PAGE_SIZE = 20;

function AlertItem({ alert, farmName }: { alert: Alert; farmName: string }) {
  const { t, lang, bi } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const update = useMutation({
    mutationFn: (status: 'acknowledged' | 'resolved') => alertService.update(alert.id, status),
    onSuccess: (a) => {
      toast.success(a.status === 'resolved' ? t('alerts.toast.resolved') : t('alerts.toast.acknowledged'));
      void qc.invalidateQueries({ queryKey: ['alerts'] });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
      void qc.invalidateQueries({ queryKey: qk.farms });
    },
    onError: (err) => toast.error(t('alerts.toast.failed'), errorText(err, t)),
  });
  const percepts = alert.evidence?.percepts ?? [];
  return (
    <li className={cn('card relative overflow-hidden', alert.status === 'resolved' && 'opacity-75')}>
      <span className={cn('absolute inset-y-0 start-0 w-1.5', severityStripe(alert.severity))} aria-hidden />
      <div className="p-4 ps-6 sm:p-5 sm:ps-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={severityTone(alert.severity)} dot size="xs">
                {labelSeverity(t, alert.severity)}
              </Badge>
              <Badge tone="outline" size="xs">
                <span className="font-mono" dir="ltr">{alert.rule_code}</span>
              </Badge>
              <Badge tone={alert.status === 'open' ? 'critical' : alert.status === 'acknowledged' ? 'water' : 'emerald'} size="xs">
                {labelAlertStatus(t, alert.status)}
              </Badge>
            </div>
            <h2 className="mt-2 font-semibold text-ink">{bi(alert.title_en, alert.title_ar)}</h2>
            <p className="mt-1 text-sm text-muted">{bi(alert.message_en, alert.message_ar)}</p>
            <p className="mt-2 text-xs text-muted">
              {farmName} — <time dateTime={alert.created_at} title={fmtDateTime(alert.created_at, lang)}>{fmtRelative(alert.created_at, lang)}</time>
              {alert.resolved_reason ? ` — ${alert.resolved_reason}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {alert.status === 'open' ? (
              <Button variant="secondary" size="sm" icon={<Check className="h-4 w-4" aria-hidden />} loading={update.isPending && update.variables === 'acknowledged'} onClick={() => update.mutate('acknowledged')}>
                {t('alerts.acknowledge')}
              </Button>
            ) : null}
            {alert.status !== 'resolved' ? (
              <Button variant="subtle" size="sm" icon={<CheckCheck className="h-4 w-4" aria-hidden />} loading={update.isPending && update.variables === 'resolved'} onClick={() => update.mutate('resolved')}>
                {t('alerts.resolve')}
              </Button>
            ) : null}
          </div>
        </div>
        {percepts.length ? (
          <div className="mt-3">
            <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex items-center gap-1 text-sm font-medium text-teal hover:underline">
              <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} aria-hidden />
              {open ? t('alerts.hideEvidence') : t('alerts.showEvidence', { n: percepts.length })}
            </button>
            {open ? (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {percepts.map((p) => (
                  <li key={p.symbol} className={cn('rounded-xl border p-3 text-xs', p.value ? 'border-emerald/40 bg-[#ECFAF4]' : 'border-line bg-canvas')}>
                    <p className="flex items-center justify-between gap-2 font-mono" dir="ltr">
                      <span className="font-semibold text-ink">{p.symbol}</span>
                      <span className={p.value === null ? 'text-[#92400E]' : p.value ? 'text-[#04664A]' : 'text-muted'}>{p.value === null ? '?' : p.value ? 'T' : 'F'}</span>
                    </p>
                    <EvidenceList evidence={p.evidence} className="mt-1.5 text-muted" />
                    {p.flip_en ? <p className="mt-1 text-[#0B6B63]">{t('alerts.flip', { c: bi(p.flip_en, p.flip_ar) })}</p> : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

export default function AlertsPage() {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const { farms, farmId: ctxFarm } = useFarmContext();
  const [farmId, setFarmId] = useState('');
  const [status, setStatus] = useState<AlertStatus | ''>('open');
  const [severity, setSeverity] = useState<Severity | ''>('');
  const [page, setPage] = useState(1);
  const filters = useMemo(() => ({ farm_id: farmId || undefined, status: status || undefined, severity: severity || undefined, page, size: PAGE_SIZE }), [farmId, status, severity, page]);
  const alerts = useQuery({ queryKey: qk.alerts(filters), queryFn: () => alertService.list(filters), placeholderData: keepPreviousData });
  const evalFarm = farmId || ctxFarm;
  const evaluate = useMutation({
    mutationFn: () => alertService.evaluate(evalFarm as string),
    onSuccess: (res) => {
      const created = Object.values(res).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);
      toast.success(t('alerts.evaluated'), t('alerts.evaluatedBody', { n: created, weather: res.weather ?? 0, usage: res.usage ?? 0, records: res.records ?? 0 }));
      void qc.invalidateQueries({ queryKey: ['alerts'] });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
    },
    onError: (err) => toast.error(t('alerts.evaluateFailed'), errorText(err, t)),
  });
  const farmName = (id: string) => farms.find((f) => f.id === id)?.name ?? '—';

  return (
    <div>
      <PageHeader
        icon={<Bell className="h-6 w-6" />}
        title={t('alerts.title')}
        description={t('alerts.description')}
        actions={
          <Button variant="secondary" icon={<Play className="flip-rtl h-4 w-4" aria-hidden />} disabled={!evalFarm} loading={evaluate.isPending} onClick={() => evaluate.mutate()}>
            {t('alerts.evaluate', { farm: evalFarm ? farmName(evalFarm) : '' })}
          </Button>
        }
      />
      <div className="card mb-5 flex flex-wrap items-end gap-3 p-4">
        <Field label={t('common.farm')} className="w-full sm:w-52">
          <Select value={farmId} onChange={(e) => { setFarmId(e.target.value); setPage(1); }}>
            <option value="">{t('common.allFarms')}</option>
            {farms.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </Select>
        </Field>
        <Field label={t('alerts.status')} className="w-[calc(50%-0.375rem)] sm:w-44">
          <Select value={status} onChange={(e) => { setStatus(e.target.value as AlertStatus | ''); setPage(1); }}>
            <option value="">{t('common.all')}</option>
            {(['open', 'acknowledged', 'resolved'] as const).map((s) => (
              <option key={s} value={s}>{labelAlertStatus(t, s)}</option>
            ))}
          </Select>
        </Field>
        <Field label={t('alerts.severity')} className="w-[calc(50%-0.375rem)] sm:w-44">
          <Select value={severity} onChange={(e) => { setSeverity(e.target.value as Severity | ''); setPage(1); }}>
            <option value="">{t('common.all')}</option>
            {(['critical', 'warning', 'info'] as const).map((s) => (
              <option key={s} value={s}>{labelSeverity(t, s)}</option>
            ))}
          </Select>
        </Field>
      </div>
      {alerts.isPending ? (
        <SkeletonTable rows={5} />
      ) : alerts.isError ? (
        <ErrorState error={alerts.error} onRetry={() => void alerts.refetch()} />
      ) : alerts.data.items.length === 0 ? (
        <div className="card">
          <EmptyState icon={<BellRing className="h-7 w-7" />} title={status === 'open' ? t('alerts.empty.open') : t('alerts.empty.title')} hint={t('alerts.empty.hint')} />
        </div>
      ) : (
        <>
          <ul className="space-y-3">
            {alerts.data.items.map((a) => (
              <AlertItem key={a.id} alert={a} farmName={farmName(a.farm_id)} />
            ))}
          </ul>
          <Pagination page={page} size={PAGE_SIZE} total={alerts.data.total} onChange={setPage} />
        </>
      )}
    </div>
  );
}

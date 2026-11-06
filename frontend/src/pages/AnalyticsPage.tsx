import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, BarChart3, FlaskConical, Info, Plus, Scale, TrendingDown, TrendingUp } from 'lucide-react';
import { ChartFrame } from '../components/charts/ChartFrame';
import { CategoryBarChart } from '../components/charts/Charts';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  FormError,
  FormGrid,
  Input,
  Modal,
  PageHeader,
  Segmented,
  Select,
  Skeleton,
  StatTile,
  Table,
  Textarea,
  useToast,
} from '../components/ui';
import { qk, usePlantings } from '../hooks/queries';
import { useAuth } from '../hooks/useAuth';
import { useFarmContext } from '../hooks/useFarmContext';
import { useOnOpen } from '../hooks/useOnOpen';
import { useI18n } from '../i18n';
import { waterService } from '../services/water';
import type { AnalyticsFilters } from '../services/water';
import type { UUID, WaterAnalytics } from '../types/api';
import { errorText } from '../utils/errors';
import { fmtDate, fmtLitres, fmtNumber, fmtPercent, parseNum } from '../utils/format';
import { labelWaterSource } from '../utils/labels';
import { serverText } from '../utils/serverText';

type Period = AnalyticsFilters['period'];

function UsageSection({ data, period }: { data: WaterAnalytics; period: Period }) {
  const { t, lang, bi } = useI18n();
  if (!data.has_data) {
    return (
      <div className="card">
        <EmptyState icon={<BarChart3 className="h-7 w-7" />} title={t('analytics.empty.title')} hint={data.message ? serverText(data.message, lang, t) : t('analytics.empty.hint')} />
      </div>
    );
  }
  const fmt = (v: number) => fmtNumber(v, lang, 0);
  const byCrop = data.by_crop.map((c) => ({ name: bi(c.name_en, c.name_ar), total_l: c.total_l }));
  const bySource = data.by_source.map((s) => ({ name: labelWaterSource(t, s.source), total_l: s.total_l }));
  const byFarm = data.by_farm.map((f) => ({ name: f.farm, total_l: f.total_l }));
  return (
    <div className="space-y-6">
      {data.sufficient_history ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-6">
          <StatTile label={t('analytics.stat.total')} value={data.total_l} format={fmt} unit={t('unit.l')} tone="water" />
          <StatTile label={t('analytics.stat.avg', { period: t(`period.${period}` as const) })} value={data.average_per_period_l} format={fmt} unit={t('unit.l')} />
          <StatTile label={t('analytics.stat.min')} value={data.min_period_l} format={fmt} unit={t('unit.l')} />
          <StatTile label={t('analytics.stat.max')} value={data.max_period_l} format={fmt} unit={t('unit.l')} />
          <StatTile
            label={t('analytics.stat.trend')}
            value={data.trend_pct}
            format={(v) => fmtPercent(v, lang, 1, true)}
            tone={data.trend_pct !== null && data.trend_pct > 0 ? 'warning' : 'emerald'}
            icon={data.trend_pct !== null && data.trend_pct > 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            hint={t('analytics.stat.trendHint')}
          />
          <StatTile label={t('analytics.stat.lpm2')} value={data.l_per_m2} format={(v) => fmtNumber(v, lang, 2)} unit={t('unit.lpm2')} tone="teal" hint={t('analytics.stat.lpm2Hint')} />
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-2xl border border-water/25 bg-water-50 p-4 text-sm text-water-700" role="status">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">{t('analytics.insufficient')}</p>
            <p className="mt-0.5" dir="auto">{serverText(data.message, lang, t)}</p>
            <p className="mt-1 text-xs">{t('analytics.daysWithRecords', { n: data.days_with_records })}</p>
          </div>
        </div>
      )}

      {data.series.length ? (
        <ChartFrame
          title={t('analytics.series.title')}
          subtitle={t('analytics.series.subtitle', { period: t(`period.${period}` as const) })}
          summary={t('analytics.series.summary', { n: data.series.length, total: fmtLitres(data.total_l, lang) })}
          table={{ columns: [t('analytics.col.period'), t('common.volumeL'), t('analytics.col.records')], rows: data.series.map((p) => [p.period, fmtNumber(p.total_l, lang, 1), p.records]) }}
          height={280}
        >
          <CategoryBarChart data={data.series as unknown as Record<string, unknown>[]} xKey="period" yKey="total_l" name={t('common.volumeL')} format={fmt} layout="horizontal" />
        </ChartFrame>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-3">
        {[
          { key: 'crop', title: t('analytics.byCrop'), rows: byCrop },
          { key: 'farm', title: t('analytics.byFarm'), rows: byFarm },
          { key: 'source', title: t('analytics.bySource'), rows: bySource },
        ].map((g) =>
          g.rows.length ? (
            <ChartFrame
              key={g.key}
              title={g.title}
              summary={`${g.title}: ${g.rows.map((r) => `${r.name} ${fmtLitres(r.total_l, lang)}`).join(', ')}`}
              table={{ columns: [t('common.name'), t('common.volumeL')], rows: g.rows.map((r) => [r.name, fmtNumber(r.total_l, lang, 1)]) }}
              height={Math.max(140, g.rows.length * 44)}
            >
              <CategoryBarChart data={g.rows} xKey="name" yKey="total_l" name={t('common.volumeL')} format={fmt} colorByIndex />
            </ChartFrame>
          ) : null,
        )}
      </div>

      <Card>
        <CardHeader title={t('analytics.anomalies')} subtitle={t('analytics.anomaliesHint')} icon={<AlertTriangle className="h-4 w-4" />} actions={<Badge tone="outline"><span dir="ltr">R-ALR-003</span></Badge>} />
        {data.anomalies.length === 0 ? (
          <EmptyState compact icon={<AlertTriangle className="h-6 w-6" />} title={t('analytics.anomalies.none')} hint={data.sufficient_history ? t('analytics.anomalies.noneHint') : t('analytics.anomalies.needHistory')} />
        ) : (
          <Table
            caption={t('analytics.anomalies')}
            rows={data.anomalies}
            rowKey={(a) => a.date}
            columns={[
              { key: 'date', header: t('common.date'), primary: true, cell: (a) => fmtDate(a.date, lang) },
              { key: 'total', header: t('analytics.anom.total'), align: 'end', cell: (a) => <span className="tabular font-semibold">{fmtLitres(a.total_l, lang)}</span> },
              { key: 'median', header: t('analytics.anom.median'), align: 'end', cell: (a) => <span className="tabular">{fmtLitres(a.median_l, lang)}</span> },
              { key: 'factor', header: t('analytics.anom.factor'), align: 'end', cell: (a) => <span className="tabular">× {fmtNumber(a.factor, lang, 2)}</span> },
              { key: 'rule', header: t('analytics.anom.rule'), cell: (a) => <Badge tone="warning" size="xs"><span dir="ltr">{a.rule}</span></Badge> },
            ]}
          />
        )}
      </Card>
    </div>
  );
}

function BaselineModal({ open, onClose, farmId }: { open: boolean; onClose: () => void; farmId: UUID }) {
  const { t, bi } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const plantings = usePlantings(farmId);
  const [f, setF] = useState({ start: '', end: '', volume: '', area: '', planting: '', notes: '' });
  const [error, setError] = useState<string | null>(null);
  useOnOpen(open, () => {
    setF({ start: '', end: '', volume: '', area: '', planting: '', notes: '' });
    setError(null);
  });
  const mutation = useMutation({
    mutationFn: waterService.createBaseline,
    onSuccess: () => {
      toast.success(t('impact.baseline.saved'));
      void qc.invalidateQueries({ queryKey: qk.baselines(farmId) });
      void qc.invalidateQueries({ queryKey: qk.impact(farmId) });
      onClose();
    },
    onError: (err) => setError(errorText(err, t)),
  });
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const vol = parseNum(f.volume);
    const area = parseNum(f.area);
    if (!f.start || !f.end || vol === null || vol < 0 || area === null || area <= 0) {
      setError(t('impact.baseline.invalid'));
      return;
    }
    if (f.end < f.start) {
      setError(t('impact.baseline.order'));
      return;
    }
    mutation.mutate({ farm_id: farmId, farm_crop_id: f.planting || null, period_start: f.start, period_end: f.end, total_volume_l: vol, area_m2: area, notes: f.notes.trim() || null });
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!mutation.isPending}
      title={t('impact.baseline.add')}
      description={t('impact.baseline.description')}
      icon={<Scale className="h-5 w-5" />}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>{t('common.cancel')}</Button>
          <Button type="submit" form="baseline-form" loading={mutation.isPending}>{t('impact.baseline.save')}</Button>
        </>
      }
    >
      <form id="baseline-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <FormError>{error}</FormError>
        <FormGrid>
          <Field label={t('impact.baseline.start')} required>
            <Input type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} data-autofocus />
          </Field>
          <Field label={t('impact.baseline.end')} required>
            <Input type="date" value={f.end} min={f.start || undefined} onChange={(e) => setF({ ...f, end: e.target.value })} />
          </Field>
          <Field label={t('impact.baseline.volume')} required>
            <Input type="number" min={0} step="any" suffix={t('unit.l')} value={f.volume} onChange={(e) => setF({ ...f, volume: e.target.value })} />
          </Field>
          <Field label={t('impact.baseline.area')} required>
            <Input type="number" min={0} step="any" suffix={t('unit.m2')} value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} />
          </Field>
          <Field label={t('common.planting')} hint={t('water.field.optional')} className="sm:col-span-2">
            <Select value={f.planting} onChange={(e) => setF({ ...f, planting: e.target.value })}>
              <option value="">{t('common.none')}</option>
              {(plantings.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>{bi(p.crop.name_en, p.crop.name_ar)}</option>
              ))}
            </Select>
          </Field>
        </FormGrid>
        <Field label={t('common.notes')}>
          <Textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
      </form>
    </Modal>
  );
}

function ImpactSection({ farmId }: { farmId: UUID }) {
  const { t, lang } = useI18n();
  const { canEditFarm } = useAuth();
  const [adding, setAdding] = useState(false);
  const baselines = useQuery({ queryKey: qk.baselines(farmId), queryFn: () => waterService.baselines(farmId) });
  const impact = useQuery({ queryKey: qk.impact(farmId), queryFn: () => waterService.impact(farmId) });
  return (
    <section aria-labelledby="impact-title" className="mt-10">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="impact-title" className="text-xl font-semibold text-ink">{t('impact.title')}</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted">{t('impact.description')}</p>
        </div>
        {canEditFarm ? (
          <Button variant="secondary" icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setAdding(true)}>
            {t('impact.baseline.add')}
          </Button>
        ) : null}
      </div>
      {impact.isPending ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : impact.isError ? (
        <ErrorState error={impact.error} onRetry={() => void impact.refetch()} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <div className="mb-3 flex items-center gap-2">
              <Badge tone="emerald">{t('impact.measured.badge')}</Badge>
              <h3 className="font-semibold text-ink">{t('impact.measured.title')}</h3>
            </div>
            {impact.data.measured_savings_pct !== null ? (
              <p className="tabular text-4xl font-semibold text-forest-700">{fmtPercent(impact.data.measured_savings_pct, lang, 1)}</p>
            ) : (
              <p className="text-lg font-semibold text-muted">{t('impact.measured.na')}</p>
            )}
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-canvas p-3">
                <dt className="text-xs text-muted">{t('impact.baselineRate')}</dt>
                <dd className="tabular font-semibold text-ink">{impact.data.baseline_l_per_m2_day !== null ? `${fmtNumber(impact.data.baseline_l_per_m2_day, lang, 3)} ${t('unit.lpm2day')}` : '—'}</dd>
              </div>
              <div className="rounded-xl bg-canvas p-3">
                <dt className="text-xs text-muted">{t('impact.currentRate', { n: impact.data.current_days })}</dt>
                <dd className="tabular font-semibold text-ink">{impact.data.current_l_per_m2_day !== null ? `${fmtNumber(impact.data.current_l_per_m2_day, lang, 3)} ${t('unit.lpm2day')}` : '—'}</dd>
              </div>
            </dl>
            <p className="mt-3 text-sm text-muted" dir="auto">{serverText(impact.data.measured_savings_note, lang, t)}</p>
          </Card>
          <Card>
            <div className="mb-3 flex items-center gap-2">
              <Badge tone="warning">{t('impact.apparent.badge')}</Badge>
              <h3 className="font-semibold text-ink">{t('impact.apparent.title')}</h3>
            </div>
            <p className="tabular text-4xl font-semibold text-ink">{impact.data.apparent_savings_l !== null ? fmtLitres(impact.data.apparent_savings_l, lang) : '—'}</p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-canvas p-3">
                <dt className="text-xs text-muted">{t('impact.requirement')}</dt>
                <dd className="tabular font-semibold text-ink">{fmtLitres(impact.data.calculated_requirement_l, lang)}</dd>
              </div>
              <div className="rounded-xl bg-canvas p-3">
                <dt className="text-xs text-muted">{t('impact.actual')}</dt>
                <dd className="tabular font-semibold text-ink">{fmtLitres(impact.data.actual_usage_l, lang)}</dd>
              </div>
            </dl>
            <p className="mt-3 flex items-start gap-2 rounded-xl border border-warning/30 bg-[#FFF9EF] p-3 text-sm text-[#92400E]" dir="auto">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {serverText(impact.data.apparent_savings_note, lang, t)}
            </p>
          </Card>
        </div>
      )}
      <Card className="mt-6">
        <CardHeader title={t('impact.baselines')} subtitle={t('impact.baselinesHint')} />
        {baselines.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : baselines.isError ? (
          <ErrorState compact error={baselines.error} onRetry={() => void baselines.refetch()} />
        ) : baselines.data.length === 0 ? (
          <EmptyState compact icon={<Scale className="h-6 w-6" />} title={t('impact.baselines.empty')} hint={t('impact.baselines.emptyHint')} action={canEditFarm ? <Button size="sm" onClick={() => setAdding(true)}>{t('impact.baseline.add')}</Button> : null} />
        ) : (
          <Table
            caption={t('impact.baselines')}
            rows={baselines.data}
            rowKey={(b) => b.id}
            columns={[
              { key: 'period', header: t('impact.col.period'), primary: true, cell: (b) => `${fmtDate(b.period_start, lang)} – ${fmtDate(b.period_end, lang)}` },
              { key: 'vol', header: t('impact.col.volume'), align: 'end', cell: (b) => <span className="tabular">{fmtLitres(b.total_volume_l, lang)}</span> },
              { key: 'area', header: t('impact.col.area'), align: 'end', cell: (b) => <span className="tabular">{fmtNumber(b.area_m2, lang, 0)} {t('unit.m2')}</span> },
              { key: 'notes', header: t('common.notes'), cell: (b) => <span className="text-muted" dir="auto">{b.notes || '—'}</span> },
            ]}
          />
        )}
      </Card>
      <BaselineModal open={adding} onClose={() => setAdding(false)} farmId={farmId} />
    </section>
  );
}

export default function AnalyticsPage() {
  const { t } = useI18n();
  const { farms, farmId: ctxFarm } = useFarmContext();
  const [farmId, setFarmId] = useState<string>(ctxFarm ?? '');
  const [period, setPeriod] = useState<Period>('day');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const filters = useMemo<AnalyticsFilters>(() => ({ farm_id: farmId || undefined, period, date_from: from || undefined, date_to: to || undefined }), [farmId, period, from, to]);
  const analytics = useQuery({ queryKey: qk.analytics(filters), queryFn: () => waterService.analytics(filters), placeholderData: keepPreviousData });
  const impactFarm = farmId || ctxFarm;

  return (
    <div>
      <PageHeader icon={<BarChart3 className="h-6 w-6" />} title={t('analytics.title')} description={t('analytics.description')} />
      <Card className="mb-6" padded={false}>
        <div className="flex flex-wrap items-end gap-3 p-4">
          <Field label={t('common.farm')} className="w-full sm:w-52">
            <Select value={farmId} onChange={(e) => setFarmId(e.target.value)}>
              <option value="">{t('common.allFarms')}</option>
              {farms.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </Select>
          </Field>
          <div>
            <p className="label mb-1.5">{t('analytics.period')}</p>
            <Segmented
              label={t('analytics.period')}
              value={period}
              onChange={setPeriod}
              options={(['day', 'week', 'month', 'year'] as const).map((p) => ({ value: p, label: t(`period.${p}` as const) }))}
            />
          </div>
          <Field label={t('common.from')} className="w-[calc(50%-0.375rem)] sm:w-40">
            <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label={t('common.to')} className="w-[calc(50%-0.375rem)] sm:w-40">
            <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
      </Card>

      {analytics.isPending ? (
        <Skeleton className="h-72 w-full rounded-2xl" />
      ) : analytics.isError ? (
        <ErrorState error={analytics.error} onRetry={() => void analytics.refetch()} />
      ) : (
        <UsageSection data={analytics.data} period={period} />
      )}

      {impactFarm ? (
        <ImpactSection key={impactFarm} farmId={impactFarm} />
      ) : (
        <div className="card mt-10">
          <EmptyState icon={<FlaskConical className="h-7 w-7" />} title={t('impact.pickFarm')} hint={t('impact.pickFarmHint')} />
        </div>
      )}
    </div>
  );
}

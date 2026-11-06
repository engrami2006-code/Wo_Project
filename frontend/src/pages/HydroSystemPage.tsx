import { useState } from 'react';
import type { FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, BookOpen, FlaskConical, Pencil, Plus, Recycle, Scale } from 'lucide-react';
import { ChartFrame } from '../components/charts/ChartFrame';
import { BandTrendChart } from '../components/charts/Charts';
import { RecommendationCard } from '../components/explain/RecommendationCard';
import { HydroSystemModal } from '../components/forms/HydroSystemModal';
import { HydroTypeIcon } from '../components/hydro/HydroTypeIcon';
import { ReservoirGauge, WaterFlowDiagram } from '../components/hydro/HydroVisuals';
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
  Skeleton,
  SkeletonTable,
  StatTile,
  Table,
  Textarea,
  useToast,
} from '../components/ui';
import { qk } from '../hooks/queries';
import { useAuth } from '../hooks/useAuth';
import { useOnOpen } from '../hooks/useOnOpen';
import { useI18n } from '../i18n';
import { hydroService } from '../services/hydro';
import type { Explanation, HydroRecordInput, HydroSystem } from '../types/api';
import { errorText } from '../utils/errors';
import { fmtDateTime, fmtLitres, fmtNumber, fmtRatio, fmtShortDate, localInputToISO, nowLocalInput, parseNum } from '../utils/format';
import { labelHydroType, labelSystemStatus } from '../utils/labels';

type RecordField =
  | 'water_input_l'
  | 'water_consumed_l'
  | 'water_recycled_l'
  | 'water_discharged_l'
  | 'water_losses_l'
  | 'reservoir_start_l'
  | 'reservoir_end_l'
  | 'ph'
  | 'ec'
  | 'water_temp_c';

const emptyRecord: Record<RecordField, string> = {
  water_input_l: '',
  water_consumed_l: '',
  water_recycled_l: '',
  water_discharged_l: '',
  water_losses_l: '',
  reservoir_start_l: '',
  reservoir_end_l: '',
  ph: '',
  ec: '',
  water_temp_c: '',
};

function AddRecordModal({ open, onClose, system, onEvaluated }: { open: boolean; onClose: () => void; system: HydroSystem; onEvaluated: (e: Explanation) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [when, setWhen] = useState(nowLocalInput());
  const [period, setPeriod] = useState('1');
  const [v, setV] = useState(emptyRecord);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Partial<Record<RecordField | 'when' | 'period', string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  useOnOpen(open, () => {
    setWhen(nowLocalInput());
    setPeriod('1');
    setV({ ...emptyRecord, reservoir_start_l: system.latest_record?.reservoir_end_l != null ? String(system.latest_record.reservoir_end_l) : '' });
    setNotes('');
    setErrors({});
    setFormError(null);
  });

  const mutation = useMutation({
    mutationFn: (data: HydroRecordInput) => hydroService.addRecord(system.id, data),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: qk.hydroBalance(system.id) });
      void qc.invalidateQueries({ queryKey: qk.hydroSystem(system.id) });
      void qc.invalidateQueries({ queryKey: ['hydro-records', system.id] });
      void qc.invalidateQueries({ queryKey: ['hydro-systems'] });
      void qc.invalidateQueries({ queryKey: ['alerts'] });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
      void qc.invalidateQueries({ queryKey: ['water-records'] });
      toast.success(t('hydro.record.saved'));
      if (res.alerts_created) toast.warning(t('hydro.record.alerts', { n: res.alerts_created }));
      onEvaluated(res.evaluation);
      onClose();
    },
    onError: (err) => setFormError(errorText(err, t)),
  });

  const onSubmit = (ev: FormEvent) => {
    ev.preventDefault();
    setFormError(null);
    const e: Partial<Record<RecordField | 'when' | 'period', string>> = {};
    const nums = Object.fromEntries((Object.keys(v) as RecordField[]).map((k) => [k, parseNum(v[k])])) as Record<RecordField, number | null>;
    const per = parseNum(period);
    if (!when) e.when = t('validation.required');
    else if (new Date(when).getTime() > Date.now() + 60_000) e.when = t('validation.notFuture');
    if (per === null || per <= 0 || per > 31) e.period = t('validation.range', { min: 0, max: 31 });
    if (nums.water_input_l === null || nums.water_input_l < 0) e.water_input_l = t('validation.nonNegative');
    for (const k of ['water_consumed_l', 'water_recycled_l', 'water_discharged_l', 'water_losses_l', 'reservoir_start_l', 'reservoir_end_l'] as const) {
      const x = nums[k];
      if (x !== null && x < 0) e[k] = t('validation.nonNegative');
      if ((k === 'reservoir_start_l' || k === 'reservoir_end_l') && x !== null && x > system.reservoir_capacity_l) e[k] = t('hydro.record.overCapacity');
    }
    if (nums.ph !== null && (nums.ph < 0 || nums.ph > 14)) e.ph = t('validation.range', { min: 0, max: 14 });
    if (nums.ec !== null && (nums.ec < 0 || nums.ec > 20)) e.ec = t('validation.range', { min: 0, max: 20 });
    if (nums.water_temp_c !== null && (nums.water_temp_c < -5 || nums.water_temp_c > 60)) e.water_temp_c = t('validation.range', { min: -5, max: 60 });
    setErrors(e);
    if (Object.keys(e).length) return;
    mutation.mutate({
      recorded_at: localInputToISO(when),
      period_days: per as number,
      water_input_l: nums.water_input_l as number,
      water_consumed_l: nums.water_consumed_l,
      water_recycled_l: nums.water_recycled_l,
      water_discharged_l: nums.water_discharged_l,
      water_losses_l: nums.water_losses_l,
      reservoir_start_l: nums.reservoir_start_l,
      reservoir_end_l: nums.reservoir_end_l,
      ph: nums.ph,
      ec: nums.ec,
      water_temp_c: nums.water_temp_c,
      notes: notes.trim() || null,
    });
  };

  const num = (k: RecordField, label: string, suffix?: string, step = 'any', required = false) => (
    <Field label={label} error={errors[k]} required={required}>
      <Input type="number" step={step} min={k === 'water_temp_c' ? -5 : 0} dir="ltr" suffix={suffix} value={v[k]} onChange={(e) => setV((x) => ({ ...x, [k]: e.target.value }))} />
    </Field>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!mutation.isPending}
      size="lg"
      icon={<Plus className="h-5 w-5" />}
      title={t('hydro.record.add')}
      description={t('hydro.record.description')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="hydro-record-form" loading={mutation.isPending}>
            {t('hydro.record.save')}
          </Button>
        </>
      }
    >
      <form id="hydro-record-form" onSubmit={onSubmit} noValidate className="space-y-5">
        <FormError>{formError}</FormError>
        <FormGrid>
          <Field label={t('water.field.when')} required error={errors.when}>
            <Input type="datetime-local" value={when} max={nowLocalInput()} onChange={(e) => setWhen(e.target.value)} />
          </Field>
          <Field label={t('hydro.record.period')} required error={errors.period} hint={t('hydro.record.periodHint')}>
            <Input type="number" step="0.5" min={0} max={31} suffix={t('unit.days')} value={period} onChange={(e) => setPeriod(e.target.value)} />
          </Field>
        </FormGrid>
        <fieldset className="rounded-2xl border border-line p-4">
          <legend className="px-1 text-sm font-semibold text-ink">{t('hydro.record.balance')}</legend>
          <p className="mb-3 text-xs text-muted">{t('hydro.flow.equation')}</p>
          <FormGrid cols={3}>
            {num('water_input_l', t('hydro.flow.input'), t('unit.l'), 'any', true)}
            {num('water_consumed_l', t('hydro.flow.consumed'), t('unit.l'))}
            {num('water_recycled_l', t('hydro.flow.recycled'), t('unit.l'))}
            {num('water_discharged_l', t('hydro.flow.discharged'), t('unit.l'))}
            {num('water_losses_l', t('hydro.flow.losses'), t('unit.l'))}
          </FormGrid>
        </fieldset>
        <fieldset className="rounded-2xl border border-line p-4">
          <legend className="px-1 text-sm font-semibold text-ink">{t('hydro.record.reservoir')}</legend>
          <FormGrid>
            {num('reservoir_start_l', t('hydro.record.resStart'), t('unit.l'))}
            {num('reservoir_end_l', t('hydro.record.resEnd'), t('unit.l'))}
          </FormGrid>
        </fieldset>
        <fieldset className="rounded-2xl border border-line p-4">
          <legend className="px-1 text-sm font-semibold text-ink">{t('hydro.record.solution')}</legend>
          <FormGrid cols={3}>
            {num('ph', 'pH', undefined, '0.01')}
            {num('ec', 'EC', 'mS/cm', '0.01')}
            {num('water_temp_c', t('hydro.record.temp'), '°C', '0.1')}
          </FormGrid>
        </fieldset>
        <Field label={t('common.notes')}>
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

export default function HydroSystemPage() {
  const { systemId = '' } = useParams();
  const { t, lang } = useI18n();
  const { canEditFarm } = useAuth();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [evaluation, setEvaluation] = useState<Explanation | null>(null);
  const system = useQuery({ queryKey: qk.hydroSystem(systemId), queryFn: () => hydroService.get(systemId), enabled: !!systemId });
  const balance = useQuery({ queryKey: qk.hydroBalance(systemId), queryFn: () => hydroService.balance(systemId), enabled: !!systemId });

  const evaluate = useMutation({
    mutationFn: () => hydroService.evaluate(systemId),
    onSuccess: (e) => {
      setEvaluation(e);
      toast.success(t('hydro.evaluated'));
    },
    onError: (err) => toast.error(t('hydro.evaluateFailed'), errorText(err, t)),
  });

  if (system.isPending) return <SkeletonTable rows={6} />;
  if (system.isError) return <ErrorState error={system.error} onRetry={() => void system.refetch()} />;
  const s = system.data;
  const b = balance.data;
  const rows = b?.records ?? [];
  const latest = rows.length ? rows[rows.length - 1] : null;
  const shownEval = evaluation ?? b?.evaluation ?? null;
  const ranges = b?.ranges;
  const trend = rows.map((r) => ({ t: r.recorded_at, ph: r.ph, ec: r.ec }));

  return (
    <div>
      <PageHeader
        back={{ to: '/hydroponics', label: t('hydro.title') }}
        icon={<HydroTypeIcon type={s.system_type} className="h-6 w-6" />}
        title={s.name}
        description={labelHydroType(t, s.system_type)}
        meta={
          <>
            <Badge tone={s.status === 'active' ? 'emerald' : s.status === 'maintenance' ? 'warning' : 'neutral'} dot>
              {labelSystemStatus(t, s.status)}
            </Badge>
            <Badge tone={s.is_closed_loop ? 'teal' : 'outline'} icon={s.is_closed_loop ? <Recycle className="h-3 w-3" aria-hidden /> : undefined}>
              {s.is_closed_loop ? t('hydro.closedLoop') : t('hydro.openLoop')}
            </Badge>
          </>
        }
        actions={
          <>
            {canEditFarm ? (
              <Button variant="secondary" icon={<Pencil className="h-4 w-4" aria-hidden />} onClick={() => setEditing(true)}>
                {t('common.edit')}
              </Button>
            ) : null}
            <Button variant="secondary" icon={<Activity className="h-4 w-4" aria-hidden />} loading={evaluate.isPending} onClick={() => evaluate.mutate()}>
              {t('hydro.evaluate')}
            </Button>
            <Button icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setAdding(true)}>
              {t('hydro.record.add')}
            </Button>
          </>
        }
      />

      {balance.isPending ? (
        <Skeleton className="h-64 w-full rounded-2xl" />
      ) : balance.isError ? (
        <ErrorState error={balance.error} onRetry={() => void balance.refetch()} />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <div className="space-y-6">
              <Card>
                <ReservoirGauge level={s.latest_record?.reservoir_end_l ?? null} capacity={s.reservoir_capacity_l} />
              </Card>
              <Card>
                <CardHeader title={t('hydro.ranges.title')} icon={<Scale className="h-4 w-4" />} />
                {ranges?.configured ? (
                  <>
                    <dl className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl bg-canvas p-3">
                        <dt className="text-xs text-muted">pH</dt>
                        <dd className="tabular font-semibold text-ink" dir="ltr">{fmtNumber(ranges.ph_min, lang, 2)} – {fmtNumber(ranges.ph_max, lang, 2)}</dd>
                      </div>
                      <div className="rounded-xl bg-canvas p-3">
                        <dt className="text-xs text-muted">EC (mS/cm)</dt>
                        <dd className="tabular font-semibold text-ink" dir="ltr">{fmtNumber(ranges.ec_min, lang, 2)} – {fmtNumber(ranges.ec_max, lang, 2)}</dd>
                      </div>
                    </dl>
                    <p className="mt-3 flex items-start gap-1.5 text-xs text-muted">
                      <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span dir="auto">{ranges.source || t('hydro.ranges.noSource')}</span>
                    </p>
                  </>
                ) : (
                  <div className="rounded-xl border border-dashed border-warning/40 bg-[#FFF9EF] p-4 text-sm">
                    <p className="font-medium text-[#92400E]">{t('hydro.rangeNotConfigured')}</p>
                    <p className="mt-1 text-muted">{t('hydro.ranges.notConfiguredHint')}</p>
                  </div>
                )}
              </Card>
            </div>
            <Card>
              <CardHeader title={t('hydro.flow.title')} subtitle={latest ? t('hydro.flow.latest', { when: fmtDateTime(latest.recorded_at, lang) }) : undefined} />
              {latest ? (
                <WaterFlowDiagram row={latest} closedLoop={s.is_closed_loop} />
              ) : (
                <EmptyState icon={<FlaskConical className="h-7 w-7" />} title={t('hydro.noRecords')} hint={t('hydro.noRecordsHint')} action={<Button onClick={() => setAdding(true)} icon={<Plus className="h-4 w-4" aria-hidden />}>{t('hydro.record.add')}</Button>} />
              )}
            </Card>
          </div>

          {b?.has_data && b.totals ? (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatTile label={t('hydro.totals.input')} value={b.totals.input_l} format={(x) => fmtNumber(x, lang, 1)} unit={t('unit.l')} tone="water" />
              <StatTile label={t('hydro.totals.perDay')} value={b.totals.input_per_day_l} format={(x) => fmtNumber(x, lang, 1)} unit={t('unit.l')} />
              <StatTile label={t('hydro.totals.perPlant')} value={b.totals.input_per_plant_day_l} format={(x) => fmtNumber(x, lang, 3)} unit={t('unit.l')} tone="emerald" />
              <StatTile label={t('hydro.totals.recirculation')} value={b.totals.recirculation_ratio !== null ? b.totals.recirculation_ratio * 100 : null} format={(x) => fmtNumber(x, lang, 1)} unit="%" tone="teal" hint={t('hydro.totals.recirculationHint')} />
            </div>
          ) : null}

          {rows.length ? (
            <div className="grid gap-6 lg:grid-cols-2">
              {(['ph', 'ec'] as const).map((k) => {
                const min = k === 'ph' ? ranges?.ph_min ?? null : ranges?.ec_min ?? null;
                const max = k === 'ph' ? ranges?.ph_max ?? null : ranges?.ec_max ?? null;
                const values = trend.filter((p) => p[k] !== null);
                return (
                  <ChartFrame
                    key={k}
                    title={k === 'ph' ? t('hydro.trend.ph') : t('hydro.trend.ec')}
                    subtitle={min !== null && max !== null ? t('hydro.trend.band', { min: fmtNumber(min, lang, 2), max: fmtNumber(max, lang, 2) }) : t('hydro.rangeNotConfigured')}
                    summary={t('hydro.trend.summary', { name: k.toUpperCase(), n: values.length })}
                    table={{ columns: [t('common.date'), k === 'ph' ? 'pH' : 'EC'], rows: trend.map((p) => [fmtDateTime(p.t, lang), fmtNumber(p[k], lang, 2)]) }}
                    height={220}
                  >
                    {values.length ? (
                      <BandTrendChart data={trend} xKey="t" yKey={k} name={k === 'ph' ? 'pH' : 'EC'} min={min} max={max} color={k === 'ph' ? '#7C3AED' : '#0284C7'} format={(x) => fmtNumber(x, lang, 2)} tickFormat={(d) => fmtShortDate(d, lang)} bandLabel={t('hydro.trend.bandLabel')} />
                    ) : (
                      <p className="flex h-full items-center justify-center text-sm text-muted">{t('hydro.trend.noValues')}</p>
                    )}
                  </ChartFrame>
                );
              })}
            </div>
          ) : null}

          {shownEval ? (
            <section aria-label={t('hydro.evaluation')}>
              <h2 className="mb-3 text-lg font-semibold text-ink">{t('hydro.evaluation')}</h2>
              <RecommendationCard key={JSON.stringify(shownEval.fired_codes ?? [])} explanation={shownEval} />
            </section>
          ) : null}

          <Card>
            <CardHeader title={t('hydro.records.title')} subtitle={t('hydro.records.subtitle')} />
            {rows.length === 0 ? (
              <EmptyState compact icon={<FlaskConical className="h-6 w-6" />} title={t('hydro.noRecords')} hint={t('hydro.noRecordsHint')} />
            ) : (
              <Table
                caption={t('hydro.records.title')}
                dense
                rows={[...rows].reverse()}
                rowKey={(r) => r.id}
                columns={[
                  { key: 'when', header: t('water.col.when'), primary: true, cell: (r) => <span className="whitespace-nowrap">{fmtDateTime(r.recorded_at, lang)}</span> },
                  { key: 'ph', header: 'pH', align: 'end', cell: (r) => <span className="tabular">{fmtNumber(r.ph, lang, 2)}</span> },
                  { key: 'ec', header: 'EC', align: 'end', cell: (r) => <span className="tabular">{fmtNumber(r.ec, lang, 2)}</span> },
                  { key: 'in', header: t('hydro.flow.input'), align: 'end', cell: (r) => <span className="tabular">{fmtLitres(r.input_l, lang)}</span> },
                  { key: 'cons', header: t('hydro.flow.consumed'), align: 'end', cell: (r) => <span className="tabular">{fmtLitres(r.consumed_l, lang)}</span> },
                  { key: 'rec', header: t('hydro.flow.recycled'), align: 'end', cell: (r) => <span className="tabular">{fmtLitres(r.recycled_l, lang)}</span> },
                  { key: 'dis', header: t('hydro.flow.discharged'), align: 'end', cell: (r) => <span className="tabular">{fmtLitres(r.discharged_l, lang)}</span> },
                  { key: 'ds', header: t('hydro.flow.storage'), align: 'end', cell: (r) => <span className="tabular">{fmtLitres(r.delta_storage_l, lang)}</span> },
                  {
                    key: 'un',
                    header: t('hydro.flow.unaccounted'),
                    align: 'end',
                    cell: (r) => (
                      <span className="tabular">
                        {fmtLitres(r.unaccounted_l, lang)}
                        {r.unaccounted_fraction !== null ? <span className="ms-1 text-xs text-muted">({fmtRatio(r.unaccounted_fraction, lang, 1)})</span> : null}
                      </span>
                    ),
                  },
                ]}
              />
            )}
          </Card>
          {s.notes ? (
            <p className="text-sm text-muted" dir="auto">
              {s.notes}
            </p>
          ) : null}
        </div>
      )}
      <HydroSystemModal open={editing} system={s} onClose={() => setEditing(false)} />
      <AddRecordModal open={adding} onClose={() => setAdding(false)} system={s} onEvaluated={setEvaluation} />
    </div>
  );
}

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calculator, CircleHelp, History, Play } from 'lucide-react';
import { CalculationSteps } from '../components/explain/CalculationSteps';
import { PlantingPicker } from '../components/farm/PlantingPicker';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Collapsible,
  EmptyState,
  ErrorState,
  Field,
  Input,
  KeyValue,
  PageHeader,
  SkeletonTable,
  Table,
  useToast,
} from '../components/ui';
import { qk } from '../hooks/queries';
import { useFarmContext } from '../hooks/useFarmContext';
import { useI18n } from '../i18n';
import { waterService } from '../services/water';
import type { Calculation, CalculationResponse, Planting, UUID } from '../types/api';
import { errorText } from '../utils/errors';
import { labelEt0Source } from '../utils/labels';
import { fmtDate, fmtDateTime, fmtLitres, fmtNumber, fmtValue, parseNum, todayISO } from '../utils/format';
import { serverText } from '../utils/serverText';

function CalculationResultView({ calc }: { calc: Calculation }) {
  const { t, lang } = useI18n();
  const r = calc.result;
  const kpis: { label: string; value: string; strong?: boolean }[] = [
    { label: 'Kc', value: fmtNumber(r.kc, lang, 3) },
    { label: 'ET0', value: `${fmtNumber(r.et0_mm, lang, 2)} ${t('unit.mmDay')}` },
    { label: 'ETc', value: `${fmtNumber(r.etc_mm, lang, 2)} ${t('unit.mmDay')}` },
    { label: 'P_eff', value: `${fmtNumber(r.p_eff_mm, lang, 2)} ${t('unit.mm')}` },
    { label: 'NIR', value: `${fmtNumber(r.nir_mm, lang, 2)} ${t('unit.mm')}` },
    { label: t('calc.kpi.net'), value: fmtLitres(r.net_l, lang) },
    { label: t('calc.kpi.gross'), value: fmtLitres(r.gross_l, lang), strong: true },
  ];
  const inputs = calc.inputs as Record<string, unknown>;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        {kpis.map((k) => (
          <div key={k.label} className={k.strong ? 'rounded-2xl bg-forest-700 p-4 text-white' : 'rounded-2xl border border-line bg-surface p-4'}>
            <p className={k.strong ? 'text-xs text-forest-100' : 'font-mono text-xs text-muted'} dir={k.strong ? undefined : 'ltr'}>
              {k.label}
            </p>
            <p className="tabular mt-1 text-lg font-semibold" dir="ltr">
              {k.value}
            </p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge tone="outline">{calc.method}</Badge>
        {inputs.et0_source ? <Badge tone={inputs.et0_source === 'manual' ? 'warning' : 'water'}>{t('calc.et0Source', { source: labelEt0Source(t, String(inputs.et0_source)) })}</Badge> : null}
        {r.kc_climate_adjusted === false ? <Badge tone="neutral">{t('calc.kcNotAdjusted')}</Badge> : <Badge tone="emerald">{t('calc.kcAdjusted')}</Badge>}
        {typeof r.coverage_pct === 'number' ? <Badge tone="teal">{t('calc.coverage', { pct: fmtNumber(r.coverage_pct, lang, 1) })}</Badge> : null}
      </div>
      <CalculationSteps steps={calc.steps} />
      <Collapsible title={t('calc.inputsParams')}>
        <h4 className="mb-2 text-sm font-semibold text-ink">{t('calc.inputs')}</h4>
        <KeyValue
          cols={3}
          items={Object.entries(calc.inputs).map(([k, v]) => ({ label: <span className="font-mono" dir="ltr">{k}</span>, value: <span dir="auto">{fmtValue(v, lang)}</span> }))}
        />
        <h4 className="mb-2 mt-5 text-sm font-semibold text-ink">{t('calc.parameters')}</h4>
        <KeyValue
          cols={3}
          items={Object.entries(calc.parameters).map(([k, v]) => ({ label: <span className="font-mono" dir="ltr">{k}</span>, value: <span dir="auto">{fmtValue(v, lang)}</span> }))}
        />
      </Collapsible>
    </div>
  );
}

export default function CalculationsPage() {
  const { t, lang, bi } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const { farmId: ctxFarm } = useFarmContext();
  const [farmId, setFarmId] = useState<UUID | null>(ctxFarm);
  const [plantingId, setPlantingId] = useState<UUID | null>(null);
  const [planting, setPlanting] = useState<Planting | null>(null);
  const [date, setDate] = useState(todayISO());
  const [et0, setEt0] = useState('');
  const [rain, setRain] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<CalculationResponse | null>(null);

  const history = useQuery({
    queryKey: qk.calculations({ farm_id: farmId }),
    queryFn: () => waterService.calculations({ farm_id: farmId ?? undefined, limit: 20 }),
    enabled: !!farmId,
  });

  const run = useMutation({
    mutationFn: waterService.calculate,
    onSuccess: (res) => {
      setResult(res);
      if (res.status === 'calculated') {
        toast.success(t('calc.toast.done'));
        void qc.invalidateQueries({ queryKey: ['calculations'] });
      }
    },
    onError: (err) => toast.error(t('calc.toast.failed'), errorText(err, t)),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const et0v = parseNum(et0);
    const rainv = parseNum(rain);
    if (!plantingId) errs.planting = t('validation.required');
    if (et0.trim() && (et0v === null || et0v < 0 || et0v > 30)) errs.et0 = t('validation.range', { min: 0, max: 30 });
    if (rain.trim() && (rainv === null || rainv < 0 || rainv > 1000)) errs.rain = t('validation.range', { min: 0, max: 1000 });
    setErrors(errs);
    if (Object.keys(errs).length || !plantingId) return;
    run.mutate({ farm_crop_id: plantingId, target_date: date || null, et0_override_mm: et0v, precipitation_override_mm: rainv });
  };

  return (
    <div>
      <PageHeader icon={<Calculator className="h-6 w-6" />} title={t('calc.title')} description={t('calc.description')} />
      <div className="grid gap-6 xl:grid-cols-[22rem_1fr]">
        <Card as="aside" className="h-fit xl:sticky xl:top-24">
          <CardHeader title={t('calc.form.title')} level={2} />
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <PlantingPicker
              farmId={farmId}
              onFarmChange={(id) => {
                setFarmId(id);
                setResult(null);
              }}
              plantingId={plantingId}
              onPlantingChange={(id, p) => {
                setPlantingId(id);
                setPlanting(p);
              }}
              error={errors.planting}
            />
            <Field label={t('common.date')}>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <fieldset className="rounded-2xl border border-dashed border-line p-4">
              <legend className="px-1 text-sm font-semibold text-ink">{t('manual.title')}</legend>
              <p className="mb-3 text-xs text-muted">{t('manual.hint')}</p>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('manual.et0')} error={errors.et0}>
                  <Input type="number" step="0.1" min={0} max={30} dir="ltr" suffix={t('unit.mmDay')} value={et0} onChange={(e) => setEt0(e.target.value)} />
                </Field>
                <Field label={t('manual.rain')} error={errors.rain}>
                  <Input type="number" step="0.1" min={0} dir="ltr" suffix={t('unit.mm')} value={rain} onChange={(e) => setRain(e.target.value)} />
                </Field>
              </div>
            </fieldset>
            <Button type="submit" className="w-full" loading={run.isPending} icon={<Play className="flip-rtl h-4 w-4" aria-hidden />}>
              {t('calc.run')}
            </Button>
          </form>
        </Card>

        <div className="min-w-0 space-y-6">
          {result ? (
            result.status === 'calculated' && result.calculation ? (
              <Card className="animate-reveal">
                <CardHeader
                  title={t('calc.result.title')}
                  subtitle={planting ? `${bi(planting.crop.name_en, planting.crop.name_ar)} — ${fmtDate(result.calculation.target_date ?? date, lang)}` : undefined}
                />
                <CalculationResultView calc={result.calculation} />
              </Card>
            ) : (
              <section className="animate-reveal rounded-2xl border border-warning/30 bg-[#FFF9EF] p-6" aria-live="polite">
                <div className="flex items-start gap-4">
                  <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#FEF3E2] text-[#92400E]" aria-hidden>
                    <CircleHelp className="h-6 w-6" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-[#7C2D12]">{t('calc.insufficient')}</h2>
                    <p className="mt-1 text-sm text-[#92400E]" dir="auto">{serverText(result.message, lang, t)}</p>
                    {result.missing_data.length ? (
                      <ul className="mt-3 list-disc space-y-1 ps-5 text-sm text-ink">
                        {result.missing_data.map((m) => (
                          <li key={m} dir="auto">{serverText(m, lang, t)}</li>
                        ))}
                      </ul>
                    ) : null}
                    <p className="mt-3 text-sm text-ink">{t('calc.insufficientHint')}</p>
                  </div>
                </div>
              </section>
            )
          ) : (
            <Card>
              <EmptyState icon={<Calculator className="h-7 w-7" />} title={t('calc.empty.title')} hint={t('calc.empty.hint')} />
            </Card>
          )}

          <Card>
            <CardHeader title={t('calc.history')} icon={<History className="h-4 w-4" />} subtitle={t('calc.historyHint')} />
            {!farmId ? (
              <EmptyState compact icon={<History className="h-6 w-6" />} title={t('calc.history.pickFarm')} />
            ) : history.isPending ? (
              <SkeletonTable rows={3} />
            ) : history.isError ? (
              <ErrorState compact error={history.error} onRetry={() => void history.refetch()} />
            ) : history.data.length === 0 ? (
              <EmptyState compact icon={<History className="h-6 w-6" />} title={t('calc.history.empty')} hint={t('calc.history.emptyHint')} />
            ) : (
              <Table
                caption={t('calc.history')}
                rows={history.data}
                rowKey={(c) => c.id ?? `${c.created_at}`}
                columns={[
                  { key: 'when', header: t('common.created'), primary: true, cell: (c) => fmtDateTime(c.created_at, lang) },
                  { key: 'date', header: t('common.date'), cell: (c) => fmtDate(c.target_date, lang) },
                  { key: 'et0', header: 'ET0', align: 'end', cell: (c) => <span className="tabular">{fmtNumber(c.result.et0_mm, lang, 2)}</span> },
                  { key: 'etc', header: 'ETc', align: 'end', cell: (c) => <span className="tabular">{fmtNumber(c.result.etc_mm, lang, 2)}</span> },
                  { key: 'gross', header: t('calc.kpi.gross'), align: 'end', cell: (c) => <span className="tabular font-semibold">{fmtLitres(c.result.gross_l, lang)}</span> },
                  { key: 'src', header: t('calc.col.source'), cell: (c) => <Badge tone={c.inputs.et0_source === 'manual' ? 'warning' : 'water'} size="xs">{labelEt0Source(t, c.inputs.et0_source as string | null)}</Badge> },
                  {
                    key: 'view',
                    header: <span className="sr-only">{t('common.actions')}</span>,
                    align: 'end',
                    cell: (c) => (
                      <Button variant="ghost" size="xs" onClick={() => setResult({ calculation: c, status: 'calculated', missing_data: [], message: '' })}>
                        {t('common.view')}
                      </Button>
                    ),
                  },
                ]}
              />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

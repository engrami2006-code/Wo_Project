import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CloudOff, Info, ListPlus, Play, Plus, Sigma, Trash2, Waves } from 'lucide-react';
import { ChartFrame } from '../components/charts/ChartFrame';
import { LoadProfileChart } from '../components/charts/Charts';
import { RecommendationCard } from '../components/explain/RecommendationCard';
import { PlantingPicker } from '../components/farm/PlantingPicker';
import { GanttTimeline } from '../components/schedule/GanttTimeline';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  FormError,
  IconButton,
  Input,
  KeyValue,
  PageHeader,
  Select,
  Spinner,
  TabPanel,
  Tabs,
  useToast,
} from '../components/ui';
import { qk, usePlantings } from '../hooks/queries';
import { useFarmContext } from '../hooks/useFarmContext';
import { useI18n } from '../i18n';
import { farmService } from '../services/farms';
import { irrigationService, recommendationService } from '../services/irrigation';
import { weatherService } from '../services/weather';
import type { IrrigationResponse, Planting, ScheduleResponse, UUID } from '../types/api';
import { errorText } from '../utils/errors';
import { fmtInt, fmtLitres, fmtNumber, parseNum, todayISO, toMinutes } from '../utils/format';
import { labelConstraint, labelCspStat, labelWeatherStatus, weatherTone } from '../utils/labels';
import { serverText } from '../utils/serverText';

/* ------------------------------------------------------------------ recommendation tab */
function RecommendationTab() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const { farmId: ctxFarm, farms } = useFarmContext();
  const [farmId, setFarmId] = useState<UUID | null>(ctxFarm);
  const [plantingId, setPlantingId] = useState<UUID | null>(params.get('planting'));
  const [, setPlanting] = useState<Planting | null>(null);
  const [date, setDate] = useState(todayISO());
  const [available, setAvailable] = useState('');
  const [et0, setEt0] = useState('');
  const [rain, setRain] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<IrrigationResponse | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  // Deep link: /irrigation?planting=<id> resolves its farm first.
  const linked = params.get('planting');
  const linkedQ = useQuery({ queryKey: ['planting', linked], queryFn: () => farmService.getPlanting(linked as string), enabled: !!linked });
  useEffect(() => {
    if (linkedQ.data) {
      setFarmId(linkedQ.data.farm_id);
      setPlantingId(linkedQ.data.id);
    }
  }, [linkedQ.data]);
  useEffect(() => {
    if (!farmId && ctxFarm && !linked) setFarmId(ctxFarm);
  }, [ctxFarm, farmId, linked]);

  const farm = farms.find((f) => f.id === farmId) ?? null;
  const weather = useQuery({ queryKey: qk.weather(farmId ?? 'none'), queryFn: () => weatherService.get(farmId as UUID), enabled: !!farmId });
  const weatherDown = weather.data && (weather.data.status === 'unavailable' || weather.data.stale);

  const run = useMutation({
    mutationFn: irrigationService.recommend,
    onSuccess: (res) => {
      setResult(res);
      void qc.invalidateQueries({ queryKey: ['recommendations'] });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
      void qc.invalidateQueries({ queryKey: ['alerts'] });
      if (res.status === 'recommendation') toast.success(t('irr.toast.done'));
      else toast.warning(t('xai.insufficient'));
      if (res.alerts_created) toast.info(t('irr.toast.alerts', { n: res.alerts_created }));
      window.setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    },
    onError: (err) => toast.error(t('irr.toast.failed'), errorText(err, t)),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const av = parseNum(available);
    const et0v = parseNum(et0);
    const rainv = parseNum(rain);
    if (!plantingId) errs.planting = t('validation.required');
    if (available.trim() && (av === null || av < 0)) errs.available = t('validation.nonNegative');
    if (et0.trim() && (et0v === null || et0v < 0 || et0v > 30)) errs.et0 = t('validation.range', { min: 0, max: 30 });
    if (rain.trim() && (rainv === null || rainv < 0 || rainv > 1000)) errs.rain = t('validation.range', { min: 0, max: 1000 });
    setErrors(errs);
    if (Object.keys(errs).length || !plantingId) return;
    run.mutate({
      farm_crop_id: plantingId,
      target_date: date || null,
      available_water_l: av,
      et0_override_mm: et0v,
      precipitation_override_mm: rainv,
      persist: true,
    });
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[23rem_1fr]">
      <Card as="aside" className="h-fit xl:sticky xl:top-24">
        <CardHeader title={t('irr.form.title')} subtitle={t('irr.form.subtitle')} />
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
          <Field
            label={t('irr.available')}
            error={errors.available}
            hint={farm?.daily_water_allowance_l != null ? t('irr.availableHint', { v: fmtLitres(farm.daily_water_allowance_l, lang) }) : t('irr.availableHintNone')}
          >
            <Input
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              suffix={t('unit.l')}
              placeholder={farm?.daily_water_allowance_l != null ? String(farm.daily_water_allowance_l) : undefined}
              value={available}
              onChange={(e) => setAvailable(e.target.value)}
            />
          </Field>

          <fieldset className={`rounded-2xl border p-4 ${weatherDown ? 'border-warning/40 bg-[#FFFBF3]' : 'border-dashed border-line'}`}>
            <legend className="px-1 text-sm font-semibold text-ink">{t('manual.title')}</legend>
            <div className="mb-3 flex items-start gap-2 text-xs text-muted">
              {weather.isPending && farmId ? (
                <Spinner className="h-3.5 w-3.5" />
              ) : weatherDown ? (
                <CloudOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#B45309]" aria-hidden />
              ) : (
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              )}
              <span>
                {weather.data ? (
                  <>
                    <Badge tone={weatherTone(weather.data.status, weather.data.stale)} size="xs" className="me-1 align-middle">
                      {labelWeatherStatus(t, weather.data.status)}
                    </Badge>
                    {weatherDown ? t('manual.offline') : t('manual.online')}
                  </>
                ) : (
                  t('manual.hint')
                )}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('manual.et0')} error={errors.et0}>
                <Input type="number" step="0.1" min={0} max={30} dir="ltr" suffix={t('unit.mmDay')} value={et0} onChange={(e) => setEt0(e.target.value)} />
              </Field>
              <Field label={t('manual.rain')} error={errors.rain}>
                <Input type="number" step="0.1" min={0} dir="ltr" suffix={t('unit.mm')} value={rain} onChange={(e) => setRain(e.target.value)} />
              </Field>
            </div>
          </fieldset>
          <Button type="submit" variant="primary" size="lg" className="w-full" loading={run.isPending} icon={<Play className="flip-rtl h-4 w-4" aria-hidden />}>
            {t('irr.run')}
          </Button>
          <p className="text-center text-xs text-muted">{t('irr.noAi')}</p>
        </form>
      </Card>

      <div ref={resultRef} className="min-w-0 scroll-mt-24" aria-live="polite">
        {result ? (
          <div className="space-y-3">
            {result.recommendation_id ? (
              <p className="text-sm text-muted">
                {t('irr.saved')}{' '}
                <Link to={`/recommendations/${result.recommendation_id}`} className="font-medium text-teal underline-offset-4 hover:underline">
                  {t('irr.openSaved')}
                </Link>
              </p>
            ) : null}
            <RecommendationCard key={JSON.stringify(result.explanation.fired_codes ?? [])} explanation={result.explanation} />
          </div>
        ) : (
          <Card className="flex h-full min-h-[24rem] items-center justify-center">
            <EmptyState icon={<Waves className="h-7 w-7" />} title={t('irr.empty.title')} hint={t('irr.empty.hint')} />
          </Card>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ schedule tab */
interface TaskRow {
  id: number;
  name: string;
  farm_crop_id: UUID | null;
  volume: string;
  flow: string;
}

function ScheduleTab() {
  const { t, lang, bi } = useI18n();
  const toast = useToast();
  const { farmId } = useFarmContext();
  const plantings = usePlantings(farmId);
  const seq = useRef(1);
  const [tasks, setTasks] = useState<TaskRow[]>([{ id: 0, name: '', farm_crop_id: null, volume: '', flow: '' }]);
  const [capacity, setCapacity] = useState('');
  const [windowStart, setWindowStart] = useState('05:00');
  const [windowEnd, setWindowEnd] = useState('21:00');
  const [blocked, setBlocked] = useState<{ id: number; start: string; end: string }[]>([{ id: 0, start: '11:00', end: '15:00' }]);
  const [slot, setSlot] = useState<15 | 30 | 60>(30);
  const [limit, setLimit] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<ScheduleResponse | null>(null);
  const [submitted, setSubmitted] = useState<{ ws: string; we: string; blocked: { start: string; end: string }[]; capacity: number } | null>(null);

  const recent = useQuery({
    queryKey: qk.recommendations({ farm_id: farmId, kind: 'irrigation', size: 50 }),
    queryFn: () => recommendationService.list({ farm_id: farmId ?? undefined, kind: 'irrigation', size: 50 }),
    enabled: !!farmId,
  });

  const prefill = () => {
    const latest = new Map<string, { amount: number }>();
    for (const r of recent.data?.items ?? []) {
      if (!r.farm_crop_id || r.amount_l === null || r.amount_l <= 0) continue;
      if (!latest.has(r.farm_crop_id)) latest.set(r.farm_crop_id, { amount: r.amount_l });
    }
    if (latest.size === 0) {
      toast.info(t('schedule.prefillNone'), t('schedule.prefillNoneHint'));
      return;
    }
    const rows: TaskRow[] = [];
    latest.forEach((v, pid) => {
      const p = plantings.data?.find((x) => x.id === pid);
      rows.push({
        id: seq.current++,
        name: p ? bi(p.crop.name_en, p.crop.name_ar) : t('common.planting'),
        farm_crop_id: pid,
        volume: String(Math.round(v.amount * 10) / 10),
        flow: '',
      });
    });
    setTasks(rows);
    toast.success(t('schedule.prefilled', { n: rows.length }));
  };

  const run = useMutation({
    mutationFn: irrigationService.schedule,
    onSuccess: (res) => {
      setResult(res);
      if (res.status === 'solved') toast.success(t('schedule.toast.solved'));
      else toast.warning(t('schedule.toast.infeasible'), serverText(res.message, lang, t));
    },
    onError: (err) => setFormError(errorText(err, t)),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const cap = parseNum(capacity);
    const lim = parseNum(limit);
    const parsed = tasks.map((r) => ({ name: r.name.trim(), farm_crop_id: r.farm_crop_id, volume_l: parseNum(r.volume), flow_lph: parseNum(r.flow) }));
    if (parsed.some((p) => !p.name || !p.volume_l || p.volume_l <= 0 || !p.flow_lph || p.flow_lph <= 0)) {
      setFormError(t('schedule.error.tasks'));
      return;
    }
    if (cap === null || cap <= 0) {
      setFormError(t('schedule.error.capacity'));
      return;
    }
    if (toMinutes(windowEnd) <= toMinutes(windowStart)) {
      setFormError(t('schedule.error.window'));
      return;
    }
    if (blocked.some((b) => toMinutes(b.end) <= toMinutes(b.start))) {
      setFormError(t('schedule.error.blocked'));
      return;
    }
    const blockedList = blocked.map((b) => ({ start: b.start, end: b.end }));
    setSubmitted({ ws: windowStart, we: windowEnd, blocked: blockedList, capacity: cap });
    run.mutate({
      farm_id: farmId,
      slot_minutes: slot,
      window_start: windowStart,
      window_end: windowEnd,
      blocked: blockedList,
      pump_capacity_lph: cap,
      daily_limit_l: lim && lim > 0 ? lim : null,
      tasks: parsed.map((p) => ({ name: p.name, farm_crop_id: p.farm_crop_id, volume_l: p.volume_l as number, flow_lph: p.flow_lph as number })),
    });
  };

  const updateTask = (id: number, patch: Partial<TaskRow>) => setTasks((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const stats = result?.stats ?? {};

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={t('schedule.form.title')}
          subtitle={t('schedule.form.subtitle')}
          actions={
            <Button variant="secondary" size="sm" icon={<ListPlus className="h-4 w-4" aria-hidden />} onClick={prefill} disabled={!farmId || recent.isPending} loading={recent.isFetching && !recent.data}>
              {t('schedule.prefill')}
            </Button>
          }
        />
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          <FormError>{formError}</FormError>
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-ink">{t('schedule.tasks')}</legend>
            <ul className="space-y-2.5">
              {tasks.map((r, i) => (
                <li key={r.id} className="grid grid-cols-2 items-end gap-2.5 rounded-2xl border border-line p-3 sm:grid-cols-[1.5fr_1fr_1fr_auto]">
                  <Field label={t('schedule.task.name')} className="col-span-2 sm:col-span-1">
                    <Input value={r.name} onChange={(e) => updateTask(r.id, { name: e.target.value })} aria-label={`${t('schedule.task.name')} ${i + 1}`} />
                  </Field>
                  <Field label={t('schedule.task.volume')}>
                    <Input type="number" min={0} step="any" suffix={t('unit.l')} value={r.volume} onChange={(e) => updateTask(r.id, { volume: e.target.value })} />
                  </Field>
                  <Field label={t('schedule.task.flow')}>
                    <Input type="number" min={0} step="any" suffix={t('unit.lph')} value={r.flow} onChange={(e) => updateTask(r.id, { flow: e.target.value })} />
                  </Field>
                  <IconButton label={t('schedule.task.remove')} tone="danger" disabled={tasks.length === 1} onClick={() => setTasks((xs) => xs.filter((x) => x.id !== r.id))} className="col-span-2 justify-self-end sm:col-span-1">
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </li>
              ))}
            </ul>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              icon={<Plus className="h-4 w-4" aria-hidden />}
              disabled={tasks.length >= 30}
              onClick={() => setTasks((xs) => [...xs, { id: seq.current++, name: '', farm_crop_id: null, volume: '', flow: '' }])}
            >
              {t('schedule.task.add')}
            </Button>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Field label={t('schedule.capacity')} required>
              <Input type="number" min={0} step="any" suffix={t('unit.lph')} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            </Field>
            <Field label={t('schedule.windowStart')}>
              <Input type="time" dir="ltr" step={900} value={windowStart} onChange={(e) => setWindowStart(e.target.value)} />
            </Field>
            <Field label={t('schedule.windowEnd')}>
              <Input type="time" dir="ltr" step={900} value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} />
            </Field>
            <Field label={t('schedule.slot')}>
              <Select value={slot} onChange={(e) => setSlot(Number(e.target.value) as 15 | 30 | 60)}>
                {[15, 30, 60].map((m) => (
                  <option key={m} value={m}>
                    {t('schedule.minutes', { n: m })}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('schedule.limit')} hint={t('water.field.optional')}>
              <Input type="number" min={0} step="any" suffix={t('unit.l')} value={limit} onChange={(e) => setLimit(e.target.value)} />
            </Field>
          </div>

          <fieldset>
            <legend className="mb-1 text-sm font-semibold text-ink">{t('schedule.blockedTitle')}</legend>
            <p className="mb-2 text-xs text-muted">{t('schedule.blockedHint')}</p>
            <ul className="flex flex-wrap gap-2">
              {blocked.map((b) => (
                <li key={b.id} className="flex items-center gap-1.5 rounded-xl border border-line bg-canvas p-1.5">
                  <Input type="time" dir="ltr" step={900} className="h-9 w-[8.75rem] py-1" value={b.start} aria-label={t('common.from')} onChange={(e) => setBlocked((xs) => xs.map((x) => (x.id === b.id ? { ...x, start: e.target.value } : x)))} />
                  <span className="text-muted" aria-hidden>–</span>
                  <Input type="time" dir="ltr" step={900} className="h-9 w-[8.75rem] py-1" value={b.end} aria-label={t('common.to')} onChange={(e) => setBlocked((xs) => xs.map((x) => (x.id === b.id ? { ...x, end: e.target.value } : x)))} />
                  <IconButton size="sm" tone="danger" label={t('schedule.removeBlocked')} onClick={() => setBlocked((xs) => xs.filter((x) => x.id !== b.id))}>
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </li>
              ))}
              <li>
                <Button variant="ghost" size="sm" className="h-full" icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setBlocked((xs) => [...xs, { id: seq.current++, start: '12:00', end: '13:00' }])}>
                  {t('schedule.addBlocked')}
                </Button>
              </li>
            </ul>
          </fieldset>

          <div className="flex justify-end">
            <Button type="submit" loading={run.isPending} icon={<CalendarClock className="h-4 w-4" aria-hidden />}>
              {t('schedule.run')}
            </Button>
          </div>
        </form>
      </Card>

      {result && submitted ? (
        <div className="stagger space-y-6" aria-live="polite">
          <Card>
            <CardHeader
              title={t('schedule.result')}
              actions={
                <Badge tone={result.status === 'solved' ? 'emerald' : 'critical'} dot>
                  {result.status === 'solved' ? t('schedule.solved') : t('schedule.infeasible')}
                </Badge>
              }
            />
            {result.status !== 'solved' ? (
              <div role="alert" className="mb-4 rounded-2xl border border-earth/30 bg-earth-50 p-4 text-sm">
                <p className="font-semibold text-earth-700">{t('schedule.infeasibleTitle')}</p>
                <p className="mt-1 text-ink" dir="auto">{serverText(result.message, lang, t)}</p>
                {result.violated ? (
                  <p className="mt-2 text-earth-700">
                    {t('schedule.violated')} <Badge tone="critical" size="xs">{labelConstraint(t, result.violated)}</Badge>
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mb-4 text-sm text-muted" dir="auto">{serverText(result.message, lang, t)}</p>
            )}
            <GanttTimeline tasks={result.schedule} windowStart={submitted.ws} windowEnd={submitted.we} blocked={submitted.blocked} />
          </Card>

          {result.load_profile?.length ? (
            <ChartFrame
              title={t('schedule.load')}
              subtitle={t('schedule.loadHint', { cap: fmtNumber(submitted.capacity, lang, 0) })}
              summary={t('schedule.loadSummary', { peak: fmtNumber(Math.max(...result.load_profile.map((s) => s.load_lph)), lang, 0), cap: fmtNumber(submitted.capacity, lang, 0) })}
              table={{
                columns: [t('schedule.col.time'), t('schedule.col.load'), t('schedule.blocked')],
                rows: result.load_profile.map((s) => [s.time, fmtNumber(s.load_lph, lang, 0), s.blocked ? t('common.yes') : t('common.no')]),
              }}
              height={240}
            >
              <LoadProfileChart data={result.load_profile} capacity={submitted.capacity} format={(v) => fmtNumber(v, lang, 0)} capacityLabel={t('schedule.capacityLine')} name={t('schedule.col.load')} />
            </ChartFrame>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title={t('schedule.stats')} icon={<Sigma className="h-4 w-4" />} />
              <KeyValue
                items={Object.entries(stats).map(([k, v]) => ({
                  label: labelCspStat(t, k),
                  value: <span className="tabular">{k === 'runtime_ms' ? `${fmtNumber(v, lang, 2)} ms` : fmtInt(v, lang)}</span>,
                }))}
              />
            </Card>
            <Card>
              <CardHeader title={t('schedule.formulation')} subtitle={t('schedule.formulationHint')} />
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-xs text-muted">{t('csp.variables')}</dt>
                  <dd className="mt-1 flex flex-wrap gap-1.5">
                    {result.formulation.variables.map((v) => (
                      <Badge key={v} tone="outline" size="xs">{v}</Badge>
                    ))}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">{t('csp.domains')}</dt>
                  <dd className="mt-1 text-ink" dir="ltr" style={{ textAlign: 'start' }}>{result.formulation.domains}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">{t('csp.constraints')}</dt>
                  <dd>
                    <ul className="mt-1 space-y-1">
                      {result.formulation.constraints.map((c) => (
                        <li key={c} className="formula text-xs">{c}</li>
                      ))}
                    </ul>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">{t('csp.heuristics')}</dt>
                  <dd className="mt-1 flex flex-wrap gap-1.5">
                    {result.formulation.heuristics.map((h) => (
                      <Badge key={h} tone="teal" size="xs">{h}</Badge>
                    ))}
                  </dd>
                </div>
              </dl>
            </Card>
          </div>
        </div>
      ) : (
        <Card>
          <EmptyState icon={<CalendarClock className="h-7 w-7" />} title={t('schedule.empty.title')} hint={t('schedule.empty.hint')} />
        </Card>
      )}
    </div>
  );
}

export default function IrrigationPage() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<'recommendation' | 'schedule'>(params.get('tab') === 'schedule' ? 'schedule' : 'recommendation');
  const items = useMemo(
    () => [
      { key: 'recommendation' as const, label: t('irr.tab.recommendation'), icon: <Waves className="h-4 w-4" aria-hidden /> },
      { key: 'schedule' as const, label: t('irr.tab.schedule'), icon: <CalendarClock className="h-4 w-4" aria-hidden /> },
    ],
    [t],
  );
  return (
    <div>
      <PageHeader icon={<Waves className="h-6 w-6" />} title={t('irr.title')} description={t('irr.description')} />
      <Tabs items={items} value={tab} onChange={setTab} label={t('irr.title')} idPrefix="irr" className="mb-6" />
      <TabPanel id="irr" tabKey="recommendation" active={tab === 'recommendation'}>
        <RecommendationTab />
      </TabPanel>
      <TabPanel id="irr" tabKey="schedule" active={tab === 'schedule'}>
        <ScheduleTab />
      </TabPanel>
    </div>
  );
}

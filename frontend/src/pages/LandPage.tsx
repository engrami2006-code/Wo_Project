import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Grid3x3, History, Info, Play, Plus, Route, Trash2 } from 'lucide-react';
import { ChartFrame } from '../components/charts/ChartFrame';
import { CategoryBarChart } from '../components/charts/Charts';
import { LandGrid } from '../components/land/LandGrid';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  FormError,
  IconButton,
  Input,
  PageHeader,
  Pagination,
  Segmented,
  Select,
  Skeleton,
  Table,
  Toggle,
  useToast,
} from '../components/ui';
import { qk, useCrops } from '../hooks/queries';
import { useFarmContext } from '../hooks/useFarmContext';
import { useI18n } from '../i18n';
import { landService } from '../services/land';
import { SEARCH_ALGORITHMS } from '../types/api';
import type { AlgorithmRun, LandAllocation, LandCandidateInput, LandRequest, LandResponse, SearchAlgorithm, UUID } from '../types/api';
import { cn } from '../utils/cn';
import { errorText } from '../utils/errors';
import { fmtDateTime, fmtLitres, fmtNumber, parseNum } from '../utils/format';
import { labelAlgorithm, labelConstraint } from '../utils/labels';
import { serverText } from '../utils/serverText';

interface CandRow {
  id: number;
  mode: 'crop' | 'custom';
  crop_id: string;
  name: string;
  water: string;
  yield: string;
  min_area: string;
  max_area: string;
  min_prod: string;
  price: string;
}

const newRow = (id: number): CandRow => ({ id, mode: 'crop', crop_id: '', name: '', water: '', yield: '', min_area: '', max_area: '', min_prod: '', price: '' });

interface ResultView {
  status: string;
  statement?: string;
  message: string | null;
  allocation: LandAllocation[];
  totals: Record<string, number | null>;
  binding: string[];
  formulation: LandResponse['formulation'];
  comparison: AlgorithmRun[];
  numUnits: number;
}

function fromResponse(r: LandResponse, numUnits: number): ResultView {
  return {
    status: r.status,
    statement: r.statement,
    message: r.message,
    allocation: r.allocation,
    totals: r.totals,
    binding: r.binding_constraints,
    formulation: r.formulation,
    comparison: r.comparison,
    numUnits,
  };
}

function Results({ view: raw }: { view: ResultView }) {
  const { t, lang, bi } = useI18n();
  const crops = useCrops();
  // Library crops come back with their English name; show the name in the UI language.
  const nameOf = (n: string) => {
    const c = crops.data?.find((x) => x.name_en === n);
    return c ? bi(c.name_en, c.name_ar) : n;
  };
  const view: ResultView = {
    ...raw,
    allocation: raw.allocation.map((a) => ({ ...a, name: nameOf(a.name) })),
    formulation: { ...raw.formulation, candidates: raw.formulation?.candidates?.map((c) => ({ ...c, name: nameOf(c.name) })) },
    binding: raw.binding.map((b) => (b.includes(':') ? `${b.split(':')[0]}:${nameOf(b.split(':').slice(1).join(':'))}` : b)),
  };
  const f = view.formulation ?? {};
  const optimal = view.status === 'optimal';
  const comparisonRows = view.comparison.map((c) => ({ name: t(`algorithm.short.${c.algorithm}` as 'algorithm.short.astar'), nodes: Math.max(1, c.nodes_expanded) }));
  return (
    <div className="stagger space-y-6">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={optimal ? 'emerald' : view.status === 'infeasible' ? 'critical' : 'warning'} dot icon={optimal ? <BadgeCheck className="h-3 w-3" aria-hidden /> : undefined}>
                {t(`land.status.${view.status}` as 'land.status.optimal')}
              </Badge>
              {view.binding.map((b) => (
                <Badge key={b} tone="outline" size="xs">
                  {t('land.binding')}: {labelConstraint(t, b)}
                </Badge>
              ))}
            </div>
            <p className="mt-3 text-lg font-semibold text-ink">{optimal ? t('land.statement') : t('land.notOptimal')}</p>
            {view.message && view.message !== view.statement && view.message !== 'Optimal under the selected objective and constraints.' ? (
              <p className="mt-1 text-sm text-muted" dir="auto">{serverText(view.message, lang, t)}</p>
            ) : null}
          </div>
        </div>
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <LandGrid allocation={view.allocation} numUnits={view.numUnits} unitArea={typeof f.unit_area_m2 === 'number' ? f.unit_area_m2 : undefined} />
          <div className="min-w-0">
            <Table
              caption={t('land.allocation')}
              dense
              rows={view.allocation}
              rowKey={(a) => a.name}
              columns={[
                { key: 'name', header: t('land.col.crop'), primary: true, cell: (a) => <span className="font-medium">{a.name}</span> },
                { key: 'units', header: t('land.col.units'), align: 'end', cell: (a) => <span className="tabular">{fmtNumber(a.units, lang, 0)}</span> },
                { key: 'area', header: t('land.col.area'), align: 'end', cell: (a) => <span className="tabular">{fmtNumber(a.area_m2, lang, 0)}</span> },
                { key: 'water', header: t('land.col.water'), align: 'end', cell: (a) => <span className="tabular">{fmtLitres(a.water_l, lang, { allowM3: true })}</span> },
                { key: 'prod', header: t('land.col.production'), align: 'end', cell: (a) => <span className="tabular">{fmtNumber(a.production_kg, lang, 0)}</span> },
              ]}
            />
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              {(
                [
                  ['units_used', t('land.totals.units'), (v: number) => fmtNumber(v, lang, 0)],
                  ['fallow_units', t('land.totals.fallow'), (v: number) => fmtNumber(v, lang, 0)],
                  ['area_used_m2', t('land.totals.area'), (v: number) => `${fmtNumber(v, lang, 0)} ${t('unit.m2')}`],
                  ['water_used_l', t('land.totals.water'), (v: number) => fmtLitres(v, lang, { allowM3: true })],
                  ['water_left_l', t('land.totals.waterLeft'), (v: number) => fmtLitres(v, lang, { allowM3: true })],
                  ['production_kg', t('land.totals.production'), (v: number) => `${fmtNumber(v, lang, 0)} ${t('unit.kg')}`],
                ] as const
              ).map(([k, label, fmt]) =>
                typeof view.totals?.[k] === 'number' ? (
                  <div key={k} className="rounded-xl bg-canvas p-3">
                    <dt className="text-xs text-muted">{label}</dt>
                    <dd className="tabular font-semibold text-ink">{fmt(view.totals[k] as number)}</dd>
                  </div>
                ) : null,
              )}
            </dl>
          </div>
        </div>
      </Card>

      {view.comparison.length ? (
        <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader title={t('land.comparison')} subtitle={t('land.comparisonHint')} />
            <Table
              caption={t('land.comparison')}
              dense
              rows={view.comparison}
              rowKey={(c) => c.algorithm}
              rowClassName={(c) => (c.algorithm === 'astar' ? 'bg-forest-50/50' : undefined)}
              columns={[
                { key: 'alg', header: t('land.col.algorithm'), primary: true, cell: (c) => <span className="whitespace-nowrap font-medium">{labelAlgorithm(t, c.algorithm)}</span> },
                { key: 'obj', header: t('land.col.objective'), align: 'end', cell: (c) => <span className="tabular">{c.found ? fmtNumber(c.objective_value, lang, 0) : '—'}</span> },
                { key: 'exp', header: t('land.col.expanded'), align: 'end', cell: (c) => <span className="tabular font-semibold">{fmtNumber(c.nodes_expanded, lang, 0)}</span> },
                { key: 'gen', header: t('land.col.generated'), align: 'end', cell: (c) => <span className="tabular">{fmtNumber(c.nodes_generated, lang, 0)}</span> },
                { key: 'front', header: t('land.col.frontier'), align: 'end', cell: (c) => <span className="tabular">{fmtNumber(c.max_frontier, lang, 0)}</span> },
                { key: 'ms', header: t('land.col.runtime'), align: 'end', cell: (c) => <span className="tabular">{fmtNumber(c.runtime_ms, lang, 2)}</span> },
                {
                  key: 'opt',
                  header: t('land.col.optimal'),
                  cell: (c) => (
                    <Badge tone={c.optimal_guarantee ? 'emerald' : 'neutral'} size="xs">
                      {c.optimal_guarantee ? t('land.guaranteed') : t('land.notGuaranteed')}
                    </Badge>
                  ),
                },
              ]}
            />
          </Card>
          <ChartFrame
            title={t('land.nodesChart')}
            subtitle={t('land.nodesChartHint')}
            summary={comparisonRows.map((r) => `${r.name}: ${r.nodes}`).join(', ')}
            table={{ columns: [t('land.col.algorithm'), t('land.col.expanded')], rows: comparisonRows.map((r) => [r.name, r.nodes]) }}
            height={220}
          >
            <CategoryBarChart data={comparisonRows} xKey="name" yKey="nodes" name={t('land.col.expanded')} format={(v) => fmtNumber(v, lang, 0)} colorByIndex scale="log" />
          </ChartFrame>
        </div>
      ) : null}

      <Card>
        <CardHeader title={t('land.formulation')} subtitle={t('land.formulationHint')} icon={<Route className="h-4 w-4" />} />
        <dl className="grid gap-4 md:grid-cols-2">
          {(
            [
              ['state', t('land.f.state')],
              ['initial_state', t('land.f.initial')],
              ['actions', t('land.f.actions')],
              ['transition', t('land.f.transition')],
              ['goal_test', t('land.f.goal')],
              ['step_cost', t('land.f.cost')],
              ['heuristic', t('land.f.heuristic')],
            ] as const
          ).map(([k, label]) =>
            typeof f[k] === 'string' ? (
              <div key={k} className={cn('rounded-xl border border-line p-3', k === 'heuristic' && 'md:col-span-2 border-teal/40 bg-[#F7FCFB]')}>
                <dt className="text-xs font-medium text-muted">{label}</dt>
                <dd className="formula mt-1 block text-[0.8125rem]">{f[k] as string}</dd>
              </div>
            ) : null,
          )}
        </dl>
        {f.candidates?.length ? (
          <div className="mt-5">
            <h3 className="mb-2 text-sm font-semibold text-ink">{t('land.candidatesUsed')}</h3>
            <Table
              dense
              caption={t('land.candidatesUsed')}
              rows={f.candidates}
              rowKey={(c) => c.name}
              columns={[
                { key: 'n', header: t('land.col.crop'), primary: true, cell: (c) => c.name },
                { key: 'w', header: t('land.col.waterPerM2'), align: 'end', cell: (c) => <span className="tabular">{fmtNumber(c.water_l_per_m2, lang, 1)}</span> },
                { key: 's', header: t('land.col.waterSource'), cell: (c) => <span className="text-xs text-muted" dir="ltr">{c.water_source}</span> },
                { key: 'y', header: t('land.col.yield'), align: 'end', cell: (c) => <span className="tabular">{fmtNumber(c.yield_kg_per_m2, lang, 2)}</span> },
                { key: 'mm', header: t('land.col.bounds'), align: 'end', cell: (c) => <span className="tabular">{c.min_units} – {c.max_units ?? '∞'}</span> },
              ]}
            />
          </div>
        ) : null}
      </Card>
    </div>
  );
}

export default function LandPage() {
  const { t, lang, bi } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const crops = useCrops();
  const { farmId, farm } = useFarmContext();
  const seq = useRef(2);
  const [area, setArea] = useState('');
  const [units, setUnits] = useState('20');
  const [water, setWater] = useState('');
  const [objective, setObjective] = useState<'max_production' | 'min_water'>('max_production');
  const [target, setTarget] = useState('');
  const [useValue, setUseValue] = useState(false);
  const [et0, setEt0] = useState('');
  const [eff, setEff] = useState('');
  const [rows, setRows] = useState<CandRow[]>([newRow(0), newRow(1)]);
  const [algos, setAlgos] = useState<SearchAlgorithm[]>([...SEARCH_ALGORITHMS]);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ResultView | null>(null);
  const [page, setPage] = useState(1);
  const resultRef = useRef<HTMLDivElement>(null);

  const history = useQuery({ queryKey: qk.landRequests(page), queryFn: () => landService.requests(page, 8), placeholderData: keepPreviousData });

  const optimize = useMutation({
    mutationFn: (req: LandRequest) => landService.optimize(req),
    onSuccess: (res, req) => {
      setView(fromResponse(res, req.num_units));
      void qc.invalidateQueries({ queryKey: ['land-requests'] });
      if (res.status === 'optimal') toast.success(t('land.toast.optimal'));
      else toast.warning(t(`land.status.${res.status}` as 'land.status.optimal'), res.message);
      window.setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    },
    onError: (err) => setError(errorText(err, t)),
  });

  const loadHistory = useMutation({
    mutationFn: (id: UUID) => landService.request(id),
    onSuccess: (d) => {
      if (!d.result) {
        toast.info(t('land.history.noResult'));
        return;
      }
      const stats = (d.result.search_stats ?? {}) as { formulation?: LandResponse['formulation']; totals?: Record<string, number | null>; binding?: string[] };
      setView({
        status: d.result.status,
        message: d.result.message,
        allocation: d.result.allocation ?? [],
        totals: stats.totals ?? {},
        binding: stats.binding ?? [],
        formulation: stats.formulation ?? {},
        comparison: d.result.comparison ?? [],
        numUnits: d.inputs.num_units,
      });
      window.setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
    },
    onError: (err) => toast.error(t('land.history.failed'), errorText(err, t)),
  });

  const updateRow = (id: number, patch: Partial<CandRow>) => setRows((xs) => xs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const A = parseNum(area);
    const N = parseNum(units);
    const W = parseNum(water);
    if (A === null || A <= 0) return setError(t('land.error.area'));
    if (N === null || !Number.isInteger(N) || N < 1 || N > 60) return setError(t('land.error.units'));
    if (W === null || W <= 0) return setError(t('land.error.water'));
    if (objective === 'min_water' && !(parseNum(target) ?? 0)) return setError(t('land.error.target'));
    if (!algos.length) return setError(t('land.error.algorithms'));
    const candidates: LandCandidateInput[] = [];
    for (const r of rows) {
      const y = parseNum(r.yield);
      if (y === null || y <= 0) return setError(t('land.error.yield'));
      const cand: LandCandidateInput = {
        yield_kg_per_m2: y,
        min_area_m2: parseNum(r.min_area) ?? 0,
        max_area_m2: parseNum(r.max_area),
        min_production_kg: parseNum(r.min_prod),
        price_per_kg: useValue ? parseNum(r.price) : null,
      };
      if (useValue && (cand.price_per_kg === null || cand.price_per_kg === undefined || cand.price_per_kg < 0)) return setError(t('land.error.price'));
      if (r.mode === 'crop') {
        if (!r.crop_id) return setError(t('land.error.crop'));
        cand.crop_id = r.crop_id;
        const w = parseNum(r.water);
        if (w !== null && w > 0) cand.water_l_per_m2 = w;
      } else {
        const w = parseNum(r.water);
        if (!r.name.trim()) return setError(t('land.error.name'));
        if (w === null || w <= 0) return setError(t('land.error.customWater'));
        cand.name = r.name.trim();
        cand.water_l_per_m2 = w;
      }
      candidates.push(cand);
    }
    const needsFao = candidates.some((c) => c.crop_id && !c.water_l_per_m2);
    const et0v = parseNum(et0);
    const effPct = parseNum(eff);
    if (needsFao && (et0v === null || et0v <= 0 || et0v > 20 || effPct === null || effPct <= 0 || effPct > 100)) return setError(t('land.error.fao'));
    optimize.mutate({
      farm_id: farmId,
      total_area_m2: A,
      num_units: N,
      available_water_l: W,
      objective,
      use_value: useValue,
      production_target_kg: objective === 'min_water' ? parseNum(target) : null,
      season_et0_mm_day: et0v,
      efficiency: effPct !== null ? Math.round(effPct * 10) / 1000 : null,
      candidates,
      algorithms: algos,
    });
  };

  return (
    <div>
      <PageHeader icon={<Grid3x3 className="h-6 w-6" />} title={t('land.title')} description={t('land.description')} />
      <Card>
        <form onSubmit={onSubmit} noValidate className="space-y-6">
          <FormError>{error}</FormError>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t('land.area')} required hint={farm?.total_area_m2 ? t('land.areaHint', { v: fmtNumber(farm.total_area_m2, lang, 0) }) : undefined}>
              <Input type="number" min={0} step="any" suffix={t('unit.m2')} value={area} onChange={(e) => setArea(e.target.value)} />
            </Field>
            <Field label={t('land.units.label')} required hint={t('land.unitsHint')}>
              <Input type="number" min={1} max={60} step={1} value={units} onChange={(e) => setUnits(e.target.value)} />
            </Field>
            <Field label={t('land.water')} required>
              <Input type="number" min={0} step="any" suffix={t('unit.l')} value={water} onChange={(e) => setWater(e.target.value)} />
            </Field>
            <div>
              <p className="label mb-1.5">{t('land.objective')}</p>
              <Segmented
                label={t('land.objective')}
                value={objective}
                onChange={setObjective}
                size="sm"
                options={[
                  { value: 'max_production', label: t('land.obj.max') },
                  { value: 'min_water', label: t('land.obj.min') },
                ]}
              />
            </div>
            {objective === 'min_water' ? (
              <Field label={t('land.target')} required>
                <Input type="number" min={0} step="any" suffix={t('unit.kg')} value={target} onChange={(e) => setTarget(e.target.value)} />
              </Field>
            ) : null}
            <Field label={t('land.et0')} hint={t('land.et0Hint')}>
              <Input type="number" min={0} max={20} step="0.1" dir="ltr" suffix={t('unit.mmDay')} value={et0} onChange={(e) => setEt0(e.target.value)} />
            </Field>
            <Field label={t('land.efficiency')} hint={t('land.efficiencyHint')}>
              <Input type="number" min={1} max={100} step="any" suffix="%" value={eff} onChange={(e) => setEff(e.target.value)} />
            </Field>
            <div className="flex items-end pb-2">
              <Toggle checked={useValue} onChange={setUseValue} label={t('land.useValue')} description={t('land.useValueHint')} />
            </div>
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-ink">{t('land.candidates')}</legend>
            <ul className="space-y-3">
              {rows.map((r, i) => (
                <li key={r.id} className="rounded-2xl border border-line p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <Segmented
                      label={t('land.candidateType', { n: i + 1 })}
                      size="sm"
                      value={r.mode}
                      onChange={(m) => updateRow(r.id, { mode: m })}
                      options={[
                        { value: 'crop', label: t('land.mode.crop') },
                        { value: 'custom', label: t('land.mode.custom') },
                      ]}
                    />
                    <IconButton size="sm" tone="danger" label={t('land.removeCandidate')} disabled={rows.length <= 1} onClick={() => setRows((xs) => xs.filter((x) => x.id !== r.id))}>
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
                    {r.mode === 'crop' ? (
                      <Field label={t('land.col.crop')} required className="lg:col-span-2">
                        <Select value={r.crop_id} onChange={(e) => updateRow(r.id, { crop_id: e.target.value })}>
                          <option value="">{t('common.choose')}</option>
                          {(crops.data ?? []).map((c) => (
                            <option key={c.id} value={c.id}>{bi(c.name_en, c.name_ar)}</option>
                          ))}
                        </Select>
                      </Field>
                    ) : (
                      <Field label={t('land.customName')} required className="lg:col-span-2">
                        <Input value={r.name} onChange={(e) => updateRow(r.id, { name: e.target.value })} />
                      </Field>
                    )}
                    <Field label={t('land.col.waterPerM2')} required={r.mode === 'custom'} hint={r.mode === 'crop' ? t('land.waterFao') : undefined}>
                      <Input type="number" min={0} step="any" value={r.water} onChange={(e) => updateRow(r.id, { water: e.target.value })} />
                    </Field>
                    <Field label={t('land.col.yield')} required>
                      <Input type="number" min={0} step="any" value={r.yield} onChange={(e) => updateRow(r.id, { yield: e.target.value })} />
                    </Field>
                    <Field label={t('land.minArea')}>
                      <Input type="number" min={0} step="any" suffix={t('unit.m2')} value={r.min_area} onChange={(e) => updateRow(r.id, { min_area: e.target.value })} />
                    </Field>
                    <Field label={t('land.maxArea')}>
                      <Input type="number" min={0} step="any" suffix={t('unit.m2')} value={r.max_area} onChange={(e) => updateRow(r.id, { max_area: e.target.value })} />
                    </Field>
                    <Field label={t('land.minProd')}>
                      <Input type="number" min={0} step="any" suffix={t('unit.kg')} value={r.min_prod} onChange={(e) => updateRow(r.id, { min_prod: e.target.value })} />
                    </Field>
                    {useValue ? (
                      <Field label={t('land.price')} required>
                        <Input type="number" min={0} step="any" value={r.price} onChange={(e) => updateRow(r.id, { price: e.target.value })} />
                      </Field>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
            <Button variant="ghost" size="sm" className="mt-2" icon={<Plus className="h-4 w-4" aria-hidden />} disabled={rows.length >= 6} onClick={() => setRows((xs) => [...xs, newRow(seq.current++)])}>
              {t('land.addCandidate')}
            </Button>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-ink">{t('land.algorithms')}</legend>
            <div className="flex flex-wrap gap-2">
              {SEARCH_ALGORITHMS.map((a) => {
                const on = algos.includes(a);
                return (
                  <label key={a} className={cn('flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors', on ? 'border-forest-700 bg-forest-50 text-forest-700' : 'border-line text-muted hover:border-forest-200')}>
                    <input type="checkbox" className="h-4 w-4 accent-[#0F3D2E]" checked={on} onChange={(e) => setAlgos((xs) => (e.target.checked ? [...xs, a] : xs.filter((x) => x !== a)))} />
                    {labelAlgorithm(t, a)}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <Info className="h-3.5 w-3.5" aria-hidden />
              {t('land.inputsNote')}
            </p>
            <Button type="submit" size="lg" loading={optimize.isPending} icon={<Play className="flip-rtl h-4 w-4" aria-hidden />}>
              {t('land.run')}
            </Button>
          </div>
        </form>
      </Card>

      <div ref={resultRef} className="mt-6 scroll-mt-24" aria-live="polite">
        {view ? <Results view={view} /> : null}
      </div>

      <Card className="mt-6">
        <CardHeader title={t('land.history')} icon={<History className="h-4 w-4" />} />
        {history.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : history.isError ? (
          <ErrorState compact error={history.error} onRetry={() => void history.refetch()} />
        ) : history.data.items.length === 0 ? (
          <EmptyState compact icon={<History className="h-6 w-6" />} title={t('land.history.empty')} hint={t('land.history.emptyHint')} />
        ) : (
          <>
            <Table
              caption={t('land.history')}
              rows={history.data.items}
              rowKey={(r) => r.id}
              columns={[
                { key: 'when', header: t('common.created'), primary: true, cell: (r) => fmtDateTime(r.created_at, lang) },
                { key: 'obj', header: t('land.objective'), cell: (r) => (r.objective === 'min_water' ? t('land.obj.min') : t('land.obj.max')) },
                { key: 'status', header: t('common.status'), cell: (r) => <Badge tone={r.status === 'optimal' ? 'emerald' : 'warning'} size="xs">{t(`land.status.${r.status}` as 'land.status.optimal')}</Badge> },
                { key: 'val', header: t('land.col.objective'), align: 'end', cell: (r) => <span className="tabular">{fmtNumber(r.objective_value, lang, 0)}</span> },
                { key: 'water', header: t('land.totals.water'), align: 'end', cell: (r) => <span className="tabular">{fmtLitres(r.total_water_l, lang, { allowM3: true })}</span> },
                {
                  key: 'open',
                  header: <span className="sr-only">{t('common.actions')}</span>,
                  align: 'end',
                  cell: (r) => (
                    <Button variant="ghost" size="xs" loading={loadHistory.isPending && loadHistory.variables === r.id} onClick={() => loadHistory.mutate(r.id)}>
                      {t('common.view')}
                    </Button>
                  ),
                },
              ]}
            />
            <Pagination page={page} size={8} total={history.data.total} onChange={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}

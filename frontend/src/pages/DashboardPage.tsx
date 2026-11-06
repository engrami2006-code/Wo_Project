import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowUpRight,
  Bell,
  CloudOff,
  CloudSun,
  Droplets,
  FlaskConical,
  Lightbulb,
  Map,
  Plus,
  Sprout,
  Tractor,
  Waves,
} from 'lucide-react';
import { ChartFrame, CHART_COLORS } from '../components/charts/ChartFrame';
import { DonutChart, TimeAreaChart } from '../components/charts/Charts';
import { Badge, ButtonLink, Card, CardHeader, EmptyState, ErrorState, Skeleton, SkeletonCards, StatTile } from '../components/ui';
import { qk } from '../hooks/queries';
import { useAuth } from '../hooks/useAuth';
import { useI18n } from '../i18n';
import { dashboardService } from '../services/dashboard';
import type { DashboardFull } from '../types/api';
import { cn } from '../utils/cn';
import { fmtArea, fmtDate, fmtInt, fmtLitres, fmtNumber, fmtPercent, fmtRelative, fmtShortDate } from '../utils/format';
import { labelAction, labelHydroType, labelSeverity, labelWeatherStatus, severityStripe, weatherTone } from '../utils/labels';

function WelcomeBand({ data }: { data: DashboardFull }) {
  const { t, tp, lang } = useI18n();
  const { user } = useAuth();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? t('dash.greeting.morning') : hour < 18 ? t('dash.greeting.afternoon') : t('dash.greeting.evening');
  return (
    <section className="relative mb-6 overflow-hidden rounded-3xl bg-gradient-to-br from-forest-700 via-[#0F4A3B] to-teal px-6 py-7 text-white shadow-card sm:px-8">
      <svg className="pointer-events-none absolute inset-y-0 end-0 h-full w-1/2 opacity-25" viewBox="0 0 300 200" preserveAspectRatio="xMaxYMid slice" aria-hidden>
        {Array.from({ length: 9 }, (_, i) => (
          <path key={i} d={`M ${300 - i * 34} 200 C ${290 - i * 30} 140, ${250 - i * 22} 90, ${240 - i * 16} 0`} stroke="#A7F3D0" strokeWidth="1.4" fill="none" />
        ))}
      </svg>
      <div className="relative flex flex-wrap items-end justify-between gap-5">
        <div className="max-w-2xl">
          <p className="text-sm text-forest-100/90">{fmtDate(new Date(), lang, { dateStyle: 'full' })}</p>
          <h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">
            {t('dash.greeting.line', { greeting, name: user?.full_name.split(' ')[0] ?? '' })}
          </h1>
          <p className="mt-2 text-forest-50/90">
            {t('dash.welcome.summary', {
              farms: tp('count.farm', data.counts.farms),
              plantings: tp('count.planting', data.counts.active_plantings),
              alerts: tp('count.alert', data.counts.open_alerts),
            })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink to="/irrigation" variant="secondary" className="border-white/20 bg-white text-forest-700 hover:bg-forest-50" icon={<Waves className="h-4 w-4" aria-hidden />}>
            {t('dash.action.irrigate')}
          </ButtonLink>
          <ButtonLink to="/water?new=1" variant="ghost" className="bg-white/10 text-white hover:bg-white/20" icon={<Droplets className="h-4 w-4" aria-hidden />}>
            {t('dash.action.record')}
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}

function DashboardContent({ data }: { data: DashboardFull }) {
  const { t, tp, lang, bi } = useI18n();
  const series = data.water.series;
  const hasSeries = series.some((p) => p.total_l > 0);
  const cropData = useMemo(
    () => data.crop_distribution.map((c) => ({ name: bi(c.name_en, c.name_ar), value: c.area_m2 })),
    [data.crop_distribution, bi],
  );
  const cropTotal = cropData.reduce((s, c) => s + c.value, 0);
  const sevOrder = ['critical', 'warning', 'info'] as const;
  const actions = Object.entries(data.irrigation_actions_30d ?? {});

  return (
    <>
      <WelcomeBand data={data} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-6">
        <StatTile label={t('dash.stat.farms')} value={data.counts.farms} format={(v) => fmtInt(v, lang)} icon={<Tractor className="h-4 w-4" />} />
        <StatTile label={t('dash.stat.plantings')} value={data.counts.active_plantings} format={(v) => fmtInt(v, lang)} icon={<Sprout className="h-4 w-4" />} tone="emerald" />
        <StatTile
          label={t('dash.stat.hydro')}
          value={data.counts.hydroponic_systems}
          format={(v) => fmtInt(v, lang)}
          icon={<FlaskConical className="h-4 w-4" />}
          tone="teal"
          hint={t('dash.stat.hydroActive', { n: fmtInt(data.counts.active_hydroponic_systems, lang) })}
        />
        <StatTile label={t('dash.stat.alerts')} value={data.counts.open_alerts} format={(v) => fmtInt(v, lang)} icon={<Bell className="h-4 w-4" />} tone={data.counts.open_alerts ? 'warning' : 'forest'} />
        <StatTile label={t('dash.stat.area')} value={data.counts.cultivated_area_m2} format={(v) => fmtNumber(v, lang, 0)} unit={lang === 'ar' ? 'م²' : 'm²'} icon={<Map className="h-4 w-4" />} />
        <StatTile
          label={t('dash.stat.water30')}
          value={data.water.last_30_days_l}
          format={(v) => fmtNumber(v, lang, 0)}
          unit={lang === 'ar' ? 'لتر' : 'L'}
          icon={<Droplets className="h-4 w-4" />}
          tone="water"
          hint={
            data.water.trend_pct !== null
              ? t('dash.stat.trend', { pct: fmtPercent(data.water.trend_pct, lang, 1, true) })
              : tp('count.dayRecords', data.water.days_with_records)
          }
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        {hasSeries ? (
          <ChartFrame
            className="xl:col-span-2"
            title={t('dash.water.title')}
            subtitle={t('dash.water.subtitle')}
            summary={t('dash.water.summary', { total: fmtLitres(data.water.last_30_days_l, lang), days: data.water.days_with_records })}
            table={{ columns: [t('common.date'), t('common.volumeL')], rows: series.map((p) => [fmtDate(p.date, lang), fmtNumber(p.total_l, lang, 1)]) }}
            height={260}
          >
            <TimeAreaChart data={series} xKey="date" yKey="total_l" name={t('common.volumeL')} format={(v) => fmtNumber(v, lang, 0)} tickFormat={(d) => fmtShortDate(d, lang)} />
          </ChartFrame>
        ) : (
          <Card className="xl:col-span-2">
            <CardHeader title={t('dash.water.title')} subtitle={t('dash.water.subtitle')} />
            <EmptyState
              compact
              icon={<Droplets className="h-6 w-6" />}
              title={t('dash.water.empty')}
              hint={t('dash.water.emptyHint')}
              action={<ButtonLink to="/water?new=1" size="sm" icon={<Plus className="h-4 w-4" aria-hidden />}>{t('water.add')}</ButtonLink>}
            />
          </Card>
        )}

        <Card>
          <CardHeader title={t('dash.crops.title')} subtitle={t('dash.crops.subtitle')} />
          {cropData.length ? (
            <div className="flex flex-col items-center gap-4 sm:flex-row xl:flex-col 2xl:flex-row">
              <figure className="relative h-44 w-44 shrink-0" dir="ltr" role="img" aria-label={t('dash.crops.summary', { n: cropData.length })}>
                <DonutChart data={cropData} format={(v) => fmtArea(v, lang, 0)} />
                <figcaption className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="tabular text-lg font-semibold text-ink">{fmtNumber(cropTotal, lang, 0)}</span>
                  <span className="text-xs text-muted">{lang === 'ar' ? 'م²' : 'm²'}</span>
                </figcaption>
              </figure>
              <ul className="w-full space-y-2 text-sm">
                {cropData.map((c, i) => (
                  <li key={c.name} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-ink">{c.name}</span>
                    <span className="tabular text-muted">{fmtArea(c.value, lang, 0)}</span>
                    <span className="tabular w-12 text-end font-medium text-ink">{fmtPercent((c.value / cropTotal) * 100, lang, 0)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <EmptyState compact icon={<Sprout className="h-6 w-6" />} title={t('dash.crops.empty')} hint={t('dash.crops.emptyHint')} action={<ButtonLink to="/farms" size="sm">{t('dash.crops.go')}</ButtonLink>} />
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader
            title={t('dash.recs.title')}
            icon={<Lightbulb className="h-4 w-4" />}
            actions={<Link to="/recommendations" className="inline-flex items-center gap-1 text-sm font-medium text-teal hover:underline">{t('common.viewAll')}<ArrowUpRight className="flip-rtl h-3.5 w-3.5" aria-hidden /></Link>}
          />
          {data.recommendations.length ? (
            <ul className="divide-y divide-line">
              {data.recommendations.map((r) => (
                <li key={r.id}>
                  <Link to={`/recommendations/${r.id}`} className="-mx-2 flex items-start gap-3 rounded-xl px-2 py-3 hover:bg-forest-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal">
                    <span className={cn('mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', r.kind === 'hydroponic' ? 'bg-[#E0F4F2] text-[#0B6B63]' : 'bg-water-50 text-water-700')} aria-hidden>
                      {r.kind === 'hydroponic' ? <FlaskConical className="h-4 w-4" /> : <Droplets className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-ink">{bi(r.title_en, r.title_ar)}</span>
                        {r.amount_l !== null ? <Badge tone="water" size="xs">{fmtLitres(r.amount_l, lang)}</Badge> : null}
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-sm text-muted">{bi(r.summary_en, r.summary_ar)}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted">{fmtRelative(r.created_at, lang)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact icon={<Lightbulb className="h-6 w-6" />} title={t('dash.recs.empty')} hint={t('dash.recs.emptyHint')} action={<ButtonLink to="/irrigation" size="sm">{t('dash.action.irrigate')}</ButtonLink>} />
          )}
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader
            title={t('dash.alerts.title')}
            icon={<AlertTriangle className="h-4 w-4" />}
            actions={<Link to="/alerts" className="inline-flex items-center gap-1 text-sm font-medium text-teal hover:underline">{t('common.viewAll')}<ArrowUpRight className="flip-rtl h-3.5 w-3.5" aria-hidden /></Link>}
          />
          {data.counts.open_alerts ? (
            <>
              <div className="mb-4 grid grid-cols-3 gap-2">
                {sevOrder.map((s) => (
                  <div key={s} className="rounded-xl border border-line p-3">
                    <div className="flex items-center gap-1.5 text-xs text-muted">
                      <span className={cn('h-2 w-2 rounded-full', severityStripe(s))} aria-hidden />
                      {labelSeverity(t, s)}
                    </div>
                    <p className="tabular mt-1 text-xl font-semibold text-ink">{fmtInt(data.alerts.by_severity[s] ?? 0, lang)}</p>
                  </div>
                ))}
              </div>
              <ul className="space-y-2">
                {data.alerts.latest.slice(0, 4).map((a) => (
                  <li key={a.id} className="relative overflow-hidden rounded-xl border border-line py-2.5 pe-3 ps-4">
                    <span className={cn('absolute inset-y-0 start-0 w-1', severityStripe(a.severity))} aria-hidden />
                    <p className="flex items-center justify-between gap-2 text-sm font-medium text-ink">
                      <span className="truncate">{bi(a.title_en, a.title_ar)}</span>
                      <span className="shrink-0 font-mono text-[11px] text-muted" dir="ltr">{a.rule_code}</span>
                    </p>
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted">{bi(a.message_en, a.message_ar)}</p>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <EmptyState compact icon={<Bell className="h-6 w-6" />} title={t('dash.alerts.empty')} hint={t('dash.alerts.emptyHint')} />
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title={t('dash.weather.title')} icon={<CloudSun className="h-4 w-4" />} />
          {data.weather.length ? (
            <ul className="space-y-2.5">
              {data.weather.map((w) => (
                <li key={w.farm_id} className="flex items-center justify-between gap-3 rounded-xl bg-canvas px-3 py-2.5">
                  <span className="flex min-w-0 items-center gap-2">
                    {w.status === 'unavailable' ? <CloudOff className="h-4 w-4 shrink-0 text-muted" aria-hidden /> : <CloudSun className="h-4 w-4 shrink-0 text-water-700" aria-hidden />}
                    <span className="truncate text-sm font-medium text-ink">{w.farm}</span>
                  </span>
                  <Badge tone={weatherTone(w.status)} dot size="xs">
                    {labelWeatherStatus(t, w.status)}
                    {w.age_hours !== null ? ` · ${t('weather.ageH', { h: fmtNumber(w.age_hours, lang, 1) })}` : ''}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">—</p>
          )}
          <Link to="/weather" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-teal hover:underline">
            {t('dash.weather.open')}
            <ArrowUpRight className="flip-rtl h-3.5 w-3.5" aria-hidden />
          </Link>
        </Card>

        <Card>
          <CardHeader title={t('dash.hydro.title')} icon={<FlaskConical className="h-4 w-4" />} />
          {data.hydroponics.length ? (
            <ul className="space-y-2.5">
              {data.hydroponics.map((h) => (
                <li key={h.id}>
                  <Link to={`/hydroponics/${h.id}`} className="block rounded-xl border border-line px-3 py-2.5 hover:border-forest-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-ink">{h.name}</span>
                      <span className="text-xs text-muted">{labelHydroType(t, h.type)}</span>
                    </span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="tabular rounded-md bg-canvas px-1.5 py-0.5" dir="ltr">pH {h.last_ph !== null ? fmtNumber(h.last_ph, lang, 2) : '—'}</span>
                      <span className="tabular rounded-md bg-canvas px-1.5 py-0.5" dir="ltr">EC {h.last_ec !== null ? fmtNumber(h.last_ec, lang, 2) : '—'}</span>
                      {h.in_range === null ? (
                        <Badge tone="neutral" size="xs">{h.last_record_at ? t('hydro.rangeNotConfigured') : t('hydro.noRecords')}</Badge>
                      ) : h.in_range ? (
                        <Badge tone="emerald" size="xs" dot>{t('hydro.inRange')}</Badge>
                      ) : (
                        <Badge tone="warning" size="xs" dot>{t('hydro.outOfRange')}</Badge>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact icon={<FlaskConical className="h-6 w-6" />} title={t('dash.hydro.empty')} hint={t('dash.hydro.emptyHint')} action={<ButtonLink to="/hydroponics" size="sm">{t('dash.hydro.go')}</ButtonLink>} />
          )}
        </Card>

        <Card>
          <CardHeader title={t('dash.actions.title')} subtitle={t('dash.actions.subtitle')} icon={<Waves className="h-4 w-4" />} />
          {actions.length ? (
            <ul className="space-y-3">
              {actions.map(([action, n]) => {
                const max = Math.max(...actions.map(([, v]) => v));
                return (
                  <li key={action}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-ink">{labelAction(t, action)}</span>
                      <span className="tabular font-semibold text-ink">{fmtInt(n, lang)}</span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-canvas">
                      <div className="h-2 rounded-full bg-teal" style={{ width: `${(n / max) * 100}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState compact icon={<Waves className="h-6 w-6" />} title={t('dash.actions.empty')} hint={t('dash.actions.emptyHint')} />
          )}
        </Card>
      </div>
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div role="status" aria-busy="true">
      <Skeleton className="mb-6 h-36 w-full rounded-3xl" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <SkeletonCards count={3} className="mt-6" />
    </div>
  );
}

export default function DashboardPage() {
  const { t } = useI18n();
  const q = useQuery({ queryKey: qk.dashboard, queryFn: dashboardService.summary });
  if (q.isPending) return <DashboardSkeleton />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const data = q.data;
  if (data.empty) {
    return (
      <div className="card overflow-hidden">
        <div className="h-2 bg-gradient-to-r from-forest-700 to-teal" aria-hidden />
        <EmptyState
          icon={<Tractor className="h-8 w-8" />}
          title={t('dash.empty.title')}
          hint={t('dash.empty.hint')}
          action={
            <ButtonLink to="/farms?new=1" size="lg" icon={<Plus className="h-4 w-4" aria-hidden />}>
              {t('dash.empty.action')}
            </ButtonLink>
          }
        />
      </div>
    );
  }
  return <DashboardContent data={data} />;
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CloudOff, CloudRain, Droplets, Info, RefreshCw, Thermometer, Wind } from 'lucide-react';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Skeleton, Table, useToast } from '../ui';
import { qk } from '../../hooks/queries';
import { useI18n } from '../../i18n';
import { weatherService } from '../../services/weather';
import type { UUID, WeatherSnapshot } from '../../types/api';
import { errorText } from '../../utils/errors';
import { fmtDate, fmtDateTime, fmtNumber, isNum } from '../../utils/format';
import { labelWeatherStatus, weatherTone } from '../../utils/labels';
import { serverText } from '../../utils/serverText';

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function DailyTable({ snapshot }: { snapshot: WeatherSnapshot }) {
  const { t, lang } = useI18n();
  const d = snapshot.daily ?? {};
  const days = (d.time ?? []) as string[];
  const rows = days.map((day, i) => ({
    day,
    et0: num(d.et0_fao_evapotranspiration?.[i]),
    p: num(d.precipitation_sum?.[i]),
    prob: num(d.precipitation_probability_max?.[i]),
    tmax: num(d.temperature_2m_max?.[i]),
    tmin: num(d.temperature_2m_min?.[i]),
    wind: num(d.wind_speed_10m_max?.[i]),
  }));
  return (
    <Table
      caption={t('weather.daily')}
      rows={rows}
      rowKey={(r) => r.day}
      columns={[
        { key: 'day', header: t('common.date'), primary: true, cell: (r) => fmtDate(r.day, lang, { weekday: 'short', day: 'numeric', month: 'short' }) },
        { key: 'et0', header: t('weather.col.et0'), align: 'end', cell: (r) => <span className="tabular">{fmtNumber(r.et0, lang, 2)}</span> },
        { key: 'p', header: t('weather.col.precip'), align: 'end', cell: (r) => <span className="tabular">{fmtNumber(r.p, lang, 1)}</span> },
        { key: 'prob', header: t('weather.col.prob'), align: 'end', cell: (r) => <span className="tabular">{isNum(r.prob) ? `${fmtNumber(r.prob, lang, 0)}%` : '—'}</span> },
        { key: 't', header: t('weather.col.temp'), align: 'end', cell: (r) => <span className="tabular" dir="ltr">{fmtNumber(r.tmax, lang, 1)} / {fmtNumber(r.tmin, lang, 1)}</span> },
        { key: 'wind', header: t('weather.col.wind'), align: 'end', cell: (r) => <span className="tabular">{fmtNumber(r.wind, lang, 1)}</span> },
      ]}
    />
  );
}

export function WeatherPanel({ farmId, showHistory = true }: { farmId: UUID; showHistory?: boolean }) {
  const { t, lang } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const weather = useQuery({ queryKey: qk.weather(farmId), queryFn: () => weatherService.get(farmId) });
  const snaps = useQuery({ queryKey: qk.snapshots(farmId), queryFn: () => weatherService.snapshots(farmId, 10), enabled: showHistory });

  const refresh = useMutation({
    mutationFn: () => weatherService.refresh(farmId),
    onSuccess: (data) => {
      qc.setQueryData(qk.weather(farmId), data);
      void qc.invalidateQueries({ queryKey: qk.snapshots(farmId) });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
      if (data.status === 'fresh') toast.success(t('weather.toast.fresh'));
      else toast.warning(t('weather.toast.notFresh'), data.message);
    },
    onError: (err) => toast.error(t('weather.toast.failed'), errorText(err, t)),
  });

  if (weather.isPending) return <Skeleton className="h-48 w-full rounded-2xl" />;
  if (weather.isError) return <ErrorState error={weather.error} onRetry={() => void weather.refetch()} />;
  const w = weather.data;
  const cur = w.snapshot?.current ?? {};

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={weatherTone(w.status, w.stale)} dot>
                {labelWeatherStatus(t, w.status)}
              </Badge>
              {w.status === 'cached' && w.age_hours !== null ? (
                <Badge tone="outline">{t('weather.ageH', { h: fmtNumber(w.age_hours, lang, 1) })}</Badge>
              ) : null}
              {w.stale ? <Badge tone="warning">{t('weatherStatus.stale')}</Badge> : null}
            </div>
            <p className="mt-2 max-w-2xl text-sm text-muted" dir="auto">
              {serverText(w.message, lang, t)}
            </p>
          </div>
          <Button variant="secondary" size="sm" loading={refresh.isPending} icon={<RefreshCw className="h-4 w-4" aria-hidden />} onClick={() => refresh.mutate()}>
            {t('weather.refresh')}
          </Button>
        </div>

        {w.snapshot ? (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { icon: <Thermometer className="h-4 w-4" />, label: t('weather.cur.temp'), value: `${fmtNumber(num(cur.temperature_2m), lang, 1)} °C` },
              { icon: <Droplets className="h-4 w-4" />, label: t('weather.cur.rh'), value: `${fmtNumber(num(cur.relative_humidity_2m), lang, 0)} %` },
              { icon: <Wind className="h-4 w-4" />, label: t('weather.cur.wind'), value: `${fmtNumber(num(cur.wind_speed_10m), lang, 1)} m/s` },
              { icon: <CloudRain className="h-4 w-4" />, label: t('weather.cur.precip'), value: `${fmtNumber(num(cur.precipitation), lang, 1)} mm` },
            ].map((c) => (
              <div key={c.label} className="rounded-xl bg-canvas p-3">
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  <span className="text-water-700" aria-hidden>{c.icon}</span>
                  {c.label}
                </p>
                <p className="tabular mt-1 text-lg font-semibold text-ink" dir="ltr">
                  {c.value}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState compact icon={<CloudOff className="h-6 w-6" />} title={t('weather.none.title')} hint={t('weather.none.hint')} />
        )}

        <p className="mt-4 flex items-start gap-2 rounded-xl border border-water/20 bg-water-50 px-3 py-2.5 text-sm text-water-700">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {t('weather.rhNote')}
        </p>
      </Card>

      {w.snapshot ? (
        <Card>
          <CardHeader title={t('weather.daily')} subtitle={t('weather.fetchedAt', { when: fmtDateTime(w.snapshot.fetched_at, lang), provider: w.snapshot.provider })} />
          <DailyTable snapshot={w.snapshot} />
        </Card>
      ) : null}

      {showHistory ? (
        <Card>
          <CardHeader title={t('weather.history')} subtitle={t('weather.historyHint')} />
          {snaps.isPending ? (
            <Skeleton className="h-20 w-full" />
          ) : snaps.isError ? (
            <ErrorState compact error={snaps.error} onRetry={() => void snaps.refetch()} />
          ) : snaps.data.length === 0 ? (
            <EmptyState compact icon={<CloudOff className="h-6 w-6" />} title={t('weather.history.empty')} hint={t('weather.history.emptyHint')} />
          ) : (
            <Table
              rows={snaps.data}
              rowKey={(s) => s.id}
              caption={t('weather.history')}
              columns={[
                { key: 'when', header: t('weather.col.fetched'), primary: true, cell: (s) => fmtDateTime(s.fetched_at, lang) },
                { key: 'provider', header: t('weather.col.provider'), cell: (s) => s.provider },
                { key: 'days', header: t('weather.col.days'), align: 'end', cell: (s) => <span className="tabular">{(s.daily?.time ?? []).length}</span> },
                { key: 'vars', header: t('weather.col.variables'), cell: (s) => s.variables_set ?? '—' },
              ]}
            />
          )}
        </Card>
      ) : null}
    </div>
  );
}

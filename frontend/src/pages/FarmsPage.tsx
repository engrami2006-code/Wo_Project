import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Droplets, FlaskConical, MapPin, Pencil, Plus, Search, Sprout, Tractor, Trash2 } from 'lucide-react';
import { FarmFormModal } from '../components/forms/FarmFormModal';
import { Badge, Button, ConfirmDialog, EmptyState, ErrorState, IconButton, Input, PageHeader, SkeletonCards, useToast } from '../components/ui';
import { qk, useFarms } from '../hooks/queries';
import { useAuth } from '../hooks/useAuth';
import { useI18n } from '../i18n';
import { farmService } from '../services/farms';
import type { FarmSummary } from '../types/api';
import { errorText } from '../utils/errors';
import { fmtArea, fmtInt, fmtLitres, fmtNumber } from '../utils/format';
import { labelWaterSource } from '../utils/labels';

export default function FarmsPage() {
  const { t, lang } = useI18n();
  const { canCreateFarm, canEditFarm, canDeleteFarm } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const farms = useFarms();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<FarmSummary | null>(null);
  const [deleting, setDeleting] = useState<FarmSummary | null>(null);
  const creating = params.get('new') === '1';

  const closeCreate = () => {
    params.delete('new');
    setParams(params, { replace: true });
  };

  const del = useMutation({
    mutationFn: (id: string) => farmService.remove(id),
    onSuccess: () => {
      toast.success(t('farms.toast.deleted'), deleting?.name);
      setDeleting(null);
      void qc.invalidateQueries({ queryKey: qk.farms });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
    },
    onError: (err) => toast.error(t('farms.toast.deleteFailed'), errorText(err, t)),
  });

  const items = useMemo(() => {
    const all = farms.data?.items ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((f) => f.name.toLowerCase().includes(q) || (f.location_name ?? '').toLowerCase().includes(q));
  }, [farms.data, search]);

  return (
    <div>
      <PageHeader
        icon={<Tractor className="h-6 w-6" />}
        title={t('farms.title')}
        description={t('farms.description')}
        actions={
          canCreateFarm ? (
            <Button icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setParams({ new: '1' })}>
              {t('farms.create')}
            </Button>
          ) : null
        }
      />

      {farms.isPending ? (
        <SkeletonCards count={3} />
      ) : farms.isError ? (
        <ErrorState error={farms.error} onRetry={() => void farms.refetch()} />
      ) : (farms.data?.items.length ?? 0) === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Tractor className="h-7 w-7" />}
            title={t('farms.empty.title')}
            hint={canCreateFarm ? t('farms.empty.hint') : t('farms.empty.hintMember')}
            action={
              canCreateFarm ? (
                <Button icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setParams({ new: '1' })}>
                  {t('farms.create')}
                </Button>
              ) : null
            }
          />
        </div>
      ) : (
        <>
          <div className="mb-5 max-w-sm">
            <label className="relative block">
              <span className="sr-only">{t('farms.search')}</span>
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('farms.search')} className="ps-9" />
            </label>
          </div>
          {items.length === 0 ? (
            <div className="card">
              <EmptyState compact icon={<Search className="h-6 w-6" />} title={t('common.noMatches')} hint={t('common.noMatchesHint')} />
            </div>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((f) => (
                <li key={f.id} className="card hover-lift relative flex flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-semibold text-ink">
                        <Link to={`/farms/${f.id}`} className="after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-teal">
                          {f.name}
                        </Link>
                      </h2>
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
                        <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        <span className="truncate">
                          {f.location_name ? `${f.location_name} — ` : ''}
                          <span dir="ltr">
                            {fmtNumber(f.latitude, lang, 4)}, {fmtNumber(f.longitude, lang, 4)}
                          </span>
                        </span>
                      </p>
                    </div>
                    {f.is_demo ? <Badge tone="warning">DEMO</Badge> : null}
                  </div>

                  <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl bg-canvas px-2 py-2.5">
                      <dt className="flex items-center justify-center gap-1 text-xs text-muted">
                        <Sprout className="h-3.5 w-3.5" aria-hidden />
                        {t('farms.card.plantings')}
                      </dt>
                      <dd className="tabular mt-0.5 text-lg font-semibold text-ink">{fmtInt(f.plantings_count, lang)}</dd>
                    </div>
                    <div className="rounded-xl bg-canvas px-2 py-2.5">
                      <dt className="flex items-center justify-center gap-1 text-xs text-muted">
                        <FlaskConical className="h-3.5 w-3.5" aria-hidden />
                        {t('farms.card.systems')}
                      </dt>
                      <dd className="tabular mt-0.5 text-lg font-semibold text-ink">{fmtInt(f.hydro_systems_count, lang)}</dd>
                    </div>
                    <div className="rounded-xl bg-canvas px-2 py-2.5">
                      <dt className="flex items-center justify-center gap-1 text-xs text-muted">
                        <Bell className="h-3.5 w-3.5" aria-hidden />
                        {t('farms.card.alerts')}
                      </dt>
                      <dd className={`tabular mt-0.5 text-lg font-semibold ${f.open_alerts ? 'text-[#B45309]' : 'text-ink'}`}>{fmtInt(f.open_alerts, lang)}</dd>
                    </div>
                  </dl>

                  <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                    <span>{t('farms.card.area')}: <span className="text-ink">{fmtArea(f.total_area_m2, lang, 0)}</span></span>
                    <span className="inline-flex items-center gap-1">
                      <Droplets className="h-3.5 w-3.5" aria-hidden />
                      {f.water_source ? labelWaterSource(t, f.water_source) : t('common.notSet')}
                    </span>
                    {f.daily_water_allowance_l != null ? (
                      <span>{t('farms.card.allowance')}: <span className="text-ink">{fmtLitres(f.daily_water_allowance_l, lang)}</span></span>
                    ) : null}
                  </div>

                  {canEditFarm || canDeleteFarm ? (
                    <div className="relative z-10 mt-4 flex justify-end gap-1 border-t border-line pt-3">
                      {canEditFarm ? (
                        <IconButton label={t('farms.editNamed', { name: f.name })} size="sm" onClick={() => setEditing(f)}>
                          <Pencil className="h-4 w-4" />
                        </IconButton>
                      ) : null}
                      {canDeleteFarm ? (
                        <IconButton label={t('farms.deleteNamed', { name: f.name })} size="sm" tone="danger" onClick={() => setDeleting(f)}>
                          <Trash2 className="h-4 w-4" />
                        </IconButton>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <FarmFormModal open={creating} onClose={closeCreate} />
      <FarmFormModal open={!!editing} farm={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={!!deleting}
        title={t('farms.delete.title')}
        message={t('farms.delete.message', { name: deleting?.name ?? '' })}
        confirmLabel={t('farms.delete.confirm')}
        loading={del.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && del.mutate(deleting.id)}
      />
    </div>
  );
}

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FlaskConical, Pencil, Plus, Recycle, Trash2 } from 'lucide-react';
import { HydroSystemModal } from '../components/forms/HydroSystemModal';
import { HydroTypeIcon } from '../components/hydro/HydroTypeIcon';
import { Badge, Button, ConfirmDialog, EmptyState, ErrorState, IconButton, PageHeader, SkeletonCards, useToast } from '../components/ui';
import { qk, useHydroSystems } from '../hooks/queries';
import { useAuth } from '../hooks/useAuth';
import { useFarmContext } from '../hooks/useFarmContext';
import { useI18n } from '../i18n';
import { hydroService } from '../services/hydro';
import { HYDRO_TYPES } from '../types/api';
import type { HydroSystem, HydroSystemType } from '../types/api';
import { cn } from '../utils/cn';
import { errorText } from '../utils/errors';
import { fmtInt, fmtLitres, fmtNumber, fmtRelative } from '../utils/format';
import { labelHydroType, labelSystemStatus } from '../utils/labels';

function rangeState(s: HydroSystem): 'none' | 'notConfigured' | 'in' | 'out' {
  const r = s.latest_record;
  if (!r) return 'none';
  if (s.ph_min === null || s.ph_max === null || s.ec_min === null || s.ec_max === null) return 'notConfigured';
  const phOk = r.ph === null || (r.ph >= s.ph_min && r.ph <= s.ph_max);
  const ecOk = r.ec === null || (r.ec >= s.ec_min && r.ec <= s.ec_max);
  return phOk && ecOk ? 'in' : 'out';
}

function SystemCard({ s, onEdit, onDelete }: { s: HydroSystem; onEdit?: () => void; onDelete?: () => void }) {
  const { t, lang } = useI18n();
  const r = s.latest_record;
  const state = rangeState(s);
  return (
    <li className="card hover-lift relative flex flex-col p-5">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#E0F4F2] text-[#0B6B63]">
          <HydroTypeIcon type={s.system_type} className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-ink">
            <Link to={`/hydroponics/${s.id}`} className="after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-teal">
              {s.name}
            </Link>
          </h2>
          <p className="text-sm text-muted">{labelHydroType(t, s.system_type)}</p>
        </div>
        <Badge tone={s.status === 'active' ? 'emerald' : s.status === 'maintenance' ? 'warning' : 'neutral'} dot size="xs">
          {labelSystemStatus(t, s.status)}
        </Badge>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-canvas py-2">
          <dt className="text-[11px] text-muted">pH</dt>
          <dd className="tabular font-semibold text-ink">{fmtNumber(r?.ph, lang, 2)}</dd>
        </div>
        <div className="rounded-xl bg-canvas py-2">
          <dt className="text-[11px] text-muted" dir="ltr">EC</dt>
          <dd className="tabular font-semibold text-ink">{fmtNumber(r?.ec, lang, 2)}</dd>
        </div>
        <div className="rounded-xl bg-canvas py-2">
          <dt className="text-[11px] text-muted">{t('hydro.card.plants')}</dt>
          <dd className="tabular font-semibold text-ink">{fmtInt(s.plant_count, lang)}</dd>
        </div>
      </dl>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {state === 'in' ? <Badge tone="emerald" dot size="xs">{t('hydro.inRange')}</Badge> : null}
        {state === 'out' ? <Badge tone="warning" dot size="xs">{t('hydro.outOfRange')}</Badge> : null}
        {state === 'notConfigured' ? <Badge tone="neutral" size="xs">{t('hydro.rangeNotConfigured')}</Badge> : null}
        {state === 'none' ? <Badge tone="outline" size="xs">{t('hydro.noRecords')}</Badge> : null}
        <Badge tone={s.is_closed_loop ? 'teal' : 'outline'} size="xs" icon={s.is_closed_loop ? <Recycle className="h-3 w-3" aria-hidden /> : undefined}>
          {s.is_closed_loop ? t('hydro.closedLoop') : t('hydro.openLoop')}
        </Badge>
      </div>
      <p className="mt-3 text-xs text-muted">
        {t('hydro.card.capacity', { v: fmtLitres(s.reservoir_capacity_l, lang, { maxFrac: 0 }) })} — {t('hydro.card.records', { n: fmtInt(s.records_count, lang) })}
        {r ? ` — ${fmtRelative(r.recorded_at, lang)}` : ''}
      </p>
      {onEdit || onDelete ? (
        <div className="relative z-10 mt-3 flex justify-end gap-1 border-t border-line pt-2">
          {onEdit ? (
            <IconButton size="sm" label={t('common.edit')} onClick={onEdit}>
              <Pencil className="h-4 w-4" />
            </IconButton>
          ) : null}
          {onDelete ? (
            <IconButton size="sm" tone="danger" label={t('common.delete')} onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </IconButton>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export default function HydroponicsPage() {
  const { t, lang } = useI18n();
  const { canEditFarm, canDeleteFarm } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { farmId, farms } = useFarmContext();
  const [scope, setScope] = useState<'farm' | 'all'>('farm');
  const systems = useHydroSystems(scope === 'farm' ? farmId ?? undefined : undefined);
  const [type, setType] = useState<HydroSystemType | 'all'>('all');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<HydroSystem | null>(null);
  const [deleting, setDeleting] = useState<HydroSystem | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of systems.data ?? []) c[s.system_type] = (c[s.system_type] ?? 0) + 1;
    return c;
  }, [systems.data]);
  const list = (systems.data ?? []).filter((s) => type === 'all' || s.system_type === type);

  const del = useMutation({
    mutationFn: (id: string) => hydroService.remove(id),
    onSuccess: () => {
      toast.success(t('hydro.toast.deleted'));
      setDeleting(null);
      void qc.invalidateQueries({ queryKey: ['hydro-systems'] });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
    },
    onError: (err) => toast.error(t('hydro.toast.deleteFailed'), errorText(err, t)),
  });

  return (
    <div>
      <PageHeader
        icon={<FlaskConical className="h-6 w-6" />}
        title={t('hydro.title')}
        description={t('hydro.description')}
        actions={
          canEditFarm && farms.length ? (
            <Button icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setCreating(true)}>
              {t('hydro.create')}
            </Button>
          ) : null
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label={t('hydro.scope')} className="inline-flex rounded-xl border border-line bg-canvas p-1">
          {(['farm', 'all'] as const).map((sc) => (
            <button
              key={sc}
              type="button"
              role="radio"
              aria-checked={scope === sc}
              onClick={() => setScope(sc)}
              className={cn('rounded-lg px-3 py-1.5 text-sm font-medium', scope === sc ? 'bg-surface text-forest-700 shadow-sm' : 'text-muted hover:text-ink')}
            >
              {sc === 'farm' ? t('hydro.scope.farm') : t('hydro.scope.all')}
            </button>
          ))}
        </div>
      </div>

      <div className="scrollbar-thin -mx-1 mb-6 flex gap-2 overflow-x-auto px-1 pb-1 md:flex-wrap md:overflow-visible" role="toolbar" aria-label={t('hydro.types')}>
        <button
          type="button"
          aria-pressed={type === 'all'}
          onClick={() => setType('all')}
          className={cn('inline-flex shrink-0 items-center gap-2 rounded-2xl border px-3.5 py-2 text-sm font-medium transition-colors', type === 'all' ? 'border-forest-700 bg-forest-700 text-white' : 'border-line bg-surface text-ink hover:border-forest-200')}
        >
          {t('common.all')}
          <span className="tabular text-xs opacity-75">{fmtInt(systems.data?.length ?? 0, lang)}</span>
        </button>
        {HYDRO_TYPES.map((ty) => (
          <button
            key={ty}
            type="button"
            aria-pressed={type === ty}
            onClick={() => setType(ty)}
            className={cn(
              'inline-flex shrink-0 items-center gap-2 rounded-2xl border px-3.5 py-2 text-sm font-medium transition-colors',
              type === ty ? 'border-teal bg-[#E0F4F2] text-[#0B6B63]' : 'border-line bg-surface text-ink hover:border-forest-200',
              !counts[ty] && type !== ty && 'text-muted',
            )}
          >
            <HydroTypeIcon type={ty} className="h-4 w-4" />
            {labelHydroType(t, ty)}
            <span className="tabular text-xs opacity-75">{fmtInt(counts[ty] ?? 0, lang)}</span>
          </button>
        ))}
      </div>

      {systems.isPending ? (
        <SkeletonCards count={3} />
      ) : systems.isError ? (
        <ErrorState error={systems.error} onRetry={() => void systems.refetch()} />
      ) : list.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<FlaskConical className="h-7 w-7" />}
            title={type === 'all' ? t('hydro.empty.title') : t('hydro.empty.type', { type: labelHydroType(t, type) })}
            hint={t('hydro.empty.hint')}
            action={canEditFarm && farms.length ? <Button icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setCreating(true)}>{t('hydro.create')}</Button> : null}
          />
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((s) => (
            <SystemCard key={s.id} s={s} onEdit={canEditFarm ? () => setEditing(s) : undefined} onDelete={canDeleteFarm ? () => setDeleting(s) : undefined} />
          ))}
        </ul>
      )}

      <HydroSystemModal open={creating} onClose={() => setCreating(false)} />
      <HydroSystemModal open={!!editing} system={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={!!deleting}
        title={t('hydro.delete.title')}
        message={t('hydro.delete.message', { name: deleting?.name ?? '' })}
        confirmLabel={t('common.delete')}
        loading={del.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && del.mutate(deleting.id)}
      />
    </div>
  );
}

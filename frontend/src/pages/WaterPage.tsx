import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Droplets, Filter, Plus, Trash2, X } from 'lucide-react';
import { WaterRecordModal } from '../components/forms/WaterRecordModal';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  Input,
  PageHeader,
  Pagination,
  Select,
  SkeletonTable,
  Table,
  useToast,
} from '../components/ui';
import { qk, useHydroSystems, usePlantings } from '../hooks/queries';
import { useAuth } from '../hooks/useAuth';
import { useFarmContext } from '../hooks/useFarmContext';
import { useI18n } from '../i18n';
import { waterService } from '../services/water';
import type { WaterRecord } from '../types/api';
import { errorText } from '../utils/errors';
import { fmtDateTime, fmtLitres } from '../utils/format';
import { labelRecordType, labelWaterSource } from '../utils/labels';

const PAGE_SIZE = 25;

export default function WaterPage() {
  const { t, lang, bi } = useI18n();
  const { canDelete } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { farms, farmId: ctxFarm } = useFarmContext();
  const [params, setParams] = useSearchParams();
  const [farmId, setFarmId] = useState<string>(ctxFarm ?? '');
  const [plantingId, setPlantingId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState<WaterRecord | null>(null);
  const adding = params.get('new') === '1';
  const plantings = usePlantings(farmId || null);
  const systems = useHydroSystems(farmId || undefined);

  const filters = useMemo(
    () => ({ farm_id: farmId || undefined, farm_crop_id: plantingId || undefined, date_from: from || undefined, date_to: to || undefined, page, size: PAGE_SIZE }),
    [farmId, plantingId, from, to, page],
  );
  const records = useQuery({ queryKey: qk.waterRecords(filters), queryFn: () => waterService.records(filters), placeholderData: keepPreviousData });

  const del = useMutation({
    mutationFn: (id: string) => waterService.removeRecord(id),
    onSuccess: () => {
      toast.success(t('water.toast.deleted'));
      setDeleting(null);
      void qc.invalidateQueries({ queryKey: ['water-records'] });
      void qc.invalidateQueries({ queryKey: ['analytics'] });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
    },
    onError: (err) => toast.error(t('water.toast.deleteFailed'), errorText(err, t)),
  });

  const farmName = (id: string) => farms.find((f) => f.id === id)?.name ?? '—';
  const targetName = (r: WaterRecord) => {
    if (r.farm_crop_id) {
      const p = plantings.data?.find((x) => x.id === r.farm_crop_id);
      return p ? bi(p.crop.name_en, p.crop.name_ar) : t('water.target.planting');
    }
    if (r.hydroponic_system_id) {
      const s = systems.data?.find((x) => x.id === r.hydroponic_system_id);
      return s ? s.name : t('water.target.system');
    }
    return t('water.target.farm');
  };
  const filtered = !!(plantingId || from || to);
  const resetPage = () => setPage(1);

  return (
    <div>
      <PageHeader
        icon={<Droplets className="h-6 w-6" />}
        title={t('water.title')}
        description={t('water.description')}
        actions={
          <Button icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setParams({ new: '1' })} disabled={farms.length === 0}>
            {t('water.add')}
          </Button>
        }
      />

      <Card className="mb-5" padded={false}>
        <div className="flex flex-wrap items-end gap-3 p-4">
          <span className="mb-2.5 hidden items-center gap-1.5 text-sm font-medium text-muted md:inline-flex">
            <Filter className="h-4 w-4" aria-hidden />
            {t('common.filters')}
          </span>
          <Field label={t('common.farm')} className="w-full sm:w-48">
            <Select
              value={farmId}
              onChange={(e) => {
                setFarmId(e.target.value);
                setPlantingId('');
                resetPage();
              }}
            >
              <option value="">{t('common.allFarms')}</option>
              {farms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('water.field.planting')} className="w-full sm:w-48">
            <Select
              value={plantingId}
              disabled={!farmId}
              onChange={(e) => {
                setPlantingId(e.target.value);
                resetPage();
              }}
            >
              <option value="">{t('common.all')}</option>
              {(plantings.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {bi(p.crop.name_en, p.crop.name_ar)}
                  {p.variety ? ` — ${p.variety}` : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('common.from')} className="w-[calc(50%-0.375rem)] sm:w-40">
            <Input type="date" value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); resetPage(); }} />
          </Field>
          <Field label={t('common.to')} className="w-[calc(50%-0.375rem)] sm:w-40">
            <Input type="date" value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); resetPage(); }} />
          </Field>
          {filtered ? (
            <Button
              variant="ghost"
              size="sm"
              className="mb-0.5"
              icon={<X className="h-4 w-4" aria-hidden />}
              onClick={() => {
                setPlantingId('');
                setFrom('');
                setTo('');
                resetPage();
              }}
            >
              {t('common.clearFilters')}
            </Button>
          ) : null}
        </div>
      </Card>

      {records.isPending ? (
        <SkeletonTable rows={6} />
      ) : records.isError ? (
        <ErrorState error={records.error} onRetry={() => void records.refetch()} />
      ) : records.data.items.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Droplets className="h-7 w-7" />}
            title={filtered ? t('common.noMatches') : t('water.empty.title')}
            hint={filtered ? t('common.noMatchesHint') : t('water.empty.hint')}
            action={!filtered && farms.length ? <Button icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setParams({ new: '1' })}>{t('water.add')}</Button> : null}
          />
        </div>
      ) : (
        <Card padded={false} className="p-2 sm:p-3">
          <Table
            caption={t('water.title')}
            rows={records.data.items}
            rowKey={(r) => r.id}
            columns={[
              { key: 'when', header: t('water.col.when'), primary: true, cell: (r) => <span className="whitespace-nowrap">{fmtDateTime(r.recorded_at, lang)}</span> },
              { key: 'farm', header: t('common.farm'), cell: (r) => farmName(r.farm_id) },
              { key: 'target', header: t('water.col.target'), cell: (r) => targetName(r) },
              { key: 'vol', header: t('water.col.volume'), align: 'end', cell: (r) => <span className="tabular font-semibold">{fmtLitres(r.volume_l, lang)}</span> },
              { key: 'type', header: t('water.col.type'), cell: (r) => <Badge tone={r.record_type === 'hydroponic' ? 'teal' : r.record_type === 'irrigation' ? 'water' : 'neutral'} size="xs">{labelRecordType(t, r.record_type)}</Badge> },
              { key: 'source', header: t('water.col.source'), cell: (r) => labelWaterSource(t, r.source) },
              { key: 'notes', header: t('common.notes'), hideOnMobile: true, cell: (r) => <span className="line-clamp-1 max-w-[14rem] text-muted" dir="auto" title={r.notes ?? undefined}>{r.notes || '—'}</span> },
              ...(canDelete
                ? [
                    {
                      key: 'x',
                      header: <span className="sr-only">{t('common.actions')}</span>,
                      align: 'end' as const,
                      cell: (r: WaterRecord) => (
                        <IconButton size="sm" tone="danger" label={t('common.delete')} onClick={() => setDeleting(r)}>
                          <Trash2 className="h-4 w-4" />
                        </IconButton>
                      ),
                    },
                  ]
                : []),
            ]}
          />
          <div className="px-2 pb-1">
            <Pagination page={page} size={PAGE_SIZE} total={records.data.total} onChange={setPage} />
          </div>
        </Card>
      )}

      <WaterRecordModal
        open={adding}
        defaultFarmId={farmId || null}
        onClose={() => {
          params.delete('new');
          setParams(params, { replace: true });
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        title={t('water.delete.title')}
        message={deleting ? t('water.delete.message', { volume: fmtLitres(deleting.volume_l, lang), when: fmtDateTime(deleting.recorded_at, lang) }) : ''}
        confirmLabel={t('common.delete')}
        loading={del.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && del.mutate(deleting.id)}
      />
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CloudSun,
  Droplets,
  LayoutDashboard,
  Pencil,
  Plus,
  Sprout,
  Tractor,
  Trash2,
  UserPlus,
  Users,
  Waves,
} from 'lucide-react';
import { FarmFormModal } from '../components/forms/FarmFormModal';
import { PlantingFormModal } from '../components/forms/PlantingFormModal';
import { WaterRecordModal } from '../components/forms/WaterRecordModal';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  KeyValue,
  PageHeader,
  Select,
  Skeleton,
  SkeletonTable,
  StatTile,
  Table,
  TabPanel,
  Tabs,
  useToast,
} from '../components/ui';
import { WeatherPanel } from '../components/weather/WeatherPanel';
import { StageChip } from '../components/farm/StageChip';
import { qk, usePlantings } from '../hooks/queries';
import { useAuth } from '../hooks/useAuth';
import { useFarmContext } from '../hooks/useFarmContext';
import { useI18n } from '../i18n';
import { userService } from '../services/admin';
import { farmService } from '../services/farms';
import { waterService } from '../services/water';
import type { Farm, Planting, UUID } from '../types/api';
import { errorText } from '../utils/errors';
import { fmtArea, fmtDate, fmtDateTime, fmtInt, fmtLitres, fmtNumber, fmtPercent } from '../utils/format';
import { labelRecordType, labelRole, labelWaterSource } from '../utils/labels';

type TabKey = 'overview' | 'plantings' | 'water' | 'weather' | 'members';

function PlantingsTab({ farm }: { farm: Farm }) {
  const { t, lang, bi } = useI18n();
  const { canEditFarm } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const plantings = usePlantings(farm.id);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Planting | null>(null);
  const [deleting, setDeleting] = useState<Planting | null>(null);
  const del = useMutation({
    mutationFn: (id: UUID) => farmService.removePlanting(id),
    onSuccess: () => {
      toast.success(t('plantings.toast.deleted'));
      setDeleting(null);
      void qc.invalidateQueries({ queryKey: qk.plantings(farm.id) });
      void qc.invalidateQueries({ queryKey: qk.farms });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
    },
    onError: (err) => toast.error(t('plantings.toast.deleteFailed'), errorText(err, t)),
  });

  return (
    <Card>
      <CardHeader
        title={t('plantings.title')}
        subtitle={t('plantings.subtitle')}
        actions={
          canEditFarm ? (
            <Button size="sm" icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setAdding(true)}>
              {t('plantings.add')}
            </Button>
          ) : null
        }
      />
      {plantings.isPending ? (
        <SkeletonTable rows={3} />
      ) : plantings.isError ? (
        <ErrorState compact error={plantings.error} onRetry={() => void plantings.refetch()} />
      ) : plantings.data.length === 0 ? (
        <EmptyState
          icon={<Sprout className="h-7 w-7" />}
          title={t('plantings.empty.title')}
          hint={t('plantings.empty.hint')}
          action={canEditFarm ? <Button icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setAdding(true)}>{t('plantings.add')}</Button> : null}
        />
      ) : (
        <Table
          caption={t('plantings.title')}
          rows={plantings.data}
          rowKey={(p) => p.id}
          columns={[
            {
              key: 'crop',
              header: t('plantings.col.crop'),
              primary: true,
              cell: (p) => (
                <span className="flex flex-col">
                  <span className="font-medium text-ink">{bi(p.crop.name_en, p.crop.name_ar)}</span>
                  <span className="text-xs text-muted">{p.variety || p.crop.category.replace(/_/g, ' ')}</span>
                </span>
              ),
            },
            { key: 'area', header: t('plantings.col.area'), align: 'end', cell: (p) => <span className="tabular">{fmtArea(p.area_m2, lang, 0)}</span> },
            { key: 'date', header: t('plantings.col.date'), cell: (p) => fmtDate(p.planting_date, lang) },
            { key: 'stage', header: t('plantings.col.stage'), cell: (p) => <StageChip planting={p} /> },
            {
              key: 'method',
              header: t('plantings.col.method'),
              cell: (p) =>
                p.irrigation_method ? (
                  <span className="text-sm">
                    {bi(p.irrigation_method.name_en, p.irrigation_method.name_ar)}{' '}
                    <span className="tabular text-muted">{fmtPercent((p.irrigation_efficiency ?? p.irrigation_method.efficiency) * 100, lang, 0)}</span>
                  </span>
                ) : p.irrigation_efficiency ? (
                  <span className="tabular">{fmtPercent(p.irrigation_efficiency * 100, lang, 0)}</span>
                ) : (
                  <Badge tone="warning">{t('plantings.noMethod')}</Badge>
                ),
            },
            {
              key: 'actions',
              header: <span className="sr-only">{t('common.actions')}</span>,
              align: 'end',
              hideOnMobile: false,
              cell: (p) => (
                <span className="flex items-center justify-end gap-1">
                  <ButtonLink to={`/irrigation?planting=${p.id}`} variant="subtle" size="xs" icon={<Waves className="h-3.5 w-3.5" aria-hidden />}>
                    {t('plantings.recommend')}
                  </ButtonLink>
                  {canEditFarm ? (
                    <>
                      <IconButton size="sm" label={t('common.edit')} onClick={() => setEditing(p)}>
                        <Pencil className="h-4 w-4" />
                      </IconButton>
                      <IconButton size="sm" tone="danger" label={t('common.delete')} onClick={() => setDeleting(p)}>
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </>
                  ) : null}
                </span>
              ),
            },
          ]}
        />
      )}
      <PlantingFormModal open={adding} onClose={() => setAdding(false)} farmId={farm.id} />
      <PlantingFormModal open={!!editing} onClose={() => setEditing(null)} farmId={farm.id} planting={editing} />
      <ConfirmDialog
        open={!!deleting}
        title={t('plantings.delete.title')}
        message={t('plantings.delete.message', { name: deleting ? bi(deleting.crop.name_en, deleting.crop.name_ar) : '' })}
        confirmLabel={t('common.delete')}
        loading={del.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && del.mutate(deleting.id)}
      />
    </Card>
  );
}

function WaterTab({ farm }: { farm: Farm }) {
  const { t, lang, bi } = useI18n();
  const [adding, setAdding] = useState(false);
  const filters = { farm_id: farm.id, page: 1, size: 20 };
  const records = useQuery({ queryKey: qk.waterRecords(filters), queryFn: () => waterService.records(filters) });
  const plantings = usePlantings(farm.id);
  const plantingName = (id: string | null) => {
    if (!id) return '—';
    const p = plantings.data?.find((x) => x.id === id);
    return p ? bi(p.crop.name_en, p.crop.name_ar) : '—';
  };
  return (
    <Card>
      <CardHeader
        title={t('farm.water.title')}
        subtitle={t('farm.water.subtitle')}
        actions={
          <>
            <ButtonLink to="/water" variant="ghost" size="sm">
              {t('common.viewAll')}
            </ButtonLink>
            <Button size="sm" icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setAdding(true)}>
              {t('water.add')}
            </Button>
          </>
        }
      />
      {records.isPending ? (
        <SkeletonTable rows={4} />
      ) : records.isError ? (
        <ErrorState compact error={records.error} onRetry={() => void records.refetch()} />
      ) : records.data.items.length === 0 ? (
        <EmptyState icon={<Droplets className="h-7 w-7" />} title={t('water.empty.title')} hint={t('water.empty.hint')} action={<Button onClick={() => setAdding(true)} icon={<Plus className="h-4 w-4" aria-hidden />}>{t('water.add')}</Button>} />
      ) : (
        <Table
          caption={t('farm.water.title')}
          rows={records.data.items}
          rowKey={(r) => r.id}
          columns={[
            { key: 'when', header: t('water.col.when'), primary: true, cell: (r) => fmtDateTime(r.recorded_at, lang) },
            { key: 'vol', header: t('water.col.volume'), align: 'end', cell: (r) => <span className="tabular font-medium">{fmtLitres(r.volume_l, lang)}</span> },
            { key: 'type', header: t('water.col.type'), cell: (r) => labelRecordType(t, r.record_type) },
            { key: 'planting', header: t('water.col.planting'), cell: (r) => plantingName(r.farm_crop_id) },
            { key: 'source', header: t('water.col.source'), cell: (r) => labelWaterSource(t, r.source) },
          ]}
        />
      )}
      <WaterRecordModal open={adding} onClose={() => setAdding(false)} defaultFarmId={farm.id} lockFarm />
    </Card>
  );
}

function MembersTab({ farm }: { farm: Farm }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const members = useQuery({ queryKey: qk.members(farm.id), queryFn: () => farmService.members(farm.id) });
  const users = useQuery({ queryKey: qk.users, queryFn: () => userService.list(1, 200) });
  const [pick, setPick] = useState('');
  const [removing, setRemoving] = useState<{ id: UUID; name: string } | null>(null);
  const candidates = useMemo(() => {
    const assigned = new Set((members.data ?? []).map((m) => m.user_id));
    return (users.data?.items ?? []).filter(
      (u) => (u.role === 'FARM_MANAGER' || u.role === 'EMPLOYEE') && u.is_active && !assigned.has(u.id) && (farm.company_id ? u.company_id === farm.company_id : true),
    );
  }, [members.data, users.data, farm.company_id]);

  const add = useMutation({
    mutationFn: (userId: UUID) => farmService.addMember(farm.id, userId),
    onSuccess: () => {
      toast.success(t('members.toast.added'));
      setPick('');
      void qc.invalidateQueries({ queryKey: qk.members(farm.id) });
    },
    onError: (err) => toast.error(t('members.toast.failed'), errorText(err, t)),
  });
  const remove = useMutation({
    mutationFn: (userId: UUID) => farmService.removeMember(farm.id, userId),
    onSuccess: () => {
      toast.success(t('members.toast.removed'));
      setRemoving(null);
      void qc.invalidateQueries({ queryKey: qk.members(farm.id) });
    },
    onError: (err) => toast.error(t('members.toast.failed'), errorText(err, t)),
  });

  return (
    <Card>
      <CardHeader title={t('members.title')} subtitle={t('members.subtitle')} icon={<Users className="h-4 w-4" />} />
      <form
        className="mb-5 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (pick) add.mutate(pick);
        }}
      >
        <Field label={t('members.assign')} className="min-w-[14rem] flex-1" hint={candidates.length === 0 && users.isSuccess ? t('members.noCandidates') : undefined}>
          <Select value={pick} onChange={(e) => setPick(e.target.value)} disabled={users.isPending || candidates.length === 0}>
            <option value="">{t('common.choose')}</option>
            {candidates.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name} — {labelRole(t, u.role)}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" disabled={!pick} loading={add.isPending} icon={<UserPlus className="h-4 w-4" aria-hidden />}>
          {t('members.assignButton')}
        </Button>
      </form>
      {members.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : members.isError ? (
        <ErrorState compact error={members.error} onRetry={() => void members.refetch()} />
      ) : members.data.length === 0 ? (
        <EmptyState compact icon={<Users className="h-6 w-6" />} title={t('members.empty.title')} hint={t('members.empty.hint')} />
      ) : (
        <Table
          caption={t('members.title')}
          rows={members.data}
          rowKey={(m) => m.user_id}
          columns={[
            { key: 'name', header: t('common.name'), primary: true, cell: (m) => <span className="font-medium">{m.full_name}</span> },
            { key: 'email', header: t('auth.email'), cell: (m) => <span dir="ltr">{m.email}</span> },
            { key: 'role', header: t('common.role'), cell: (m) => <Badge tone="teal">{labelRole(t, m.role)}</Badge> },
            {
              key: 'x',
              header: <span className="sr-only">{t('common.actions')}</span>,
              align: 'end',
              cell: (m) => (
                <IconButton size="sm" tone="danger" label={t('members.remove')} onClick={() => setRemoving({ id: m.user_id, name: m.full_name })}>
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              ),
            },
          ]}
        />
      )}
      <ConfirmDialog
        open={!!removing}
        title={t('members.remove')}
        message={t('members.removeMessage', { name: removing?.name ?? '' })}
        confirmLabel={t('members.remove')}
        loading={remove.isPending}
        onCancel={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing.id)}
      />
    </Card>
  );
}

function OverviewTab({ farm, onEdit }: { farm: Farm; onEdit?: () => void }) {
  const { t, lang } = useI18n();
  const plantings = usePlantings(farm.id);
  const active = (plantings.data ?? []).filter((p) => p.status === 'active');
  const area = active.reduce((s, p) => s + p.area_m2, 0);
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader
          title={t('farm.overview.details')}
          actions={onEdit ? <Button variant="secondary" size="sm" icon={<Pencil className="h-4 w-4" aria-hidden />} onClick={onEdit}>{t('common.edit')}</Button> : null}
        />
        <KeyValue
          items={[
            { label: t('farms.field.location'), value: farm.location_name || '—' },
            { label: t('farm.overview.coordinates'), value: <span dir="ltr">{fmtNumber(farm.latitude, lang, 5)}, {fmtNumber(farm.longitude, lang, 5)}</span> },
            { label: t('farms.field.area'), value: fmtArea(farm.total_area_m2, lang, 0) },
            { label: t('farms.field.source'), value: farm.water_source ? labelWaterSource(t, farm.water_source) : '—' },
            { label: t('farms.field.allowance'), value: fmtLitres(farm.daily_water_allowance_l, lang) },
            { label: t('common.created'), value: fmtDate(farm.created_at, lang) },
          ]}
        />
        {farm.notes ? (
          <div className="mt-5 rounded-xl bg-canvas p-4 text-sm text-ink" dir="auto">
            {farm.notes}
          </div>
        ) : null}
      </Card>
      <div className="grid gap-4">
        <StatTile label={t('farm.overview.activePlantings')} value={plantings.isSuccess ? active.length : null} format={(v) => fmtInt(v, lang)} icon={<Sprout className="h-4 w-4" />} tone="emerald" />
        <StatTile label={t('farm.overview.plantedArea')} value={plantings.isSuccess ? area : null} format={(v) => fmtNumber(v, lang, 0)} unit={lang === 'ar' ? 'م²' : 'm²'} icon={<LayoutDashboard className="h-4 w-4" />} />
        <ButtonLink to="/irrigation" variant="accent" icon={<Waves className="h-4 w-4" aria-hidden />}>
          {t('dash.action.irrigate')}
        </ButtonLink>
      </div>
    </div>
  );
}

export default function FarmDetailsPage() {
  const { farmId = '' } = useParams();
  const { t } = useI18n();
  const { canEditFarm, canManageMembers } = useAuth();
  const [tab, setTab] = useState<TabKey>('overview');
  const [editing, setEditing] = useState(false);
  const farm = useQuery({ queryKey: qk.farm(farmId), queryFn: () => farmService.get(farmId), enabled: !!farmId });
  const { setFarmId } = useFarmContext();
  // Opening a farm puts it in focus for the rest of the app (top-bar selector).
  useEffect(() => {
    if (farm.data) setFarmId(farm.data.id);
  }, [farm.data, setFarmId]);

  if (farm.isPending) return <SkeletonTable rows={6} />;
  if (farm.isError) return <ErrorState error={farm.error} onRetry={() => void farm.refetch()} />;
  const f = farm.data;

  const tabs = [
    { key: 'overview' as const, label: t('farm.tab.overview'), icon: <LayoutDashboard className="h-4 w-4" aria-hidden /> },
    { key: 'plantings' as const, label: t('farm.tab.plantings'), icon: <Sprout className="h-4 w-4" aria-hidden /> },
    { key: 'water' as const, label: t('farm.tab.water'), icon: <Droplets className="h-4 w-4" aria-hidden /> },
    { key: 'weather' as const, label: t('farm.tab.weather'), icon: <CloudSun className="h-4 w-4" aria-hidden /> },
    ...(canManageMembers ? [{ key: 'members' as const, label: t('farm.tab.members'), icon: <Users className="h-4 w-4" aria-hidden /> }] : []),
  ];

  return (
    <div>
      <PageHeader
        back={{ to: '/farms', label: t('farms.title') }}
        icon={<Tractor className="h-6 w-6" />}
        title={f.name}
        description={f.location_name ?? undefined}
        meta={f.is_demo ? <Badge tone="warning">DEMO</Badge> : undefined}
      />
      <Tabs items={tabs} value={tab} onChange={setTab} label={t('farm.tabs')} idPrefix="farm" className="mb-6" />
      <TabPanel id="farm" tabKey="overview" active={tab === 'overview'}>
        <OverviewTab farm={f} onEdit={canEditFarm ? () => setEditing(true) : undefined} />
      </TabPanel>
      <TabPanel id="farm" tabKey="plantings" active={tab === 'plantings'}>
        <PlantingsTab farm={f} />
      </TabPanel>
      <TabPanel id="farm" tabKey="water" active={tab === 'water'}>
        <WaterTab farm={f} />
      </TabPanel>
      <TabPanel id="farm" tabKey="weather" active={tab === 'weather'}>
        <WeatherPanel farmId={f.id} showHistory={false} />
      </TabPanel>
      {canManageMembers ? (
        <TabPanel id="farm" tabKey="members" active={tab === 'members'}>
          <MembersTab farm={f} />
        </TabPanel>
      ) : null}
      <FarmFormModal open={editing} farm={f} onClose={() => setEditing(false)} />
    </div>
  );
}

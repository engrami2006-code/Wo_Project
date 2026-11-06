import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FlaskConical } from 'lucide-react';
import { Button, Field, FormError, FormGrid, Input, Modal, Select, Textarea, Toggle, useToast } from '../ui';
import { qk, useCrops } from '../../hooks/queries';
import { useFarmContext } from '../../hooks/useFarmContext';
import { useOnOpen } from '../../hooks/useOnOpen';
import { useI18n } from '../../i18n';
import { hydroService } from '../../services/hydro';
import { HYDRO_TYPES, SYSTEM_STATUSES } from '../../types/api';
import type { HydroSystem, HydroSystemInput, HydroSystemType, SystemStatus } from '../../types/api';
import { errorText } from '../../utils/errors';
import { parseNum } from '../../utils/format';
import { labelHydroType, labelSystemStatus } from '../../utils/labels';

interface F {
  farm_id: string;
  name: string;
  system_type: HydroSystemType;
  crop_id: string;
  growing_area_m2: string;
  plant_count: string;
  reservoir_capacity_l: string;
  is_closed_loop: boolean;
  status: SystemStatus;
  ph_min: string;
  ph_max: string;
  ec_min: string;
  ec_max: string;
  threshold_source: string;
  profile_code: string;
  notes: string;
}

const s = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));

function toForm(sys: HydroSystem | null | undefined, farmId: string): F {
  return {
    farm_id: sys?.farm_id ?? farmId,
    name: sys?.name ?? '',
    system_type: sys?.system_type ?? 'NFT',
    crop_id: sys?.crop_id ?? '',
    growing_area_m2: s(sys?.growing_area_m2),
    plant_count: s(sys?.plant_count),
    reservoir_capacity_l: s(sys?.reservoir_capacity_l),
    is_closed_loop: sys?.is_closed_loop ?? true,
    status: sys?.status ?? 'active',
    ph_min: s(sys?.ph_min),
    ph_max: s(sys?.ph_max),
    ec_min: s(sys?.ec_min),
    ec_max: s(sys?.ec_max),
    threshold_source: sys?.threshold_source ?? '',
    profile_code: '',
    notes: sys?.notes ?? '',
  };
}

export function HydroSystemModal({ open, onClose, system }: { open: boolean; onClose: () => void; system?: HydroSystem | null }) {
  const { t, bi } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const { farms, farmId } = useFarmContext();
  const crops = useCrops();
  const profiles = useQuery({ queryKey: qk.hydroProfiles, queryFn: hydroService.profiles, staleTime: 10 * 60_000 });
  const [f, setF] = useState<F>(() => toForm(system, farmId ?? ''));
  const [errors, setErrors] = useState<Partial<Record<keyof F, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  useOnOpen(open, () => {
    setF(toForm(system, farmId ?? farms[0]?.id ?? ''));
    setErrors({});
    setFormError(null);
  });
  const set = <K extends keyof F>(k: K, v: F[K]) => setF((x) => ({ ...x, [k]: v }));
  const profile = useMemo(() => profiles.data?.find((p) => p.code === f.profile_code) ?? null, [profiles.data, f.profile_code]);

  const mutation = useMutation({
    mutationFn: (payload: HydroSystemInput) => (system ? hydroService.update(system.id, payload) : hydroService.create(payload)),
    onSuccess: (saved) => {
      void qc.invalidateQueries({ queryKey: ['hydro-systems'] });
      void qc.invalidateQueries({ queryKey: qk.hydroSystem(saved.id) });
      void qc.invalidateQueries({ queryKey: qk.hydroBalance(saved.id) });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
      void qc.invalidateQueries({ queryKey: qk.farms });
      toast.success(system ? t('hydro.toast.updated') : t('hydro.toast.created'), saved.name);
      onClose();
    },
    onError: (err) => setFormError(errorText(err, t)),
  });

  const onSubmit = (ev: FormEvent) => {
    ev.preventDefault();
    setFormError(null);
    const e: Partial<Record<keyof F, string>> = {};
    const area = parseNum(f.growing_area_m2);
    const plants = parseNum(f.plant_count);
    const cap = parseNum(f.reservoir_capacity_l);
    const phMin = parseNum(f.ph_min);
    const phMax = parseNum(f.ph_max);
    const ecMin = parseNum(f.ec_min);
    const ecMax = parseNum(f.ec_max);
    if (!system && !f.farm_id) e.farm_id = t('validation.required');
    if (!f.name.trim()) e.name = t('validation.required');
    if (area === null || area <= 0) e.growing_area_m2 = t('validation.positive');
    if (plants !== null && (plants < 0 || !Number.isInteger(plants))) e.plant_count = t('validation.integer');
    if (cap === null || cap <= 0) e.reservoir_capacity_l = t('validation.positive');
    for (const [k, v] of [['ph_min', phMin], ['ph_max', phMax]] as const) if (v !== null && (v < 0 || v > 14)) e[k] = t('validation.range', { min: 0, max: 14 });
    for (const [k, v] of [['ec_min', ecMin], ['ec_max', ecMax]] as const) if (v !== null && (v < 0 || v > 20)) e[k] = t('validation.range', { min: 0, max: 20 });
    if (phMin !== null && phMax !== null && phMin >= phMax) e.ph_max = t('hydro.form.minMax');
    if (ecMin !== null && ecMax !== null && ecMin >= ecMax) e.ec_max = t('hydro.form.minMax');
    setErrors(e);
    if (Object.keys(e).length) return;
    const payload: HydroSystemInput = {
      name: f.name.trim(),
      system_type: f.system_type,
      crop_id: f.crop_id || null,
      growing_area_m2: area as number,
      plant_count: plants ?? 0,
      reservoir_capacity_l: cap as number,
      is_closed_loop: f.is_closed_loop,
      status: f.status,
      threshold_source: f.threshold_source.trim() || null,
      notes: f.notes.trim() || null,
    };
    if (f.profile_code) payload.profile_code = f.profile_code;
    else {
      payload.ph_min = phMin;
      payload.ph_max = phMax;
      payload.ec_min = ecMin;
      payload.ec_max = ecMax;
    }
    if (!system) payload.farm_id = f.farm_id;
    mutation.mutate(payload);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!mutation.isPending}
      size="lg"
      icon={<FlaskConical className="h-5 w-5" />}
      title={system ? t('hydro.edit') : t('hydro.create')}
      description={t('hydro.form.description')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="hydro-form" loading={mutation.isPending}>
            {system ? t('common.saveChanges') : t('hydro.create')}
          </Button>
        </>
      }
    >
      <form id="hydro-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <FormError>{formError}</FormError>
        <FormGrid>
          <Field label={t('common.farm')} required error={errors.farm_id}>
            <Select value={f.farm_id} disabled={!!system} onChange={(e) => set('farm_id', e.target.value)}>
              <option value="">{t('common.choose')}</option>
              {farms.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('common.name')} required error={errors.name}>
            <Input value={f.name} onChange={(e) => set('name', e.target.value)} data-autofocus />
          </Field>
          <Field label={t('hydro.field.type')} required>
            <Select value={f.system_type} onChange={(e) => set('system_type', e.target.value as HydroSystemType)}>
              {HYDRO_TYPES.map((ty) => (
                <option key={ty} value={ty}>
                  {labelHydroType(t, ty)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('hydro.field.crop')} hint={t('water.field.optional')}>
            <Select value={f.crop_id} onChange={(e) => set('crop_id', e.target.value)}>
              <option value="">{t('common.none')}</option>
              {(crops.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {bi(c.name_en, c.name_ar)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('hydro.field.area')} required error={errors.growing_area_m2}>
            <Input type="number" min={0} step="any" suffix={t('unit.m2')} value={f.growing_area_m2} onChange={(e) => set('growing_area_m2', e.target.value)} />
          </Field>
          <Field label={t('hydro.field.plants')} error={errors.plant_count}>
            <Input type="number" min={0} step="1" value={f.plant_count} onChange={(e) => set('plant_count', e.target.value)} />
          </Field>
          <Field label={t('hydro.field.capacity')} required error={errors.reservoir_capacity_l}>
            <Input type="number" min={0} step="any" suffix={t('unit.l')} value={f.reservoir_capacity_l} onChange={(e) => set('reservoir_capacity_l', e.target.value)} />
          </Field>
          <Field label={t('hydro.field.status')}>
            <Select value={f.status} onChange={(e) => set('status', e.target.value as SystemStatus)}>
              {SYSTEM_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {labelSystemStatus(t, st)}
                </option>
              ))}
            </Select>
          </Field>
        </FormGrid>
        <Toggle checked={f.is_closed_loop} onChange={(v) => set('is_closed_loop', v)} label={t('hydro.field.closedLoop')} description={t('hydro.field.closedLoopHint')} />

        <fieldset className="rounded-2xl border border-line p-4">
          <legend className="px-1 text-sm font-semibold text-ink">{t('hydro.form.ranges')}</legend>
          <Field label={t('hydro.form.profile')} hint={profile ? `${profile.source}${profile.source_note ? ` — ${profile.source_note}` : ''}` : t('hydro.form.profileHint')}>
            <Select value={f.profile_code} onChange={(e) => set('profile_code', e.target.value)}>
              <option value="">{t('hydro.form.profileManual')}</option>
              {(profiles.data ?? []).map((p) => (
                <option key={p.code} value={p.code}>
                  {bi(p.name_en, p.name_ar)} — pH {p.ph_min ?? '—'}–{p.ph_max ?? '—'}, EC {p.ec_min ?? '—'}–{p.ec_max ?? '—'}
                </option>
              ))}
            </Select>
          </Field>
          {f.profile_code ? null : (
            <>
              <FormGrid cols={4} className="mt-4">
                <Field label={t('hydro.form.phMin')} error={errors.ph_min}>
                  <Input type="number" step="0.1" min={0} max={14} dir="ltr" value={f.ph_min} onChange={(e) => set('ph_min', e.target.value)} />
                </Field>
                <Field label={t('hydro.form.phMax')} error={errors.ph_max}>
                  <Input type="number" step="0.1" min={0} max={14} dir="ltr" value={f.ph_max} onChange={(e) => set('ph_max', e.target.value)} />
                </Field>
                <Field label={t('hydro.form.ecMin')} error={errors.ec_min}>
                  <Input type="number" step="0.05" min={0} max={20} dir="ltr" value={f.ec_min} onChange={(e) => set('ec_min', e.target.value)} />
                </Field>
                <Field label={t('hydro.form.ecMax')} error={errors.ec_max}>
                  <Input type="number" step="0.05" min={0} max={20} dir="ltr" value={f.ec_max} onChange={(e) => set('ec_max', e.target.value)} />
                </Field>
              </FormGrid>
              <Field label={t('hydro.form.thresholdSource')} className="mt-4" hint={t('hydro.form.thresholdSourceHint')}>
                <Input value={f.threshold_source} onChange={(e) => set('threshold_source', e.target.value)} />
              </Field>
            </>
          )}
        </fieldset>
        <Field label={t('common.notes')}>
          <Textarea rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Tractor } from 'lucide-react';
import { Button, Field, FormError, FormGrid, Input, Modal, Select, Textarea, useToast } from '../ui';
import { qk } from '../../hooks/queries';
import { useOnOpen } from '../../hooks/useOnOpen';
import { useI18n } from '../../i18n';
import { farmService } from '../../services/farms';
import { WATER_SOURCES } from '../../types/api';
import type { Farm, FarmInput, WaterSource } from '../../types/api';
import { errorText } from '../../utils/errors';
import { parseNum } from '../../utils/format';
import { labelWaterSource } from '../../utils/labels';

interface FormState {
  name: string;
  latitude: string;
  longitude: string;
  location_name: string;
  total_area_m2: string;
  water_source: string;
  daily_water_allowance_l: string;
  notes: string;
}

function toForm(f?: Farm | null): FormState {
  return {
    name: f?.name ?? '',
    latitude: f ? String(f.latitude) : '',
    longitude: f ? String(f.longitude) : '',
    location_name: f?.location_name ?? '',
    total_area_m2: f?.total_area_m2 != null ? String(f.total_area_m2) : '',
    water_source: f?.water_source ?? '',
    daily_water_allowance_l: f?.daily_water_allowance_l != null ? String(f.daily_water_allowance_l) : '',
    notes: f?.notes ?? '',
  };
}

export function FarmFormModal({ open, onClose, farm, onSaved }: { open: boolean; onClose: () => void; farm?: Farm | null; onSaved?: (f: Farm) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(() => toForm(farm));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);

  useOnOpen(open, () => {
    setForm(toForm(farm));
    setErrors({});
    setFormError(null);
  });

  const set = (k: keyof FormState) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: (payload: FarmInput) => (farm ? farmService.update(farm.id, payload) : farmService.create(payload)),
    onSuccess: (saved) => {
      void qc.invalidateQueries({ queryKey: qk.farms });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
      qc.setQueryData(qk.farm(saved.id), saved);
      toast.success(farm ? t('farms.toast.updated') : t('farms.toast.created'), saved.name);
      onSaved?.(saved);
      onClose();
    },
    onError: (err) => setFormError(errorText(err, t)),
  });

  const validate = (): FarmInput | null => {
    const e: Partial<Record<keyof FormState, string>> = {};
    const lat = parseNum(form.latitude);
    const lon = parseNum(form.longitude);
    const area = parseNum(form.total_area_m2);
    const allowance = parseNum(form.daily_water_allowance_l);
    if (!form.name.trim()) e.name = t('validation.required');
    if (lat === null || lat < -90 || lat > 90) e.latitude = t('validation.latitude');
    if (lon === null || lon < -180 || lon > 180) e.longitude = t('validation.longitude');
    if (form.total_area_m2.trim() && (area === null || area <= 0)) e.total_area_m2 = t('validation.positive');
    if (form.daily_water_allowance_l.trim() && (allowance === null || allowance < 0)) e.daily_water_allowance_l = t('validation.nonNegative');
    setErrors(e);
    if (Object.keys(e).length) return null;
    return {
      name: form.name.trim(),
      latitude: lat as number,
      longitude: lon as number,
      location_name: form.location_name.trim() || null,
      total_area_m2: area,
      water_source: (form.water_source || null) as WaterSource | null,
      daily_water_allowance_l: allowance,
      notes: form.notes.trim() || null,
    };
  };

  const onSubmit = (ev: FormEvent) => {
    ev.preventDefault();
    setFormError(null);
    const payload = validate();
    if (payload) mutation.mutate(payload);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!mutation.isPending}
      size="lg"
      icon={<Tractor className="h-5 w-5" />}
      title={farm ? t('farms.edit') : t('farms.create')}
      description={t('farms.form.description')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="farm-form" loading={mutation.isPending}>
            {farm ? t('common.saveChanges') : t('farms.create')}
          </Button>
        </>
      }
    >
      <form id="farm-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <FormError>{formError}</FormError>
        <Field label={t('farms.field.name')} required error={errors.name}>
          <Input value={form.name} onChange={(e) => set('name')(e.target.value)} data-autofocus />
        </Field>
        <FormGrid>
          <Field label={t('farms.field.latitude')} required error={errors.latitude} hint={t('farms.field.latitudeHint')}>
            <Input type="number" step="any" inputMode="decimal" dir="ltr" value={form.latitude} onChange={(e) => set('latitude')(e.target.value)} />
          </Field>
          <Field label={t('farms.field.longitude')} required error={errors.longitude} hint={t('farms.field.longitudeHint')}>
            <Input type="number" step="any" inputMode="decimal" dir="ltr" value={form.longitude} onChange={(e) => set('longitude')(e.target.value)} />
          </Field>
          <Field label={t('farms.field.location')}>
            <Input value={form.location_name} onChange={(e) => set('location_name')(e.target.value)} />
          </Field>
          <Field label={t('farms.field.area')} error={errors.total_area_m2}>
            <Input type="number" min={0} step="any" inputMode="decimal" suffix={t('unit.m2')} value={form.total_area_m2} onChange={(e) => set('total_area_m2')(e.target.value)} />
          </Field>
          <Field label={t('farms.field.source')}>
            <Select value={form.water_source} onChange={(e) => set('water_source')(e.target.value)}>
              <option value="">{t('common.notSet')}</option>
              {WATER_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {labelWaterSource(t, s)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('farms.field.allowance')} error={errors.daily_water_allowance_l} hint={t('farms.field.allowanceHint')}>
            <Input type="number" min={0} step="any" inputMode="decimal" suffix={t('unit.l')} value={form.daily_water_allowance_l} onChange={(e) => set('daily_water_allowance_l')(e.target.value)} />
          </Field>
        </FormGrid>
        <Field label={t('common.notes')}>
          <Textarea value={form.notes} onChange={(e) => set('notes')(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

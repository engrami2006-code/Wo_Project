import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sprout } from 'lucide-react';
import { Button, Field, FormError, FormGrid, Input, Modal, Select, Textarea, useToast } from '../ui';
import { qk, useCrops, useMethods } from '../../hooks/queries';
import { useOnOpen } from '../../hooks/useOnOpen';
import { useI18n } from '../../i18n';
import { farmService } from '../../services/farms';
import { GROWTH_STAGES } from '../../types/api';
import type { GrowthStage, Planting, PlantingInput, PlantingStatus, UUID } from '../../types/api';
import { errorText } from '../../utils/errors';
import { fmtPercent, parseNum } from '../../utils/format';
import { labelStage } from '../../utils/labels';

interface FormState {
  crop_id: string;
  variety: string;
  area_m2: string;
  planting_date: string;
  irrigation_method_id: string;
  efficiency_pct: string;
  stage_override: string;
  status: PlantingStatus;
  notes: string;
}

function toForm(p?: Planting | null): FormState {
  return {
    crop_id: p?.crop_id ?? '',
    variety: p?.variety ?? '',
    area_m2: p ? String(p.area_m2) : '',
    planting_date: p?.planting_date ?? '',
    irrigation_method_id: p?.irrigation_method_id ?? '',
    efficiency_pct: p?.irrigation_efficiency != null ? String(Math.round(p.irrigation_efficiency * 1000) / 10) : '',
    stage_override: p?.stage_override ?? '',
    status: p?.status ?? 'active',
    notes: p?.notes ?? '',
  };
}

export function PlantingFormModal({ open, onClose, farmId, planting }: { open: boolean; onClose: () => void; farmId: UUID; planting?: Planting | null }) {
  const { t, lang, bi } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const crops = useCrops();
  const methods = useMethods();
  const [form, setForm] = useState<FormState>(() => toForm(planting));
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);

  useOnOpen(open, () => {
    setForm(toForm(planting));
    setErrors({});
    setFormError(null);
  });

  const set = (k: keyof FormState) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const sortedCrops = useMemo(
    () => [...(crops.data ?? [])].sort((a, b) => bi(a.name_en, a.name_ar).localeCompare(bi(b.name_en, b.name_ar), lang)),
    [crops.data, bi, lang],
  );
  const selectedCrop = sortedCrops.find((c) => c.id === form.crop_id);

  const mutation = useMutation({
    mutationFn: (payload: PlantingInput) => (planting ? farmService.updatePlanting(planting.id, payload) : farmService.createPlanting(farmId, payload)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.plantings(farmId) });
      void qc.invalidateQueries({ queryKey: qk.farms });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
      toast.success(planting ? t('plantings.toast.updated') : t('plantings.toast.created'));
      onClose();
    },
    onError: (err) => setFormError(errorText(err, t)),
  });

  const onSubmit = (ev: FormEvent) => {
    ev.preventDefault();
    setFormError(null);
    const e: Partial<Record<keyof FormState, string>> = {};
    const area = parseNum(form.area_m2);
    const eff = parseNum(form.efficiency_pct);
    if (!planting && !form.crop_id) e.crop_id = t('validation.required');
    if (area === null || area <= 0) e.area_m2 = t('validation.positive');
    if (form.efficiency_pct.trim() && (eff === null || eff <= 0 || eff > 100)) e.efficiency_pct = t('validation.percent');
    setErrors(e);
    if (Object.keys(e).length) return;
    const payload: PlantingInput = {
      variety: form.variety.trim() || null,
      area_m2: area as number,
      planting_date: form.planting_date || null,
      irrigation_method_id: form.irrigation_method_id || null,
      irrigation_efficiency: eff !== null ? Math.round(eff * 10) / 1000 : null,
      stage_override: (form.stage_override || null) as GrowthStage | null,
      notes: form.notes.trim() || null,
    };
    if (!planting) payload.crop_id = form.crop_id;
    else {
      payload.status = form.status;
      if (!form.stage_override && planting.stage_override) payload.clear_stage_override = true;
    }
    mutation.mutate(payload);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!mutation.isPending}
      size="lg"
      icon={<Sprout className="h-5 w-5" />}
      title={planting ? t('plantings.edit') : t('plantings.add')}
      description={t('plantings.form.description')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="planting-form" loading={mutation.isPending}>
            {planting ? t('common.saveChanges') : t('plantings.add')}
          </Button>
        </>
      }
    >
      <form id="planting-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <FormError>{formError}</FormError>
        <Field
          label={t('plantings.field.crop')}
          required={!planting}
          error={errors.crop_id}
          hint={selectedCrop ? `Kc ${selectedCrop.kc_ini} / ${selectedCrop.kc_mid} / ${selectedCrop.kc_end} · ${selectedCrop.source}` : undefined}
        >
          <Select value={form.crop_id} onChange={(e) => set('crop_id')(e.target.value)} disabled={!!planting || crops.isPending} data-autofocus>
            <option value="">{crops.isPending ? t('common.loading') : t('plantings.field.cropPick')}</option>
            {sortedCrops.map((c) => (
              <option key={c.id} value={c.id}>
                {bi(c.name_en, c.name_ar)} — {c.category.replace(/_/g, ' ')}
                {c.is_reference ? '' : ` (${t('crops.custom')})`}
              </option>
            ))}
          </Select>
        </Field>
        <FormGrid>
          <Field label={t('plantings.field.variety')}>
            <Input value={form.variety} onChange={(e) => set('variety')(e.target.value)} />
          </Field>
          <Field label={t('plantings.field.area')} required error={errors.area_m2}>
            <Input type="number" min={0} step="any" inputMode="decimal" suffix={t('unit.m2')} value={form.area_m2} onChange={(e) => set('area_m2')(e.target.value)} />
          </Field>
          <Field label={t('plantings.field.date')} hint={t('plantings.field.dateHint')}>
            <Input type="date" value={form.planting_date} onChange={(e) => set('planting_date')(e.target.value)} />
          </Field>
          <Field label={t('plantings.field.method')} hint={t('plantings.field.methodHint')}>
            <Select value={form.irrigation_method_id} onChange={(e) => set('irrigation_method_id')(e.target.value)}>
              <option value="">{t('common.notSet')}</option>
              {(methods.data ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {bi(m.name_en, m.name_ar)} — {fmtPercent(m.efficiency * 100, lang, 0)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('plantings.field.efficiency')} error={errors.efficiency_pct} hint={t('plantings.field.efficiencyHint')}>
            <Input type="number" min={1} max={100} step="any" inputMode="decimal" suffix="%" value={form.efficiency_pct} onChange={(e) => set('efficiency_pct')(e.target.value)} />
          </Field>
          <Field label={t('plantings.field.stage')} hint={t('plantings.field.stageHint')}>
            <Select value={form.stage_override} onChange={(e) => set('stage_override')(e.target.value)}>
              <option value="">{t('plantings.field.stageAuto')}</option>
              {GROWTH_STAGES.map((s) => (
                <option key={s} value={s}>
                  {labelStage(t, s)}
                </option>
              ))}
            </Select>
          </Field>
          {planting ? (
            <Field label={t('plantings.field.status')}>
              <Select value={form.status} onChange={(e) => set('status')(e.target.value)}>
                <option value="active">{t('plantingStatus.active')}</option>
                <option value="harvested">{t('plantingStatus.harvested')}</option>
              </Select>
            </Field>
          ) : null}
        </FormGrid>
        <Field label={t('common.notes')}>
          <Textarea value={form.notes} onChange={(e) => set('notes')(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

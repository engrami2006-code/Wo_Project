import { useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Droplets } from 'lucide-react';
import { Button, Field, FormError, FormGrid, Input, Modal, Select, Textarea, useToast } from '../ui';
import { qk, useHydroSystems, usePlantings } from '../../hooks/queries';
import { useFarmContext } from '../../hooks/useFarmContext';
import { useOnOpen } from '../../hooks/useOnOpen';
import { useI18n } from '../../i18n';
import { waterService } from '../../services/water';
import { WATER_RECORD_TYPES, WATER_SOURCES } from '../../types/api';
import type { UUID, WaterRecordType, WaterSource } from '../../types/api';
import { errorText } from '../../utils/errors';
import { localInputToISO, nowLocalInput, parseNum } from '../../utils/format';
import { labelRecordType, labelWaterSource } from '../../utils/labels';

export function WaterRecordModal({ open, onClose, defaultFarmId, lockFarm }: { open: boolean; onClose: () => void; defaultFarmId?: UUID | null; lockFarm?: boolean }) {
  const { t, bi } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const { farms, farmId: ctxFarmId } = useFarmContext();
  const [farmId, setFarmId] = useState<string>(defaultFarmId ?? ctxFarmId ?? '');
  const [plantingId, setPlantingId] = useState('');
  const [systemId, setSystemId] = useState('');
  const [when, setWhen] = useState(nowLocalInput());
  const [volume, setVolume] = useState('');
  const [source, setSource] = useState<string>('');
  const [type, setType] = useState<WaterRecordType>('irrigation');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const plantings = usePlantings(farmId || null);
  const systems = useHydroSystems(farmId || undefined);

  useOnOpen(open, () => {
    const f = defaultFarmId ?? ctxFarmId ?? farms[0]?.id ?? '';
    setFarmId(f);
    setPlantingId('');
    setSystemId('');
    setWhen(nowLocalInput());
    setVolume('');
    setSource(farms.find((x) => x.id === f)?.water_source ?? '');
    setType('irrigation');
    setNotes('');
    setErrors({});
    setFormError(null);
  });

  const mutation = useMutation({
    mutationFn: waterService.createRecord,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['water-records'] });
      void qc.invalidateQueries({ queryKey: ['analytics'] });
      void qc.invalidateQueries({ queryKey: qk.dashboard });
      void qc.invalidateQueries({ queryKey: ['alerts'] });
      toast.success(t('water.toast.created'));
      onClose();
    },
    onError: (err) => setFormError(errorText(err, t)),
  });

  const onSubmit = (ev: FormEvent) => {
    ev.preventDefault();
    setFormError(null);
    const e: Record<string, string> = {};
    const vol = parseNum(volume);
    if (!farmId) e.farm = t('validation.required');
    if (vol === null || vol < 0) e.volume = t('validation.nonNegative');
    if (!source) e.source = t('validation.required');
    if (!when) e.when = t('validation.required');
    else if (new Date(when).getTime() > Date.now() + 60_000) e.when = t('validation.notFuture');
    setErrors(e);
    if (Object.keys(e).length) return;
    mutation.mutate({
      farm_id: farmId,
      farm_crop_id: type !== 'hydroponic' ? plantingId || null : null,
      hydroponic_system_id: type === 'hydroponic' ? systemId || null : null,
      recorded_at: localInputToISO(when),
      volume_l: vol as number,
      source: source as WaterSource,
      record_type: type,
      notes: notes.trim() || null,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!mutation.isPending}
      size="lg"
      icon={<Droplets className="h-5 w-5" />}
      title={t('water.add')}
      description={t('water.form.description')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="water-form" loading={mutation.isPending}>
            {t('water.save')}
          </Button>
        </>
      }
    >
      <form id="water-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <FormError>{formError}</FormError>
        <FormGrid>
          <Field label={t('common.farm')} required error={errors.farm}>
            <Select
              value={farmId}
              disabled={lockFarm}
              onChange={(e) => {
                setFarmId(e.target.value);
                setPlantingId('');
                setSystemId('');
                setSource(farms.find((x) => x.id === e.target.value)?.water_source ?? source);
              }}
            >
              <option value="">{t('common.choose')}</option>
              {farms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('water.field.type')}>
            <Select value={type} onChange={(e) => setType(e.target.value as WaterRecordType)}>
              {WATER_RECORD_TYPES.map((x) => (
                <option key={x} value={x}>
                  {labelRecordType(t, x)}
                </option>
              ))}
            </Select>
          </Field>
          {type === 'hydroponic' ? (
            <Field label={t('water.field.system')} hint={t('water.field.optional')}>
              <Select value={systemId} onChange={(e) => setSystemId(e.target.value)} disabled={!farmId}>
                <option value="">{t('common.none')}</option>
                {(systems.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label={t('water.field.planting')} hint={t('water.field.optional')}>
              <Select value={plantingId} onChange={(e) => setPlantingId(e.target.value)} disabled={!farmId}>
                <option value="">{t('common.none')}</option>
                {(plantings.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {bi(p.crop.name_en, p.crop.name_ar)}
                    {p.variety ? ` — ${p.variety}` : ''}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label={t('water.field.when')} required error={errors.when}>
            <Input type="datetime-local" value={when} max={nowLocalInput()} onChange={(e) => setWhen(e.target.value)} />
          </Field>
          <Field label={t('water.field.volume')} required error={errors.volume}>
            <Input type="number" min={0} step="any" inputMode="decimal" suffix={t('unit.l')} value={volume} onChange={(e) => setVolume(e.target.value)} data-autofocus />
          </Field>
          <Field label={t('water.field.source')} required error={errors.source}>
            <Select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">{t('common.choose')}</option>
              {WATER_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {labelWaterSource(t, s)}
                </option>
              ))}
            </Select>
          </Field>
        </FormGrid>
        <Field label={t('common.notes')}>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>
      </form>
    </Modal>
  );
}

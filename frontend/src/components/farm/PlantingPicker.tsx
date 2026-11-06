import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { usePlantings } from '../../hooks/queries';
import { useFarmContext } from '../../hooks/useFarmContext';
import { useI18n } from '../../i18n';
import type { Planting, UUID } from '../../types/api';
import { fmtArea } from '../../utils/format';
import { Field, Select } from '../ui/Field';

/** Farm + planting selectors. The farm defaults to the top-bar farm context. */
export function PlantingPicker({
  farmId,
  onFarmChange,
  plantingId,
  onPlantingChange,
  error,
  autoSelect = true,
}: {
  farmId: UUID | null;
  onFarmChange: (id: UUID | null) => void;
  plantingId: UUID | null;
  onPlantingChange: (id: UUID | null, planting: Planting | null) => void;
  error?: string;
  autoSelect?: boolean;
}) {
  const { t, lang, bi } = useI18n();
  const { farms } = useFarmContext();
  const plantings = usePlantings(farmId);
  const active = (plantings.data ?? []).filter((p) => p.status === 'active');

  // Pick the first active planting automatically so the form is usable straight away.
  useEffect(() => {
    if (!autoSelect || !plantings.isSuccess) return;
    if (plantingId && plantings.data.some((p) => p.id === plantingId)) {
      const p = plantings.data.find((x) => x.id === plantingId) ?? null;
      onPlantingChange(plantingId, p);
      return;
    }
    const first = plantings.data.find((p) => p.status === 'active') ?? null;
    onPlantingChange(first?.id ?? null, first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plantings.isSuccess, plantings.data, farmId]);

  return (
    <>
      <Field label={t('common.farm')} required>
        <Select value={farmId ?? ''} onChange={(e) => onFarmChange(e.target.value || null)}>
          <option value="">{t('common.choose')}</option>
          {farms.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label={t('common.planting')}
        required
        error={error}
        hint={
          farmId && plantings.isSuccess && active.length === 0 ? (
            <>
              {t('picker.noPlantings')}{' '}
              <Link to={`/farms/${farmId}`} className="font-medium text-teal underline">
                {t('picker.addPlanting')}
              </Link>
            </>
          ) : undefined
        }
      >
        <Select
          value={plantingId ?? ''}
          disabled={!farmId || plantings.isPending}
          onChange={(e) => {
            const p = plantings.data?.find((x) => x.id === e.target.value) ?? null;
            onPlantingChange(p?.id ?? null, p);
          }}
        >
          <option value="">{plantings.isPending && farmId ? t('common.loading') : t('common.choose')}</option>
          {active.map((p) => (
            <option key={p.id} value={p.id}>
              {bi(p.crop.name_en, p.crop.name_ar)}
              {p.variety ? ` (${p.variety})` : ''} — {fmtArea(p.area_m2, lang, 0)}
            </option>
          ))}
        </Select>
      </Field>
    </>
  );
}

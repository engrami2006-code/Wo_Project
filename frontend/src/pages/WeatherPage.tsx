import { CloudSun, Tractor } from 'lucide-react';
import { ButtonLink, EmptyState, Field, PageHeader, Select } from '../components/ui';
import { WeatherPanel } from '../components/weather/WeatherPanel';
import { useFarmContext } from '../hooks/useFarmContext';
import { useI18n } from '../i18n';

export default function WeatherPage() {
  const { t } = useI18n();
  const { farms, farmId, setFarmId, loading } = useFarmContext();
  return (
    <div>
      <PageHeader
        icon={<CloudSun className="h-6 w-6" />}
        title={t('weather.title')}
        description={t('weather.description')}
        actions={
          farms.length ? (
            <Field label={t('common.farm')} className="w-60">
              <Select value={farmId ?? ''} onChange={(e) => setFarmId(e.target.value || null)}>
                {farms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null
        }
      />
      {!loading && farms.length === 0 ? (
        <div className="card">
          <EmptyState icon={<Tractor className="h-7 w-7" />} title={t('common.noFarms')} hint={t('common.noFarmsHint')} action={<ButtonLink to="/farms?new=1">{t('farms.create')}</ButtonLink>} />
        </div>
      ) : farmId ? (
        <WeatherPanel key={farmId} farmId={farmId} />
      ) : null}
    </div>
  );
}

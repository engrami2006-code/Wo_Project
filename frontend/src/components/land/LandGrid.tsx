import { useI18n } from '../../i18n';
import { cn } from '../../utils/cn';
import { fmtInt } from '../../utils/format';
import { CHART_COLORS } from '../charts/ChartFrame';

export interface LandGridItem {
  name: string;
  units: number;
}

/**
 * The field as N equal land units. Units are filled crop by crop in allocation order;
 * the remainder is fallow (hatched). Each crop keeps the colour of its candidate index.
 */
export function LandGrid({ allocation, numUnits, unitArea }: { allocation: LandGridItem[]; numUnits: number; unitArea?: number }) {
  const { t, lang } = useI18n();
  const cells: { crop: string | null; color: string | null }[] = [];
  allocation.forEach((a, i) => {
    for (let k = 0; k < a.units && cells.length < numUnits; k++) cells.push({ crop: a.name, color: CHART_COLORS[i % CHART_COLORS.length] });
  });
  while (cells.length < numUnits) cells.push({ crop: null, color: null });
  const cols = numUnits <= 12 ? numUnits : numUnits <= 30 ? 10 : 12;
  const fallow = cells.filter((c) => c.crop === null).length;

  return (
    <div>
      <ul
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        aria-label={t('land.grid.label', { n: numUnits })}
        data-testid="land-grid"
      >
        {cells.map((c, i) => (
          <li
            key={i}
            className={cn('aspect-square rounded-md', c.crop ? '' : 'border border-dashed border-[#CBD5CF]')}
            style={
              c.color
                ? { background: c.color }
                : { backgroundImage: 'repeating-linear-gradient(45deg, #F1F4F1 0 4px, #FFFFFF 4px 8px)' }
            }
            title={c.crop ?? t('land.fallow')}
            aria-label={`${i + 1}: ${c.crop ?? t('land.fallow')}`}
          />
        ))}
      </ul>
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm" aria-label={t('land.legend')}>
        {allocation.map((a, i) => (
          <li key={a.name} className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} aria-hidden />
            <span className="text-ink">{a.name}</span>
            <span className="tabular text-muted">{t('land.units', { n: fmtInt(a.units, lang) })}</span>
          </li>
        ))}
        <li className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm border border-dashed border-[#CBD5CF]" style={{ backgroundImage: 'repeating-linear-gradient(45deg, #F1F4F1 0 2px, #FFFFFF 2px 4px)' }} aria-hidden />
          <span className="text-ink">{t('land.fallow')}</span>
          <span className="tabular text-muted">{t('land.units', { n: fmtInt(fallow, lang) })}</span>
        </li>
        {unitArea ? <li className="text-muted">{t('land.unitArea', { a: fmtInt(unitArea, lang) })}</li> : null}
      </ul>
    </div>
  );
}

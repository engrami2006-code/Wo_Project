import { useI18n } from '../../i18n';
import type { Planting } from '../../types/api';
import { fmtInt } from '../../utils/format';
import { labelStage, labelStageStatus } from '../../utils/labels';
import { Badge } from '../ui/Badge';

export function StageChip({ planting }: { planting: Planting }) {
  const { t, lang } = useI18n();
  const s = planting.current_stage;
  if (!s) return <Badge tone="outline">{t('plantings.noDate')}</Badge>;
  if (s.status === 'in_season' && s.stage) {
    return (
      <Badge tone="emerald" dot title={s.note || undefined}>
        {labelStage(t, s.stage)}
        {s.day_in_stage !== null && s.stage_length ? ` — ${t('plantings.dayOf', { d: fmtInt(s.day_in_stage, lang), n: fmtInt(s.stage_length, lang) })}` : ''}
        {planting.stage_override ? ` (${t('plantings.override')})` : ''}
      </Badge>
    );
  }
  return <Badge tone={s.status === 'season_ended' ? 'neutral' : 'water'}>{labelStageStatus(t, s.status)}</Badge>;
}

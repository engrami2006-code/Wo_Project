import { useI18n } from '../../i18n';
import type { Crop } from '../../types/api';
import { fmtInt, fmtNumber } from '../../utils/format';

const STAGE_COLORS = ['#A7E3C9', '#5CC49B', '#10B981', '#0D9488'];

/** Four segments proportional to L_ini / L_dev / L_mid / L_late (FAO-56 Table 11). */
export function StageBar({ crop }: { crop: Crop }) {
  const { t, lang } = useI18n();
  const parts = [crop.l_ini, crop.l_dev, crop.l_mid, crop.l_late];
  if (parts.some((p) => p === null)) return null;
  const vals = parts as number[];
  const total = vals.reduce((a, b) => a + b, 0);
  const names = [t('stage.initial'), t('stage.development'), t('stage.mid'), t('stage.late')];
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full" role="img" aria-label={t('crops.stageBarLabel', { total: fmtInt(total, lang), parts: vals.map((v, i) => `${names[i]} ${v}`).join(', ') })}>
        {vals.map((v, i) => (
          <span key={i} style={{ width: `${(v / total) * 100}%`, background: STAGE_COLORS[i] }} className="h-full border-e-2 border-surface last:border-e-0" />
        ))}
      </div>
      <div className="mt-1.5 flex text-[10px] text-muted" aria-hidden>
        {vals.map((v, i) => (
          <span key={i} style={{ width: `${(v / total) * 100}%` }} className="truncate">
            {fmtInt(v, lang)}
            {t('unit.dShort')}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Kc(t) curve: flat in initial/mid, linear in development/late (FAO-56 Eq. 66). */
export function KcSparkline({ crop, height = 56 }: { crop: Crop; height?: number }) {
  const { t, lang } = useI18n();
  const parts = [crop.l_ini, crop.l_dev, crop.l_mid, crop.l_late];
  if (parts.some((p) => p === null)) return null;
  const [a, b, c, d] = parts as number[];
  const total = a + b + c + d;
  const W = 240;
  const H = height;
  const maxKc = Math.max(1.3, crop.kc_mid, crop.kc_ini, crop.kc_end);
  const x = (day: number) => (day / total) * W;
  const y = (kc: number) => H - 6 - (kc / maxKc) * (H - 14);
  const pts: [number, number][] = [
    [0, crop.kc_ini],
    [a, crop.kc_ini],
    [a + b, crop.kc_mid],
    [a + b + c, crop.kc_mid],
    [total, crop.kc_end],
  ];
  const path = pts.map(([dd, k], i) => `${i ? 'L' : 'M'}${x(dd).toFixed(1)},${y(k).toFixed(1)}`).join(' ');
  const area = `${path} L${W},${H} L0,${H} Z`;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-14 w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label={t('crops.kcCurveLabel', {
        ini: fmtNumber(crop.kc_ini, lang, 2),
        mid: fmtNumber(crop.kc_mid, lang, 2),
        end: fmtNumber(crop.kc_end, lang, 2),
      })}
      style={{ direction: 'ltr' }}
    >
      {[a, a + b, a + b + c].map((dd) => (
        <line key={dd} x1={x(dd)} x2={x(dd)} y1={4} y2={H} stroke="#E3E9E4" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      ))}
      <path d={area} fill="#10B981" fillOpacity={0.1} />
      <path d={path} fill="none" stroke="#047857" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

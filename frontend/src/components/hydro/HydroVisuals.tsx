import { useI18n } from '../../i18n';
import type { HydroBalanceRow } from '../../types/api';
import { fmtLitres, fmtNumber, fmtRatio, isNum } from '../../utils/format';

/** Reservoir level: latest reservoir_end_l over capacity. Shows "not recorded" when missing. */
export function ReservoirGauge({ level, capacity }: { level: number | null | undefined; capacity: number }) {
  const { t, lang } = useI18n();
  const known = isNum(level);
  const ratio = known ? Math.max(0, Math.min(1, (level as number) / capacity)) : 0;
  const H = 150;
  const fillH = ratio * (H - 20);
  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 110 170" className="h-40 w-28 shrink-0" role="img" aria-label={known ? t('hydro.gauge.label', { level: fmtLitres(level, lang), capacity: fmtLitres(capacity, lang), pct: fmtRatio(ratio, lang, 0) }) : t('hydro.gauge.notRecorded')}>
        <defs>
          <linearGradient id="tank-water" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#38BDF8" />
            <stop offset="1" stopColor="#0284C7" />
          </linearGradient>
          <clipPath id="tank-clip">
            <rect x="12" y="12" width="86" height={H - 4} rx="14" />
          </clipPath>
        </defs>
        <rect x="10" y="10" width="90" height={H} rx="16" fill="#F6F8F5" stroke="#CFE3D8" strokeWidth="2" />
        {known ? (
          <g clipPath="url(#tank-clip)">
            <rect x="12" y={10 + H - 2 - fillH} width="86" height={fillH + 2} fill="url(#tank-water)" />
            <path d={`M12 ${10 + H - 2 - fillH} q 11 -5 22 0 t 22 0 t 22 0 t 22 0`} fill="#7DD3FC" opacity=".6" />
          </g>
        ) : (
          <path d="M30 80 h50" stroke="#CBD5CF" strokeWidth="2" strokeDasharray="4 4" />
        )}
        {[0.25, 0.5, 0.75].map((p) => (
          <line key={p} x1="86" x2="98" y1={10 + H - 2 - p * (H - 20)} y2={10 + H - 2 - p * (H - 20)} stroke="#9CB5A8" strokeWidth="1.5" />
        ))}
      </svg>
      <div>
        <p className="text-xs text-muted">{t('hydro.gauge.title')}</p>
        {known ? (
          <>
            <p className="tabular text-3xl font-semibold text-water-700">{fmtRatio(ratio, lang, 0)}</p>
            <p className="tabular text-sm text-muted">{t('hydro.gauge.of', { level: fmtLitres(level, lang), capacity: fmtLitres(capacity, lang) })}</p>
          </>
        ) : (
          <>
            <p className="text-lg font-semibold text-muted">{t('hydro.gauge.notRecorded')}</p>
            <p className="text-sm text-muted">{t('hydro.gauge.capacity', { capacity: fmtLitres(capacity, lang) })}</p>
          </>
        )}
      </div>
    </div>
  );
}

interface FlowTerm {
  key: string;
  label: string;
  value: number | null;
  color: string;
}

/**
 * Water-flow diagram for the latest record: Input → Consumed / Discharged / Losses / ΔStorage / Unaccounted,
 * with Recycled drawn as a loop back to the input. Missing terms are drawn dashed as "not measured".
 * Mirrored for RTL so the flow reads in the language direction.
 */
export function WaterFlowDiagram({ row, closedLoop }: { row: HydroBalanceRow; closedLoop: boolean }) {
  const { t, lang, dir } = useI18n();
  const rtl = dir === 'rtl';
  const W = 720;
  const H = 330;
  const mx = (x: number) => (rtl ? W - x : x);
  const anchor = (a: 'start' | 'end') => (rtl ? (a === 'start' ? 'end' : 'start') : a);

  const terms: FlowTerm[] = [
    { key: 'consumed', label: t('hydro.flow.consumed'), value: row.consumed_l, color: '#059669' },
    { key: 'discharged', label: t('hydro.flow.discharged'), value: row.discharged_l, color: '#D97706' },
    { key: 'losses', label: t('hydro.flow.losses'), value: row.losses_l, color: '#C2410C' },
    { key: 'storage', label: t('hydro.flow.storage'), value: row.delta_storage_l, color: '#0284C7' },
    { key: 'unaccounted', label: t('hydro.flow.unaccounted'), value: row.unaccounted_l, color: '#7C3AED' },
  ];
  const maxV = Math.max(row.input_l, ...terms.map((x) => Math.abs(x.value ?? 0)), 1);
  const width = (v: number | null) => (isNum(v) ? 2 + (Math.abs(v) / maxV) * 16 : 1.5);
  const ys = [44, 104, 164, 224, 284];
  const srcX = 190;
  const srcY = 150;
  const dstX = 470;

  const summary = [
    `${t('hydro.flow.input')} ${fmtLitres(row.input_l, lang)}`,
    ...terms.map((x) => `${x.label} ${isNum(x.value) ? fmtLitres(x.value, lang) : t('hydro.flow.notMeasured')}`),
    `${t('hydro.flow.recycled')} ${isNum(row.recycled_l) ? fmtLitres(row.recycled_l, lang) : t('hydro.flow.notMeasured')}`,
  ].join(', ');

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={t('hydro.flow.label', { summary })}>
      <defs>
        <marker id="arrow-flow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="#5B6B63" />
        </marker>
      </defs>

      {/* input node */}
      <rect x={rtl ? W - 190 : 20} y={110} width={170} height={80} rx={18} fill="#0F3D2E" />
      <text x={mx(105)} y={142} textAnchor="middle" fontSize="13" fill="#A7F3D0">
        {t('hydro.flow.input')}
      </text>
      <text x={mx(105)} y={168} textAnchor="middle" fontSize="18" fontWeight={600} fill="#fff">
        {fmtLitres(row.input_l, lang)}
      </text>

      {/* recycled loop under the input node */}
      <path
        d={`M ${mx(150)} 190 C ${mx(150)} 260, ${mx(60)} 260, ${mx(60)} 196`}
        fill="none"
        stroke={isNum(row.recycled_l) && row.recycled_l > 0 ? '#0D9488' : '#CBD5CF'}
        strokeWidth={isNum(row.recycled_l) && row.recycled_l > 0 ? 4 : 2}
        strokeDasharray={isNum(row.recycled_l) ? undefined : '5 5'}
        markerEnd="url(#arrow-flow)"
      />
      <text x={mx(105)} y={282} textAnchor="middle" fontSize="12" fill="#0B6B63" fontWeight={600}>
        {t('hydro.flow.recycled')}: {isNum(row.recycled_l) ? fmtLitres(row.recycled_l, lang) : t('hydro.flow.notMeasured')}
      </text>
      <text x={mx(105)} y={300} textAnchor="middle" fontSize="11" fill="#5B6B63">
        {isNum(row.recirculation_ratio) ? t('hydro.flow.ratio', { v: fmtRatio(row.recirculation_ratio, lang, 1) }) : closedLoop ? t('hydro.closedLoop') : t('hydro.openLoop')}
      </text>

      {/* branches */}
      {terms.map((term, i) => {
        const y = ys[i];
        const measured = isNum(term.value);
        return (
          <g key={term.key}>
            <path
              d={`M ${mx(srcX)} ${srcY} C ${mx(srcX + 140)} ${srcY}, ${mx(dstX - 140)} ${y}, ${mx(dstX)} ${y}`}
              fill="none"
              stroke={measured ? term.color : '#CBD5CF'}
              strokeOpacity={measured ? 0.8 : 1}
              strokeWidth={width(term.value)}
              strokeDasharray={measured ? undefined : '6 6'}
              strokeLinecap="round"
            />
            <circle cx={mx(dstX)} cy={y} r={5} fill={measured ? term.color : '#CBD5CF'} />
            <text x={mx(dstX + 14)} y={y - 3} textAnchor={anchor('start')} fontSize="13" fill="#10231B" fontWeight={600}>
              {term.label}
            </text>
            <text x={mx(dstX + 14)} y={y + 14} textAnchor={anchor('start')} fontSize="12" fill={measured ? '#5B6B63' : '#9AA8A1'}>
              {measured ? fmtLitres(term.value, lang) : t('hydro.flow.notMeasured')}
              {measured && term.key === 'unaccounted' && isNum(row.unaccounted_fraction) ? ` (${fmtRatio(row.unaccounted_fraction, lang, 1)})` : ''}
            </text>
          </g>
        );
      })}
      <text x={mx(20)} y={24} textAnchor={anchor('start')} fontSize="11" fill="#5B6B63">
        {t('hydro.flow.equation')}
      </text>
      {row.missing_terms.length ? (
        <text x={mx(20)} y={44} textAnchor={anchor('start')} fontSize="11" fill="#92400E">
          {t('hydro.flow.missing', { terms: row.missing_terms.join(', ') })}
        </text>
      ) : null}
      {/* scale hint */}
      <text x={mx(20)} y={H - 6} textAnchor={anchor('start')} fontSize="10" fill="#9AA8A1">
        {t('hydro.flow.scale', { v: fmtNumber(maxV, lang, 0) })}
      </text>
    </svg>
  );
}

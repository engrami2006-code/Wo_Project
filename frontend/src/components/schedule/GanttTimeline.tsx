import { useI18n } from '../../i18n';
import type { ScheduledTask } from '../../types/api';
import { fmtLitres, toMinutes } from '../../utils/format';
import { CHART_COLORS } from '../charts/ChartFrame';

/**
 * Gantt-style day timeline: hours on the x axis, one row per irrigation task,
 * blocked periods hatched. Always drawn left-to-right (clock time).
 */
export function GanttTimeline({
  tasks,
  windowStart,
  windowEnd,
  blocked,
}: {
  tasks: ScheduledTask[];
  windowStart: string;
  windowEnd: string;
  blocked: { start: string; end: string }[];
}) {
  const { t, lang } = useI18n();
  const ws = toMinutes(windowStart);
  const we = toMinutes(windowEnd);
  const span = Math.max(60, we - ws);
  const labelW = 132;
  const W = 900;
  const rowH = 36;
  const top = 28;
  const H = top + tasks.length * rowH + 18;
  const x = (min: number) => labelW + ((min - ws) / span) * (W - labelW - 12);
  const firstHour = Math.ceil(ws / 60);
  const lastHour = Math.floor(we / 60);
  const hours = Array.from({ length: lastHour - firstHour + 1 }, (_, i) => firstHour + i);
  const step = hours.length > 14 ? 2 : 1;

  const summary = tasks
    .map((tk) => (tk.start ? `${tk.name}: ${tk.start}–${tk.end}` : `${tk.name}: ${t('schedule.unscheduled')}`))
    .join('; ');

  return (
    <div className="scrollbar-thin overflow-x-auto" dir="ltr">
      <svg viewBox={`0 0 ${W} ${H}`} className="min-w-[640px] w-full" role="img" aria-label={t('schedule.ganttLabel', { summary })}>
        <defs>
          <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="8" height="8" fill="#F6F8F5" />
            <line x1="0" y1="0" x2="0" y2="8" stroke="#C2410C" strokeOpacity="0.35" strokeWidth="3" />
          </pattern>
        </defs>
        {/* blocked ranges */}
        {blocked.map((b, i) => {
          const s = Math.max(ws, toMinutes(b.start));
          const e = Math.min(we, toMinutes(b.end));
          if (e <= s) return null;
          return (
            <g key={i}>
              <rect x={x(s)} y={top - 6} width={x(e) - x(s)} height={H - top} fill="url(#hatch)" />
              <text x={(x(s) + x(e)) / 2} y={H - 4} textAnchor="middle" fontSize="10" fill="#9A3412">
                {t('schedule.blocked')}
              </text>
            </g>
          );
        })}
        {/* hour grid */}
        {hours.map((h) => (
          <g key={h}>
            <line x1={x(h * 60)} x2={x(h * 60)} y1={top - 4} y2={H - 8} stroke="#E3E9E4" />
            {(h - firstHour) % step === 0 ? (
              <text x={x(h * 60)} y={14} textAnchor={h === lastHour && x(h * 60) > W - 30 ? 'end' : 'middle'} fontSize="11" fill="#5B6B63">
                {String(h).padStart(2, '0')}:00
              </text>
            ) : null}
          </g>
        ))}
        {/* rows */}
        {tasks.map((tk, i) => {
          const y = top + i * rowH;
          const color = CHART_COLORS[i % CHART_COLORS.length];
          return (
            <g key={`${tk.name}-${i}`}>
              <text x={8} y={y + rowH / 2 + 4} fontSize="12" fill="#10231B">
                {tk.name.length > 16 ? `${tk.name.slice(0, 15)}…` : tk.name}
              </text>
              <line x1={labelW} x2={W - 12} y1={y + rowH - 2} y2={y + rowH - 2} stroke="#F0F3F0" />
              {tk.start && tk.end ? (
                (() => {
                  const x0 = x(toMinutes(tk.start));
                  const w = Math.max(4, x(toMinutes(tk.end)) - x0);
                  const label = `${tk.start}–${tk.end}  ${fmtLitres(tk.volume_l, lang, { maxFrac: 0 })}`;
                  // Put the label inside the bar when it fits, otherwise right after it in ink colour.
                  const fits = label.length * 6.4 + 16 < w;
                  return (
                    <g>
                      <rect x={x0} y={y + 6} width={w} height={rowH - 14} rx={6} fill={color} />
                      <text x={fits ? x0 + 8 : x0 + w + 6} y={y + rowH / 2 + 3} fontSize="11" fill={fits ? '#fff' : '#10231B'} fontWeight={600}>
                        {label}
                      </text>
                    </g>
                  );
                })()
              ) : (
                <text x={labelW + 8} y={y + rowH / 2 + 4} fontSize="11" fill="#9A3412">
                  {t('schedule.unscheduled')}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { AXIS_COLOR, CHART_COLORS, ChartTooltip, GRID_COLOR, WATER_COLOR } from './ChartFrame';

const axisProps = {
  tick: { fill: AXIS_COLOR, fontSize: 12 },
  tickLine: false,
  axisLine: { stroke: GRID_COLOR },
} as const;

export function TimeAreaChart({
  data,
  xKey,
  yKey,
  name,
  format,
  tickFormat,
  color = WATER_COLOR,
}: {
  data: Record<string, unknown>[];
  xKey: string;
  yKey: string;
  name: string;
  format: (v: number) => string;
  tickFormat?: (v: string) => string;
  color?: string;
}) {
  const reduced = useReducedMotion();
  const gid = `grad-${yKey}`;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={GRID_COLOR} vertical={false} />
        <XAxis dataKey={xKey} {...axisProps} tickFormatter={tickFormat} minTickGap={24} />
        <YAxis {...axisProps} width={56} tickFormatter={(v: number) => format(v)} />
        <Tooltip cursor={{ stroke: color, strokeOpacity: 0.3 }} content={<ChartTooltip formatter={format} labelFormatter={(l) => (tickFormat ? tickFormat(String(l)) : String(l))} />} />
        <Area type="monotone" dataKey={yKey} name={name} stroke={color} strokeWidth={2} fill={`url(#${gid})`} isAnimationActive={!reduced} activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function CategoryBarChart({
  data,
  xKey,
  yKey,
  name,
  format,
  layout = 'vertical',
  colorByIndex = false,
  color = WATER_COLOR,
  scale,
}: {
  data: Record<string, unknown>[];
  xKey: string;
  yKey: string;
  name: string;
  format: (v: number) => string;
  layout?: 'vertical' | 'horizontal';
  colorByIndex?: boolean;
  color?: string;
  scale?: 'log' | 'linear';
}) {
  const reduced = useReducedMotion();
  if (layout === 'vertical') {
    // horizontal bars (categories on the y axis)
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 0 }} barCategoryGap={8}>
          <CartesianGrid stroke={GRID_COLOR} horizontal={false} />
          <XAxis type="number" {...axisProps} tickFormatter={(v: number) => format(v)} scale={scale ?? 'auto'} domain={scale === 'log' ? [1, 'auto'] : undefined} allowDataOverflow={scale === 'log'} />
          <YAxis type="category" dataKey={xKey} {...axisProps} width={110} />
          <Tooltip cursor={{ fill: '#F1F5F2' }} content={<ChartTooltip formatter={format} />} />
          <Bar dataKey={yKey} name={name} radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={!reduced}>
            {data.map((_, i) => (
              <Cell key={i} fill={colorByIndex ? CHART_COLORS[i % CHART_COLORS.length] : color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID_COLOR} vertical={false} />
        <XAxis dataKey={xKey} {...axisProps} minTickGap={16} />
        <YAxis {...axisProps} width={56} tickFormatter={(v: number) => format(v)} scale={scale ?? 'auto'} domain={scale === 'log' ? [1, 'auto'] : undefined} allowDataOverflow={scale === 'log'} />
        <Tooltip cursor={{ fill: '#F1F5F2' }} content={<ChartTooltip formatter={format} />} />
        <Bar dataKey={yKey} name={name} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={!reduced}>
          {data.map((_, i) => (
            <Cell key={i} fill={colorByIndex ? CHART_COLORS[i % CHART_COLORS.length] : color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({ data, format }: { data: { name: string; value: number }[]; format: (v: number) => string }) {
  const reduced = useReducedMotion();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Tooltip content={<ChartTooltip formatter={format} />} />
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="92%" paddingAngle={data.length > 1 ? 2 : 0} stroke="#fff" strokeWidth={2} isAnimationActive={!reduced}>
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}

export function BandTrendChart({
  data,
  xKey,
  yKey,
  name,
  min,
  max,
  format,
  tickFormat,
  color,
  bandLabel,
}: {
  data: Record<string, unknown>[];
  xKey: string;
  yKey: string;
  name: string;
  min: number | null;
  max: number | null;
  format: (v: number) => string;
  tickFormat?: (v: string) => string;
  color: string;
  bandLabel: string;
}) {
  const reduced = useReducedMotion();
  const values = data.map((d) => d[yKey]).filter((v): v is number => typeof v === 'number');
  const lo = Math.min(...values, min ?? Infinity);
  const hi = Math.max(...values, max ?? -Infinity);
  const pad = Math.max((hi - lo) * 0.15, 0.1);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID_COLOR} vertical={false} />
        <XAxis dataKey={xKey} {...axisProps} tickFormatter={tickFormat} minTickGap={20} />
        <YAxis {...axisProps} width={44} domain={[Math.max(0, lo - pad), hi + pad]} tickFormatter={(v: number) => format(v)} />
        {min !== null && max !== null ? (
          <ReferenceArea y1={min} y2={max} fill="#10B981" fillOpacity={0.12} stroke="#10B981" strokeOpacity={0.35} strokeDasharray="4 4" label={{ value: bandLabel, position: 'insideTopLeft', fill: '#047857', fontSize: 11 }} />
        ) : null}
        <Tooltip content={<ChartTooltip formatter={format} labelFormatter={(l) => (tickFormat ? tickFormat(String(l)) : String(l))} />} />
        <Line type="monotone" dataKey={yKey} name={name} stroke={color} strokeWidth={2} dot={{ r: 3.5, strokeWidth: 2, stroke: '#fff', fill: color }} activeDot={{ r: 5 }} connectNulls isAnimationActive={!reduced} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function LoadProfileChart({
  data,
  capacity,
  format,
  capacityLabel,
  name,
}: {
  data: { time: string; load_lph: number; blocked: boolean }[];
  capacity: number;
  format: (v: number) => string;
  capacityLabel: string;
  name: string;
}) {
  const reduced = useReducedMotion();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 16, right: 12, bottom: 0, left: 0 }} barCategoryGap={1}>
        <CartesianGrid stroke={GRID_COLOR} vertical={false} />
        <XAxis dataKey="time" {...axisProps} minTickGap={20} />
        <YAxis {...axisProps} width={56} tickFormatter={(v: number) => format(v)} domain={[0, Math.max(capacity * 1.1, ...data.map((d) => d.load_lph))]} />
        <Tooltip cursor={{ fill: '#F1F5F2' }} content={<ChartTooltip formatter={format} />} />
        <ReferenceLine y={capacity} stroke="#C2410C" strokeDasharray="6 4" strokeWidth={1.5} label={{ value: capacityLabel, position: 'insideTopRight', fill: '#9A3412', fontSize: 11 }} />
        <Bar dataKey="load_lph" name={name} isAnimationActive={!reduced} radius={[3, 3, 0, 0]}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.blocked ? '#CBD5CF' : '#0D9488'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

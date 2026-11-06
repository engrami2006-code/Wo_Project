import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { BarChart3, Table2 } from 'lucide-react';
import { useI18n } from '../../i18n';
import { cn } from '../../utils/cn';

/** Categorical chart palette (validated for CVD separation and ≥3:1 contrast on white). */
export const CHART_COLORS = ['#0284C7', '#059669', '#7C3AED', '#D97706', '#0D9488', '#C2410C'];
export const WATER_COLOR = '#0284C7';
export const GRID_COLOR = '#E8EEE9';
export const AXIS_COLOR = '#5B6B63';

export interface ChartTable {
  columns: string[];
  rows: (string | number)[][];
}

/**
 * Wraps a chart with a heading, an aria-label summary and a "view as table" toggle so the
 * data is always available as text. Charts render LTR (time and value axes) in both languages.
 */
export function ChartFrame({
  title,
  summary,
  table,
  children,
  actions,
  className,
  height = 260,
  subtitle,
}: {
  title: ReactNode;
  summary: string;
  table: ChartTable;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  height?: number;
  subtitle?: ReactNode;
}) {
  const { t } = useI18n();
  const [asTable, setAsTable] = useState(false);
  const id = useId();
  return (
    <section className={cn('card p-5 sm:p-6', className)} aria-labelledby={id}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={id} className="text-base font-semibold text-ink">
            {title}
          </h2>
          {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          {actions}
          <button
            type="button"
            onClick={() => setAsTable((v) => !v)}
            aria-pressed={asTable}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs font-medium text-muted hover:bg-forest-50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
          >
            {asTable ? <BarChart3 className="h-3.5 w-3.5" aria-hidden /> : <Table2 className="h-3.5 w-3.5" aria-hidden />}
            {asTable ? t('chart.showChart') : t('chart.showTable')}
          </button>
        </div>
      </div>
      {asTable ? (
        <div className="scrollbar-thin overflow-auto rounded-xl border border-line" style={{ maxHeight: Math.max(height, 220) }}>
          <table className="w-full text-sm">
            <caption className="sr-only">{summary}</caption>
            <thead className="sticky top-0 bg-canvas">
              <tr>
                {table.columns.map((c) => (
                  <th key={c} scope="col" className="px-3 py-2 text-start text-xs font-semibold text-muted">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i} className="border-t border-line/70">
                  {r.map((cell, j) => (
                    <td key={j} className={cn('tabular px-3 py-1.5', j > 0 && 'text-end')}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <figure role="img" aria-label={summary} className="m-0" dir="ltr" style={{ height }}>
          {children}
        </figure>
      )}
    </section>
  );
}

export function ChartTooltip({
  active,
  payload,
  label,
  formatter,
  labelFormatter,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number | string; color?: string; payload?: Record<string, unknown> }[];
  label?: string | number;
  formatter: (v: number) => string;
  labelFormatter?: (l: string | number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-pop">
      {label !== undefined ? <p className="mb-1 font-medium text-ink">{labelFormatter ? labelFormatter(label) : label}</p> : null}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-2 text-muted">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} aria-hidden />
          {p.name ? <span>{p.name}</span> : null}
          <span className="tabular ms-auto font-semibold text-ink">{typeof p.value === 'number' ? formatter(p.value) : p.value}</span>
        </p>
      ))}
    </div>
  );
}

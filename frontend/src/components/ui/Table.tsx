import type { ReactNode } from 'react';
import { cn } from '../../utils/cn';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: 'start' | 'end' | 'center';
  className?: string;
  /** hide this column in the stacked mobile card */
  hideOnMobile?: boolean;
  /** render as the card title on mobile */
  primary?: boolean;
}

/**
 * Responsive data table: a real <table> from `md` up, stacked cards below it.
 */
export function Table<T>({
  columns,
  rows,
  rowKey,
  caption,
  className,
  dense,
  rowClassName,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption?: string;
  className?: string;
  dense?: boolean;
  rowClassName?: (row: T) => string | undefined;
}) {
  const primary = columns.find((c) => c.primary) ?? columns[0];
  return (
    <div className={cn('min-w-0', className)}>
      <div className="scrollbar-thin hidden overflow-x-auto md:block">
        <table className="w-full border-separate border-spacing-0 text-sm">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    'whitespace-nowrap border-b border-line bg-canvas/70 px-4 py-2.5 text-start text-xs font-semibold text-muted first:rounded-ss-xl last:rounded-se-xl',
                    c.align === 'end' && 'text-end',
                    c.align === 'center' && 'text-center',
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className={cn('group transition-colors hover:bg-forest-50/40', rowClassName?.(row))}>
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      'border-b border-line/70 px-4 align-middle text-ink group-last:border-0',
                      dense ? 'py-2' : 'py-3',
                      c.align === 'end' && 'text-end',
                      c.align === 'center' && 'text-center',
                      c.className,
                    )}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-3 md:hidden" aria-label={caption}>
        {rows.map((row) => (
          <li key={rowKey(row)} className={cn('rounded-2xl border border-line bg-surface p-4', rowClassName?.(row))}>
            <div className="mb-2 font-medium text-ink">{primary.cell(row)}</div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              {columns
                .filter((c) => c !== primary && !c.hideOnMobile)
                .map((c) => (
                  <div key={c.key} className="min-w-0">
                    <dt className="text-xs text-muted">{c.header}</dt>
                    <dd className="min-w-0 break-words text-ink">{c.cell(row)}</dd>
                  </div>
                ))}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Small key/value list used inside cards. */
export function KeyValue({ items, className, cols = 2 }: { items: { label: ReactNode; value: ReactNode }[]; className?: string; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={cn('grid gap-x-6 gap-y-3', cols === 2 && 'sm:grid-cols-2', cols === 3 && 'sm:grid-cols-3', className)}>
      {items.map((it, i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs text-muted">{it.label}</dt>
          <dd className="mt-0.5 break-words text-sm font-medium text-ink">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

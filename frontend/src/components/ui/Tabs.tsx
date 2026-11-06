import { useId, useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { useI18n } from '../../i18n';
import { cn } from '../../utils/cn';

export interface TabItem<K extends string> {
  key: K;
  label: ReactNode;
  icon?: ReactNode;
  count?: number;
}

export function Tabs<K extends string>({
  items,
  value,
  onChange,
  label,
  className,
  idPrefix,
}: {
  items: TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  label: string;
  className?: string;
  idPrefix?: string;
}) {
  const { dir } = useI18n();
  const autoId = useId();
  const prefix = idPrefix ?? autoId;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const forward = dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
    const back = dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
    let next = -1;
    if (e.key === forward) next = (index + 1) % items.length;
    else if (e.key === back) next = (index - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    if (next >= 0) {
      e.preventDefault();
      refs.current[next]?.focus();
      onChange(items[next].key);
    }
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn('scrollbar-thin -mx-1 flex gap-1 overflow-x-auto border-b border-line px-1', className)}
    >
      {items.map((item, i) => {
        const selected = item.key === value;
        return (
          <button
            key={item.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={`${prefix}-tab-${item.key}`}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-controls={`${prefix}-panel-${item.key}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.key)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              'relative -mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal',
              selected ? 'border-forest-700 text-forest-700' : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {item.icon}
            {item.label}
            {typeof item.count === 'number' ? (
              <span
                className={cn(
                  'tabular rounded-full px-1.5 text-2xs',
                  selected ? 'bg-forest-700 text-white' : 'bg-forest-50 text-forest-600',
                )}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ id, tabKey, active, children, className }: { id: string; tabKey: string; active: boolean; children: ReactNode; className?: string }) {
  if (!active) return null;
  return (
    <div
      role="tabpanel"
      id={`${id}-panel-${tabKey}`}
      aria-labelledby={`${id}-tab-${tabKey}`}
      tabIndex={0}
      className={cn('animate-page-in focus-visible:outline-none', className)}
    >
      {children}
    </div>
  );
}

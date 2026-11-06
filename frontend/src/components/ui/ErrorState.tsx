import { CloudOff, RotateCw } from 'lucide-react';
import { useI18n } from '../../i18n';
import { describeError } from '../../utils/errors';
import { cn } from '../../utils/cn';
import { Button } from './Button';

export function ErrorState({ error, onRetry, className, compact }: { error: unknown; onRetry?: () => void; className?: string; compact?: boolean }) {
  const { t } = useI18n();
  const d = describeError(error, t);
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center rounded-2xl border border-earth/20 bg-earth-50/50 text-center',
        compact ? 'px-4 py-6' : 'px-6 py-12',
        className,
      )}
    >
      <span className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-surface text-earth ring-1 ring-earth/20" aria-hidden>
        <CloudOff className="h-6 w-6" />
      </span>
      <h3 className="font-semibold text-ink">{d.title}</h3>
      {d.detail ? (
        <p className="mt-1 max-w-lg text-sm text-muted" dir="auto">
          {d.detail}
        </p>
      ) : null}
      {onRetry ? (
        <Button variant="secondary" size="sm" className="mt-4" icon={<RotateCw className="h-4 w-4" />} onClick={onRetry}>
          {t('common.retry')}
        </Button>
      ) : null}
    </div>
  );
}

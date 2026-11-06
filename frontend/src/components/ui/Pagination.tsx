import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useI18n } from '../../i18n';
import { Button } from './Button';

export function Pagination({ page, size, total, onChange }: { page: number; size: number; total: number; onChange: (p: number) => void }) {
  const { t } = useI18n();
  const pages = Math.max(1, Math.ceil(total / size));
  if (total <= size) return null;
  return (
    <nav className="mt-4 flex items-center justify-between gap-3 text-sm" aria-label={t('common.pagination')}>
      <p className="tabular text-muted">{t('common.pageOf', { page, pages, total })}</p>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          icon={<ChevronLeft className="flip-rtl h-4 w-4" aria-hidden />}
        >
          {t('common.previous')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
          iconEnd={<ChevronRight className="flip-rtl h-4 w-4" aria-hidden />}
        >
          {t('common.next')}
        </Button>
      </div>
    </nav>
  );
}

import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Lightbulb, X } from 'lucide-react';
import { RecommendationCard } from '../components/explain/RecommendationCard';
import { Badge, Button, EmptyState, ErrorState, PageHeader, Skeleton, useToast } from '../components/ui';
import { qk } from '../hooks/queries';
import { useI18n } from '../i18n';
import { recommendationService } from '../services/irrigation';
import type { RecommendationStatus } from '../types/api';
import { errorText } from '../utils/errors';
import { fmtDate, fmtDateTime } from '../utils/format';
import { labelRecKind, labelRecStatus } from '../utils/labels';

export default function RecommendationDetailPage() {
  const { recId = '' } = useParams();
  const { t, lang, bi } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const rec = useQuery({ queryKey: qk.recommendation(recId), queryFn: () => recommendationService.get(recId), enabled: !!recId });
  const update = useMutation({
    mutationFn: (status: RecommendationStatus) => recommendationService.setStatus(recId, status),
    onSuccess: (r) => {
      qc.setQueryData(qk.recommendation(recId), (old: typeof rec.data) => (old ? { ...old, status: r.status } : old));
      void qc.invalidateQueries({ queryKey: ['recommendations'] });
      toast.success(r.status === 'accepted' ? t('recs.toast.accepted') : t('recs.toast.dismissed'));
    },
    onError: (err) => toast.error(t('recs.toast.failed'), errorText(err, t)),
  });

  if (rec.isPending) return <Skeleton className="h-96 w-full rounded-2xl" />;
  if (rec.isError) return <ErrorState error={rec.error} onRetry={() => void rec.refetch()} />;
  const r = rec.data;

  return (
    <div>
      <PageHeader
        back={{ to: '/recommendations', label: t('recs.title') }}
        icon={<Lightbulb className="h-6 w-6" />}
        title={bi(r.title_en, r.title_ar)}
        description={t('recs.detailMeta', { kind: labelRecKind(t, r.kind), date: fmtDate(r.target_date, lang), created: fmtDateTime(r.created_at, lang) })}
        meta={<Badge tone={r.status === 'accepted' ? 'emerald' : r.status === 'dismissed' ? 'neutral' : 'outline'} dot>{labelRecStatus(t, r.status)}</Badge>}
        actions={
          <>
            <Button variant="secondary" icon={<X className="h-4 w-4" aria-hidden />} disabled={r.status === 'dismissed'} loading={update.isPending && update.variables === 'dismissed'} onClick={() => update.mutate('dismissed')}>
              {t('recs.dismiss')}
            </Button>
            <Button icon={<Check className="h-4 w-4" aria-hidden />} disabled={r.status === 'accepted'} loading={update.isPending && update.variables === 'accepted'} onClick={() => update.mutate('accepted')}>
              {t('recs.accept')}
            </Button>
          </>
        }
      />
      {r.payload ? (
        <RecommendationCard explanation={r.payload} />
      ) : (
        <div className="card">
          <EmptyState icon={<Lightbulb className="h-7 w-7" />} title={t('recs.noPayload')} />
        </div>
      )}
    </div>
  );
}

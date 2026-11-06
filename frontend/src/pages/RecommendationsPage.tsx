import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Droplets, FlaskConical, Lightbulb } from 'lucide-react';
import { Badge, ButtonLink, EmptyState, ErrorState, Field, PageHeader, Pagination, Select, SkeletonTable } from '../components/ui';
import { qk } from '../hooks/queries';
import { useFarmContext } from '../hooks/useFarmContext';
import { useI18n } from '../i18n';
import { recommendationService } from '../services/irrigation';
import { cn } from '../utils/cn';
import { fmtDate, fmtLitres, fmtRelative } from '../utils/format';
import { labelCertainty, labelDataQuality, labelRecKind, labelRecStatus } from '../utils/labels';

const PAGE_SIZE = 15;

export default function RecommendationsPage() {
  const { t, lang, bi } = useI18n();
  const { farms } = useFarmContext();
  const [farmId, setFarmId] = useState('');
  const [kind, setKind] = useState('');
  const [page, setPage] = useState(1);
  const filters = useMemo(() => ({ farm_id: farmId || undefined, kind: kind || undefined, page, size: PAGE_SIZE }), [farmId, kind, page]);
  const recs = useQuery({ queryKey: qk.recommendations(filters), queryFn: () => recommendationService.list(filters), placeholderData: keepPreviousData });
  const farmName = (id: string) => farms.find((f) => f.id === id)?.name ?? '—';

  return (
    <div>
      <PageHeader icon={<Lightbulb className="h-6 w-6" />} title={t('recs.title')} description={t('recs.description')} />
      <div className="card mb-5 flex flex-wrap items-end gap-3 p-4">
        <Field label={t('common.farm')} className="w-full sm:w-52">
          <Select value={farmId} onChange={(e) => { setFarmId(e.target.value); setPage(1); }}>
            <option value="">{t('common.allFarms')}</option>
            {farms.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </Select>
        </Field>
        <Field label={t('recs.kind')} className="w-full sm:w-48">
          <Select value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }}>
            <option value="">{t('common.all')}</option>
            <option value="irrigation">{labelRecKind(t, 'irrigation')}</option>
            <option value="hydroponic">{labelRecKind(t, 'hydroponic')}</option>
          </Select>
        </Field>
      </div>
      {recs.isPending ? (
        <SkeletonTable rows={6} />
      ) : recs.isError ? (
        <ErrorState error={recs.error} onRetry={() => void recs.refetch()} />
      ) : recs.data.items.length === 0 ? (
        <div className="card">
          <EmptyState icon={<Lightbulb className="h-7 w-7" />} title={t('recs.empty.title')} hint={t('recs.empty.hint')} action={<ButtonLink to="/irrigation">{t('dash.action.irrigate')}</ButtonLink>} />
        </div>
      ) : (
        <>
          <ul className="space-y-3">
            {recs.data.items.map((r) => (
              <li key={r.id}>
                <Link to={`/recommendations/${r.id}`} className="card hover-lift flex items-start gap-4 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal sm:p-5">
                  <span className={cn('inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl', r.kind === 'hydroponic' ? 'bg-[#E0F4F2] text-[#0B6B63]' : 'bg-water-50 text-water-700')} aria-hidden>
                    {r.kind === 'hydroponic' ? <FlaskConical className="h-5 w-5" /> : <Droplets className="h-5 w-5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{bi(r.title_en, r.title_ar)}</span>
                      {r.amount_l !== null ? <Badge tone="water" size="xs">{fmtLitres(r.amount_l, lang)}</Badge> : null}
                      <Badge tone={r.status === 'accepted' ? 'emerald' : r.status === 'dismissed' ? 'neutral' : 'outline'} size="xs">{labelRecStatus(t, r.status)}</Badge>
                    </span>
                    <span className="mt-1 line-clamp-2 block text-sm text-muted">{bi(r.summary_en, r.summary_ar)}</span>
                    <span className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      <span>{farmName(r.farm_id)}</span>
                      <span aria-hidden>—</span>
                      <span>{labelRecKind(t, r.kind)}</span>
                      <span aria-hidden>—</span>
                      <span>{t('recs.for', { date: fmtDate(r.target_date, lang) })}</span>
                      <Badge tone={r.certainty === 'entailed' ? 'emerald' : 'warning'} size="xs">{labelCertainty(t, r.certainty)}</Badge>
                      <Badge tone="outline" size="xs">{labelDataQuality(t, r.data_quality)}</Badge>
                    </span>
                  </span>
                  <span className="hidden shrink-0 text-xs text-muted sm:block">{fmtRelative(r.created_at, lang)}</span>
                </Link>
              </li>
            ))}
          </ul>
          <Pagination page={page} size={PAGE_SIZE} total={recs.data.total} onChange={setPage} />
        </>
      )}
    </div>
  );
}

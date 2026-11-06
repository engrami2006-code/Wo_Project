import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Plus, Search, Sprout } from 'lucide-react';
import { KcSparkline, StageBar } from '../components/crops/CropVisuals';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Field,
  FormError,
  FormGrid,
  Input,
  Modal,
  PageHeader,
  Segmented,
  SkeletonCards,
  Textarea,
  Toggle,
  useToast,
} from '../components/ui';
import { qk, useCrops } from '../hooks/queries';
import { useAuth } from '../hooks/useAuth';
import { useOnOpen } from '../hooks/useOnOpen';
import { useI18n } from '../i18n';
import { cropService } from '../services/farms';
import type { Crop, CropCreate } from '../types/api';
import { errorText } from '../utils/errors';
import { fmtInt, fmtNumber, parseNum } from '../utils/format';

function CropCard({ crop }: { crop: Crop }) {
  const { t, lang, bi } = useI18n();
  return (
    <li className="card flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-ink">{bi(crop.name_en, crop.name_ar)}</h2>
          <p className="mt-0.5 truncate text-xs text-muted">
            {lang === 'ar' ? crop.name_en : crop.name_ar} — {crop.category.replace(/_/g, ' ')}
          </p>
        </div>
        <Badge tone={crop.is_reference ? 'forest' : 'teal'} size="xs">
          {crop.is_reference ? t('crops.reference') : t('crops.custom')}
        </Badge>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2">
        {(
          [
            ['Kc ini', crop.kc_ini],
            ['Kc mid', crop.kc_mid],
            ['Kc end', crop.kc_end],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="rounded-xl bg-canvas px-2.5 py-2">
            <dt className="font-mono text-[11px] text-muted" dir="ltr">
              {k}
            </dt>
            <dd className="tabular text-base font-semibold text-ink">{fmtNumber(v, lang, 2)}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4">
        {crop.l_ini !== null ? (
          <>
            <KcSparkline crop={crop} />
            <StageBar crop={crop} />
          </>
        ) : (
          <p className="rounded-xl border border-dashed border-line px-3 py-3 text-xs text-muted">{t('crops.perennialNoStages')}</p>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
        <div>
          <dt className="text-xs text-muted">{t('crops.season')}</dt>
          <dd className="tabular font-medium text-ink">{crop.season_length_days ? `${fmtInt(crop.season_length_days, lang)} ${t('unit.days')}` : '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted" title={t('crops.kyHint')}>
            Ky
          </dt>
          <dd className="tabular font-medium text-ink">
            {fmtNumber(crop.ky, lang, 2)}
            {crop.ky !== null && crop.ky > 1 ? <span className="ms-1 text-xs font-normal text-[#B45309]">{t('crops.sensitive')}</span> : null}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{t('crops.height')}</dt>
          <dd className="tabular font-medium text-ink">{crop.max_height_m !== null ? `${fmtNumber(crop.max_height_m, lang, 2)} ${t('unit.m')}` : '—'}</dd>
        </div>
      </dl>

      <div className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-muted">
        <p className="flex items-start gap-1.5">
          <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-forest-600" aria-hidden />
          <span dir="auto">{crop.source}</span>
        </p>
        {crop.source_note ? (
          <p className="mt-1.5 line-clamp-3" dir="auto" title={crop.source_note}>
            {crop.source_note}
          </p>
        ) : null}
      </div>
    </li>
  );
}

interface CropForm {
  code: string;
  name_en: string;
  name_ar: string;
  category: string;
  aliases: string;
  kc_ini: string;
  kc_mid: string;
  kc_end: string;
  l_ini: string;
  l_dev: string;
  l_mid: string;
  l_late: string;
  max_height_m: string;
  ky: string;
  is_perennial: boolean;
  source: string;
  source_note: string;
}

const emptyForm: CropForm = {
  code: '',
  name_en: '',
  name_ar: '',
  category: 'custom',
  aliases: '',
  kc_ini: '',
  kc_mid: '',
  kc_end: '',
  l_ini: '',
  l_dev: '',
  l_mid: '',
  l_late: '',
  max_height_m: '',
  ky: '',
  is_perennial: false,
  source: '',
  source_note: '',
};

function CropModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [f, setF] = useState<CropForm>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof CropForm, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  useOnOpen(open, () => {
    setF(emptyForm);
    setErrors({});
    setFormError(null);
  });
  const set = (k: keyof CropForm) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const mutation = useMutation({
    mutationFn: (data: CropCreate) => cropService.create(data),
    onSuccess: (c) => {
      void qc.invalidateQueries({ queryKey: qk.crops });
      toast.success(t('crops.toast.created'), c.name_en);
      onClose();
    },
    onError: (err) => setFormError(errorText(err, t)),
  });

  const onSubmit = (ev: FormEvent) => {
    ev.preventDefault();
    setFormError(null);
    const e: Partial<Record<keyof CropForm, string>> = {};
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(f.code)) e.code = t('crops.form.codeRule');
    if (!f.name_en.trim()) e.name_en = t('validation.required');
    if (!f.name_ar.trim()) e.name_ar = t('validation.required');
    const kc = (['kc_ini', 'kc_mid', 'kc_end'] as const).map((k) => {
      const v = parseNum(f[k]);
      if (v === null || v < 0 || v > 2) e[k] = t('crops.form.kcRule');
      return v;
    });
    const stageKeys = ['l_ini', 'l_dev', 'l_mid', 'l_late'] as const;
    const stages = stageKeys.map((k) => parseNum(f[k]));
    const anyStage = stages.some((s) => s !== null);
    if (!f.is_perennial || anyStage) {
      stageKeys.forEach((k, i) => {
        const v = stages[i];
        if (v === null || v < 1 || v > 400 || !Number.isInteger(v)) e[k] = t('crops.form.stageRule');
      });
    }
    const ky = parseNum(f.ky);
    if (f.ky.trim() && (ky === null || ky <= 0 || ky > 3)) e.ky = t('crops.form.kyRule');
    const h = parseNum(f.max_height_m);
    if (f.max_height_m.trim() && (h === null || h <= 0 || h > 40)) e.max_height_m = t('validation.positive');
    if (f.source.trim().length < 3) e.source = t('crops.form.sourceRule');
    setErrors(e);
    if (Object.keys(e).length) return;
    mutation.mutate({
      code: f.code,
      name_en: f.name_en.trim(),
      name_ar: f.name_ar.trim(),
      category: f.category.trim() || 'custom',
      aliases: f.aliases
        .split(/[,،]/)
        .map((a) => a.trim())
        .filter(Boolean)
        .slice(0, 20),
      kc_ini: kc[0] as number,
      kc_mid: kc[1] as number,
      kc_end: kc[2] as number,
      l_ini: stages[0],
      l_dev: stages[1],
      l_mid: stages[2],
      l_late: stages[3],
      max_height_m: h,
      ky,
      is_perennial: f.is_perennial,
      source: f.source.trim(),
      source_note: f.source_note.trim() || null,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!mutation.isPending}
      size="lg"
      icon={<Sprout className="h-5 w-5" />}
      title={t('crops.add')}
      description={t('crops.form.description')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="crop-form" loading={mutation.isPending}>
            {t('crops.add')}
          </Button>
        </>
      }
    >
      <form id="crop-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <FormError>{formError}</FormError>
        <FormGrid cols={3}>
          <Field label={t('crops.form.code')} required error={errors.code} hint={t('crops.form.codeHint')}>
            <Input dir="ltr" value={f.code} onChange={(e) => set('code')(e.target.value.toLowerCase())} data-autofocus />
          </Field>
          <Field label={t('crops.form.nameEn')} required error={errors.name_en}>
            <Input dir="ltr" lang="en" value={f.name_en} onChange={(e) => set('name_en')(e.target.value)} />
          </Field>
          <Field label={t('crops.form.nameAr')} required error={errors.name_ar}>
            <Input dir="rtl" lang="ar" value={f.name_ar} onChange={(e) => set('name_ar')(e.target.value)} />
          </Field>
          <Field label={t('crops.form.category')}>
            <Input dir="ltr" value={f.category} onChange={(e) => set('category')(e.target.value)} />
          </Field>
          <Field label={t('crops.form.aliases')} hint={t('crops.form.aliasesHint')} className="sm:col-span-2">
            <Input value={f.aliases} onChange={(e) => set('aliases')(e.target.value)} />
          </Field>
        </FormGrid>
        <fieldset className="rounded-2xl border border-line p-4">
          <legend className="px-1 text-sm font-semibold text-ink">{t('crops.form.kc')}</legend>
          <FormGrid cols={3}>
            {(['kc_ini', 'kc_mid', 'kc_end'] as const).map((k) => (
              <Field key={k} label={<span dir="ltr">{k.replace('kc_', 'Kc ')}</span>} required error={errors[k]}>
                <Input type="number" step="0.01" min={0} max={2} dir="ltr" value={f[k]} onChange={(e) => set(k)(e.target.value)} />
              </Field>
            ))}
          </FormGrid>
        </fieldset>
        <fieldset className="rounded-2xl border border-line p-4">
          <legend className="px-1 text-sm font-semibold text-ink">{t('crops.form.stages')}</legend>
          <Toggle className="mb-4" checked={f.is_perennial} onChange={(v) => setF((x) => ({ ...x, is_perennial: v }))} label={t('crops.form.perennial')} description={t('crops.form.perennialHint')} />
          <FormGrid cols={4}>
            {(
              [
                ['l_ini', t('stage.initial')],
                ['l_dev', t('stage.development')],
                ['l_mid', t('stage.mid')],
                ['l_late', t('stage.late')],
              ] as const
            ).map(([k, label]) => (
              <Field key={k} label={label} required={!f.is_perennial} error={errors[k]}>
                <Input type="number" step="1" min={1} max={400} suffix={t('unit.days')} value={f[k]} onChange={(e) => set(k)(e.target.value)} />
              </Field>
            ))}
          </FormGrid>
        </fieldset>
        <FormGrid>
          <Field label={t('crops.form.ky')} error={errors.ky} hint={t('crops.kyHint')}>
            <Input type="number" step="0.01" min={0} max={3} dir="ltr" value={f.ky} onChange={(e) => set('ky')(e.target.value)} />
          </Field>
          <Field label={t('crops.form.height')} error={errors.max_height_m}>
            <Input type="number" step="0.01" min={0} suffix={t('unit.m')} value={f.max_height_m} onChange={(e) => set('max_height_m')(e.target.value)} />
          </Field>
        </FormGrid>
        <Field label={t('crops.form.source')} required error={errors.source} hint={t('crops.form.sourceHint')}>
          <Input value={f.source} onChange={(e) => set('source')(e.target.value)} />
        </Field>
        <Field label={t('crops.form.sourceNote')}>
          <Textarea rows={2} value={f.source_note} onChange={(e) => set('source_note')(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

export default function CropsPage() {
  const { t, bi, lang } = useI18n();
  const { canCreateCrop } = useAuth();
  const crops = useCrops();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<'all' | 'reference' | 'custom'>('all');
  const [adding, setAdding] = useState(false);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (crops.data ?? [])
      .filter((c) => (kind === 'all' ? true : kind === 'reference' ? c.is_reference : !c.is_reference))
      .filter((c) => !q || [c.name_en, c.name_ar, c.code, c.category, ...c.aliases].some((s) => s.toLowerCase().includes(q)))
      .sort((a, b) => bi(a.name_en, a.name_ar).localeCompare(bi(b.name_en, b.name_ar), lang));
  }, [crops.data, search, kind, bi, lang]);

  return (
    <div>
      <PageHeader
        icon={<Sprout className="h-6 w-6" />}
        title={t('crops.title')}
        description={t('crops.description')}
        actions={
          canCreateCrop ? (
            <Button icon={<Plus className="h-4 w-4" aria-hidden />} onClick={() => setAdding(true)}>
              {t('crops.add')}
            </Button>
          ) : null
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <label className="relative block w-full max-w-sm">
          <span className="sr-only">{t('crops.search')}</span>
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('crops.search')} className="ps-9" />
        </label>
        <Segmented
          label={t('crops.filter')}
          value={kind}
          onChange={setKind}
          options={[
            { value: 'all', label: t('common.all') },
            { value: 'reference', label: t('crops.reference') },
            { value: 'custom', label: t('crops.custom') },
          ]}
        />
        {crops.isSuccess ? <span className="text-sm text-muted">{t('crops.count', { n: fmtInt(list.length, lang) })}</span> : null}
      </div>
      {crops.isPending ? (
        <SkeletonCards count={6} />
      ) : crops.isError ? (
        <ErrorState error={crops.error} onRetry={() => void crops.refetch()} />
      ) : list.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Sprout className="h-7 w-7" />}
            title={kind === 'custom' && !search ? t('crops.emptyCustom') : t('common.noMatches')}
            hint={kind === 'custom' && !search ? t('crops.emptyCustomHint') : t('common.noMatchesHint')}
            action={kind === 'custom' && canCreateCrop ? <Button onClick={() => setAdding(true)}>{t('crops.add')}</Button> : null}
          />
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((c) => (
            <CropCard key={c.id} crop={c} />
          ))}
        </ul>
      )}
      <CropModal open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

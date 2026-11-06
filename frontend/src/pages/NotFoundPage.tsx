import { Compass, Home } from 'lucide-react';
import { ButtonLink, EmptyState } from '../components/ui';
import { useI18n } from '../i18n';

export default function NotFoundPage({ standalone = false }: { standalone?: boolean }) {
  const { t } = useI18n();
  const body = (
    <EmptyState
      icon={<Compass className="h-7 w-7" />}
      title={t('notFound.title')}
      hint={t('notFound.hint')}
      action={
        <ButtonLink to="/" icon={<Home className="h-4 w-4" aria-hidden />}>
          {t('notFound.home')}
        </ButtonLink>
      }
    />
  );
  if (!standalone) return <div className="card">{body}</div>;
  return <div className="flex min-h-screen items-center justify-center bg-canvas p-6">{body}</div>;
}

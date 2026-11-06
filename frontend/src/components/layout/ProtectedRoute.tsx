import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { LogoMark } from '../brand/Logo';
import { Spinner } from '../ui/Spinner';
import { useAuth } from '../../hooks/useAuth';
import { useI18n } from '../../i18n';
import type { Role } from '../../types/api';

export function FullPageLoader() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas" role="status" aria-live="polite">
      <LogoMark className="h-12 w-12" />
      <Spinner className="h-5 w-5 text-forest-600" />
      <span className="sr-only">{t('common.loading')}</span>
    </div>
  );
}

/** Redirects anonymous visitors to /login (remembering where they were going). */
export function ProtectedRoute({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { status, user } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <FullPageLoader />;
  if (status !== 'authenticated' || !user) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Sends signed-in users away from /login and /register. */
export function GuestRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === 'loading') return <FullPageLoader />;
  if (status === 'authenticated') return <Navigate to="/" replace />;
  return <>{children}</>;
}

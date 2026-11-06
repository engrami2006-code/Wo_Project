import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { Button, Field, FormError, Input } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { useI18n } from '../i18n';
import { AuthLayout } from '../layouts/AuthLayout';
import { ApiError } from '../services/api';
import { errorText } from '../utils/errors';

export default function LoginPage() {
  const { t } = useI18n();
  const { login, sessionExpired } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError(t('auth.errors.required'));
      return;
    }
    setBusy(true);
    try {
      await login({ email: email.trim(), password });
      navigate(from === '/login' ? '/' : from, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'unauthorized') setError(t('auth.errors.invalid'));
      else if (err instanceof ApiError && err.code === 'rate_limited') setError(t('auth.errors.rateLimited'));
      else setError(errorText(err, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title={t('auth.login.title')} subtitle={t('auth.login.subtitle')}>
      <form onSubmit={onSubmit} noValidate className="space-y-5" aria-label={t('auth.login.title')}>
        {sessionExpired ? <FormError>{t('auth.sessionExpired')}</FormError> : null}
        <FormError>{error}</FormError>
        <Field label={t('auth.email')} required>
          <Input
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            dir="ltr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
          />
        </Field>
        <Field label={t('auth.password')} required htmlFor="login-password">
          <div className="relative">
            <Input
              id="login-password"
              required
              type={show ? 'text' : 'password'}
              name="password"
              autoComplete="current-password"
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pe-11"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute inset-y-0 end-0 flex w-11 items-center justify-center rounded-e-xl text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal"
              aria-label={show ? t('auth.hidePassword') : t('auth.showPassword')}
              aria-pressed={show}
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={busy} icon={<LogIn className="flip-rtl h-4 w-4" aria-hidden />}>
          {t('auth.login.submit')}
        </Button>
        <p className="text-center text-sm text-muted">
          {t('auth.login.noAccount')}{' '}
          <Link to="/register" className="font-medium text-teal underline-offset-4 hover:underline">
            {t('auth.login.toRegister')}
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}

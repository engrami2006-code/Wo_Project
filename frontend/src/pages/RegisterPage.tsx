import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Building2, Check, UserRound, UserPlus } from 'lucide-react';
import { Button, Field, FormError, Input } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { useI18n } from '../i18n';
import { AuthLayout } from '../layouts/AuthLayout';
import { errorText } from '../utils/errors';
import { cn } from '../utils/cn';
import { passwordChecks } from '../utils/validation';

export default function RegisterPage() {
  const { t, lang } = useI18n();
  const { register } = useAuth();
  const navigate = useNavigate();
  const [accountType, setAccountType] = useState<'individual' | 'company'>('individual');
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const checks = useMemo(() => passwordChecks(password), [password]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (fullName.trim().length < 2 || !email.trim()) {
      setError(t('auth.errors.required'));
      return;
    }
    if (!checks.length || !checks.letters || !checks.digits) {
      setError(t('auth.errors.passwordPolicy'));
      return;
    }
    if (accountType === 'company' && !companyName.trim()) {
      setError(t('auth.errors.companyRequired'));
      return;
    }
    setBusy(true);
    try {
      await register({
        email: email.trim(),
        password,
        full_name: fullName.trim(),
        account_type: accountType,
        company_name: accountType === 'company' ? companyName.trim() : null,
        preferred_language: lang,
      });
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorText(err, t));
    } finally {
      setBusy(false);
    }
  };

  const types = [
    { value: 'individual' as const, icon: <UserRound className="h-5 w-5" aria-hidden />, title: t('auth.register.individual'), hint: t('auth.register.individualHint') },
    { value: 'company' as const, icon: <Building2 className="h-5 w-5" aria-hidden />, title: t('auth.register.company'), hint: t('auth.register.companyHint') },
  ];

  return (
    <AuthLayout title={t('auth.register.title')} subtitle={t('auth.register.subtitle')}>
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <FormError>{error}</FormError>
        <fieldset>
          <legend className="label mb-2">{t('auth.register.accountType')}</legend>
          <div className="grid grid-cols-2 gap-3" role="radiogroup">
            {types.map((ty) => {
              const active = accountType === ty.value;
              return (
                <button
                  key={ty.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setAccountType(ty.value)}
                  className={cn(
                    'relative rounded-2xl border p-3.5 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal',
                    active ? 'border-forest-700 bg-forest-50' : 'border-line bg-surface hover:border-forest-200',
                  )}
                >
                  <span className={cn('mb-2 inline-flex', active ? 'text-forest-700' : 'text-muted')}>{ty.icon}</span>
                  <span className="block text-sm font-semibold text-ink">{ty.title}</span>
                  <span className="mt-0.5 block text-xs text-muted">{ty.hint}</span>
                  {active ? (
                    <Check className="absolute end-3 top-3 h-4 w-4 text-forest-700" aria-hidden />
                  ) : null}
                </button>
              );
            })}
          </div>
        </fieldset>
        <Field label={t('auth.fullName')} required>
          <Input autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        {accountType === 'company' ? (
          <Field label={t('auth.companyName')} required>
            <Input autoComplete="organization" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
          </Field>
        ) : null}
        <Field label={t('auth.email')} required>
          <Input type="email" autoComplete="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
        </Field>
        <Field label={t('auth.password')} required hint={t('auth.passwordPolicy')}>
          <Input type="password" autoComplete="new-password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <ul className="-mt-2 flex flex-wrap gap-2 text-xs" aria-label={t('auth.passwordPolicy')}>
          {(
            [
              ['length', t('auth.pw.length')],
              ['letters', t('auth.pw.letters')],
              ['digits', t('auth.pw.digits')],
            ] as const
          ).map(([k, label]) => (
            <li
              key={k}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2.5 py-1',
                checks[k] ? 'bg-[#E3F7EF] text-[#04664A]' : 'bg-canvas text-muted',
              )}
            >
              <Check className={cn('h-3 w-3', checks[k] ? 'opacity-100' : 'opacity-30')} aria-hidden />
              {label}
              <span className="sr-only">{checks[k] ? t('auth.pw.met') : t('auth.pw.unmet')}</span>
            </li>
          ))}
        </ul>
        <Button type="submit" size="lg" className="w-full" loading={busy} icon={<UserPlus className="h-4 w-4" aria-hidden />}>
          {t('auth.register.submit')}
        </Button>
        <p className="text-center text-sm text-muted">
          {t('auth.register.haveAccount')}{' '}
          <Link to="/login" className="font-medium text-teal underline-offset-4 hover:underline">
            {t('auth.register.toLogin')}
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}

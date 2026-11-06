import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { KeyRound, UserRound } from 'lucide-react';
import { Badge, Button, Card, CardHeader, Field, FormError, Input, KeyValue, PageHeader, Select, useToast } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { useI18n } from '../i18n';
import { authService } from '../services/auth';
import type { Lang, ProfileUpdate } from '../types/api';
import { errorText } from '../utils/errors';
import { fmtDateTime } from '../utils/format';
import { labelRole } from '../utils/labels';
import { passwordValid } from '../utils/validation';

export default function ProfilePage() {
  const { t, lang, setLang } = useI18n();
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [name, setName] = useState(user?.full_name ?? '');
  const [prefLang, setPrefLang] = useState<Lang>((user?.preferred_language as Lang) ?? lang);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [profileError, setProfileError] = useState<string | null>(null);
  const [pwError, setPwError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (data: ProfileUpdate) => authService.updateMe(data),
    onSuccess: (u) => {
      setUser(u);
      toast.success(t('profile.saved'));
    },
    onError: (err) => setProfileError(errorText(err, t)),
  });
  const changePw = useMutation({
    mutationFn: (data: ProfileUpdate) => authService.updateMe(data),
    onSuccess: async () => {
      // The backend revokes every existing token when the password changes: sign in again.
      toast.success(t('profile.passwordChanged'), t('profile.signInAgain'));
      await logout({ remote: false });
      navigate('/login', { replace: true });
    },
    onError: (err) => setPwError(errorText(err, t)),
  });

  if (!user) return null;

  const onProfile = (e: FormEvent) => {
    e.preventDefault();
    setProfileError(null);
    if (name.trim().length < 2) return setProfileError(t('validation.required'));
    save.mutate({ full_name: name.trim(), preferred_language: prefLang });
    if (prefLang !== lang) setLang(prefLang);
  };

  const onPassword = (e: FormEvent) => {
    e.preventDefault();
    setPwError(null);
    if (!current) return setPwError(t('profile.currentRequired'));
    if (!passwordValid(next)) return setPwError(t('auth.errors.passwordPolicy'));
    if (next !== confirm) return setPwError(t('profile.mismatch'));
    changePw.mutate({ current_password: current, new_password: next });
  };

  return (
    <div className="max-w-3xl">
      <PageHeader icon={<UserRound className="h-6 w-6" />} title={t('profile.title')} description={t('profile.description')} />
      <Card className="mb-6">
        <CardHeader title={t('profile.account')} />
        <KeyValue
          items={[
            { label: t('auth.email'), value: <span dir="ltr">{user.email}</span> },
            { label: t('common.role'), value: <Badge tone="forest">{labelRole(t, user.role)}</Badge> },
            { label: t('common.created'), value: fmtDateTime(user.created_at, lang) },
            { label: t('profile.lastLogin'), value: fmtDateTime(user.last_login_at, lang) },
          ]}
        />
      </Card>
      <Card className="mb-6">
        <CardHeader title={t('profile.details')} icon={<UserRound className="h-4 w-4" />} />
        <form onSubmit={onProfile} noValidate className="space-y-4">
          <FormError>{profileError}</FormError>
          <Field label={t('auth.fullName')} required>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </Field>
          <Field label={t('profile.language')} hint={t('profile.languageHint')}>
            <Select value={prefLang} onChange={(e) => setPrefLang(e.target.value as Lang)}>
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </Select>
          </Field>
          <div className="flex justify-end">
            <Button type="submit" loading={save.isPending}>{t('common.saveChanges')}</Button>
          </div>
        </form>
      </Card>
      <Card>
        <CardHeader title={t('profile.password')} icon={<KeyRound className="h-4 w-4" />} subtitle={t('auth.passwordPolicy')} />
        <form onSubmit={onPassword} noValidate className="space-y-4">
          <FormError>{pwError}</FormError>
          <Field label={t('profile.current')} required>
            <Input type="password" dir="ltr" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('profile.new')} required>
              <Input type="password" dir="ltr" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
            </Field>
            <Field label={t('profile.confirm')} required>
              <Input type="password" dir="ltr" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button type="submit" variant="secondary" loading={changePw.isPending}>{t('profile.changePassword')}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

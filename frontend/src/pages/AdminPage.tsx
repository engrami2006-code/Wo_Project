import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Building2, Pencil, Plus, Power, ScrollText, ShieldCheck, UserPlus, Users } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  FormError,
  FormGrid,
  IconButton,
  Input,
  Modal,
  PageHeader,
  Pagination,
  Select,
  SkeletonTable,
  StatTile,
  Table,
  TabPanel,
  Tabs,
  useToast,
} from '../components/ui';
import { qk } from '../hooks/queries';
import { useAuth } from '../hooks/useAuth';
import { useOnOpen } from '../hooks/useOnOpen';
import { useI18n } from '../i18n';
import { adminService, companyService, userService } from '../services/admin';
import type { Company, Lang, Role, User } from '../types/api';
import { errorText } from '../utils/errors';
import { fmtDateTime, fmtInt } from '../utils/format';
import { labelRole } from '../utils/labels';
import { passwordValid } from '../utils/validation';

const ALL_ROLES: Role[] = ['FARM_MANAGER', 'EMPLOYEE', 'COMPANY_OWNER', 'INDIVIDUAL', 'SUPER_ADMIN'];

function UserModal({ open, onClose, companies }: { open: boolean; onClose: () => void; companies: Company[] }) {
  const { t, lang } = useI18n();
  const { isSuperAdmin } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const roles = isSuperAdmin ? ALL_ROLES : (['FARM_MANAGER', 'EMPLOYEE'] as Role[]);
  const [f, setF] = useState({ full_name: '', email: '', password: '', role: 'EMPLOYEE' as Role, company_id: '', preferred_language: lang as Lang });
  const [error, setError] = useState<string | null>(null);
  useOnOpen(open, () => {
    setF({ full_name: '', email: '', password: '', role: 'EMPLOYEE', company_id: companies[0]?.id ?? '', preferred_language: lang });
    setError(null);
  });
  const needsCompany = isSuperAdmin && ['FARM_MANAGER', 'EMPLOYEE', 'COMPANY_OWNER'].includes(f.role);
  const mutation = useMutation({
    mutationFn: userService.create,
    onSuccess: (u) => {
      toast.success(t('admin.users.created'), u.email);
      void qc.invalidateQueries({ queryKey: qk.users });
      onClose();
    },
    onError: (err) => setError(errorText(err, t)),
  });
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (f.full_name.trim().length < 2 || !f.email.trim()) return setError(t('auth.errors.required'));
    if (!passwordValid(f.password)) return setError(t('auth.errors.passwordPolicy'));
    if (needsCompany && !f.company_id) return setError(t('admin.users.companyRequired'));
    mutation.mutate({
      full_name: f.full_name.trim(),
      email: f.email.trim(),
      password: f.password,
      role: f.role,
      company_id: needsCompany ? f.company_id : null,
      preferred_language: f.preferred_language,
    });
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!mutation.isPending}
      icon={<UserPlus className="h-5 w-5" />}
      title={t('admin.users.create')}
      description={isSuperAdmin ? t('admin.users.createHintAdmin') : t('admin.users.createHintOwner')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>{t('common.cancel')}</Button>
          <Button type="submit" form="user-form" loading={mutation.isPending}>{t('admin.users.create')}</Button>
        </>
      }
    >
      <form id="user-form" onSubmit={onSubmit} noValidate className="space-y-4">
        <FormError>{error}</FormError>
        <FormGrid>
          <Field label={t('auth.fullName')} required>
            <Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} data-autofocus />
          </Field>
          <Field label={t('auth.email')} required>
            <Input type="email" dir="ltr" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </Field>
          <Field label={t('auth.password')} required hint={t('auth.passwordPolicy')}>
            <Input type="password" dir="ltr" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          </Field>
          <Field label={t('common.role')} required>
            <Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
              {roles.map((r) => (
                <option key={r} value={r}>{labelRole(t, r)}</option>
              ))}
            </Select>
          </Field>
          {needsCompany ? (
            <Field label={t('admin.company')} required>
              <Select value={f.company_id} onChange={(e) => setF({ ...f, company_id: e.target.value })}>
                <option value="">{t('common.choose')}</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label={t('profile.language')}>
            <Select value={f.preferred_language} onChange={(e) => setF({ ...f, preferred_language: e.target.value as Lang })}>
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </Select>
          </Field>
        </FormGrid>
      </form>
    </Modal>
  );
}

function UsersTab() {
  const { t, lang } = useI18n();
  const { user: me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const users = useQuery({ queryKey: qk.users, queryFn: () => userService.list(1, 200) });
  const companies = useQuery({ queryKey: qk.companies, queryFn: companyService.list });
  const [creating, setCreating] = useState(false);
  const companyName = (id: string | null) => (id ? companies.data?.find((c) => c.id === id)?.name ?? '—' : '—');
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof userService.update>[1] }) => userService.update(id, data),
    onSuccess: (u) => {
      toast.success(u.is_active ? t('admin.users.activated') : t('admin.users.deactivated'), u.email);
      void qc.invalidateQueries({ queryKey: qk.users });
    },
    onError: (err) => toast.error(t('admin.users.failed'), errorText(err, t)),
  });
  return (
    <Card>
      <CardHeader title={t('admin.users')} icon={<Users className="h-4 w-4" />} actions={<Button size="sm" icon={<UserPlus className="h-4 w-4" aria-hidden />} onClick={() => setCreating(true)}>{t('admin.users.create')}</Button>} />
      {users.isPending ? (
        <SkeletonTable rows={4} />
      ) : users.isError ? (
        <ErrorState compact error={users.error} onRetry={() => void users.refetch()} />
      ) : users.data.items.length === 0 ? (
        <EmptyState compact icon={<Users className="h-6 w-6" />} title={t('admin.users.empty')} />
      ) : (
        <Table
          caption={t('admin.users')}
          rows={users.data.items}
          rowKey={(u) => u.id}
          columns={[
            { key: 'name', header: t('common.name'), primary: true, cell: (u: User) => <span className="font-medium">{u.full_name}</span> },
            { key: 'email', header: t('auth.email'), cell: (u) => <span dir="ltr">{u.email}</span> },
            { key: 'role', header: t('common.role'), cell: (u) => <Badge tone="teal" size="xs">{labelRole(t, u.role)}</Badge> },
            { key: 'company', header: t('admin.company'), cell: (u) => companyName(u.company_id) },
            { key: 'status', header: t('common.status'), cell: (u) => <Badge tone={u.is_active ? 'emerald' : 'neutral'} dot size="xs">{u.is_active ? t('admin.active') : t('admin.inactive')}</Badge> },
            { key: 'login', header: t('profile.lastLogin'), cell: (u) => <span className="text-xs text-muted">{fmtDateTime(u.last_login_at, lang)}</span> },
            {
              key: 'x',
              header: <span className="sr-only">{t('common.actions')}</span>,
              align: 'end',
              cell: (u) =>
                u.id === me?.id ? null : (
                  <IconButton size="sm" tone={u.is_active ? 'danger' : 'default'} label={u.is_active ? t('admin.deactivate') : t('admin.activate')} onClick={() => update.mutate({ id: u.id, data: { is_active: !u.is_active } })}>
                    <Power className="h-4 w-4" />
                  </IconButton>
                ),
            },
          ]}
        />
      )}
      <UserModal open={creating} onClose={() => setCreating(false)} companies={companies.data ?? []} />
    </Card>
  );
}

function CompaniesTab() {
  const { t, lang } = useI18n();
  const { isSuperAdmin } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const companies = useQuery({ queryKey: qk.companies, queryFn: companyService.list });
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<Company | null>(null);
  const [newName, setNewName] = useState('');
  const create = useMutation({
    mutationFn: (n: string) => companyService.create(n),
    onSuccess: (c) => {
      toast.success(t('admin.companies.created'), c.name);
      setName('');
      void qc.invalidateQueries({ queryKey: qk.companies });
    },
    onError: (err) => toast.error(t('admin.companies.failed'), errorText(err, t)),
  });
  const rename = useMutation({
    mutationFn: ({ id, n }: { id: string; n: string }) => companyService.rename(id, n),
    onSuccess: () => {
      toast.success(t('admin.companies.renamed'));
      setRenaming(null);
      void qc.invalidateQueries({ queryKey: qk.companies });
    },
    onError: (err) => toast.error(t('admin.companies.failed'), errorText(err, t)),
  });
  return (
    <Card>
      <CardHeader title={t('admin.companies')} icon={<Building2 className="h-4 w-4" />} />
      {isSuperAdmin ? (
        <form
          className="mb-5 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim().length >= 2) create.mutate(name.trim());
          }}
        >
          <Field label={t('admin.companies.name')} className="min-w-[14rem] flex-1">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Button type="submit" icon={<Plus className="h-4 w-4" aria-hidden />} loading={create.isPending} disabled={name.trim().length < 2}>
            {t('admin.companies.create')}
          </Button>
        </form>
      ) : null}
      {companies.isPending ? (
        <SkeletonTable rows={3} />
      ) : companies.isError ? (
        <ErrorState compact error={companies.error} onRetry={() => void companies.refetch()} />
      ) : companies.data.length === 0 ? (
        <EmptyState compact icon={<Building2 className="h-6 w-6" />} title={t('admin.companies.empty')} />
      ) : (
        <Table
          caption={t('admin.companies')}
          rows={companies.data}
          rowKey={(c) => c.id}
          columns={[
            { key: 'name', header: t('common.name'), primary: true, cell: (c) => <span className="font-medium">{c.name}</span> },
            { key: 'created', header: t('common.created'), cell: (c) => fmtDateTime(c.created_at, lang) },
            {
              key: 'x',
              header: <span className="sr-only">{t('common.actions')}</span>,
              align: 'end',
              cell: (c) => (
                <IconButton size="sm" label={t('admin.companies.rename')} onClick={() => { setRenaming(c); setNewName(c.name); }}>
                  <Pencil className="h-4 w-4" />
                </IconButton>
              ),
            },
          ]}
        />
      )}
      <Modal
        open={!!renaming}
        onClose={() => setRenaming(null)}
        dismissible={!rename.isPending}
        title={t('admin.companies.rename')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenaming(null)}>{t('common.cancel')}</Button>
            <Button loading={rename.isPending} disabled={newName.trim().length < 2} onClick={() => renaming && rename.mutate({ id: renaming.id, n: newName.trim() })}>{t('common.saveChanges')}</Button>
          </>
        }
      >
        <Field label={t('admin.companies.name')}>
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} data-autofocus />
        </Field>
      </Modal>
    </Card>
  );
}

function AuditTab() {
  const { t, lang } = useI18n();
  const [action, setAction] = useState('');
  const [userId, setUserId] = useState('');
  const [page, setPage] = useState(1);
  const users = useQuery({ queryKey: qk.users, queryFn: () => userService.list(1, 200) });
  const filters = useMemo(() => ({ action: action.trim() || undefined, user_id: userId || undefined, page, size: 25 }), [action, userId, page]);
  const logs = useQuery({ queryKey: qk.audit(filters), queryFn: () => adminService.auditLogs(filters), placeholderData: keepPreviousData });
  return (
    <Card>
      <CardHeader title={t('admin.audit')} icon={<ScrollText className="h-4 w-4" />} subtitle={t('admin.auditHint')} />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label={t('admin.audit.action')} hint={t('admin.audit.actionHint')} className="w-full sm:w-56">
          <Input dir="ltr" value={action} placeholder="farm." onChange={(e) => { setAction(e.target.value); setPage(1); }} />
        </Field>
        <Field label={t('admin.audit.user')} className="w-full sm:w-64">
          <Select value={userId} onChange={(e) => { setUserId(e.target.value); setPage(1); }}>
            <option value="">{t('common.all')}</option>
            {(users.data?.items ?? []).map((u) => (
              <option key={u.id} value={u.id}>{u.email}</option>
            ))}
          </Select>
        </Field>
      </div>
      {logs.isPending ? (
        <SkeletonTable rows={6} />
      ) : logs.isError ? (
        <ErrorState compact error={logs.error} onRetry={() => void logs.refetch()} />
      ) : logs.data.items.length === 0 ? (
        <EmptyState compact icon={<ScrollText className="h-6 w-6" />} title={t('admin.audit.empty')} />
      ) : (
        <>
          <Table
            caption={t('admin.audit')}
            dense
            rows={logs.data.items}
            rowKey={(l) => l.id}
            columns={[
              { key: 'when', header: t('admin.audit.when'), primary: true, cell: (l) => <span className="whitespace-nowrap">{fmtDateTime(l.created_at, lang)}</span> },
              { key: 'action', header: t('admin.audit.action'), cell: (l) => <span className="font-mono text-xs" dir="ltr">{l.action}</span> },
              { key: 'entity', header: t('admin.audit.entity'), cell: (l) => <span className="text-xs text-muted" dir="ltr">{l.entity_type ?? '—'}</span> },
              { key: 'user', header: t('admin.audit.user'), cell: (l) => <span className="text-xs" dir="ltr">{l.user_email ?? '—'}</span> },
              { key: 'ip', header: 'IP', hideOnMobile: true, cell: (l) => <span className="font-mono text-xs text-muted" dir="ltr">{l.ip_address ?? '—'}</span> },
              { key: 'details', header: t('admin.audit.details'), hideOnMobile: true, cell: (l) => <code className="line-clamp-2 max-w-[22rem] break-all font-mono text-[11px] text-muted" dir="ltr">{l.details ? JSON.stringify(l.details) : '—'}</code> },
            ]}
          />
          <Pagination page={page} size={25} total={logs.data.total} onChange={setPage} />
        </>
      )}
    </Card>
  );
}

function StatsTab() {
  const { t, lang } = useI18n();
  const stats = useQuery({ queryKey: qk.adminStats, queryFn: adminService.stats });
  if (stats.isPending) return <SkeletonTable rows={2} />;
  if (stats.isError) return <ErrorState error={stats.error} onRetry={() => void stats.refetch()} />;
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
      {Object.entries(stats.data).map(([k, v]) => (
        <StatTile key={k} label={t(`admin.stats.${k}` as 'admin.stats.users')} value={v} format={(x) => fmtInt(x, lang)} icon={<Activity className="h-4 w-4" />} />
      ))}
    </div>
  );
}

export default function AdminPage() {
  const { t } = useI18n();
  const { isSuperAdmin } = useAuth();
  const [tab, setTab] = useState<'users' | 'companies' | 'audit' | 'stats'>('users');
  const items = [
    { key: 'users' as const, label: t('admin.users'), icon: <Users className="h-4 w-4" aria-hidden /> },
    ...(isSuperAdmin ? [{ key: 'companies' as const, label: t('admin.companies'), icon: <Building2 className="h-4 w-4" aria-hidden /> }] : []),
    { key: 'audit' as const, label: t('admin.audit'), icon: <ScrollText className="h-4 w-4" aria-hidden /> },
    ...(isSuperAdmin ? [{ key: 'stats' as const, label: t('admin.stats'), icon: <Activity className="h-4 w-4" aria-hidden /> }] : []),
  ];
  return (
    <div>
      <PageHeader icon={<ShieldCheck className="h-6 w-6" />} title={t('admin.title')} description={isSuperAdmin ? t('admin.descriptionAdmin') : t('admin.descriptionOwner')} />
      <Tabs items={items} value={tab} onChange={setTab} label={t('admin.title')} idPrefix="admin" className="mb-6" />
      <TabPanel id="admin" tabKey="users" active={tab === 'users'}><UsersTab /></TabPanel>
      {isSuperAdmin ? <TabPanel id="admin" tabKey="companies" active={tab === 'companies'}><CompaniesTab /></TabPanel> : null}
      <TabPanel id="admin" tabKey="audit" active={tab === 'audit'}><AuditTab /></TabPanel>
      {isSuperAdmin ? <TabPanel id="admin" tabKey="stats" active={tab === 'stats'}><StatsTab /></TabPanel> : null}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, LogOut, MapPin, Menu, PanelLeftClose, PanelLeftOpen, UserRound, X } from 'lucide-react';
import { Logo, LogoMark } from '../components/brand/Logo';
import { IconButton } from '../components/ui';
import { useAuth } from '../hooks/useAuth';
import { useFarmContext } from '../hooks/useFarmContext';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useI18n } from '../i18n';
import { cn } from '../utils/cn';
import { labelRole } from '../utils/labels';
import { NAV_GROUPS } from './navigation';

const COLLAPSE_KEY = 'wo.sidebar.collapsed';

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

function SidebarNav({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { t } = useI18n();
  const { canManageUsers } = useAuth();
  return (
    <nav aria-label={t('nav.main')} className="scrollbar-thin flex-1 overflow-y-auto px-3 pb-6">
      {NAV_GROUPS.map((group) => {
        const items = group.items.filter((it) => !it.adminOnly || canManageUsers);
        if (!items.length) return null;
        return (
          <div key={group.label} className="mt-4 first:mt-1">
            {collapsed ? (
              <div className="mx-auto mb-2 h-px w-6 bg-white/10" aria-hidden />
            ) : (
              <p className="mb-1 px-3 text-xs font-medium text-forest-200/70">{t(group.label)}</p>
            )}
            <ul className="space-y-0.5">
              {items.map((it) => {
                const Icon = it.icon;
                return (
                  <li key={it.to}>
                    <NavLink
                      to={it.to}
                      end={it.end}
                      onClick={onNavigate}
                      title={collapsed ? t(it.label) : undefined}
                      className={({ isActive }) =>
                        cn(
                          'group relative flex items-center gap-3 rounded-xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald',
                          collapsed ? 'h-10 justify-center' : 'h-9 px-3',
                          isActive ? 'bg-white/[0.09] text-white' : 'text-forest-100/80 hover:bg-white/[0.06] hover:text-white',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <span
                            aria-hidden
                            className={cn(
                              'absolute inset-y-2 start-0 w-[3px] rounded-full bg-emerald transition-opacity',
                              isActive ? 'opacity-100' : 'opacity-0',
                            )}
                          />
                          <Icon className={cn('h-[18px] w-[18px] shrink-0', isActive ? 'text-emerald' : '')} aria-hidden />
                          {collapsed ? <span className="sr-only">{t(it.label)}</span> : <span className="truncate">{t(it.label)}</span>}
                        </>
                      )}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function UserMenu() {
  const { t, lang } = useI18n();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const itemsRef = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    window.setTimeout(() => itemsRef.current[0]?.focus(), 0);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const onMenuKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = itemsRef.current.filter(Boolean) as HTMLButtonElement[];
    const idx = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') {
      setOpen(false);
      btnRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(idx + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(idx - 1 + items.length) % items.length]?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  if (!user) return null;
  const initials = user.full_name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-xl px-1.5 py-1 hover:bg-forest-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal sm:px-2"
      >
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-forest-700 text-xs font-semibold text-white" aria-hidden>
          {initials}
        </span>
        <span className="hidden min-w-0 text-start leading-tight md:block">
          <span className="block max-w-[10rem] truncate text-sm font-medium text-ink">{user.full_name}</span>
          <span className="block text-xs text-muted">{labelRole(t, user.role)}</span>
        </span>
        <ChevronDown className="hidden h-4 w-4 text-muted md:block" aria-hidden />
        <span className="sr-only md:hidden">{t('nav.userMenu')}</span>
      </button>
      {open ? (
        <div
          role="menu"
          aria-label={t('nav.userMenu')}
          onKeyDown={onMenuKey}
          className="absolute end-0 top-full z-40 mt-2 w-60 animate-scale-in rounded-2xl border border-line bg-surface p-1.5 shadow-pop"
        >
          <div className="border-b border-line px-3 py-2.5">
            <p className="truncate text-sm font-medium text-ink">{user.full_name}</p>
            <p className="truncate text-xs text-muted" dir="ltr" style={{ textAlign: lang === 'ar' ? 'right' : 'left' }}>
              {user.email}
            </p>
          </div>
          <button
            ref={(el) => {
              itemsRef.current[0] = el;
            }}
            role="menuitem"
            type="button"
            className="mt-1 flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-ink hover:bg-forest-50 focus:bg-forest-50 focus:outline-none"
            onClick={() => {
              setOpen(false);
              navigate('/profile');
            }}
          >
            <UserRound className="h-4 w-4 text-muted" aria-hidden />
            {t('nav.profile')}
          </button>
          <button
            ref={(el) => {
              itemsRef.current[1] = el;
            }}
            role="menuitem"
            type="button"
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-earth hover:bg-earth-50 focus:bg-earth-50 focus:outline-none"
            onClick={async () => {
              setOpen(false);
              await logout();
              navigate('/login', { replace: true });
            }}
          >
            <LogOut className="flip-rtl h-4 w-4" aria-hidden />
            {t('nav.logout')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function FarmSelector() {
  const { t } = useI18n();
  const { farms, farmId, setFarmId, loading } = useFarmContext();
  if (loading || farms.length === 0) return null;
  return (
    <label className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-xl border border-line bg-surface ps-3 hover:border-forest-200">
      <MapPin className="h-4 w-4 shrink-0 text-teal" aria-hidden />
      <span className="sr-only">{t('nav.farmContext')}</span>
      <select
        dir="auto"
        value={farmId ?? ''}
        onChange={(e) => setFarmId(e.target.value || null)}
        className="h-9 min-w-0 max-w-[11rem] cursor-pointer appearance-none truncate bg-transparent px-2 text-sm font-medium text-ink focus:outline-none sm:max-w-[16rem]"
      >
        {farms.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none -ms-2 me-2 h-4 w-4 shrink-0 text-muted" aria-hidden />
    </label>
  );
}

export function LangToggle({ className, onDark = false }: { className?: string; onDark?: boolean }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div
      role="group"
      aria-label={t('nav.language')}
      className={cn('inline-flex rounded-xl p-0.5', onDark ? 'bg-white/10' : 'border border-line bg-canvas', className)}
    >
      {(['ar', 'en'] as const).map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={lang === l}
          onClick={() => setLang(l)}
          className={cn(
            'h-8 min-w-[2.25rem] rounded-[10px] px-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal',
            lang === l
              ? onDark
                ? 'bg-white text-forest-700'
                : 'bg-surface text-forest-700 shadow-sm'
              : onDark
                ? 'text-white/75 hover:text-white'
                : 'text-muted hover:text-ink',
          )}
        >
          {l === 'ar' ? 'ع' : 'EN'}
          <span className="sr-only">{l === 'ar' ? ' العربية' : ' English'}</span>
        </button>
      ))}
    </div>
  );
}

function MobileDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 animate-fade bg-forest-900/50" aria-hidden onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={t('nav.main')}
        className="absolute inset-y-0 start-0 flex w-[17rem] max-w-[85vw] animate-page-in flex-col bg-forest-700"
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-5">
          <Logo onDark subtitle={t('brand.subtitle')} />
          <IconButton label={t('common.close')} tone="onDark" size="sm" onClick={onClose}>
            <X className="h-5 w-5" />
          </IconButton>
        </div>
        <SidebarNav collapsed={false} onNavigate={onClose} />
      </div>
    </div>
  );
}

export function AppLayout() {
  const { t } = useI18n();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {
      /* storage blocked */
    }
  }, [collapsed]);

  // Close the mobile drawer and reset scroll on navigation.
  useEffect(() => {
    setMobileOpen(false);
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-canvas">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-[70] focus:rounded-xl focus:bg-forest-700 focus:px-4 focus:py-2 focus:text-white"
      >
        {t('nav.skip')}
      </a>

      <aside
        className={cn(
          'fixed inset-y-0 start-0 z-30 hidden flex-col bg-forest-700 transition-[width] duration-200 lg:flex',
          collapsed ? 'w-[var(--wo-sidebar-collapsed)]' : 'w-[var(--wo-sidebar)]',
        )}
      >
        <div className={cn('flex h-16 shrink-0 items-center', collapsed ? 'justify-center' : 'px-5')}>
          {collapsed ? <LogoMark onDark /> : <Logo onDark subtitle={t('brand.subtitle')} />}
        </div>
        <SidebarNav collapsed={collapsed} />
        <div className={cn('border-t border-white/10 p-3', collapsed && 'flex justify-center')}>
          <IconButton
            label={collapsed ? t('nav.expand') : t('nav.collapse')}
            tone="onDark"
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
          >
            {collapsed ? <PanelLeftOpen className="flip-rtl h-5 w-5" /> : <PanelLeftClose className="flip-rtl h-5 w-5" />}
          </IconButton>
        </div>
      </aside>

      <MobileDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} />

      <div className={cn('transition-[padding] duration-200', collapsed ? 'lg:ps-[var(--wo-sidebar-collapsed)]' : 'lg:ps-[var(--wo-sidebar)]')}>
        <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
          <div className="mx-auto flex h-16 max-w-[90rem] items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:px-8">
            <IconButton label={t('nav.openMenu')} className="lg:hidden" onClick={() => setMobileOpen(true)} aria-expanded={mobileOpen}>
              <Menu className="h-5 w-5" />
            </IconButton>
            <span className="hidden sm:inline-flex lg:hidden">
              <LogoMark className="h-8 w-8" />
            </span>
            <div className="min-w-0 flex-1">
              <FarmSelector />
            </div>
            <LangToggle />
            <UserMenu />
          </div>
        </header>
        <main id="main" ref={mainRef} tabIndex={-1} className="mx-auto max-w-[90rem] px-4 py-6 focus:outline-none sm:px-6 sm:py-8 lg:px-8">
          <div key={location.pathname} className="animate-page-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

import type { ReactNode } from 'react';
import { BookOpen, Brain, Droplets, ListChecks } from 'lucide-react';
import { HeroArt } from '../components/brand/HeroArt';
import { Logo } from '../components/brand/Logo';
import { useI18n } from '../i18n';
import { LangToggle } from './AppLayout';

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const { t } = useI18n();
  const chain = [
    { icon: <Droplets className="h-4 w-4" aria-hidden />, label: t('auth.hero.chain.data') },
    { icon: <BookOpen className="h-4 w-4" aria-hidden />, label: t('auth.hero.chain.kb') },
    { icon: <Brain className="h-4 w-4" aria-hidden />, label: t('auth.hero.chain.inference') },
    { icon: <ListChecks className="h-4 w-4" aria-hidden />, label: t('auth.hero.chain.explanation') },
  ];
  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[1.05fr_1fr]">
      <section
        className="relative hidden overflow-hidden bg-gradient-to-br from-forest-700 via-[#0E4A3A] to-teal lg:flex lg:flex-col"
        aria-label={t('brand.name')}
      >
        <HeroArt className="pointer-events-none absolute inset-0 h-full w-full opacity-90" />
        <div className="relative z-10 flex flex-1 flex-col justify-between p-10 xl:p-14">
          <Logo onDark subtitle={t('brand.subtitle')} />
          <div className="max-w-lg">
            <h1 className="text-4xl font-semibold leading-[1.15] text-white xl:text-[2.75rem]">
              <span dir="ltr" className="inline-block rtl:text-right">WO — Water Optimization</span>
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-forest-50/90">{t('auth.hero.tagline')}</p>
            <div className="mt-8 rounded-3xl border border-white/20 bg-white/10 p-5 shadow-pop backdrop-blur-md">
              <ol className="flex flex-wrap items-center gap-2 text-sm text-white">
                {chain.map((c, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5">
                      {c.icon}
                      {c.label}
                    </span>
                    {i < chain.length - 1 ? (
                      <span className="flip-rtl text-emerald" aria-hidden>
                        →
                      </span>
                    ) : null}
                  </li>
                ))}
              </ol>
              <p className="mt-4 text-sm leading-relaxed text-forest-50/85">{t('auth.hero.card')}</p>
            </div>
          </div>
          <p className="text-xs text-forest-100/70">{t('auth.hero.footer')}</p>
        </div>
      </section>

      <section className="flex min-h-screen flex-col">
        <div className="flex items-center justify-between px-5 py-5 sm:px-10">
          <span className="lg:hidden">
            <Logo subtitle={t('brand.subtitle')} />
          </span>
          <span className="hidden lg:block" />
          <LangToggle />
        </div>
        <div className="flex flex-1 items-center justify-center px-5 pb-12 sm:px-10">
          <div className="w-full max-w-md animate-page-in">
            <div className="mb-8">
              <h2 className="text-[1.75rem] font-semibold leading-tight text-ink">{title}</h2>
              <p className="mt-2 text-muted">{subtitle}</p>
            </div>
            {children}
          </div>
        </div>
      </section>
    </div>
  );
}

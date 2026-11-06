import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ar } from './ar';
import { en } from './en';
import type { Lang } from '../types/api';

export type TKey = keyof typeof en;
export type Dict = Record<TKey, string>;
export type TVars = Record<string, string | number | null | undefined>;
export type TFunction = (key: TKey, vars?: TVars) => string;

const dictionaries: Record<Lang, Dict> = { en, ar };
export const LANG_STORAGE_KEY = 'wo.lang';
export const DEFAULT_LANG: Lang = 'ar';

export function readStoredLang(): Lang {
  try {
    const v = window.localStorage.getItem(LANG_STORAGE_KEY);
    if (v === 'ar' || v === 'en') return v;
  } catch {
    /* storage blocked: fall back to the default */
  }
  return DEFAULT_LANG;
}

function storeLang(lang: Lang): void {
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    /* storage blocked: the choice lives for this session only */
  }
}

export function dirOf(lang: Lang): 'rtl' | 'ltr' {
  return lang === 'ar' ? 'rtl' : 'ltr';
}

export function applyDocumentLang(lang: Lang): void {
  const el = document.documentElement;
  el.setAttribute('lang', lang);
  el.setAttribute('dir', dirOf(lang));
}

export function translate(lang: Lang, key: TKey, vars?: TVars): string {
  const template = dictionaries[lang][key] ?? dictionaries.en[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const v = vars[name];
    return v === null || v === undefined ? '—' : String(v);
  });
}

interface I18nValue {
  lang: Lang;
  dir: 'rtl' | 'ltr';
  t: TFunction;
  setLang: (lang: Lang) => void;
  toggleLang: () => void;
  /** Plural-aware translation: picks `${base}.${Intl.PluralRules category}` (falls back to `.other`). */
  tp: (base: string, n: number, vars?: TVars) => string;
  /** Pick the bilingual variant of a backend field (`*_ar` when Arabic, else `*_en`). */
  bi: (enText: string | null | undefined, arText: string | null | undefined) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children, initialLang }: { children: ReactNode; initialLang?: Lang }) {
  const [lang, setLangState] = useState<Lang>(() => initialLang ?? readStoredLang());

  useEffect(() => {
    applyDocumentLang(lang);
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    storeLang(next);
    applyDocumentLang(next);
    setLangState(next);
  }, []);

  const value = useMemo<I18nValue>(
    () => ({
      lang,
      dir: dirOf(lang),
      t: (key, vars) => translate(lang, key, vars),
      setLang,
      toggleLang: () => setLang(lang === 'ar' ? 'en' : 'ar'),
      tp: (base, n, vars) => {
        const cat = new Intl.PluralRules(lang).select(n);
        const key = (`${base}.${cat}` in dictionaries[lang] ? `${base}.${cat}` : `${base}.other`) as TKey;
        const formatted = new Intl.NumberFormat(lang === 'ar' ? 'ar-u-nu-latn' : 'en-GB').format(n);
        return translate(lang, key, { n: formatted, ...vars });
      },
      bi: (enText, arText) => (lang === 'ar' ? arText || enText || '' : enText || arText || ''),
    }),
    [lang, setLang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}

import type { Lang } from '../types/api';

/**
 * Number/date formatting through Intl with the UI language.
 * Arabic uses Latin digits (nu-latn) so values read the same as the formulas, rule texts and
 * engine messages that the API returns with Latin digits.
 */
export function localeOf(lang: Lang): string {
  return lang === 'ar' ? 'ar-u-nu-latn' : 'en-GB';
}

const nfCache = new Map<string, Intl.NumberFormat>();
function nf(lang: Lang, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${lang}|${JSON.stringify(opts)}`;
  let f = nfCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(localeOf(lang), opts);
    nfCache.set(key, f);
  }
  return f;
}

export const DASH = '—';

export function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function fmtNumber(v: number | null | undefined, lang: Lang, maxFrac = 2, minFrac = 0): string {
  if (!isNum(v)) return DASH;
  return nf(lang, { maximumFractionDigits: maxFrac, minimumFractionDigits: minFrac }).format(v);
}

export function fmtInt(v: number | null | undefined, lang: Lang): string {
  return fmtNumber(v, lang, 0);
}

export function fmtCompact(v: number | null | undefined, lang: Lang): string {
  if (!isNum(v)) return DASH;
  return nf(lang, { notation: 'compact', maximumFractionDigits: 1 }).format(v);
}

export function fmtPercent(v: number | null | undefined, lang: Lang, maxFrac = 1, signed = false): string {
  if (!isNum(v)) return DASH;
  const s = nf(lang, { maximumFractionDigits: maxFrac, signDisplay: signed ? 'exceptZero' : 'auto' }).format(v);
  return `${s}%`;
}

/** Ratio 0..1 → percent string. */
export function fmtRatio(v: number | null | undefined, lang: Lang, maxFrac = 1): string {
  if (!isNum(v)) return DASH;
  return fmtPercent(v * 100, lang, maxFrac);
}

export function unitL(lang: Lang): string {
  return lang === 'ar' ? 'لتر' : 'L';
}

export function unitM2(lang: Lang): string {
  return lang === 'ar' ? 'م²' : 'm²';
}

export function unitMm(lang: Lang): string {
  return lang === 'ar' ? 'مم' : 'mm';
}

/** Litres with automatic m³ for large volumes. */
export function fmtLitres(v: number | null | undefined, lang: Lang, opts: { maxFrac?: number; allowM3?: boolean } = {}): string {
  if (!isNum(v)) return DASH;
  const { maxFrac = 1, allowM3 = false } = opts;
  if (allowM3 && Math.abs(v) >= 100000) {
    return `${fmtNumber(v / 1000, lang, 1)} ${lang === 'ar' ? 'م³' : 'm³'}`;
  }
  return `${fmtNumber(v, lang, maxFrac)} ${unitL(lang)}`;
}

export function fmtArea(v: number | null | undefined, lang: Lang, maxFrac = 1): string {
  if (!isNum(v)) return DASH;
  return `${fmtNumber(v, lang, maxFrac)} ${unitM2(lang)}`;
}

export function fmtMm(v: number | null | undefined, lang: Lang, maxFrac = 2): string {
  if (!isNum(v)) return DASH;
  return `${fmtNumber(v, lang, maxFrac)} ${unitMm(lang)}`;
}

function toDate(v: string | Date): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  // Plain dates (YYYY-MM-DD) are calendar days, not instants: parse them as local midnight.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00`) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fmtDate(v: string | Date | null | undefined, lang: Lang, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }): string {
  if (!v) return DASH;
  const d = toDate(v);
  if (!d) return DASH;
  return new Intl.DateTimeFormat(localeOf(lang), opts).format(d);
}

export function fmtDateTime(v: string | Date | null | undefined, lang: Lang): string {
  return fmtDate(v, lang, { dateStyle: 'medium', timeStyle: 'short' });
}

export function fmtShortDate(v: string | Date | null | undefined, lang: Lang): string {
  return fmtDate(v, lang, { day: 'numeric', month: 'short' });
}

export function fmtRelative(v: string | Date | null | undefined, lang: Lang, now: Date = new Date()): string {
  if (!v) return DASH;
  const d = toDate(v);
  if (!d) return DASH;
  const diffSec = Math.round((d.getTime() - now.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(localeOf(lang), { numeric: 'auto' });
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(diffSec, 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), 'day');
  return fmtDate(d, lang);
}

/** Local calendar date as YYYY-MM-DD (for <input type="date">). */
export function todayISO(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return todayISO(d);
}

/** Local date-time for <input type="datetime-local">. */
export function nowLocalInput(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${todayISO(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Convert a datetime-local value into an ISO string with the local offset. */
export function localInputToISO(v: string): string {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toISOString();
}

/** Parse a numeric input; empty → null. */
export function parseNum(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Render an arbitrary evidence value compactly. */
export function fmtValue(v: unknown, lang: Lang): string {
  if (v === null || v === undefined) return DASH;
  if (typeof v === 'number') return fmtNumber(v, lang, 3);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return v.map((x) => fmtValue(x, lang)).join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Humanise snake_case identifiers for display where no translation exists. */
export function humanize(s: string): string {
  return s.replace(/_/g, ' ');
}

/** "HH:MM" → minutes since midnight. */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

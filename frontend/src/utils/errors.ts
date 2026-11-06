import { ApiError } from '../services/api';
import type { TFunction } from '../i18n';

export interface ErrorDescription {
  title: string;
  detail: string | null;
  code: string;
}

/** Localised headline for an API error, with the server's specific message as detail. */
export function describeError(err: unknown, t: TFunction): ErrorDescription {
  if (err instanceof ApiError) {
    const titles: Record<string, string> = {
      network_error: t('errors.network'),
      unauthorized: t('errors.unauthorized'),
      forbidden: t('errors.forbidden'),
      not_found: t('errors.notFound'),
      conflict: t('errors.conflict'),
      validation_error: t('errors.validation'),
      rate_limited: t('errors.rateLimited'),
      external_service_error: t('errors.external'),
    };
    const title = titles[err.code] ?? t('errors.generic');
    let detail: string | null = err.message || null;
    const fields = err.fieldErrors;
    if (fields.length) {
      detail = fields.map((f) => (f.field ? `${f.field}: ${f.message}` : f.message)).join(' · ');
    }
    if (err.code === 'network_error') detail = t('errors.networkHint');
    return { title, detail, code: err.code };
  }
  if (err instanceof Error) return { title: t('errors.generic'), detail: err.message, code: 'client_error' };
  return { title: t('errors.generic'), detail: null, code: 'unknown' };
}

/** One-line message for toasts and inline form errors. */
export function errorText(err: unknown, t: TFunction): string {
  const d = describeError(err, t);
  return d.detail ? `${d.title} ${d.detail}` : d.title;
}

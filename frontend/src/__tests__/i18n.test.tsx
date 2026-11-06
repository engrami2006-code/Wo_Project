import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider, translate, useI18n } from '../i18n';
import { ar } from '../i18n/ar';
import { en } from '../i18n/en';

function Probe() {
  const { t, dir, toggleLang } = useI18n();
  return (
    <div>
      <p>{t('nav.dashboard')}</p>
      <p data-testid="dir">{dir}</p>
      <button onClick={toggleLang}>toggle</button>
    </div>
  );
}

describe('i18n', () => {
  it('switches <html dir> to rtl for Arabic and back to ltr for English', async () => {
    render(
      <I18nProvider initialLang="en">
        <Probe />
      </I18nProvider>,
    );
    expect(document.documentElement.getAttribute('dir')).toBe('ltr');
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    await act(async () => userEvent.click(screen.getByRole('button', { name: 'toggle' })));
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
    expect(document.documentElement.getAttribute('lang')).toBe('ar');
    expect(screen.getByText('لوحة المعلومات')).toBeInTheDocument();
    expect(window.localStorage.getItem('wo.lang')).toBe('ar');
  });

  it('has an Arabic translation for every English key and interpolates variables', () => {
    const missing = Object.keys(en).filter((k) => !(k in ar) || !(ar as Record<string, string>)[k]);
    expect(missing).toEqual([]);
    expect(translate('en', 'common.pageOf', { page: 2, pages: 5, total: 90 })).toBe('Page 2 of 5 — 90 items');
    expect(translate('ar', 'xai.insufficient')).toBe('لا توجد بيانات كافية لإعطاء توصية موثوقة.');
  });
});

import { describe, expect, it } from 'vitest';
import { translate } from '../i18n';
import { fmtLitres, fmtNumber, fmtPercent } from '../utils/format';
import { prettyFormula } from '../utils/labels';
import { serverText } from '../utils/serverText';

describe('formatting and localisation helpers', () => {
  it('formats numbers and units per language and never invents values', () => {
    expect(fmtNumber(7922.22, 'en', 1)).toBe('7,922.2');
    expect(fmtLitres(5000, 'ar')).toBe('5,000 لتر');
    expect(fmtLitres(null, 'en')).toBe('—');
    expect(fmtPercent(12.5, 'en', 1, true)).toBe('+12.5%');
  });

  it('renders rule formulas with logic symbols', () => {
    expect(prettyFormula('irrigation_needed & ~water_critical => action_x')).toBe('irrigation_needed ∧ ¬water_critical ⇒ action_x');
  });

  it('localises known server messages for Arabic and keeps unknown ones', () => {
    const t = (k: Parameters<typeof translate>[1], v?: Parameters<typeof translate>[2]) => translate('ar', k, v);
    expect(serverText('Statistics need at least 7 days with records (1 so far).', 'ar', t)).toBe('‏تحتاج الإحصاءات إلى 7 أيام على الأقل فيها سجلات (1 حتى الآن).');
    expect(serverText('Something new', 'ar', t)).toBe('Something new');
    expect(serverText('No water records yet.', 'en', t)).toBe('No water records yet.');
  });
});

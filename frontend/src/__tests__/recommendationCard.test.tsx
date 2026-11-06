import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { RecommendationCard } from '../components/explain/RecommendationCard';
import { I18nProvider } from '../i18n';
import insufficient from '../test/fixtures/explanation-insufficient.json';
import recommendation from '../test/fixtures/explanation-recommendation.json';
import type { Explanation } from '../types/api';

function renderCard(e: Explanation, lang: 'en' | 'ar' = 'en') {
  return render(
    <I18nProvider initialLang={lang}>
      <RecommendationCard explanation={e} />
    </I18nProvider>,
  );
}

describe('RecommendationCard', () => {
  it('renders the recommendation, facts used, fired rules and the alternatives that were ruled out', () => {
    renderCard(recommendation as unknown as Explanation);
    const card = screen.getByRole('article', { name: 'Explained recommendation' });
    expect(within(card).getByRole('heading', { level: 2, name: 'Deficit irrigation' })).toBeInTheDocument();
    expect(within(card).getAllByText('R-IRR-003').length).toBeGreaterThan(0);
    // facts used: water_limited is true, water_sufficient is false
    expect(within(card).getByRole('button', { name: /^water_limited = true/ })).toBeInTheDocument();
    // rules triggered in firing order
    const rules = within(card).getByRole('heading', { name: /Rules triggered/ }).closest('section') as HTMLElement;
    expect(within(rules).getAllByRole('listitem')).toHaveLength(recommendation.triggered_rules.length);
    // alternatives with their blocking condition
    const alts = within(card).getByRole('heading', { name: /Why not the alternatives/ }).closest('section') as HTMLElement;
    expect(within(alts).getByText('Full irrigation')).toBeInTheDocument();
    expect(within(alts).getAllByText('Not fired').length).toBeGreaterThan(0);
    expect(within(card).getByText('available water ≥ 7,922.2 L')).toBeInTheDocument();
    expect(within(card).queryByRole('heading', { name: /Missing data/ })).not.toBeInTheDocument();
  });

  it('renders the insufficient-data variant with the Arabic sentence and the missing percepts', () => {
    renderCard(insufficient as unknown as Explanation, 'ar');
    expect(screen.getAllByText('لا توجد بيانات كافية لإعطاء توصية موثوقة.').length).toBeGreaterThanOrEqual(2);
    const missing = screen.getByRole('heading', { name: /البيانات الناقصة/ }).closest('section') as HTMLElement;
    expect(within(missing).getByText('et_demand_positive = ?')).toBeInTheDocument();
    expect(within(missing).getByText(/التبخر-النتح المرجعي/)).toBeInTheDocument();
    // alternatives list unknown blocking conditions
    expect(screen.getAllByText('غير معروف').length).toBeGreaterThan(0);
  });
});

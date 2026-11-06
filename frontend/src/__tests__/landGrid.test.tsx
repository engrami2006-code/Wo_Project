import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { LandGrid } from '../components/land/LandGrid';
import { I18nProvider } from '../i18n';

describe('LandGrid', () => {
  it('renders exactly N land units, crop units first and the rest fallow', () => {
    render(
      <I18nProvider initialLang="en">
        <LandGrid numUnits={20} allocation={[{ name: 'Tomato', units: 7 }, { name: 'Alfalfa', units: 3 }]} unitArea={500} />
      </I18nProvider>,
    );
    const grid = screen.getByTestId('land-grid');
    const cells = within(grid).getAllByRole('listitem');
    expect(cells).toHaveLength(20);
    expect(cells.filter((c) => c.getAttribute('title') === 'Tomato')).toHaveLength(7);
    expect(cells.filter((c) => c.getAttribute('title') === 'Alfalfa')).toHaveLength(3);
    expect(cells.filter((c) => c.getAttribute('title') === 'Fallow')).toHaveLength(10);
  });
});

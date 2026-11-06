import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import DashboardPage from '../pages/DashboardPage';
import { mockFetch, renderWithProviders } from '../test/utils';

describe('DashboardPage', () => {
  it('renders the onboarding empty state (and no numbers) when the workspace is empty', async () => {
    mockFetch({
      'GET /dashboard/summary': { empty: true, farms: 0, message: 'Your farm workspace is empty. Add your first farm to begin.', generated_at: '2026-10-03T00:00:00Z' },
    });
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByText('Your farm workspace is empty.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Add your first farm/ })).toHaveAttribute('href', '/farms?new=1');
    expect(screen.queryByText('Open alerts')).not.toBeInTheDocument();
  });

  it('shows an error with a retry action when the summary fails', async () => {
    mockFetch({});
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

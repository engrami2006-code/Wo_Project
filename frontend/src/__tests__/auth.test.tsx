import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '../components/layout/ProtectedRoute';
import LoginPage from '../pages/LoginPage';
import { jsonResponse, mockFetch, renderWithProviders } from '../test/utils';

describe('authentication', () => {
  it('submits the login form and shows the error returned by the API', async () => {
    const fetchMock = mockFetch({
      'POST /auth/login': () => jsonResponse({ error: { code: 'unauthorized', message: 'Invalid e-mail or password.', details: null } }, 401),
    });
    renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
      </Routes>,
      { route: '/login' },
    );
    await userEvent.type(screen.getByLabelText(/E-mail/), 'owner@test.com');
    await userEvent.type(screen.getByLabelText(/^Password/), 'WrongPass123');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The e-mail or password is incorrect.');
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ email: 'owner@test.com', password: 'WrongPass123' });
  });

  it('redirects anonymous visitors from a protected route to /login', async () => {
    mockFetch({});
    renderWithProviders(
      <Routes>
        <Route path="/login" element={<p>login screen</p>} />
        <Route
          path="/farms"
          element={
            <ProtectedRoute>
              <p>secret farms</p>
            </ProtectedRoute>
          }
        />
      </Routes>,
      { route: '/farms' },
    );
    await waitFor(() => expect(screen.getByText('login screen')).toBeInTheDocument());
    expect(screen.queryByText('secret farms')).not.toBeInTheDocument();
  });
});

import type { ReactElement, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';
import { AuthProvider } from '../hooks/useAuth';
import { I18nProvider } from '../i18n';
import type { Lang } from '../types/api';

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

/** Replaces global fetch with a router keyed by "METHOD /path" (path without the /api prefix and query). */
export function mockFetch(routes: Record<string, unknown | Handler>) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = url.replace(/^.*?\/api/, '').split('?')[0];
    const key = `${method} ${path}`;
    const route = routes[key];
    if (route === undefined) return jsonResponse({ error: { code: 'not_found', message: `No mock for ${key}` } }, 404);
    if (typeof route === 'function') return (route as Handler)(url, init);
    return jsonResponse(route);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

export function renderWithProviders(
  ui: ReactElement,
  { route = '/', lang = 'en', wrapRouter = true }: { route?: string; lang?: Lang; wrapRouter?: boolean } = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => {
    const inner = (
      <QueryClientProvider client={queryClient}>
        <I18nProvider initialLang={lang}>
          <ToastProvider>
            <AuthProvider>{children}</AuthProvider>
          </ToastProvider>
        </I18nProvider>
      </QueryClientProvider>
    );
    return wrapRouter ? <MemoryRouter initialEntries={[route]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{inner}</MemoryRouter> : inner;
  };
  return { queryClient, ...render(ui, { wrapper: Wrapper }) };
}

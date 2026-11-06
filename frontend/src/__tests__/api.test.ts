import { describe, expect, it, vi } from 'vitest';
import { api, ApiError, buildUrl, setAuthToken, setUnauthorizedHandler } from '../services/api';
import { jsonResponse } from '../test/utils';

describe('api client', () => {
  it('turns the error envelope into an ApiError with code, message, details and status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ error: { code: 'validation_error', message: 'Request validation failed.', details: [{ loc: ['body', 'email'], msg: 'bad email' }] } }, 422),
      ),
    );
    const err = await api('/auth/login', { method: 'POST', body: {} }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    const e = err as ApiError;
    expect(e.code).toBe('validation_error');
    expect(e.message).toBe('Request validation failed.');
    expect(e.status).toBe(422);
    expect(e.fieldErrors).toEqual([{ field: 'email', message: 'bad email' }]);
  });

  it('sends the bearer token and calls the unauthorized handler on 401', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: { code: 'unauthorized', message: 'Authentication required.' } }, 401));
    vi.stubGlobal('fetch', fetchMock);
    const onUnauthorized = vi.fn();
    setAuthToken('tok-123');
    setUnauthorizedHandler(onUnauthorized);
    await expect(api('/farms')).rejects.toMatchObject({ code: 'unauthorized', status: 401 });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-123');
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    setAuthToken(null);
    setUnauthorizedHandler(null);
  });

  it('maps network failures to a network_error and returns undefined for 204', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    await expect(api('/farms')).rejects.toMatchObject({ code: 'network_error', status: 0 });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
    await expect(api('/farms/1', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('builds URLs with the /api base and skips empty query values', () => {
    expect(buildUrl('/water/records', { farm_id: 'a', page: 2, date_from: '', x: null })).toBe('/api/water/records?farm_id=a&page=2');
  });
});

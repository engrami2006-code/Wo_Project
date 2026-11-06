/**
 * Thin fetch wrapper around the WO API.
 * - prefixes VITE_API_BASE_URL (default "/api")
 * - adds the Bearer token
 * - turns the uniform error envelope {error:{code,message,details}} into an ApiError
 * - on 401 for an authenticated request, notifies the auth layer (logout + redirect)
 */

export const API_BASE_URL: string = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '');

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details ?? null;
  }

  /** Field-level validation messages from FastAPI/Pydantic (details = [{loc, msg}]). */
  get fieldErrors(): { field: string; message: string }[] {
    if (!Array.isArray(this.details)) return [];
    return this.details
      .filter((d): d is { loc?: unknown[]; msg?: string } => typeof d === 'object' && d !== null)
      .map((d) => {
        const loc = Array.isArray(d.loc) ? d.loc.filter((p) => p !== 'body') : [];
        return { field: loc.join('.'), message: String(d.msg ?? '') };
      });
  }
}

let authToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

export type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, QueryValue | QueryValue[]>;
  signal?: AbortSignal;
}

export function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, raw] of Object.entries(query)) {
    const values = Array.isArray(raw) ? raw : [raw];
    for (const v of values) {
      if (v === null || v === undefined || v === '') continue;
      params.append(key, String(v));
    }
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

function isEnvelope(data: unknown): data is { error: { code: string; message: string; details?: unknown } } {
  return (
    typeof data === 'object' &&
    data !== null &&
    'error' in data &&
    typeof (data as { error: unknown }).error === 'object' &&
    (data as { error: unknown }).error !== null
  );
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, signal } = options;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const tokenAtRequest = authToken;
  if (tokenAtRequest) headers.Authorization = `Bearer ${tokenAtRequest}`;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError('network_error', 'The server could not be reached.', 0);
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const error = isEnvelope(data)
      ? new ApiError(data.error.code, data.error.message, response.status, data.error.details)
      : new ApiError('http_error', response.statusText || `HTTP ${response.status}`, response.status);
    if (response.status === 401 && tokenAtRequest && unauthorizedHandler) unauthorizedHandler();
    throw error;
  }
  return data as T;
}

export const http = {
  get: <T>(path: string, query?: RequestOptions['query'], signal?: AbortSignal) =>
    api<T>(path, { query, signal }),
  post: <T>(path: string, body?: unknown, query?: RequestOptions['query']) =>
    api<T>(path, { method: 'POST', body: body ?? {}, query }),
  patch: <T>(path: string, body: unknown) => api<T>(path, { method: 'PATCH', body }),
  del: (path: string) => api<void>(path, { method: 'DELETE' }),
};

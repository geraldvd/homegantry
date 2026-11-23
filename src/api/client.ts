import type {
  AuthStatus,
  Service,
  ServiceOverride,
  ManualService,
  DashboardSettings,
  StackConfig,
} from '../types';

const BASE = '/api';

// ---- admin token (kept for the browser session only) ----

const TOKEN_KEY = 'homegantry.adminToken';
/** Fired on `window` when the server rejects the stored token. */
export const AUTH_EXPIRED_EVENT = 'homegantry:auth-expired';

export function getStoredToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage unavailable (private mode): the token simply is not remembered
  }
}

function authHeader(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    // not JSON
  }
  return `HTTP ${res.status}`;
}

/** Default headers, then the caller's, then auth (a caller cannot replace the stored token). */
function mergeHeaders(token: string | null, extra?: HeadersInit): Headers {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  new Headers(extra).forEach((value, name) => headers.set(name, value));
  for (const [name, value] of Object.entries(authHeader(token))) headers.set(name, value);
  return headers;
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: mergeHeaders(token, init?.headers),
  });
  if (!res.ok) {
    if (res.status === 401 && token) {
      setStoredToken(null);
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
    throw new Error(`API ${res.status}: ${await errorMessage(res)}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Ask the server what this session may do. With `token`, checks that token instead of the
 * stored one (used by "Unlock editing"). Throws with the server's message on 401/429.
 */
export async function getAuth(token: string | null = getStoredToken()): Promise<AuthStatus> {
  const res = await fetch(`${BASE}/auth`, { headers: authHeader(token) });
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json() as Promise<AuthStatus>;
}

export function getServices(includeHidden = false): Promise<Service[]> {
  const qs = includeHidden ? '?includeHidden=true' : '';
  return request<Service[]>(`/services${qs}`);
}

export function updateOverride(id: string, override: ServiceOverride): Promise<Service> {
  return request<Service>(`/services/${encodeURIComponent(id)}/override`, {
    method: 'PUT',
    body: JSON.stringify(override),
  });
}

export function deleteOverride(id: string): Promise<Service> {
  return request<Service>(`/services/${encodeURIComponent(id)}/override`, {
    method: 'DELETE',
  });
}

export function addManualService(service: Omit<ManualService, 'id'>): Promise<ManualService> {
  return request<ManualService>('/services/manual', {
    method: 'POST',
    body: JSON.stringify(service),
  });
}

export function updateManualService(
  id: string,
  service: Partial<Omit<ManualService, 'id'>>,
): Promise<ManualService> {
  return request<ManualService>(`/services/manual/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(service),
  });
}

export function deleteManualService(id: string): Promise<void> {
  return request<void>(`/services/manual/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function getSettings(): Promise<DashboardSettings> {
  return request<DashboardSettings>('/settings');
}

export function updateSettings(settings: Partial<DashboardSettings>): Promise<DashboardSettings> {
  return request<DashboardSettings>('/settings', {
    method: 'PATCH',
    body: JSON.stringify(settings),
  });
}

export function getStacks(): Promise<Record<string, StackConfig>> {
  return request<Record<string, StackConfig>>('/stacks');
}

export function updateStack(name: string, config: Partial<StackConfig>): Promise<StackConfig> {
  return request<StackConfig>(`/stacks/${encodeURIComponent(name)}`, {
    method: 'PATCH',
    body: JSON.stringify(config),
  });
}

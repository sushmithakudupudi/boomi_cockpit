import { ApiError } from './api';

export interface AuthUser {
  id: number;
  email: string;
  fullName: string;
  role: 'admin' | 'operator' | 'viewer' | string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string | null;
}

export const SESSION_EXPIRED_EVENT = 'boomiops:session-expired';

async function authRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/auth${path}`, {
      credentials: 'same-origin',
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError('Cannot reach the BoomiOps backend. Check that it is running and try again.', 'backend_unreachable');
  }
  if (!res.ok) {
    let detail: { code?: string; message?: string } | Array<{ msg?: string }> = {};
    try {
      detail = (await res.json()).detail ?? {};
    } catch {
      /* non-JSON error body */
    }
    // FastAPI request-validation errors come back as a list.
    const message = Array.isArray(detail) ? 'Please check the details you entered.' : detail.message;
    const code = Array.isArray(detail) ? 'validation_error' : detail.code;
    throw new ApiError(message || `Request failed (HTTP ${res.status}).`, code || 'error', res.status);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const authApi = {
  status: () => authRequest<{ setupRequired: boolean }>('/status'),
  me: () => authRequest<AuthUser>('/me'),
  login: (email: string, password: string, remember: boolean) =>
    authRequest<AuthUser>('/login', { method: 'POST', body: JSON.stringify({ email, password, remember }) }),
  setup: (email: string, password: string, fullName: string) =>
    authRequest<AuthUser>('/setup', { method: 'POST', body: JSON.stringify({ email, password, fullName }) }),
  resetPassword: (email: string, password: string) =>
    authRequest<void>('/reset-password', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => authRequest<void>('/logout', { method: 'POST' }),
};

let installed = false;

/**
 * Any /api call (outside /api/auth) that comes back 401 means the session ended (expired, revoked,
 * or signed out in another tab). Broadcast it so the app returns to the sign-in screen instead of
 * silently falling back to demo data.
 */
export function installSessionWatcher() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const res = await original(input, init);
    if (res.status === 401) {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const path = new URL(url, window.location.origin).pathname;
      if (path.startsWith('/api/') && !path.startsWith('/api/auth/')) {
        window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
      }
    }
    return res;
  };
}

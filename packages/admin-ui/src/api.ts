import type { AdminState, GuardConfig, UiConfig } from './types';

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    ...init,
  });
  const data = (await res.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
  }
  return data;
}

export function apiLogin(password: string) {
  return request<{ ok: boolean }>('/admin/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export function apiLogout() {
  return request<{ ok: boolean }>('/admin/logout', { method: 'POST' });
}

export function apiState() {
  return request<AdminState>('/admin/api/state');
}

export function apiSaveAuth(auth: GuardConfig) {
  return request<{ ok: boolean; auth: GuardConfig }>('/admin/api/auth-config', {
    method: 'PUT',
    body: JSON.stringify(auth),
  });
}

export function apiSaveUi(ui: UiConfig) {
  return request<{ ok: boolean; ui: UiConfig }>('/admin/api/ui-config', {
    method: 'PUT',
    body: JSON.stringify(ui),
  });
}

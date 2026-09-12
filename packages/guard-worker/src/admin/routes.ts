import type { Env } from '../auth/types';
import { ADMIN_COOKIE } from '../auth/types';
import {
  loadGuardConfig,
  parseGuardConfig,
  saveGuardConfig,
} from '../config';
import { loadUiConfig, parseUiConfig, saveUiConfig } from '../ui-config';
import { buildSessionPayload, signSession, verifySession } from '../session';
import { ADMIN_SPA_HTML } from '../pages/admin-spa';

function isSecure(request: Request): boolean {
  const url = new URL(request.url);
  if (url.protocol === 'https:') return true;
  return request.headers.get('CF-Visitor')?.includes('https') === true;
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=') || null;
  }
  return null;
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}

function adminPage(needLogin: boolean): Response {
  // SPA handles login UI; needLogin only used when SPA missing.
  if (!ADMIN_SPA_HTML) {
    return new Response(
      needLogin
        ? 'Admin SPA not built. Run npm run build:admin && npm run sync-assets.'
        : 'Admin SPA not built.',
      {
        status: 503,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      },
    );
  }
  return new Response(ADMIN_SPA_HTML, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex',
    },
  });
}

export async function verifyAdmin(
  request: Request,
  env: Env,
): Promise<boolean> {
  if (!env.ADMIN_PASSWORD) return false;
  const token = readCookie(request, ADMIN_COOKIE);
  if (!token) return false;
  const payload = await verifySession(token, env.SESSION_SECRET);
  return payload?.provider === 'admin' && payload.sub === 'admin';
}

export async function handleAdminRequest(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const path = url.pathname;
  if (path !== '/admin' && path !== '/admin/' && !path.startsWith('/admin/')) {
    return null;
  }

  const secure = isSecure(request);

  if (path === '/admin' || path === '/admin/' || path === '/admin/index.html') {
    return adminPage(!(await verifyAdmin(request, env)));
  }

  if (path === '/admin/login' && request.method === 'POST') {
    if (!env.ADMIN_PASSWORD) {
      return json({ error: 'admin_disabled' }, 403);
    }
    let password = '';
    try {
      const body = (await request.json()) as { password?: string };
      password = body.password ?? '';
    } catch {
      return json({ error: 'invalid_json' }, 400);
    }
    const a = new TextEncoder().encode(password);
    const b = new TextEncoder().encode(env.ADMIN_PASSWORD);
    let diff = a.length === b.length ? 0 : 1;
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) {
      diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
    }
    if (diff !== 0) {
      return json({ error: 'invalid_password' }, 401);
    }
    const payload = buildSessionPayload(
      { sub: 'admin', provider: 'admin', login: 'admin' },
      8 * 3600,
    );
    const token = await signSession(payload, env.SESSION_SECRET);
    const headers = new Headers({ 'content-type': 'application/json' });
    const parts = [
      `${ADMIN_COOKIE}=${token}`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      `Max-Age=${8 * 3600}`,
    ];
    if (secure) parts.push('Secure');
    headers.append('Set-Cookie', parts.join('; '));
    return new Response(JSON.stringify({ ok: true }), { headers });
  }

  if (path === '/admin/logout' && request.method === 'POST') {
    const headers = new Headers({ 'content-type': 'application/json' });
    const parts = [
      `${ADMIN_COOKIE}=`,
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      'Max-Age=0',
    ];
    if (secure) parts.push('Secure');
    headers.append('Set-Cookie', parts.join('; '));
    return new Response(JSON.stringify({ ok: true }), { headers });
  }

  if (path.startsWith('/admin/api/')) {
    if (!env.ADMIN_PASSWORD) {
      return json({ error: 'admin_disabled' }, 403);
    }
    if (!(await verifyAdmin(request, env))) {
      return json({ error: 'unauthorized' }, 401);
    }

    if (path === '/admin/api/state' && request.method === 'GET') {
      const [auth, ui] = await Promise.all([
        loadGuardConfig(env),
        loadUiConfig(env),
      ]);
      return json({
        auth,
        ui,
        hasKv: Boolean(env.RULES),
        hasAdminPassword: true,
        githubConfigured: Boolean(
          env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET,
        ),
      });
    }

    if (path === '/admin/api/auth-config' && request.method === 'PUT') {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'invalid_json' }, 400);
      }
      try {
        const config = parseGuardConfig(body, env);
        await saveGuardConfig(env, config);
        return json({ ok: true, auth: config });
      } catch (e) {
        return json(
          { error: e instanceof Error ? e.message : 'save_failed' },
          400,
        );
      }
    }

    if (path === '/admin/api/ui-config' && request.method === 'PUT') {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json({ error: 'invalid_json' }, 400);
      }
      try {
        const ui = parseUiConfig(body);
        await saveUiConfig(env, ui);
        return json({ ok: true, ui });
      } catch (e) {
        return json(
          { error: e instanceof Error ? e.message : 'save_failed' },
          400,
        );
      }
    }

    return json({ error: 'not_found' }, 404);
  }

  return json({ error: 'not_found' }, 404);
}

import type { Env, SessionPayload, UserProfile } from './types';
import { getProvider, listProviders } from './providers';
import { evaluateRules } from './rules-engine';
import {
  buildSessionPayload,
  clearSessionCookie,
  readSessionCookie,
  sessionCookie,
  signSession,
  verifySession,
} from '../session';
import { isProviderEnabled, listPublicPaths, loadGuardConfig, resolveProviderConfig } from '../config';
import { loadUiConfig } from '../ui-config';
import type { UiConfig } from './types';
// Built by `npm run build:login` → scripts/sync-assets.mjs. Empty string disables SPA.
import { LOGIN_SPA_HTML } from '../pages/login-spa';

const STATE_COOKIE = 'csg_oauth_state';
const PENDING_COOKIE = 'csg_oauth_next';

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isSecureRequest(request: Request): boolean {
  const url = new URL(request.url);
  if (url.protocol === 'https:') return true;
  return request.headers.get('CF-Visitor')?.includes('https') === true;
}

function redirectBase(request: Request, env: Env): string {
  if (env.OAUTH_REDIRECT_BASE) {
    return env.OAUTH_REDIRECT_BASE.replace(/\/$/, '');
  }
  const url = new URL(request.url);
  return url.origin;
}

function ttlSeconds(env: Env): number {
  const n = Number(env.SESSION_TTL_SECONDS ?? '604800');
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 604800;
}

function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function setTempCookie(
  headers: Headers,
  name: string,
  value: string,
  maxAge: number,
  secure: boolean,
): void {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push('Secure');
  headers.append('Set-Cookie', parts.join('; '));
}

export function buildLoginHtml(opts: {
  providers: Array<{ id: string; displayName: string }>;
  mode: string;
  error?: string;
  reason?: string;
  next?: string;
  ui?: UiConfig;
}): string {
  const ui = opts.ui;
  const prefix = ui?.providerButtonPrefix || '使用';
  const showIcon = ui?.showGithubIcon !== false;
  const buttons = opts.providers
    .map((p) => {
      const nextQ = opts.next ? `?next=${encodeURIComponent(opts.next)}` : '';
      const href = `/auth/start/${htmlEscape(p.id)}${nextQ}`;
      const icon =
        p.id === 'github' && showIcon
          ? `<svg class="btn-icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.48 2 2 6.58 2 12.26c0 4.52 2.87 8.35 6.84 9.7.5.1.68-.22.68-.48 0-.24-.01-.87-.01-1.7-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.36 1.12 2.94.86.09-.67.35-1.12.63-1.38-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.32.1-2.75 0 0 .84-.27 2.75 1.05A9.3 9.3 0 0 1 12 6.84c.85 0 1.71.12 2.51.35 1.9-1.32 2.74-1.05 2.74-1.05.55 1.43.2 2.49.1 2.75.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.8-4.57 5.06.36.32.68.94.68 1.9 0 1.38-.01 2.48-.01 2.82 0 .26.18.58.69.48A10.27 10.27 0 0 0 22 12.26C22 6.58 17.52 2 12 2z"/></svg>`
          : p.id === 'github'
            ? ''
            : `<span class="btn-icon">${htmlEscape(p.displayName.charAt(0))}</span>`;
      return `<a class="btn" href="${href}">${icon}${htmlEscape(prefix)} ${htmlEscape(p.displayName)} 登录</a>`;
    })
    .join('\n');

  const empty =
    '<p class="status">尚未启用任何 OAuth 登录。请配置密钥并在 KV 中打开 provider。</p>';

  const errorBlock = opts.error
    ? `<div class="alert" role="alert"><strong>${htmlEscape(opts.error)}</strong>${
        opts.reason ? `<div class="alert-sub">${htmlEscape(opts.reason)}</div>` : ''
      }</div>`
    : '';

  const heading = ui?.loginHeading || '访问受保护站点';
  const subtitle = ui?.loginSubtitle || '使用已授权账号登录后继续浏览';
  const modeLabel = opts.mode === 'strict' ? '严格模式' : '普通模式';
  const showMode = ui?.showModeBadge !== false;
  const showBrand = ui?.showFooterBrand !== false;
  const brand = ui?.footerBrand || 'cf-static-guard';
  const copyright = ui?.copyright || '';
  const icp = ui?.icp || '';
  const icpLink = ui?.icpLink || 'https://beian.miit.gov.cn/';
  const legalHtml = [copyright ? `<span>${htmlEscape(copyright)}</span>` : '', icp ? `<a class="legal-link" href="${htmlEscape(icpLink)}" target="_blank" rel="noopener noreferrer">${htmlEscape(icp)}</a>` : ''].filter(Boolean).join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>登录 · Static Guard</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f4f6fb;
      --panel: #ffffff;
      --ink: #0f172a;
      --muted: #64748b;
      --accent: #2563eb;
      --accent-soft: #eff6ff;
      --accent-border: #bfdbfe;
      --danger-bg: #fef2f2;
      --danger-ink: #b91c1c;
      --danger-border: #fecaca;
      --border: #e2e8f0;
      --shadow: 0 18px 50px rgba(15, 23, 42, 0.08);
      font-family: "Segoe UI", system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      color: var(--ink);
      background:
        radial-gradient(900px 480px at 12% -8%, rgba(37, 99, 235, 0.12), transparent 55%),
        radial-gradient(720px 420px at 92% 0%, rgba(14, 165, 233, 0.1), transparent 50%),
        linear-gradient(180deg, #f8fafc 0%, var(--bg) 100%);
    }
    .card {
      width: min(420px, 100%);
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 32px 28px 24px;
      box-shadow: var(--shadow);
    }
    .hero { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 22px; }
    .logo {
      width: 44px;
      height: 44px;
      border-radius: 14px;
      display: grid;
      place-items: center;
      color: #fff;
      background: linear-gradient(145deg, #3b82f6, #0ea5e9);
      box-shadow: 0 8px 18px rgba(37, 99, 235, 0.28);
      flex-shrink: 0;
    }
    h1 { margin: 0; font-size: 1.25rem; letter-spacing: -0.02em; }
    .sub { margin: 6px 0 0; color: var(--muted); font-size: 0.92rem; line-height: 1.45; }
    .stack { display: grid; gap: 10px; }
    .btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      height: 46px;
      border-radius: 12px;
      border: 1px solid var(--accent-border);
      background: var(--accent-soft);
      color: #1d4ed8;
      text-decoration: none;
      font-weight: 600;
      font-size: 0.95rem;
      transition: transform 0.12s ease, box-shadow 0.12s ease, background 0.12s ease;
    }
    .btn-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .btn:hover {
      background: #dbeafe;
      box-shadow: 0 8px 18px rgba(37, 99, 235, 0.12);
      transform: translateY(-1px);
      text-decoration: none;
    }
    .alert {
      margin-bottom: 16px;
      padding: 12px 14px;
      border-radius: 12px;
      background: var(--danger-bg);
      color: var(--danger-ink);
      border: 1px solid var(--danger-border);
      font-size: 0.9rem;
      line-height: 1.45;
    }
    .alert-sub { margin-top: 4px; opacity: 0.92; font-size: 0.85rem; }
    .status { color: var(--muted); font-size: 0.9rem; line-height: 1.5; }
    .footer {
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      gap: 8px;
      color: var(--muted);
      font-size: 0.8rem;
    }
    .footer-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .legal { display: flex; flex-wrap: wrap; gap: 8px 12px; }
    .legal-link { color: var(--muted); text-decoration: none; }
    .legal-link:hover { color: var(--accent); }
    .badge {
      display: inline-flex;
      padding: 3px 9px;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: #f8fafc;
      font-size: 0.75rem;
      font-weight: 600;
    }
    .badge.strict { color: #b45309; background: #fffbeb; border-color: #fde68a; }
    .badge.normal { color: #047857; background: #ecfdf5; border-color: #a7f3d0; }
  </style>
</head>
<body>
  <main class="card">
    <div class="hero">
      <div class="logo" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M12 3l7 3v5.5c0 4.4-2.9 8.4-7 9.5-4.1-1.1-7-5.1-7-9.5V6l7-3z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
          <path d="M9.2 12.2l1.9 1.9 3.8-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div>
        <h1>${htmlEscape(heading)}</h1>
        <p class="sub">${htmlEscape(subtitle)}</p>
      </div>
    </div>
    ${errorBlock}
    <div class="stack">
      ${buttons || empty}
    </div>
    <div class="footer">
      <div class="footer-row">
        ${showBrand ? `<span>${htmlEscape(brand)}</span>` : '<span></span>'}
        ${showMode ? `<span class="badge ${opts.mode === 'strict' ? 'strict' : 'normal'}">${htmlEscape(modeLabel)}</span>` : ''}
      </div>
      ${legalHtml ? `<div class="legal">${legalHtml}</div>` : ''}
    </div>
  </main>
</body>
</html>`;
}

export function buildDeniedHtml(opts: {
  mode: string;
  failures: Array<{ code: string; message: string }>;
  login: string;
  provider: string;
}): string {
  const items = opts.failures
    .map((f) => `<li><code>${htmlEscape(f.code)}</code> — ${htmlEscape(f.message)}</li>`)
    .join('');
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>访问被拒绝 · Static Guard</title>
  <style>
    :root {
      color-scheme: light;
      font-family: "Segoe UI", system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
    }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background:
        radial-gradient(900px 480px at 12% -8%, rgba(37, 99, 235, 0.12), transparent 55%),
        linear-gradient(180deg, #f8fafc 0%, #f4f6fb 100%);
      color: #0f172a;
      padding: 24px;
    }
    .card {
      width: min(480px, 100%);
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 20px;
      padding: 32px 28px;
      box-shadow: 0 18px 50px rgba(15, 23, 42, 0.08);
    }
    h1 { margin: 0 0 8px; font-size: 1.2rem; }
    p { color: #64748b; line-height: 1.5; margin: 0 0 16px; }
    ul { margin: 0 0 20px; padding-left: 18px; color: #b91c1c; line-height: 1.6; }
    code { color: #b45309; background: #fffbeb; padding: 0.1em 0.35em; border-radius: 6px; }
    a.btn {
      display: inline-flex;
      height: 42px;
      align-items: center;
      padding: 0 16px;
      border-radius: 12px;
      background: #eff6ff;
      color: #1d4ed8;
      text-decoration: none;
      border: 1px solid #bfdbfe;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <main class="card">
    <h1>访问被拒绝</h1>
    <p>账号 <strong>${htmlEscape(opts.login)}</strong> 已通过 ${htmlEscape(opts.provider)} 登录，但未满足 <strong>${htmlEscape(opts.mode)}</strong> 策略。</p>
    <ul>${items || '<li>策略校验失败</li>'}</ul>
    <a class="btn" href="/auth/logout">退出登录</a>
  </main>
</body>
</html>`;
}

export async function verifyRequestSession(
  request: Request,
  env: Env,
): Promise<SessionPayload | null> {
  const token = readSessionCookie(request);
  if (!token) return null;
  return verifySession(token, env.SESSION_SECRET);
}

export function isPublicPath(pathname: string, env: Env): boolean {
  if (pathname === '/health' || pathname === '/health/') return true;
  if (pathname.startsWith('/auth/')) return true;
  // Explicit allowlist from env. Default includes favicon optionally; user said
  // all assets require auth — keep PUBLIC_PATHS configurable but default only /health.
  const allowed = listPublicPaths(env);
  return allowed.some((p) => pathname === p || pathname === `${p}/`);
}

export async function handleAuthRequest(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response | null> {
  const path = url.pathname;
  if (!path.startsWith('/auth')) return null;

  const secure = isSecureRequest(request);
  const config = await loadGuardConfig(env);

  if (path === '/auth/providers' || path === '/auth/providers/') {
    const providers = listProviders()
      .filter((p) => isProviderEnabled(config, p.id, env))
      .map((p) => ({ id: p.id, displayName: p.displayName }));
    return Response.json(
      { mode: config.mode, providers },
      { headers: { 'cache-control': 'no-store' } },
    );
  }

  if (path === '/auth/login' || path === '/auth/login/') {
    const providers = listProviders().filter((p) =>
      isProviderEnabled(config, p.id, env),
    );
    const error = url.searchParams.get('error') ?? undefined;
    const reason = url.searchParams.get('reason') ?? undefined;
    const next = url.searchParams.get('next') ?? undefined;
    const ui = await loadUiConfig(env);
    const html = LOGIN_SPA_HTML
      ? LOGIN_SPA_HTML
      : buildLoginHtml({
          providers: providers.map((p) => ({
            id: p.id,
            displayName: p.displayName,
          })),
          mode: config.mode,
          error,
          reason,
          next,
          ui,
        });
    return new Response(html, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'x-robots-tag': 'noindex',
      },
    });
  }

  if (path === '/auth/logout' || path === '/auth/logout/') {
    const headers = new Headers({ Location: '/auth/login' });
    headers.append('Set-Cookie', clearSessionCookie(secure));
    headers.append('Cache-Control', 'no-store');
    return new Response(null, { status: 302, headers });
  }

  if (path === '/auth/me' || path === '/auth/me/') {
    const session = await verifyRequestSession(request, env);
    if (!session) {
      return Response.json({ authenticated: false }, { status: 401 });
    }
    return Response.json({
      authenticated: true,
      provider: session.provider,
      login: session.login,
      name: session.name ?? null,
      avatarUrl: session.avatarUrl ?? null,
      exp: session.exp,
      mode: config.mode,
    });
  }

  const startMatch = path.match(/^\/auth\/start\/([a-z0-9_-]+)\/?$/i);
  if (startMatch) {
    const providerId = startMatch[1].toLowerCase();
    const provider = getProvider(providerId);
    if (!provider || !isProviderEnabled(config, providerId, env)) {
      return redirectLogin(url, { error: 'Provider not available' });
    }
    const next = url.searchParams.get('next') || '/';
    if (!next.startsWith('/') || next.startsWith('//')) {
      return redirectLogin(url, { error: 'Invalid next path' });
    }
    const state = crypto.randomUUID();
    const redirectUri = `${redirectBase(request, env)}/auth/callback/${provider.id}`;
    const authorizeUrl = provider.getAuthorizeUrl({
      clientId: env.GITHUB_CLIENT_ID,
      state,
      redirectUri,
    });
    const headers = new Headers({ Location: authorizeUrl });
    setTempCookie(headers, STATE_COOKIE, state, 600, secure);
    setTempCookie(headers, PENDING_COOKIE, next, 600, secure);
    return new Response(null, { status: 302, headers });
  }

  const cbMatch = path.match(/^\/auth\/callback\/([a-z0-9_-]+)\/?$/i);
  if (cbMatch) {
    const providerId = cbMatch[1].toLowerCase();
    const provider = getProvider(providerId);
    if (!provider || !isProviderEnabled(config, providerId, env)) {
      return redirectLogin(url, { error: 'Provider not available' });
    }

    const cookies = parseCookies(request.headers.get('Cookie'));
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const ghError = url.searchParams.get('error');
    const errorDesc = url.searchParams.get('error_description');

    if (ghError) {
      return redirectLogin(url, {
        error: 'Authorization failed',
        reason: errorDesc || ghError,
      });
    }
    if (!code || !state) {
      return redirectLogin(url, { error: 'Missing OAuth code/state' });
    }
    if (cookies[STATE_COOKIE] !== state) {
      return redirectLogin(url, { error: 'State mismatch', reason: 'Possible CSRF' });
    }

    const redirectUri = `${redirectBase(request, env)}/auth/callback/${provider.id}`;
    try {
      const tokens = await provider.exchangeCode({
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
        code,
        redirectUri,
      });
      const profile: UserProfile = await provider.fetchProfile(tokens);
      const { mode, rules } = resolveProviderConfig(config, provider.id);
      const result = evaluateRules({ mode, rules, profile });
      const next = cookies[PENDING_COOKIE] || '/';

      if (!result.ok) {
        if (mode === 'strict') {
          const denied = buildDeniedHtml({
            mode,
            failures: result.failures.map((f) => ({
              code: f.code,
              message: f.message,
            })),
            login: profile.login,
            provider: provider.displayName,
          });
          return new Response(denied, {
            status: 403,
            headers: {
              'content-type': 'text/html; charset=utf-8',
              'cache-control': 'no-store',
              'set-cookie': clearSessionCookie(secure),
              'x-robots-tag': 'noindex',
            },
          });
        }
        // normal mode blocklist hit
        return redirectLogin(url, {
          error: 'Access denied',
          reason: result.failures[0]?.message ?? 'policy failed',
        });
      }

      const payload = buildSessionPayload(
        {
          sub: profile.id,
          provider: profile.provider,
          login: profile.login,
          name: profile.name,
          avatarUrl: profile.avatarUrl,
        },
        ttlSeconds(env),
      );
      const token = await signSession(payload, env.SESSION_SECRET);
      const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/';
      const headers = new Headers({ Location: safeNext });
      headers.append(
        'Set-Cookie',
        sessionCookie(token, ttlSeconds(env), secure),
      );
      // clear temp cookies
      setTempCookie(headers, STATE_COOKIE, '', 0, secure);
      setTempCookie(headers, PENDING_COOKIE, '', 0, secure);
      return new Response(null, { status: 302, headers });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'OAuth error';
      // Avoid leaking raw tokens; message should already be safe-ish.
      return redirectLogin(url, {
        error: 'Sign-in failed',
        reason: message.slice(0, 200),
      });
    }
  }

  return new Response('Not found', { status: 404 });
}

function redirectLogin(
  url: URL,
  params: { error?: string; reason?: string },
): Response {
  const target = new URL('/auth/login', url.origin);
  if (params.error) target.searchParams.set('error', params.error);
  if (params.reason) target.searchParams.set('reason', params.reason);
  const next = url.searchParams.get('next');
  if (next) target.searchParams.set('next', next);
  return new Response(null, {
    status: 302,
    headers: { Location: target.pathname + target.search },
  });
}

export function unauthorizedRedirect(request: Request, url: URL): Response {
  const target = new URL('/auth/login', url.origin);
  const path = url.pathname + url.search;
  if (path && path !== '/') {
    target.searchParams.set('next', path);
  }
  // For API-ish requests, return 401 JSON instead of HTML redirect.
  const accept = request.headers.get('Accept') ?? '';
  const wantsJson =
    request.headers.get('X-Requested-With') === 'fetch' ||
    (!accept.includes('text/html') && accept.includes('application/json'));
  if (wantsJson) {
    return Response.json(
      { error: 'unauthenticated', login: '/auth/login' },
      { status: 401, headers: { 'cache-control': 'no-store' } },
    );
  }
  return new Response(null, {
    status: 302,
    headers: {
      Location: target.pathname + target.search,
      'cache-control': 'no-store',
    },
  });
}

export function healthResponse(env: Env): Response {
  return Response.json(
    {
      ok: true,
      service: 'cf-static-guard',
      time: new Date().toISOString(),
      hasGithubSecrets: Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
      hasSessionSecret: Boolean(env.SESSION_SECRET),
      hasKv: Boolean(env.RULES),
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}

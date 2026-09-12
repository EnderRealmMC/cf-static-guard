import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runWrangler } from './wrangler.js';
import type { CsgProfile, ProviderRules, UiProfile } from './store.js';

const AUTH_KEY = 'auth:config';
const UI_KEY = 'ui:config';

function requireKv(profile: CsgProfile): string {
  if (!profile.kvNamespaceId) {
    throw new Error(
      'KV namespace not set on profile. Run `csg init` or `csg kv create` first.',
    );
  }
  return profile.kvNamespaceId;
}

export async function kvPut(
  profile: CsgProfile,
  key: string,
  value: string,
): Promise<void> {
  const id = requireKv(profile);
  const dir = mkdtempSync(join(tmpdir(), 'csg-kv-'));
  const file = join(dir, 'value.json');
  writeFileSync(file, value, 'utf8');
  try {
    const res = await runWrangler([
      'kv',
      'key',
      'put',
      key,
      '--namespace-id',
      id,
      '--path',
      file,
    ]);
    if (res.exitCode !== 0) {
      throw new Error(res.stderr || res.stdout || 'kv put failed');
    }
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

export async function kvGet(
  profile: CsgProfile,
  key: string,
): Promise<string | null> {
  const id = requireKv(profile);
  const res = await runWrangler([
    'kv',
    'key',
    'get',
    key,
    '--namespace-id',
    id,
  ]);
  if (res.exitCode !== 0) return null;
  const out = res.stdout.trim();
  return out || null;
}

export interface OnlineAuthConfig {
  mode: 'normal' | 'strict';
  providers: Record<
    string,
    {
      enabled: boolean;
      mode?: 'normal' | 'strict';
      rules?: ProviderRules;
    }
  >;
}

export function profileToAuthConfig(profile: CsgProfile): OnlineAuthConfig {
  return {
    mode: profile.mode,
    providers: {
      github: {
        enabled: profile.providers.github?.enabled !== false,
        mode: profile.providers.github?.mode,
        rules: profile.providers.github?.rules || {},
      },
    },
  };
}

export function profileToUiConfig(profile: CsgProfile): UiProfile {
  return {
    siteTitle: profile.ui?.siteTitle ?? '受保护站点',
    siteSubtitle: profile.ui?.siteSubtitle ?? '登录后继续访问',
    loginHeading: profile.ui?.loginHeading ?? '访问受保护站点',
    loginSubtitle:
      profile.ui?.loginSubtitle ?? '使用已授权账号登录后继续浏览',
    providerButtonPrefix: profile.ui?.providerButtonPrefix ?? '使用',
    footerBrand: profile.ui?.footerBrand ?? 'cf-static-guard',
    copyright: profile.ui?.copyright ?? '',
    icp: profile.ui?.icp ?? '',
    icpLink: profile.ui?.icpLink ?? 'https://beian.miit.gov.cn/',
    showModeBadge: profile.ui?.showModeBadge !== false,
    showFooterBrand: profile.ui?.showFooterBrand !== false,
    showGithubIcon: profile.ui?.showGithubIcon !== false,
  };
}

export async function pushAuthConfig(profile: CsgProfile): Promise<void> {
  await kvPut(
    profile,
    AUTH_KEY,
    JSON.stringify(profileToAuthConfig(profile), null, 2),
  );
}

export async function pushUiConfig(profile: CsgProfile): Promise<void> {
  await kvPut(
    profile,
    UI_KEY,
    JSON.stringify(profileToUiConfig(profile), null, 2),
  );
}

export async function pullAuthConfig(
  profile: CsgProfile,
): Promise<OnlineAuthConfig | null> {
  const raw = await kvGet(profile, AUTH_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as OnlineAuthConfig;
}

export async function pullUiConfig(
  profile: CsgProfile,
): Promise<UiProfile | null> {
  const raw = await kvGet(profile, UI_KEY);
  if (!raw) return null;
  return JSON.parse(raw) as UiProfile;
}

/** Merge pulled auth config into a local profile (for csg config pull --apply). */
export function applyAuthToProfile(
  profile: CsgProfile,
  auth: OnlineAuthConfig,
): CsgProfile {
  const gh = auth.providers?.github;
  return {
    ...profile,
    mode: auth.mode || profile.mode,
    providers: {
      github: {
        enabled: gh?.enabled !== false,
        mode: gh?.mode,
        rules: gh?.rules || {},
      },
    },
    updatedAt: new Date().toISOString(),
  };
}

export function applyUiToProfile(
  profile: CsgProfile,
  ui: UiProfile,
): CsgProfile {
  return {
    ...profile,
    ui: { ...profile.ui, ...ui },
    updatedAt: new Date().toISOString(),
  };
}

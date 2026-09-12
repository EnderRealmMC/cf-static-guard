import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface ProviderRules {
  allowlist?: string[];
  blocklist?: string[];
  minAccountAgeDays?: number;
  requiredOrgs?: string[];
  requiredTeams?: Array<{ org: string; team: string }>;
  emailDomainAllowlist?: string[];
}

export interface ProviderProfile {
  enabled: boolean;
  mode?: 'normal' | 'strict';
  clientId?: string;
  rules?: ProviderRules;
}

export interface UiProfile {
  siteTitle?: string;
  siteSubtitle?: string;
  loginHeading?: string;
  loginSubtitle?: string;
  providerButtonPrefix?: string;
  footerBrand?: string;
  copyright?: string;
  icp?: string;
  icpLink?: string;
  showModeBadge?: boolean;
  showFooterBrand?: boolean;
  showGithubIcon?: boolean;
}

export interface CsgProfile {
  /** Cloudflare worker name */
  name: string;
  mode: 'normal' | 'strict';
  spaFallback: boolean;
  publicPaths: string[];
  sessionTtlSeconds: number;
  oauthRedirectBase?: string;
  /** KV namespace id for RULES binding */
  kvNamespaceId?: string;
  /** accountId from wrangler, optional */
  accountId?: string;
  providers: {
    github?: ProviderProfile;
  };
  ui?: UiProfile;
  updatedAt: string;
}

export interface GlobalStore {
  defaultProfile: string;
  profiles: Record<string, CsgProfile>;
}

export function configDir(): string {
  if (process.platform === 'win32') {
    const base = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming');
    return join(base, 'csg');
  }
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(base, 'csg');
}

export function configPath(): string {
  return join(configDir(), 'config.json');
}

export function emptyStore(): GlobalStore {
  return { defaultProfile: 'default', profiles: {} };
}

export function loadStore(): GlobalStore {
  const p = configPath();
  if (!existsSync(p)) return emptyStore();
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8')) as GlobalStore;
    if (!raw || typeof raw !== 'object' || !raw.profiles) return emptyStore();
    return {
      defaultProfile: raw.defaultProfile || 'default',
      profiles: raw.profiles,
    };
  } catch {
    return emptyStore();
  }
}

export function saveStore(store: GlobalStore): void {
  const dir = configDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(configPath(), JSON.stringify(store, null, 2) + '\n', 'utf8');
}

export function getProfile(name?: string): CsgProfile | null {
  const store = loadStore();
  const key = name || store.defaultProfile;
  return store.profiles[key] || null;
}

export function upsertProfile(profile: CsgProfile, asDefault = true): void {
  const store = loadStore();
  store.profiles[profile.name] = profile;
  if (asDefault) store.defaultProfile = profile.name;
  saveStore(store);
}

export function listProfileNames(): string[] {
  return Object.keys(loadStore().profiles);
}

export function setDefaultProfile(name: string): boolean {
  const store = loadStore();
  if (!store.profiles[name]) return false;
  store.defaultProfile = name;
  saveStore(store);
  return true;
}

export function defaultProfile(name: string, mode: 'normal' | 'strict' = 'normal'): CsgProfile {
  return {
    name,
    mode,
    spaFallback: false,
    publicPaths: ['/health'],
    sessionTtlSeconds: 604800,
    providers: {
      github: { enabled: true, mode: undefined, rules: {} },
    },
    ui: {},
    updatedAt: new Date().toISOString(),
  };
}

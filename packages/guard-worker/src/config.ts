import type { GuardConfig, GuardMode, ProviderConfig, Env } from './auth/types';
import { defaultGuardConfig } from './auth/types';

const KV_CONFIG_KEY = 'auth:config';

function parseMode(value: unknown, fallback: GuardMode): GuardMode {
  return value === 'strict' || value === 'normal' ? value : fallback;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((v): v is string => typeof v === 'string' && v.length > 0);
}

function asTeamList(
  value: unknown,
): Array<{ org: string; team: string }> | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: Array<{ org: string; team: string }> = [];
  for (const item of value) {
    if (
      item &&
      typeof item === 'object' &&
      typeof (item as { org?: unknown }).org === 'string' &&
      typeof (item as { team?: unknown }).team === 'string'
    ) {
      out.push({
        org: (item as { org: string }).org,
        team: (item as { team: string }).team,
      });
    }
  }
  return out.length ? out : undefined;
}

function normalizeRules(raw: unknown): ProviderConfig['rules'] {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const rules: NonNullable<ProviderConfig['rules']> = {};
  const allowlist = asStringArray(r.allowlist);
  if (allowlist) rules.allowlist = allowlist;
  const blocklist = asStringArray(r.blocklist);
  if (blocklist) rules.blocklist = blocklist;
  if (typeof r.minAccountAgeDays === 'number' && r.minAccountAgeDays >= 0) {
    rules.minAccountAgeDays = r.minAccountAgeDays;
  }
  const requiredOrgs = asStringArray(r.requiredOrgs);
  if (requiredOrgs) rules.requiredOrgs = requiredOrgs;
  const requiredTeams = asTeamList(r.requiredTeams);
  if (requiredTeams) rules.requiredTeams = requiredTeams;
  const emailDomainAllowlist = asStringArray(r.emailDomainAllowlist);
  if (emailDomainAllowlist) rules.emailDomainAllowlist = emailDomainAllowlist;
  return rules;
}

function normalizeProvider(raw: unknown): ProviderConfig {
  if (!raw || typeof raw !== 'object') {
    return { enabled: false, rules: {} };
  }
  const p = raw as Record<string, unknown>;
  return {
    enabled: p.enabled !== false,
    mode: p.mode === 'strict' || p.mode === 'normal' ? p.mode : undefined,
    rules: normalizeRules(p.rules),
  };
}

export function parseGuardConfig(raw: unknown, env: Env): GuardConfig {
  const base = defaultGuardConfig();
  const envMode = parseMode(env.GUARD_MODE, base.mode);

  if (!raw || typeof raw !== 'object') {
    return {
      mode: envMode,
      providers: {
        github: {
          enabled: Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
          rules: {},
        },
      },
    };
  }

  const obj = raw as Record<string, unknown>;
  const mode = parseMode(obj.mode, envMode);
  const providersRaw =
    obj.providers && typeof obj.providers === 'object'
      ? (obj.providers as Record<string, unknown>)
      : { github: {} };

  const providers: GuardConfig['providers'] = {};
  for (const [id, value] of Object.entries(providersRaw)) {
    providers[id] = normalizeProvider(value);
  }

  if (!providers.github) {
    providers.github = {
      enabled: Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
      rules: {},
    };
  }

  return { mode, providers };
}

export async function loadGuardConfig(env: Env): Promise<GuardConfig> {
  if (env.RULES) {
    try {
      const cached = await env.RULES.get(KV_CONFIG_KEY, 'json');
      if (cached) return parseGuardConfig(cached, env);
    } catch {
      // fall through to defaults
    }
  }
  return parseGuardConfig(null, env);
}

export async function saveGuardConfig(
  env: Env,
  config: GuardConfig,
): Promise<void> {
  if (!env.RULES) {
    throw new Error('KV binding RULES is required to save auth config');
  }
  await env.RULES.put(KV_CONFIG_KEY, JSON.stringify(config));
}

export function resolveProviderConfig(
  config: GuardConfig,
  providerId: string,
): { mode: GuardMode; rules: NonNullable<ProviderConfig['rules']> } {
  const p = config.providers[providerId];
  if (!p) {
    return { mode: config.mode, rules: {} };
  }
  return {
    mode: p.mode ?? config.mode,
    rules: p.rules ?? {},
  };
}

export function isProviderEnabled(
  config: GuardConfig,
  providerId: string,
  env: Env,
): boolean {
  const p = config.providers[providerId];
  if (!p) return false;
  if (providerId === 'github') {
    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) return false;
  }
  return p.enabled;
}

export function listPublicPaths(env: Env): string[] {
  const raw = env.PUBLIC_PATHS ?? '/health';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => (p.startsWith('/') ? p : `/${p}`));
}

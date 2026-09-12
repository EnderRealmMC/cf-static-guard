import type { Env, UiConfig } from './auth/types';
import { defaultUiConfig } from './auth/types';

const KV_UI_KEY = 'ui:config';

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

export function parseUiConfig(raw: unknown): UiConfig {
  const d = defaultUiConfig();
  if (!raw || typeof raw !== 'object') return d;
  const o = raw as Record<string, unknown>;
  return {
    siteTitle: str(o.siteTitle, d.siteTitle),
    siteSubtitle: str(o.siteSubtitle, d.siteSubtitle),
    loginHeading: str(o.loginHeading, d.loginHeading),
    loginSubtitle: str(o.loginSubtitle, d.loginSubtitle),
    providerButtonPrefix: str(o.providerButtonPrefix, d.providerButtonPrefix),
    footerBrand: str(o.footerBrand, d.footerBrand),
    copyright: str(o.copyright, d.copyright),
    icp: str(o.icp, d.icp),
    icpLink: str(o.icpLink, d.icpLink),
    showModeBadge: bool(o.showModeBadge, d.showModeBadge),
    showFooterBrand: bool(o.showFooterBrand, d.showFooterBrand),
    showGithubIcon: bool(o.showGithubIcon, d.showGithubIcon),
  };
}

export async function loadUiConfig(env: Env): Promise<UiConfig> {
  if (!env.RULES) return defaultUiConfig();
  try {
    const raw = await env.RULES.get(KV_UI_KEY, 'json');
    if (raw) return parseUiConfig(raw);
  } catch {
    // ignore
  }
  return defaultUiConfig();
}

export async function saveUiConfig(env: Env, config: UiConfig): Promise<void> {
  if (!env.RULES) {
    throw new Error('KV binding RULES is required to save UI config');
  }
  await env.RULES.put(KV_UI_KEY, JSON.stringify(config));
}

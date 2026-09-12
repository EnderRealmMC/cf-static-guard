/** Shared auth types for pluggable OAuth providers. */

export type GuardMode = 'normal' | 'strict';

export interface UserProfile {
  provider: string;
  /** Stable unique id within the provider */
  id: string;
  /** Username / handle used for display and allowlists */
  login: string;
  name?: string;
  avatarUrl?: string;
  email?: string;
  createdAt?: string;
  orgs?: string[];
  teams?: Array<{ org: string; team: string }>;
}

export interface TokenBundle {
  accessToken: string;
  tokenType?: string;
  scope?: string;
  refreshToken?: string;
  expiresAt?: number;
}

export interface ProviderCapabilities {
  accountAge: boolean;
  orgs: boolean;
  teams: boolean;
  email: boolean;
}

export interface AuthProvider {
  readonly id: string;
  readonly displayName: string;
  readonly authorizeScopes?: string;
  capabilities(): ProviderCapabilities;
  getAuthorizeUrl(opts: {
    clientId: string;
    state: string;
    redirectUri: string;
  }): string;
  exchangeCode(opts: {
    clientId: string;
    clientSecret: string;
    code: string;
    redirectUri: string;
  }): Promise<TokenBundle>;
  fetchProfile(tokens: TokenBundle): Promise<UserProfile>;
}

/** Per-provider rules. Unknown fields are ignored. Missing fields are skipped. */
export interface ProviderRules {
  allowlist?: string[];
  blocklist?: string[];
  minAccountAgeDays?: number;
  requiredOrgs?: string[];
  requiredTeams?: Array<{ org: string; team: string }>;
  emailDomainAllowlist?: string[];
}

export interface ProviderConfig {
  enabled: boolean;
  mode?: GuardMode;
  rules?: ProviderRules;
}

export interface GuardConfig {
  mode: GuardMode;
  providers: Record<string, ProviderConfig>;
}

export interface SessionPayload {
  /** provider user id */
  sub: string;
  provider: string;
  login: string;
  name?: string;
  avatarUrl?: string;
  iat: number;
  exp: number;
}

export interface RuleCheckResult {
  ok: boolean;
  code: string;
  message: string;
}

export interface Env {
  ASSETS: Fetcher;
  RULES?: KVNamespace;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  SESSION_SECRET: string;
  ADMIN_PASSWORD?: string;
  OAUTH_REDIRECT_BASE?: string;
  GUARD_MODE?: string;
  PUBLIC_PATHS?: string;
  SPA_FALLBACK?: string;
  SESSION_TTL_SECONDS?: string;
}

export interface UiConfig {
  /** Login page */
  siteTitle: string;
  siteSubtitle: string;
  loginHeading: string;
  loginSubtitle: string;
  providerButtonPrefix: string;
  /** Footer / compliance */
  footerBrand: string;
  copyright: string;
  icp: string;
  icpLink: string;
  /** Visibility toggles */
  showModeBadge: boolean;
  showFooterBrand: boolean;
  showGithubIcon: boolean;
}

export function defaultUiConfig(): UiConfig {
  return {
    siteTitle: '受保护站点',
    siteSubtitle: '登录后继续访问',
    loginHeading: '访问受保护站点',
    loginSubtitle: '使用已授权账号登录后继续浏览',
    providerButtonPrefix: '使用',
    footerBrand: 'cf-static-guard',
    copyright: '',
    icp: '',
    icpLink: 'https://beian.miit.gov.cn/',
    showModeBadge: true,
    showFooterBrand: true,
    showGithubIcon: true,
  };
}

export const SESSION_COOKIE = 'csg_session';
export const ADMIN_COOKIE = 'csg_admin';

export function defaultGuardConfig(): GuardConfig {
  return {
    mode: 'normal',
    providers: {
      github: {
        enabled: true,
        mode: undefined,
        rules: {},
      },
    },
  };
}

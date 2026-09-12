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
  mode?: 'normal' | 'strict';
  rules?: ProviderRules;
}

export interface GuardConfig {
  mode: 'normal' | 'strict';
  providers: Record<string, ProviderConfig>;
}

export interface UiConfig {
  siteTitle: string;
  siteSubtitle: string;
  loginHeading: string;
  loginSubtitle: string;
  providerButtonPrefix: string;
  footerBrand: string;
  copyright: string;
  icp: string;
  icpLink: string;
  showModeBadge: boolean;
  showFooterBrand: boolean;
  showGithubIcon: boolean;
}

export interface AdminState {
  auth: GuardConfig;
  ui: UiConfig;
  hasKv: boolean;
  hasAdminPassword: boolean;
  githubConfigured: boolean;
}

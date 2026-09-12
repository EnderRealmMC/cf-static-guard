export interface ProviderInfo {
  id: string;
  displayName: string;
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

import type { ProviderInfo, UiConfig } from './types';

export interface ProvidersResponse {
  mode: string;
  providers: ProviderInfo[];
}

export function defaultUi(): UiConfig {
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

export async function fetchProviders(): Promise<ProvidersResponse> {
  const res = await fetch('/auth/providers', {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`providers HTTP ${res.status}`);
  return (await res.json()) as ProvidersResponse;
}

export async function fetchUiConfig(): Promise<UiConfig> {
  try {
    const res = await fetch('/ui-config', {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return defaultUi();
    const data = (await res.json()) as Partial<UiConfig>;
    return { ...defaultUi(), ...data };
  } catch {
    return defaultUi();
  }
}

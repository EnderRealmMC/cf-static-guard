import type {
  AuthProvider,
  ProviderCapabilities,
  TokenBundle,
  UserProfile,
} from '../types';

const AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const API = 'https://api.github.com';

async function ghJson<T>(
  path: string,
  accessToken: string,
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'cf-static-guard',
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${path} failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

export const githubProvider: AuthProvider = {
  id: 'github',
  displayName: 'GitHub',
  // read:org is required for /user/orgs and /user/teams in strict mode.
  // Keep the requested scope minimal-ish; user:email helps emailDomain rules later.
  authorizeScopes: 'read:user user:email read:org',

  capabilities(): ProviderCapabilities {
    return {
      accountAge: true,
      orgs: true,
      teams: true,
      email: true,
    };
  },

  getAuthorizeUrl({ clientId, state, redirectUri }) {
    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('state', state);
    url.searchParams.set('scope', githubProvider.authorizeScopes ?? 'read:user');
    url.searchParams.set('allow_signup', 'true');
    return url.toString();
  },

  async exchangeCode({ clientId, clientSecret, code, redirectUri }) {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });
    if (!res.ok) {
      throw new Error(`GitHub token exchange failed: ${res.status}`);
    }
    const data = (await res.json()) as {
      access_token?: string;
      token_type?: string;
      scope?: string;
      error?: string;
      error_description?: string;
    };
    if (!data.access_token) {
      throw new Error(
        data.error_description || data.error || 'GitHub did not return access_token',
      );
    }
    return {
      accessToken: data.access_token,
      tokenType: data.token_type,
      scope: data.scope,
    } satisfies TokenBundle;
  },

  async fetchProfile(tokens) {
    const user = await ghJson<{
      id: number;
      login: string;
      name: string | null;
      avatar_url: string;
      email: string | null;
      created_at: string;
    }>('/user', tokens.accessToken);

    let email = user.email ?? undefined;
    if (!email) {
      try {
        const emails = await ghJson<
          Array<{ email: string; primary: boolean; verified: boolean }>
        >('/user/emails', tokens.accessToken);
        const primary = emails.find((e) => e.primary && e.verified);
        email = (primary ?? emails.find((e) => e.verified))?.email;
      } catch {
        // optional
      }
    }

    let orgs: string[] | undefined;
    try {
      const orgList = await ghJson<Array<{ login: string }>>(
        '/user/orgs?per_page=100',
        tokens.accessToken,
      );
      orgs = orgList.map((o) => o.login);
    } catch {
      orgs = [];
    }

    let teams: Array<{ org: string; team: string }> | undefined;
    try {
      const teamList = await ghJson<
        Array<{
          slug: string;
          name: string;
          organization?: { login: string };
        }>
      >('/user/teams?per_page=100', tokens.accessToken);
      teams = teamList
        .filter((t) => t.organization?.login)
        .map((t) => ({
          org: t.organization!.login,
          team: t.slug || t.name,
        }));
    } catch {
      teams = [];
    }

    return {
      provider: 'github',
      id: String(user.id),
      login: user.login,
      name: user.name ?? undefined,
      avatarUrl: user.avatar_url,
      email,
      createdAt: user.created_at,
      orgs,
      teams,
    } satisfies UserProfile;
  },
};

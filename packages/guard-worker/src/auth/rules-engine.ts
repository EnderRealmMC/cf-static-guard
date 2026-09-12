import type {
  ProviderRules,
  RuleCheckResult,
  UserProfile,
} from './types';

function normalizeLogin(value: string): string {
  return value.trim().toLowerCase();
}

function checkAllowlist(
  profile: UserProfile,
  rules: ProviderRules,
): RuleCheckResult {
  if (!rules.allowlist?.length) {
    return { ok: true, code: 'allowlist_skipped', message: 'no allowlist' };
  }
  const login = normalizeLogin(profile.login);
  const id = profile.id;
  const matched = rules.allowlist.some((entry) => {
    const e = entry.trim();
    const lower = normalizeLogin(e);
    // support "login", "provider:login", or raw provider user id
    if (lower === login) return true;
    if (lower === `${profile.provider}:${login}`) return true;
    if (e === id) return true;
    return false;
  });
  return matched
    ? { ok: true, code: 'allowlist_ok', message: 'login in allowlist' }
    : {
        ok: false,
        code: 'allowlist_deny',
        message: 'account is not on the allowlist',
      };
}

function checkBlocklist(
  profile: UserProfile,
  rules: ProviderRules,
): RuleCheckResult {
  if (!rules.blocklist?.length) {
    return { ok: true, code: 'blocklist_skipped', message: 'no blocklist' };
  }
  const login = normalizeLogin(profile.login);
  const matched = rules.blocklist.some((entry) => {
    const lower = normalizeLogin(entry);
    return (
      lower === login ||
      lower === `${profile.provider}:${login}` ||
      entry === profile.id
    );
  });
  return matched
    ? {
        ok: false,
        code: 'blocklist_deny',
        message: 'account is blocked',
      }
    : { ok: true, code: 'blocklist_ok', message: 'not in blocklist' };
}

function checkAccountAge(
  profile: UserProfile,
  rules: ProviderRules,
): RuleCheckResult {
  const days = rules.minAccountAgeDays;
  if (days == null) {
    return { ok: true, code: 'age_skipped', message: 'no minAccountAgeDays' };
  }
  if (!profile.createdAt) {
    return {
      ok: false,
      code: 'age_missing',
      message: 'provider did not return account creation time',
    };
  }
  const created = Date.parse(profile.createdAt);
  if (Number.isNaN(created)) {
    return {
      ok: false,
      code: 'age_invalid',
      message: 'invalid account creation time',
    };
  }
  const ageDays = (Date.now() - created) / 86_400_000;
  return ageDays >= days
    ? { ok: true, code: 'age_ok', message: `account age ${ageDays.toFixed(1)}d` }
    : {
        ok: false,
        code: 'age_deny',
        message: `account must be at least ${days} days old`,
      };
}

function checkOrgs(
  profile: UserProfile,
  rules: ProviderRules,
): RuleCheckResult {
  const required = rules.requiredOrgs;
  if (!required?.length) {
    return { ok: true, code: 'orgs_skipped', message: 'no requiredOrgs' };
  }
  const orgs = new Set((profile.orgs ?? []).map((o) => normalizeLogin(o)));
  const missing = required.filter((r) => !orgs.has(normalizeLogin(r)));
  return missing.length === 0
    ? { ok: true, code: 'orgs_ok', message: 'required orgs satisfied' }
    : {
        ok: false,
        code: 'orgs_deny',
        message: `missing organization membership: ${missing.join(', ')}`,
      };
}

function checkTeams(
  profile: UserProfile,
  rules: ProviderRules,
): RuleCheckResult {
  const required = rules.requiredTeams;
  if (!required?.length) {
    return { ok: true, code: 'teams_skipped', message: 'no requiredTeams' };
  }
  const teams = new Set(
    (profile.teams ?? []).map(
      (t) => `${normalizeLogin(t.org)}/${normalizeLogin(t.team)}`,
    ),
  );
  const missing = required.filter(
    (r) => !teams.has(`${normalizeLogin(r.org)}/${normalizeLogin(r.team)}`),
  );
  return missing.length === 0
    ? { ok: true, code: 'teams_ok', message: 'required teams satisfied' }
    : {
        ok: false,
        code: 'teams_deny',
        message: `missing team membership: ${missing
          .map((m) => `${m.org}/${m.team}`)
          .join(', ')}`,
      };
}

function checkEmailDomains(
  profile: UserProfile,
  rules: ProviderRules,
): RuleCheckResult {
  const domains = rules.emailDomainAllowlist;
  if (!domains?.length) {
    return { ok: true, code: 'email_skipped', message: 'no emailDomainAllowlist' };
  }
  const email = profile.email?.toLowerCase();
  if (!email || !email.includes('@')) {
    return {
      ok: false,
      code: 'email_missing',
      message: 'no verified email available',
    };
  }
  const domain = email.split('@').pop() ?? '';
  const ok = domains.some((d) => domain === d.trim().toLowerCase());
  return ok
    ? { ok: true, code: 'email_ok', message: 'email domain allowed' }
    : {
        ok: false,
        code: 'email_deny',
        message: 'email domain is not allowed',
      };
}

export interface EvaluateInput {
  mode: 'normal' | 'strict';
  rules: ProviderRules;
  profile: UserProfile;
}

export function evaluateRules(input: EvaluateInput): {
  ok: boolean;
  failures: RuleCheckResult[];
  details: RuleCheckResult[];
} {
  const details: RuleCheckResult[] = [];
  const failures: RuleCheckResult[] = [];

  // Always enforce blocklist even in normal mode.
  const block = checkBlocklist(input.profile, input.rules);
  details.push(block);
  if (!block.ok) failures.push(block);

  if (input.mode === 'normal') {
    return { ok: failures.length === 0, failures, details };
  }

  // strict: every configured rule must pass
  const checks = [
    checkAllowlist(input.profile, input.rules),
    checkAccountAge(input.profile, input.rules),
    checkOrgs(input.profile, input.rules),
    checkTeams(input.profile, input.rules),
    checkEmailDomains(input.profile, input.rules),
  ];
  for (const c of checks) {
    details.push(c);
    if (!c.ok) failures.push(c);
  }

  return { ok: failures.length === 0, failures, details };
}

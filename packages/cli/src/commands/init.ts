import type { Command } from 'commander';
import { confirm, input, password, select } from '@inquirer/prompts';
import { randomBytes } from 'node:crypto';
import {
  defaultProfile,
  getProfile,
  upsertProfile,
  type CsgProfile,
  type ProviderRules,
} from '../lib/store.js';
import { box, error, step, success, warn } from '../lib/log.js';
import { createKvNamespace, putSecret, whoami } from '../lib/cf.js';
import { pushAuthConfig, pushUiConfig } from '../lib/kv.js';

interface InitOpts {
  name?: string;
  mode?: string;
  nonInteractive?: boolean;
  githubClientId?: string;
  githubClientSecret?: string;
  sessionSecret?: string;
  adminPassword?: string;
  kvId?: string;
  createKv?: boolean;
  push?: boolean;
  spa?: boolean;
  redirectBase?: string;
  customDomain?: string;
}

export function registerInit(program: Command): void {
  program
    .command('init')
    .description(
      'Create/update a global profile and push first-time secrets (writes only to ~/.config/csg and Cloudflare)',
    )
    .option('-n, --name <worker>', 'Cloudflare worker name')
    .option('-m, --mode <mode>', 'normal | strict', 'normal')
    .option('--github-client-id <id>', 'GitHub OAuth client id')
    .option('--github-client-secret <secret>', 'GitHub OAuth client secret')
    .option('--session-secret <secret>', 'JWT session secret (auto-generated if omitted)')
    .option('--admin-password <pwd>', 'Admin panel password (auto-generated if omitted)')
    .option('--kv-id <id>', 'Existing KV namespace id')
    .option('--create-kv', 'Create a new KV namespace named RULES')
    .option('--spa', 'Enable SPA index fallback')
    .option('--redirect-base <url>', 'OAuth redirect base origin')
    .option('--custom-domain <host>', 'Attach custom domain to worker (e.g. docs.example.com)')
    .option('--push', 'Push auth/ui config to KV after setup')
    .option('--non-interactive', 'Fail instead of prompting when required values are missing')
    .action(async (opts: InitOpts) => {
      const interactive = !opts.nonInteractive;

      const auth = await whoami();
      if (!auth.ok) {
        warn('Wrangler may not be logged in. Run `csg auth` if deploy fails.');
      }

      let name = opts.name;
      if (!name && interactive) {
        name = await input({
          message: 'Worker name (subdomain on workers.dev)',
          default: 'cf-static-guard',
          validate: (v) =>
            /^[a-z0-9-]+$/i.test(v) || 'Use letters, numbers, dashes',
        });
      }
      if (!name) {
        error('--name is required in non-interactive mode');
        process.exitCode = 1;
        return;
      }

      let mode: 'normal' | 'strict' =
        opts.mode === 'strict' ? 'strict' : 'normal';
      if (interactive && !opts.nonInteractive) {
        mode = await select({
          message: 'Default access mode',
          choices: [
            { name: 'normal — OAuth success is enough (blocklist still applies)', value: 'normal' },
            { name: 'strict — evaluate configured rules per provider', value: 'strict' },
          ],
          default: mode,
        });
      }

      const existing = getProfile(name);
      const profile: CsgProfile = existing
        ? { ...existing, updatedAt: new Date().toISOString() }
        : defaultProfile(name, mode);
      profile.mode = mode;
      if (opts.spa) profile.spaFallback = true;
      if (opts.redirectBase) profile.oauthRedirectBase = opts.redirectBase;
      if (opts.customDomain) profile.customDomain = opts.customDomain;

      // GitHub
      let clientId = opts.githubClientId || profile.providers.github?.clientId || process.env.CSG_GITHUB_CLIENT_ID;
      let clientSecret = opts.githubClientSecret || process.env.CSG_GITHUB_CLIENT_SECRET;

      if (interactive && !opts.nonInteractive) {
        const enableGh = await confirm({
          message: 'Enable GitHub OAuth?',
          default: true,
        });
        profile.providers.github = {
          enabled: enableGh,
          mode: undefined,
          rules: profile.providers.github?.rules || {},
        };
        if (enableGh) {
          if (!clientId) {
            clientId = await input({
              message: 'GitHub OAuth Client ID',
              validate: (v) => v.trim().length > 0 || 'required',
            });
          }
          if (!clientSecret) {
            clientSecret = await password({
              message: 'GitHub OAuth Client Secret',
              validate: (v) => v.trim().length > 0 || 'required',
            });
          }
          if (mode === 'strict') {
            profile.providers.github.rules = await promptStrictRules(
              profile.providers.github.rules || {},
            );
          }
        }
      } else if (profile.providers.github?.enabled !== false) {
        profile.providers.github = {
          ...profile.providers.github,
          enabled: true,
        };
      }

      if (clientId) profile.providers.github = { ...profile.providers.github!, enabled: profile.providers.github?.enabled !== false, clientId };

      // KV
      let kvId = opts.kvId || profile.kvNamespaceId;
      if (!kvId && interactive) {
        const doKv = await confirm({
          message: 'Create KV namespace RULES now? (needed for admin/config rules)',
          default: true,
        });
        if (doKv) {
          step('Creating KV namespace…');
          try {
            kvId = await createKvNamespace(name);
            success(`KV created: ${kvId}`);
          } catch (e) {
            error(e instanceof Error ? e.message : String(e));
            const manual = await input({ message: 'Paste KV namespace id (or empty to skip)' });
            kvId = manual.trim() || undefined;
          }
        }
      } else if (opts.createKv && !kvId) {
        step('Creating KV namespace…');
        kvId = await createKvNamespace(name);
        success(`KV created: ${kvId}`);
      }
      if (kvId) profile.kvNamespaceId = kvId;

      // Secrets
      let sessionSecret = opts.sessionSecret || process.env.CSG_SESSION_SECRET;
      let adminPassword = opts.adminPassword || process.env.CSG_ADMIN_PASSWORD;

      if (interactive && !opts.nonInteractive) {
        if (!sessionSecret) {
          const gen = await confirm({
            message: 'Generate SESSION_SECRET automatically?',
            default: true,
          });
          sessionSecret = gen
            ? randomBytes(32).toString('base64url')
            : await password({ message: 'SESSION_SECRET' });
        }
        if (!adminPassword) {
          const gen = await confirm({
            message: 'Generate ADMIN_PASSWORD automatically?',
            default: true,
          });
          adminPassword = gen
            ? randomBytes(18).toString('base64url')
            : await password({ message: 'ADMIN_PASSWORD (for /admin)' });
        }
      } else {
        sessionSecret = sessionSecret || randomBytes(32).toString('base64url');
        adminPassword = adminPassword || randomBytes(18).toString('base64url');
      }

      profile.updatedAt = new Date().toISOString();
      upsertProfile(profile, true);
      success(`Profile saved globally: ${profile.name}`);

      // Push secrets to CF (requires existing worker after first deploy, or wrangler will still accept)
      const secrets: Array<[string, string | undefined]> = [
        ['SESSION_SECRET', sessionSecret],
        ['ADMIN_PASSWORD', adminPassword],
        ['GITHUB_CLIENT_ID', clientId],
        ['GITHUB_CLIENT_SECRET', clientSecret],
      ];

      const doSecrets =
        opts.nonInteractive ||
        (await confirm({
          message: `Write secrets to Cloudflare worker "${profile.name}" now?`,
          default: true,
        }));

      if (doSecrets) {
        for (const [key, value] of secrets) {
          if (!value) continue;
          step(`secret put ${key}…`);
          try {
            await putSecret(profile.name, key, value);
            success(`${key} set`);
          } catch (e) {
            error(`${key}: ${e instanceof Error ? e.message : e}`);
            warn('If the worker does not exist yet, deploy once then re-run secrets.');
          }
        }
      }

      const doPush =
        opts.push ||
        (profile.kvNamespaceId &&
          (opts.nonInteractive ||
            (await confirm({
              message: 'Push initial auth/ui config to KV?',
              default: true,
            }))));

      if (doPush && profile.kvNamespaceId) {
        try {
          await pushAuthConfig(profile);
          await pushUiConfig(profile);
          success('KV auth:config + ui:config written');
        } catch (e) {
          error(e instanceof Error ? e.message : String(e));
        }
      } else if (!profile.kvNamespaceId) {
        warn('No KV id — rules/config commands and admin save will not work until you add one.');
      }

      box([
        'Next:',
        `  csg deploy --site <your-dist>`,
        `  csg open admin   # password = ADMIN_PASSWORD`,
        '',
        'Nothing was written into your site project directory.',
      ]);
    });
}

async function promptStrictRules(initial: ProviderRules): Promise<ProviderRules> {
  const rules: ProviderRules = { ...initial };
  const allow = await input({
    message: 'Allowlist (comma-separated logins, empty to skip)',
    default: (rules.allowlist || []).join(','),
  });
  rules.allowlist = allow
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const orgs = await input({
    message: 'Required GitHub orgs (comma-separated, empty to skip)',
    default: (rules.requiredOrgs || []).join(','),
  });
  rules.requiredOrgs = orgs
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const teams = await input({
    message: 'Required teams org/team (comma-separated, empty to skip)',
    default: (rules.requiredTeams || []).map((t) => `${t.org}/${t.team}`).join(','),
  });
  rules.requiredTeams = teams
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((line) => {
      const [org, team] = line.split('/');
      return { org: org || '', team: team || '' };
    })
    .filter((t) => t.org && t.team);

  const age = await input({
    message: 'Min account age in days (empty to skip)',
    default: rules.minAccountAgeDays != null ? String(rules.minAccountAgeDays) : '',
  });
  if (age.trim()) rules.minAccountAgeDays = Number(age.trim());
  else delete rules.minAccountAgeDays;

  return rules;
}

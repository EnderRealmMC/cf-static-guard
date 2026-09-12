import type { Command } from 'commander';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  getProfile,
  loadStore,
  upsertProfile,
  type CsgProfile,
  type ProviderRules,
} from '../lib/store.js';
import { error, success, warn, info } from '../lib/log.js';
import {
  applyAuthToProfile,
  applyUiToProfile,
  profileToAuthConfig,
  profileToUiConfig,
  pullAuthConfig,
  pullUiConfig,
  pushAuthConfig,
  pushUiConfig,
  type OnlineAuthConfig,
} from '../lib/kv.js';

function requireProfile(name?: string): CsgProfile {
  const p = getProfile(name);
  if (!p) {
    throw new Error('No profile. Run `csg init` first.');
  }
  return p;
}

function save(p: CsgProfile): void {
  const store = loadStore();
  upsertProfile(p, store.defaultProfile === p.name || !store.profiles[p.name]);
}

function rulesOf(p: CsgProfile): ProviderRules {
  if (!p.providers.github) {
    p.providers.github = { enabled: true, rules: {} };
  }
  if (!p.providers.github.rules) p.providers.github.rules = {};
  return p.providers.github.rules;
}

export function registerConfig(program: Command): void {
  const config = program
    .command('config')
    .description(
      'Read/write live KV config (same JSON as /admin). Does not write into your site repo.',
    );

  config
    .command('get')
    .description('Print local profile + try pull online auth/ui')
    .option('-p, --profile <name>', 'profile name')
    .action(async (opts: { profile?: string }) => {
      const p = requireProfile(opts.profile);
      console.log(JSON.stringify({ local: p }, null, 2));
      if (!p.kvNamespaceId) {
        warn('No KV id — skip online pull');
        return;
      }
      try {
        const auth = await pullAuthConfig(p);
        const ui = await pullUiConfig(p);
        console.log(JSON.stringify({ online: { auth, ui } }, null, 2));
      } catch (e) {
        warn(e instanceof Error ? e.message : String(e));
      }
    });

  config
    .command('set-mode <mode>')
    .description('Set normal|strict on profile and push to KV')
    .option('-p, --profile <name>', 'profile name')
    .option('--no-push', 'Only update local profile')
    .action(async (mode: string, opts: { profile?: string; push?: boolean }) => {
      if (mode !== 'normal' && mode !== 'strict') {
        error('mode must be normal or strict');
        process.exitCode = 1;
        return;
      }
      const p = requireProfile(opts.profile);
      p.mode = mode;
      p.updatedAt = new Date().toISOString();
      save(p);
      success(`Local mode → ${mode}`);
      if (opts.push !== false && p.kvNamespaceId) {
        await pushAuthConfig(p);
        success('Pushed auth:config to KV');
      }
    });

  config
    .command('allow-add <login>')
    .description('Add login to GitHub allowlist and push')
    .option('-p, --profile <name>')
    .option('--no-push')
    .action(async (login: string, opts: { profile?: string; push?: boolean }) => {
      const p = requireProfile(opts.profile);
      const rules = rulesOf(p);
      rules.allowlist = rules.allowlist || [];
      if (!rules.allowlist.includes(login)) rules.allowlist.push(login);
      p.updatedAt = new Date().toISOString();
      save(p);
      success(`allowlist += ${login}`);
      if (opts.push !== false && p.kvNamespaceId) {
        await pushAuthConfig(p);
        success('Pushed auth:config');
      }
    });

  config
    .command('allow-remove <login>')
    .description('Remove login from allowlist and push')
    .option('-p, --profile <name>')
    .option('--no-push')
    .action(async (login: string, opts: { profile?: string; push?: boolean }) => {
      const p = requireProfile(opts.profile);
      const rules = rulesOf(p);
      rules.allowlist = (rules.allowlist || []).filter((x) => x !== login);
      p.updatedAt = new Date().toISOString();
      save(p);
      success(`allowlist -= ${login}`);
      if (opts.push !== false && p.kvNamespaceId) {
        await pushAuthConfig(p);
        success('Pushed auth:config');
      }
    });

  config
    .command('org-add <org>')
    .description('Add required GitHub org and push')
    .option('-p, --profile <name>')
    .option('--no-push')
    .action(async (org: string, opts: { profile?: string; push?: boolean }) => {
      const p = requireProfile(opts.profile);
      const rules = rulesOf(p);
      rules.requiredOrgs = rules.requiredOrgs || [];
      if (!rules.requiredOrgs.includes(org)) rules.requiredOrgs.push(org);
      p.mode = p.mode === 'normal' ? 'strict' : p.mode;
      p.updatedAt = new Date().toISOString();
      save(p);
      success(`requiredOrgs += ${org}`);
      if (opts.push !== false && p.kvNamespaceId) {
        await pushAuthConfig(p);
        success('Pushed auth:config');
      }
    });

  config
    .command('ui')
    .description('UI text helpers')
    .argument('<key>', 'e.g. loginHeading, copyright, icp, footerBrand, siteTitle')
    .argument('[value]', 'new value; omit to print current')
    .option('-p, --profile <name>')
    .option('--no-push')
    .action(
      async (
        key: string,
        value: string | undefined,
        opts: { profile?: string; push?: boolean },
      ) => {
        const p = requireProfile(opts.profile);
        p.ui = p.ui || {};
        const allowed = new Set([
          'siteTitle',
          'siteSubtitle',
          'loginHeading',
          'loginSubtitle',
          'providerButtonPrefix',
          'footerBrand',
          'copyright',
          'icp',
          'icpLink',
        ]);
        const boolKeys = new Set([
          'showModeBadge',
          'showFooterBrand',
          'showGithubIcon',
        ]);
        if (!allowed.has(key) && !boolKeys.has(key)) {
          error(`Unknown ui key: ${key}`);
          process.exitCode = 1;
          return;
        }
        if (value === undefined) {
          console.log((p.ui as Record<string, unknown>)[key]);
          return;
        }
        if (boolKeys.has(key)) {
          (p.ui as Record<string, unknown>)[key] =
            value === 'true' || value === '1' || value === 'yes';
        } else {
          (p.ui as Record<string, unknown>)[key] = value;
        }
        p.updatedAt = new Date().toISOString();
        save(p);
        success(`ui.${key} = ${value}`);
        if (opts.push !== false && p.kvNamespaceId) {
          await pushUiConfig(p);
          success('Pushed ui:config');
        }
      },
    );

  config
    .command('pull')
    .description('Pull online auth/ui into local profile (still not in your site repo)')
    .option('-p, --profile <name>')
    .option('--apply', 'Merge into local profile and save', true)
    .action(async (opts: { profile?: string; apply?: boolean }) => {
      const p = requireProfile(opts.profile);
      if (!p.kvNamespaceId) {
        error('No KV id on profile');
        process.exitCode = 1;
        return;
      }
      const auth = await pullAuthConfig(p);
      const ui = await pullUiConfig(p);
      let next = p;
      if (auth) next = applyAuthToProfile(next, auth);
      if (ui) next = applyUiToProfile(next, ui);
      if (opts.apply !== false) {
        save(next);
        success('Local profile updated from KV');
      }
      console.log(JSON.stringify({ auth, ui }, null, 2));
    });

  config
    .command('push')
    .description('Push local profile auth+ui to KV')
    .option('-p, --profile <name>')
    .option('--json <file>', 'Optional: read auth config JSON from file instead of profile')
    .action(async (opts: { profile?: string; json?: string }) => {
      const p = requireProfile(opts.profile);
      if (!p.kvNamespaceId) {
        error('No KV id on profile');
        process.exitCode = 1;
        return;
      }
      if (opts.json) {
        const raw = readFileSync(resolve(process.cwd(), opts.json), 'utf8');
        const parsed = JSON.parse(raw) as OnlineAuthConfig;
        await pushAuthConfig({
          ...p,
          mode: parsed.mode || p.mode,
          providers: {
            github: {
              enabled: parsed.providers?.github?.enabled !== false,
              mode: parsed.providers?.github?.mode,
              rules: parsed.providers?.github?.rules || {},
            },
          },
        });
        await pushUiConfig(p);
        success(`Pushed auth from ${opts.json} + ui from profile`);
        return;
      }
      await pushAuthConfig(p);
      await pushUiConfig(p);
      success('Pushed auth:config + ui:config');
      info(`Local snapshot: ${JSON.stringify(profileToAuthConfig(p))}`);
      info(`UI snapshot: ${JSON.stringify(profileToUiConfig(p))}`);
    });

  config
    .command('export')
    .description('Print a backup JSON of local profile to stdout')
    .option('-p, --profile <name>')
    .option('-o, --output <file>', 'Write to file instead of stdout')
    .action((opts: { profile?: string; output?: string }) => {
      const p = requireProfile(opts.profile);
      const json = JSON.stringify(p, null, 2) + '\n';
      if (opts.output) {
        writeFileSync(resolve(process.cwd(), opts.output), json, 'utf8');
        success(`Wrote ${opts.output}`);
      } else {
        process.stdout.write(json);
      }
    });
}

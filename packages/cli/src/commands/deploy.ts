import type { Command } from 'commander';
import { resolve } from 'node:path';
import { getProfile, loadStore } from '../lib/store.js';
import { error, info, step, success, warn } from '../lib/log.js';
import { prepareDeployDir } from '../lib/deploy.js';
import { runWranglerInherit } from '../lib/wrangler.js';
import { pushAuthConfig, pushUiConfig } from '../lib/kv.js';

interface DeployOpts {
  site: string;
  profile?: string;
  mode?: string;
  spa?: boolean;
  pushConfig?: boolean;
  dryRun?: boolean;
}

export function registerDeploy(program: Command): void {
  program
    .command('deploy')
    .description(
      'Deploy/refresh worker + static assets (temp dir only; does not write into your project)',
    )
    .requiredOption('-s, --site <dir>', 'Path to static build output (dist)')
    .option('-p, --profile <name>', 'Profile name (default: global default)')
    .option('-m, --mode <mode>', 'Override mode for this deploy: normal|strict')
    .option('--spa', 'Force SPA fallback on for this deploy')
    .option('--push-config', 'Also push auth/ui config from profile to KV')
    .option('--dry-run', 'Prepare temp dir and run wrangler deploy --dry-run')
    .action(async (opts: DeployOpts) => {
      const store = loadStore();
      const profile = getProfile(opts.profile);
      if (!profile) {
        error(
          opts.profile
            ? `Profile not found: ${opts.profile}`
            : 'No profile. Run `csg init` first.',
        );
        process.exitCode = 1;
        return;
      }

      const site = resolve(process.cwd(), opts.site);
      const effective = {
        ...profile,
        mode: opts.mode === 'strict' ? ('strict' as const) : opts.mode === 'normal' ? ('normal' as const) : profile.mode,
        spaFallback: opts.spa ? true : profile.spaFallback,
      };

      info(`Profile: ${effective.name} (default=${store.defaultProfile})`);
      info(`Site:    ${site}`);
      info(`Mode:    ${effective.mode}`);
      if (!effective.kvNamespaceId) {
        warn('KV not configured — admin/config online edits will not persist.');
      }

      step('Preparing temp deploy directory…');
      const dirs = prepareDeployDir(effective, site);
      try {
        info(`Temp: ${dirs.root}`);
        step('Running wrangler deploy…');
        const code = await runWranglerInherit(
          opts.dryRun
            ? ['deploy', '-c', 'wrangler.toml', '--dry-run']
            : ['deploy', '-c', 'wrangler.toml'],
          { cwd: dirs.root },
        );
        if (code !== 0) {
          error('wrangler deploy failed');
          process.exitCode = code;
          return;
        }
        success('Deploy finished');

        if (opts.pushConfig && effective.kvNamespaceId) {
          step('Pushing profile config to KV…');
          await pushAuthConfig(effective);
          await pushUiConfig(effective);
          success('KV config updated');
        }

        success(
          `https://${effective.name}.\${your-subdomain}.workers.dev  (or your custom domain)`,
        );
      } finally {
        dirs.cleanup();
      }
    });
}

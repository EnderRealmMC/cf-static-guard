import type { Command } from 'commander';
import { getProfile, loadStore, upsertProfile } from '../lib/store.js';
import { error, step, success, warn } from '../lib/log.js';
import { createKvNamespace } from '../lib/cf.js';
import { pushAuthConfig, pushUiConfig } from '../lib/kv.js';

export function registerKv(program: Command): void {
  const kv = program.command('kv').description('KV namespace helpers for RULES');

  kv
    .command('create')
    .description('Create KV namespace and store id on the profile')
    .option('-p, --profile <name>')
    .option('--title <title>', 'Namespace title')
    .option('--push', 'Push default auth/ui config after create')
    .action(async (opts: { profile?: string; title?: string; push?: boolean }) => {
      const store = loadStore();
      const profile = getProfile(opts.profile);
      if (!profile) {
        error('No profile. Run `csg init` first.');
        process.exitCode = 1;
        return;
      }
      step('Creating KV namespace RULES…');
      const id = await createKvNamespace(opts.title || profile.name);
      const next = {
        ...profile,
        kvNamespaceId: id,
        updatedAt: new Date().toISOString(),
      };
      upsertProfile(next, store.defaultProfile === profile.name);
      success(`KV id saved: ${id}`);
      if (opts.push) {
        await pushAuthConfig(next);
        await pushUiConfig(next);
        success('Pushed default auth/ui config');
      } else {
        warn('Run `csg config push` later to write auth:config / ui:config');
      }
    });
}

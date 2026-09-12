import type { Command } from 'commander';
import {
  listProfileNames,
  loadStore,
  setDefaultProfile,
  upsertProfile,
  type CsgProfile,
} from '../lib/store.js';
import { error, info, success } from '../lib/log.js';

export function registerProfile(program: Command): void {
  const profile = program
    .command('profile')
    .description('Manage global deploy profiles (not stored in your site repo)');

  profile
    .command('list')
    .description('List profiles')
    .action(() => {
      const store = loadStore();
      const names = listProfileNames();
      if (!names.length) {
        info('No profiles. Run `csg init`.');
        return;
      }
      for (const name of names) {
        const p = store.profiles[name];
        const mark = name === store.defaultProfile ? '*' : ' ';
        console.log(
          `${mark} ${name}  worker=${p.name}  mode=${p.mode}  kv=${p.kvNamespaceId || '-'}`,
        );
      }
    });

  profile
    .command('use <name>')
    .description('Set default profile')
    .action((name: string) => {
      if (!setDefaultProfile(name)) {
        error(`Profile not found: ${name}`);
        process.exitCode = 1;
        return;
      }
      success(`Default profile → ${name}`);
    });

  profile
    .command('show [name]')
    .description('Show one profile JSON')
    .action((name?: string) => {
      const store = loadStore();
      const key = name || store.defaultProfile;
      const p = store.profiles[key];
      if (!p) {
        error(`Profile not found: ${key}`);
        process.exitCode = 1;
        return;
      }
      console.log(JSON.stringify(p, null, 2));
    });

  profile
    .command('set-kv <id>')
    .description('Set KV namespace id on current/default profile')
    .option('-p, --profile <name>', 'profile name')
    .action((id: string, opts: { profile?: string }) => {
      const store = loadStore();
      const key = opts.profile || store.defaultProfile;
      const p = store.profiles[key];
      if (!p) {
        error(`Profile not found: ${key}`);
        process.exitCode = 1;
        return;
      }
      const next: CsgProfile = {
        ...p,
        kvNamespaceId: id,
        updatedAt: new Date().toISOString(),
      };
      upsertProfile(next, key === store.defaultProfile);
      success(`KV namespace id saved on profile ${key}`);
    });
}

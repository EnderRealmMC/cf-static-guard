import type { Command } from 'commander';
import { password } from '@inquirer/prompts';
import { randomBytes } from 'node:crypto';
import { getProfile } from '../lib/store.js';
import { error, step, success } from '../lib/log.js';
import { putSecret } from '../lib/cf.js';

const KEYS = [
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'SESSION_SECRET',
  'ADMIN_PASSWORD',
] as const;

export function registerSecrets(program: Command): void {
  const secrets = program
    .command('secrets')
    .description('Set Cloudflare Worker secrets (not stored in your project)');

  secrets
    .command('set [name]')
    .description('Set one secret, or run without name for interactive multi-set')
    .option('-p, --profile <name>', 'worker profile')
    .option('--value <v>', 'Secret value (prefer prompt/env for sensitive data)')
    .option('--generate', 'Generate a random value (SESSION_SECRET / ADMIN_PASSWORD)')
    .action(async (name: string | undefined, opts: { profile?: string; value?: string; generate?: boolean }) => {
      const profile = getProfile(opts.profile);
      if (!profile) {
        error('No profile. Run `csg init` first.');
        process.exitCode = 1;
        return;
      }

      const targets: string[] = name ? [name] : [...KEYS];
      if (name && !(KEYS as readonly string[]).includes(name)) {
        error(`Unknown secret. Use: ${KEYS.join(', ')}`);
        process.exitCode = 1;
        return;
      }

      for (const key of targets) {
        let value = opts.value;
        if (!value && opts.generate && (key === 'SESSION_SECRET' || key === 'ADMIN_PASSWORD')) {
          value = randomBytes(24).toString('base64url');
        }
        if (!value) {
          value = await password({
            message: `${key} value for worker ${profile.name}`,
            mask: '*',
          });
        }
        if (!value) {
          error(`${key}: empty value`);
          process.exitCode = 1;
          return;
        }
        step(`secret put ${key}…`);
        await putSecret(profile.name, key, value);
        success(`${key} updated on ${profile.name}`);
      }
    });

  secrets
    .command('rotate-session')
    .description('Generate and set a new SESSION_SECRET (invalidates all logins)')
    .option('-p, --profile <name>')
    .action(async (opts: { profile?: string }) => {
      const profile = getProfile(opts.profile);
      if (!profile) {
        error('No profile. Run `csg init` first.');
        process.exitCode = 1;
        return;
      }
      const value = randomBytes(32).toString('base64url');
      step('secret put SESSION_SECRET…');
      await putSecret(profile.name, 'SESSION_SECRET', value);
      success('SESSION_SECRET rotated — users must log in again');
    });
}

import type { Command } from 'commander';
import { runWranglerInherit } from '../lib/wrangler.js';
import { success, info } from '../lib/log.js';

export function registerAuth(program: Command): void {
  program
    .command('auth')
    .description('Log in to Cloudflare via wrangler (opens browser)')
    .action(async () => {
      info('Running wrangler login…');
      const code = await runWranglerInherit(['login']);
      if (code !== 0) {
        process.exitCode = code;
        return;
      }
      success('Cloudflare login OK');
    });
}

import type { Command } from 'commander';
import { execa } from 'execa';
import { getProfile } from '../lib/store.js';
import { error, info } from '../lib/log.js';

function openUrl(url: string): void {
  if (process.platform === 'win32') {
    void execa('cmd', ['/c', 'start', '', url]);
    return;
  }
  if (process.platform === 'darwin') {
    void execa('open', [url]);
    return;
  }
  void execa('xdg-open', [url]);
}

export function registerOpen(program: Command): void {
  program
    .command('open <target>')
    .description('Open site | admin | login | health in browser')
    .option('-p, --profile <name>')
    .option('--base <url>', 'Full origin, e.g. https://my-docs.xxx.workers.dev')
    .action(async (target: string, opts: { profile?: string; base?: string }) => {
      const profile = getProfile(opts.profile);
      let base = opts.base || process.env.CSG_BASE_URL;
      if (!base) {
        if (!profile) {
          error('No profile and no --base. Pass --base https://<worker>.<subdomain>.workers.dev');
          process.exitCode = 1;
          return;
        }
        // users often have custom domains; default guess is name.workers.dev under unknown subdomain
        error(
          `Pass --base https://your-worker-domain (profile ${profile.name} has no recorded public origin).`,
        );
        info('Example: csg open admin --base https://my-docs.acme.workers.dev');
        process.exitCode = 1;
        return;
      }
      base = base.replace(/\/$/, '');
      const map: Record<string, string> = {
        site: '/',
        home: '/',
        admin: '/admin',
        login: '/auth/login',
        health: '/health',
      };
      const path = map[target];
      if (!path) {
        error(`Unknown target ${target}. Use: site | admin | login | health`);
        process.exitCode = 1;
        return;
      }
      const url = base + path;
      info(`Opening ${url}`);
      openUrl(url);
    });
}

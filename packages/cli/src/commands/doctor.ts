import type { Command } from 'commander';
import { error, info, success, warn } from '../lib/log.js';
import { cliVersion, hasWorkerBundle } from '../lib/paths.js';
import { configPath, listProfileNames, loadStore } from '../lib/store.js';
import { whoami } from '../lib/cf.js';
import { wranglerBin } from '../lib/wrangler.js';

export function registerDoctor(program: Command): void {
  program
    .command('doctor')
    .description('Check Node, wrangler login, worker bundle, and global config')
    .action(async () => {
      info(`csg ${cliVersion()}`);
      info(`node ${process.version}`);
      info(`wrangler bin: ${wranglerBin()}`);

      if (hasWorkerBundle()) {
        success('worker bundle present (dist-worker/worker.js)');
      } else {
        warn('worker bundle missing — reinstall package or run monorepo build');
      }

      const store = loadStore();
      info(`config: ${configPath()}`);
      const names = listProfileNames();
      if (names.length === 0) {
        warn('no profiles yet — run `csg init`');
      } else {
        success(
          `profiles: ${names.join(', ')} (default: ${store.defaultProfile})`,
        );
      }

      const auth = await whoami();
      if (auth.ok) {
        success('wrangler authenticated');
        console.log(auth.text);
      } else {
        error('wrangler not logged in — run `csg auth`');
        if (auth.text) console.log(auth.text);
        process.exitCode = 1;
      }
    });
}

import { Command } from 'commander';
import { cliVersion } from './lib/paths.js';
import { registerAuth } from './commands/auth.js';
import { registerInit } from './commands/init.js';
import { registerDeploy } from './commands/deploy.js';
import { registerConfig } from './commands/config.js';
import { registerSecrets } from './commands/secrets.js';
import { registerOpen } from './commands/open.js';
import { registerDoctor } from './commands/doctor.js';
import { registerProfile } from './commands/profile.js';
import { registerKv } from './commands/kv.js';

export async function run(argv: string[]): Promise<void> {
  const program = new Command();

  program
    .name('csg')
    .description(
      'Cloudflare static-site guard CLI — deploy any static site behind OAuth without cloning the monorepo.',
    )
    .version(cliVersion());

  registerAuth(program);
  registerInit(program);
  registerDeploy(program);
  registerConfig(program);
  registerSecrets(program);
  registerOpen(program);
  registerDoctor(program);
  registerProfile(program);
  registerKv(program);

  program.addHelpText(
    'after',
    `
Examples:
  $ csg auth
  $ csg init --name my-docs --mode normal
  $ csg deploy --site ./dist
  $ csg config get
  $ csg config set-mode strict
  $ csg open admin

Config lives in your global csg folder (~/.config/csg or %APPDATA%/csg).
Secrets and rules live on Cloudflare. This CLI does not write into your site repo.
`,
  );

  await program.parseAsync(argv);
}

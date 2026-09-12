import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CsgProfile } from './store.js';
import { workerBundlePath } from './paths.js';

export function buildWranglerToml(profile: CsgProfile): string {
  const publicPaths = (profile.publicPaths?.length
    ? profile.publicPaths
    : ['/health']
  )
    .map((p) => (p.startsWith('/') ? p : `/${p}`))
    .join(',');

  const kvBlock = profile.kvNamespaceId
    ? `
[[kv_namespaces]]
binding = "RULES"
id = "${profile.kvNamespaceId}"
`
    : `
# KV not configured. Run: csg kv create
# [[kv_namespaces]]
# binding = "RULES"
# id = "<id>"
`;

  const redirect = profile.oauthRedirectBase
    ? `\nOAUTH_REDIRECT_BASE = "${profile.oauthRedirectBase}"`
    : '';

  return `name = "${profile.name}"
main = "worker.js"
compatibility_date = "2025-03-01"
compatibility_flags = ["nodejs_compat"]

[assets]
directory = "./assets/site"
binding = "ASSETS"
run_worker_first = true

[vars]
GUARD_MODE = "${profile.mode}"
PUBLIC_PATHS = "${publicPaths}"
SPA_FALLBACK = "${profile.spaFallback ? 'true' : 'false'}"
SESSION_TTL_SECONDS = "${String(profile.sessionTtlSeconds || 604800)}"
${redirect}
${kvBlock}`;
}

export interface DeployDirs {
  root: string;
  cleanup: () => void;
}

export function prepareDeployDir(profile: CsgProfile, siteDir: string): DeployDirs {
  if (!existsSync(workerBundlePath())) {
    throw new Error(
      'Worker bundle missing. Run `npm run build` in the monorepo, or reinstall the CLI package.',
    );
  }
  if (!existsSync(siteDir)) {
    throw new Error(`Site directory not found: ${siteDir}`);
  }

  const root = mkdtempSync(join(tmpdir(), 'csg-deploy-'));
  const assets = join(root, 'assets', 'site');
  mkdirSync(assets, { recursive: true });
  cpSync(workerBundlePath(), join(root, 'worker.js'));
  cpSync(siteDir, assets, { recursive: true });
  writeFileSync(join(root, 'wrangler.toml'), buildWranglerToml(profile), 'utf8');

  return {
    root,
    cleanup: () => {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        // ignore
      }
    },
  };
}

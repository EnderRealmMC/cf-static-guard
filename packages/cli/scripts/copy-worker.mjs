#!/usr/bin/env node
/**
 * Copy prebuilt worker from monorepo output into packages/cli/dist-worker/.
 * Expected sources (first hit wins):
 *  - packages/guard-worker/dist/worker.js  (wrangler --outdir)
 *  - packages/guard-worker/dist/index.js
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cliRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = join(cliRoot, '..', '..');
const outDir = join(cliRoot, 'dist-worker');
const outFile = join(outDir, 'worker.js');

const candidates = [
  join(repoRoot, 'packages/guard-worker/dist/worker.js'),
  join(repoRoot, 'packages/guard-worker/dist/index.js'),
  join(repoRoot, 'packages/guard-worker/dist/index.mjs'),
];

mkdirSync(outDir, { recursive: true });

const found = candidates.find((p) => existsSync(p));
if (!found) {
  // Keep existing bundle if present (e.g. packing without rebuild)
  if (existsSync(outFile)) {
    console.log('[copy-worker] using existing dist-worker/worker.js');
    process.exit(0);
  }
  console.error(
    '[copy-worker] No worker bundle found. Build guard-worker first:\n' +
      '  npm run build:login && npm run build:admin && npm run sync-assets && npm run build:worker',
  );
  process.exit(1);
}

copyFileSync(found, outFile);
const size = readFileSync(outFile).length;
console.log(`[copy-worker] ${found} → dist-worker/worker.js (${size} bytes)`);

// Ensure a stub marker so files[] always has something if empty
if (size < 10) {
  writeFileSync(
    outFile,
    'export default { fetch(){ return new Response("csg worker bundle empty"); } };\n',
  );
  console.warn('[copy-worker] wrote stub — source bundle looked empty');
}

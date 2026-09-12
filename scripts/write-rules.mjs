/**
 * Write sample guard config into Cloudflare KV.
 *
 * Usage:
 *   wrangler kv key put --binding=RULES --path=scripts/rules.sample.json auth:config
 * or from this script after KV namespace id is set in wrangler.toml:
 *   node scripts/write-rules.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sample = join(root, 'scripts/rules.sample.json');
const json = readFileSync(sample, 'utf8');

console.log('Sample config (scripts/rules.sample.json):');
console.log(json);
console.log('\nApply with:');
console.log(
  '  cd packages/guard-worker && npx wrangler kv key put auth:config --binding=RULES --path ../../scripts/rules.sample.json',
);
console.log(
  '\nOr paste into dashboard → KV → your namespace → key auth:config',
);

#!/usr/bin/env node
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const vars = join(root, 'packages/guard-worker/.dev.vars');
const example = join(root, 'packages/guard-worker/.dev.vars.example');

if (!existsSync(vars)) {
  copyFileSync(example, vars);
  console.log('[setup] created packages/guard-worker/.dev.vars from example');
  console.log('[setup] 请编辑该文件，填入 GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET / SESSION_SECRET');
} else {
  console.log('[setup] .dev.vars 已存在，跳过');
}

console.log('[setup] 然后执行: npm run dev');

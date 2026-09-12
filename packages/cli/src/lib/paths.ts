import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function packageRoot(): string {
  // dist/lib -> dist -> package root
  return join(__dirname, '..', '..');
}

export function workerBundleDir(): string {
  return join(packageRoot(), 'dist-worker');
}

export function workerBundlePath(): string {
  return join(workerBundleDir(), 'worker.js');
}

export function hasWorkerBundle(): boolean {
  return existsSync(workerBundlePath());
}

export function readWorkerBundle(): string {
  return readFileSync(workerBundlePath(), 'utf8');
}

export function cliVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(join(packageRoot(), 'package.json'), 'utf8'),
    ) as { version?: string };
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

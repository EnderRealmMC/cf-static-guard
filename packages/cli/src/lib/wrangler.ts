import { execa, type Options } from 'execa';
import { dirname } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export function wranglerBin(): string {
  try {
    // resolve wrangler's bin from this package's dependency
    const pkgPath = require.resolve('wrangler/package.json');
    const root = dirname(pkgPath);
    const bin =
      process.platform === 'win32'
        ? `${root}\\bin\\wrangler.js`
        : `${root}/bin/wrangler.js`;
    return bin;
  } catch {
    return 'wrangler';
  }
}

export async function runWrangler(
  args: string[],
  opts: Options = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const bin = wranglerBin();
  const isJs = bin.endsWith('.js');
  const cmd = isJs ? process.execPath : bin;
  const cmdArgs = isJs ? [bin, ...args] : args;
  try {
    const result = await execa(cmd, cmdArgs, {
      reject: false,
      stdio: ['inherit', 'pipe', 'pipe'],
      ...opts,
    });
    return {
      stdout: String(result.stdout ?? ''),
      stderr: String(result.stderr ?? ''),
      exitCode: result.exitCode ?? 1,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { stdout: '', stderr: msg, exitCode: 1 };
  }
}

export async function runWranglerInherit(
  args: string[],
  opts: Options = {},
): Promise<number> {
  const bin = wranglerBin();
  const isJs = bin.endsWith('.js');
  const cmd = isJs ? process.execPath : bin;
  const cmdArgs = isJs ? [bin, ...args] : args;
  const result = await execa(cmd, cmdArgs, { reject: false, stdio: 'inherit', ...opts });
  return result.exitCode ?? 1;
}

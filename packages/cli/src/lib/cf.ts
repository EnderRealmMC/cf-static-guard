import { runWrangler } from './wrangler.js';

export async function putSecret(
  workerName: string,
  name: string,
  value: string,
): Promise<void> {
  const res = await runWrangler(
    ['secret', 'put', name, '--name', workerName],
    { input: value },
  );
  if (res.exitCode !== 0) {
    throw new Error(res.stderr || res.stdout || `secret put ${name} failed`);
  }
}

export async function createKvNamespace(_title?: string): Promise<string> {
  const res = await runWrangler(['kv', 'namespace', 'create', 'RULES', '--preview=false']);
  // wrangler prints: { binding = "RULES", id = "xxxx" }
  const text = `${res.stdout}\n${res.stderr}`;
  const match = text.match(/id\s*=\s*"([a-f0-9]{32})"/i) || text.match(/id['":\s]+([a-f0-9]{32})/i);
  if (res.exitCode !== 0 || !match) {
    throw new Error(
      `Failed to create KV namespace.\n${text}\nCreate it in the dashboard and set kvNamespaceId on the profile.`,
    );
  }
  return match[1];
}

export async function whoami(): Promise<{ ok: boolean; text: string }> {
  const res = await runWrangler(['whoami']);
  const text = `${res.stdout}\n${res.stderr}`.trim();
  return { ok: res.exitCode === 0, text };
}

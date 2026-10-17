import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, mkdir, writeFile, readFile, rm, copyFile, chmod, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const roots: string[] = [];
const script = new URL('../../../scripts/launch-usage-mcp.sh', import.meta.url).pathname;
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'no short launcher ')); roots.push(root);
  const target = `darwin-${process.arch}`;
  const directory = join(root, 'packages/usage/runtime', target);
  await mkdir(directory, { recursive: true }); await mkdir(join(root, 'scripts'));
  await copyFile(script, join(root, 'scripts/launch-usage-mcp.sh'));
  const helper = '#!/bin/sh\nprintf "RUNTIME_OK\\n"\n';
  const cli = '#!/bin/sh\nprintf "ccusage 20.0.34\\n"\n';
  await writeFile(join(directory, 'no-short-usage'), helper, { mode: 0o755 });
  await writeFile(join(directory, 'ccusage'), cli, { mode: 0o755 });
  const hash = (s: string) => createHash('sha256').update(s).digest('hex');
  await writeFile(join(root, 'plugin.json'), JSON.stringify({ version: '0.4.0' }));
  await writeFile(join(root, 'packages/usage/runtime-manifest.json'), JSON.stringify({ version: '0.4.0', platforms: { [target]: {
    url: `https://github.com/longlonglong173/no-short/releases/download/v0.4.0/no-short-usage-${target}.tar.gz`, sha256: 'a'.repeat(64),
    binaries: { 'no-short-usage': hash(helper), ccusage: hash(cli) },
  } } }));
  return { root, directory };
}
afterEach(async () => { await Promise.all(roots.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
test.skipIf(process.platform !== 'darwin')('launcher runs a verified bundled helper with only macOS system tools and paths containing spaces', async () => {
  const { root } = await setup();
  const p = Bun.spawn(['/bin/sh', join(root, 'scripts/launch-usage-mcp.sh')], { env: { HOME: process.env.HOME, PATH: '/usr/bin:/bin:/usr/sbin:/sbin' }, stdout: 'pipe', stderr: 'pipe' });
  expect(await p.exited).toBe(0);
  expect(await new Response(p.stdout).text()).toBe('RUNTIME_OK\n');
});
test.skipIf(process.platform !== 'darwin')('launcher refuses a modified executable before running it', async () => {
  const { root, directory } = await setup();
  await writeFile(join(directory, 'no-short-usage'), '#!/bin/sh\nprintf "UNSAFE_EXECUTION"\n'); await chmod(join(directory, 'no-short-usage'), 0o755);
  const p = Bun.spawn(['/bin/sh', join(root, 'scripts/launch-usage-mcp.sh')], { stdout: 'pipe', stderr: 'pipe' });
  expect(await p.exited).not.toBe(0);
  expect(await new Response(p.stdout).text()).toBe('');
  expect(await new Response(p.stderr).text()).toContain('checksum');
});

for (const owner of [null, '', 'not-a-pid']) {
  test.skipIf(process.platform !== 'darwin')(`bootstrap recovers an aged ownerless lock (${JSON.stringify(owner)})`, async () => {
    const { root, directory } = await setup();
    await rm(directory, { recursive: true });
    const cache = join(root, 'cache');
    const lock = join(cache, 'no-short/runtime/0.4.0', `darwin-${process.arch}.install-lock`);
    await mkdir(lock, { recursive: true });
    if (owner !== null) await writeFile(join(lock, 'pid'), owner);
    const old = new Date(Date.now() - 120_000); await utimes(lock, old, old);
    const p = Bun.spawn(['/bin/sh', join(root, 'scripts/launch-usage-mcp.sh')], {
      env: { HOME: root, XDG_CACHE_HOME: cache, PATH: '/usr/bin:/bin:/usr/sbin:/sbin' }, stdout: 'pipe', stderr: 'pipe' });
    let reachedDownload = false;
    const read = (async () => { for await (const chunk of p.stderr) { if (new TextDecoder().decode(chunk).includes('đang tải runtime')) { reachedDownload = true; p.kill(); break; } } })();
    try { await Promise.race([read, Bun.sleep(2500)]); }
    finally { p.kill(); await p.exited; }
    expect(reachedDownload).toBe(true);
  });
}

import { afterEach, expect, test } from 'bun:test';
import { cp, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { existsSync } from 'node:fs';

const root = resolve(import.meta.dirname, '../../..');
const cli = Bun.which(process.env.NO_SHORT_TEST_CODEX_CLI ?? 'codex');
const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map(p => rm(p, { recursive: true, force: true }))); });

test.skipIf(!cli)('installed Codex discovers the usage MCP from the packaged plugin manifests', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'no-short-codex-install-')); temporary.push(directory);
  const source = join(directory, 'plugin'); const home = join(directory, 'profile');
  await mkdir(source); await mkdir(home);
  for (const name of ['plugin.json', 'mcp.json', '.agents', '.claude-plugin', 'skills']) {
    if (existsSync(join(root, name))) await cp(join(root, name), join(source, name), { recursive: true });
  }
  async function run(args: string[]) {
    const p = Bun.spawn([cli!, ...args], { cwd: source, env: { ...process.env, CODEX_HOME: home }, stdout: 'pipe', stderr: 'pipe' });
    const [stdout, stderr, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
    if (code !== 0) throw new Error(`Codex ${args[0]} failed: ${stderr}`);
    return JSON.parse(stdout);
  }
  await run(['plugin', 'marketplace', 'add', source, '--json']);
  await run(['plugin', 'add', 'no-short@no-short', '--json']);
  const servers = await run(['mcp', 'list', '--json']);
  const usage = servers.find((s: any) => s.name.includes('no-short-usage'));
  expect(usage).toBeDefined();
  expect(usage.enabled).toBe(true);
  expect(usage.transport.command).toBe('sh');
  expect(usage.transport.args[0]).toEndWith('/scripts/launch-usage-mcp.sh');
  expect(usage.transport.args[0]).not.toContain('${');
}, 30_000);

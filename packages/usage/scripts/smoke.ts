import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

const root = resolve(import.meta.dirname, '../../..');
const cache = resolve(root, '.artifacts/usage/smoke-cache');
const transport = new StdioClientTransport({ command: '/bin/sh', args: [resolve(root, 'scripts/launch-usage-mcp.sh')],
  env: { HOME: process.env.HOME!, PATH: '/usr/bin:/bin:/usr/sbin:/sbin', NO_SHORT_USAGE_CACHE_DIR: cache, NO_SHORT_USAGE_OFFLINE: '1',
    ...(process.env.CODEX_HOME ? { CODEX_HOME: process.env.CODEX_HOME } : {}) }, stderr: 'pipe' });
const client = new Client({ name: 'no-short-native-smoke', version: '0.4.3' });
try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  if (tools.length !== 2) throw new Error('Unexpected tool count');
  const resource = await client.readResource({ uri: 'ui://no-short/usage.html' });
  const html = (resource.contents[0] as { text?: string }).text;
  if (!html?.includes('No Short Usage') || /<script[^>]*\bsrc\s*=/.test(html)) throw new Error('Panel is not self-contained');
  const response = await client.callTool({ name: 'get_usage_dashboard', arguments: {} }, { timeout: 90_000 });
  const usage = response._meta?.usage as any;
  if (usage?.snapshot?.schemaVersion !== 1 || usage.snapshot.status === 'error') throw new Error('Native report failed');
  await mkdir(resolve(root, '.artifacts/usage'), { recursive: true });
  await writeFile(resolve(root, '.artifacts/usage/native-smoke.json'), JSON.stringify({
    runtime: 'native compiled executable', processArch: process.arch, tools: tools.map(t => t.name), status: usage.snapshot.status,
    sessions: usage.snapshot.sessions.length, uiBytes: html.length, generatedAt: usage.snapshot.generatedAt,
    requiresNodeOrBun: false, realDesktopPanelVerified: false,
  }, null, 2));
  console.log(`Native stdio smoke passed: ${tools.length} tools, ${usage.snapshot.sessions.length} local sessions, embedded UI ${html.length} characters. PATH contains only macOS system tools.`);
} finally { await client.close(); }

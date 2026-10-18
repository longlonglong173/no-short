import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { buildSnapshot } from '../src/adapter';
import { createReportEnvironment, runReport } from '../src/runner';
import * as metadata from '../src/metadata';
import raw from './fixtures/unified.json';
import { createUsageService } from '../src/service';

const dirs: string[] = [];
const temp = async () => { const d = await mkdtemp(join(tmpdir(), 'usage-providers-')); dirs.push(d); return d; };
afterEach(async () => { await Promise.all(dirs.splice(0).map(d => rm(d, { recursive: true, force: true }))); });
const options = { now: new Date('2026-10-17T05:00:00Z'), timeZone: 'UTC', metadata: new Map(), providers: ['codex', 'claude'] as const };
const nativeCli = process.env.NO_SHORT_USAGE_CCUSAGE ?? new URL(`../runtime/darwin-${process.arch}/ccusage`, import.meta.url).pathname;

test.skipIf(!existsSync(nativeCli))('multiple roots include distinct sessions without billing copied sessions twice', async () => {
  const root = await temp();
  const codexRoots = [join(root, 'codex-a'), join(root, 'codex-b')];
  const claudeRoots = [join(root, 'claude-a'), join(root, 'claude-b')];
  const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
  for (let index = 0; index < 2; index++) {
    await mkdir(join(codexRoots[index], 'sessions'), { recursive: true });
    await mkdir(join(claudeRoots[index], 'projects/project'), { recursive: true });
    for (const id of ids.slice(0, index + 1)) {
      const timestamp = id === ids[0] ? '2026-10-17T03:00:00Z' : '2026-10-17T04:00:00Z';
      const codex = [
        { type: 'session_meta', payload: { id, source: 'cli', timestamp: '2026-10-17T03:00:00Z' } },
        { type: 'turn_context', payload: { model: 'gpt-6.1-sol' } },
        { type: 'event_msg', timestamp, payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 100, cached_input_tokens: 50, output_tokens: 10, reasoning_output_tokens: 5, total_tokens: 110 } } } },
      ];
      await writeFile(join(codexRoots[index], `sessions/rollout-2026-10-17T10-00-00-${id}.jsonl`), codex.map(v => JSON.stringify(v)).join('\n') + '\n');
      await writeFile(join(claudeRoots[index], `projects/project/${id}.jsonl`), JSON.stringify({
        type: 'assistant', timestamp: '2026-10-17T03:00:00Z', sessionId: id, requestId: `request-${id}`,
        message: { id: `message-${id}`, role: 'assistant', model: 'claude-sonnet-4-5-20250929', usage: { input_tokens: 100, output_tokens: 10, cache_creation_input_tokens: 20, cache_read_input_tokens: 50 } },
      }) + '\n');
    }
  }
  const report = await runReport({ binary: nativeCli, roots: codexRoots, claudeRoots, cacheDir: join(root, 'cache'), timeZone: 'UTC', offline: true });
  const snapshot = buildSnapshot(report, options);
  expect(snapshot.sessions.filter(s => s.provider === 'codex')).toHaveLength(2);
  expect(snapshot.sessions.filter(s => s.provider === 'claude')).toHaveLength(2);
  expect(snapshot.today.tokens.total).toBe(580);
  expect(snapshot.providerBreakdowns?.find(p => p.provider === 'codex')?.today.tokens.total).toBe(220);
  expect(snapshot.providerBreakdowns?.find(p => p.provider === 'claude')?.today.tokens.total).toBe(360);
}, 15_000);

test('mixed providers retain independent session identities, cached tokens and daily totals', () => {
  const report = structuredClone(raw);
  const claude = { ...structuredClone(report.session[0]), agent: 'claude', totalCost: 1.25 };
  report.session.push(claude);
  report.daily[1].agents.push({ ...structuredClone(report.daily[1].agents[0]), agent: 'claude', totalCost: 1.25 });
  const snapshot = buildSnapshot(report, options);
  const c = snapshot.sessions.find(s => s.provider === 'claude')!;
  expect(c.id).not.toBe(snapshot.sessions.find(s => s.provider === 'codex' && s.sessionKey === c.sessionKey)?.id);
  expect(c.tokens.cacheRead).toBe(800);
  expect(snapshot.today.cost.amountUSD).toBeCloseTo(1.72);
  expect(snapshot.providerBreakdowns?.find(p => p.provider === 'claude')?.today.cost.amountUSD).toBe(1.25);
  expect(snapshot.providerBreakdowns?.find(p => p.provider === 'codex')?.today.cost.amountUSD).toBe(0.47);
  expect(() => buildSnapshot(report, { ...options, providers: ['codex'] })).toThrow();
});

test('Claude data is enabled only for explicit roots and other agents remain isolated', () => {
  const env = createReportEnvironment({ HOME: '/home', CLAUDE_CONFIG_DIR: '/private', ANTHROPIC_API_KEY: 'secret' }, ['/codex'], '/empty', ['/claude']);
  expect(env.CLAUDE_CONFIG_DIR).toBe('/claude');
  expect(env.CODEX_HOME).toBe('/codex');
  expect(env.OPENCODE_DATA_DIR).toBe('/empty');
  expect(env.ANTHROPIC_API_KEY).toBeUndefined();
});

test('Claude metadata reads safe titles and child identities without exporting message content', async () => {
  const root = await temp(); await mkdir(join(root, 'projects/project/subagents'), { recursive: true });
  await writeFile(join(root, 'projects/project/session.jsonl'), [
    { type: 'user', message: { content: 'PRIVATE_PROMPT' }, sessionId: 'session' },
    { type: 'custom-title', customTitle: 'Phiên Claude' },
  ].map(v => JSON.stringify(v)).join('\n') + '\n{"unfinished":');
  await writeFile(join(root, 'projects/project/subagents/agent-child.jsonl'), JSON.stringify({ type: 'assistant', message: { content: 'PRIVATE_REPLY' } }) + '\n');
  expect(typeof metadata.readClaudeMetadata).toBe('function');
  const meta = await metadata.readClaudeMetadata([root]);
  expect(meta.get('claude:session')).toEqual({ title: 'Phiên Claude', kind: 'main' });
  expect(meta.get('claude:agent-child')?.kind).toBe('subagent');
  expect(JSON.stringify([...meta])).not.toContain('PRIVATE_');
});

test.skipIf(!existsSync(nativeCli))('pinned native CLI reads controlled Claude logs alongside Codex without double-counting cache', async () => {
  const root = await temp(), claude = join(root, 'claude');
  await mkdir(join(root, 'codex/sessions'), { recursive: true });
  await mkdir(join(claude, 'projects/project'), { recursive: true });
  await writeFile(join(claude, 'projects/project/22222222-2222-4222-8222-222222222222.jsonl'), JSON.stringify({
    type: 'assistant', timestamp: '2026-10-17T03:00:00Z', sessionId: '22222222-2222-4222-8222-222222222222', requestId: 'request-fixture',
    message: { id: 'message-fixture', role: 'assistant', model: 'claude-sonnet-4-5-20250929', usage: { input_tokens: 100, output_tokens: 10, cache_creation_input_tokens: 20, cache_read_input_tokens: 50 } },
  }) + '\n');
  const report = await runReport({ binary: nativeCli, roots: [join(root, 'codex')], claudeRoots: [claude], cacheDir: join(root, 'cache'), timeZone: 'UTC', offline: true });
  const snapshot = buildSnapshot(report, options);
  expect(snapshot.sessions).toHaveLength(1);
  expect(snapshot.sessions[0].provider).toBe('claude');
  expect(snapshot.sessions[0].sessionKey).toBe('22222222-2222-4222-8222-222222222222');
  expect(snapshot.sessions[0].tokens).toEqual({ input: 100, output: 10, cacheRead: 50, cacheWrite: 20, total: 180 });
}, 15_000);

test.skipIf(!existsSync(nativeCli))('an absent Claude installation leaves Codex readable and reports an empty Claude breakdown', async () => {
  const root = await temp(); await mkdir(join(root, 'codex/sessions'), { recursive: true });
  const snapshot = await createUsageService({ binary: nativeCli, roots:[join(root, 'codex')], claudeRoots:[join(root,'not-installed')], cacheDir:join(root,'cache'), timeZone:'UTC' }).get();
  expect(snapshot.status).toBe('empty');
  expect(snapshot.providerBreakdowns?.find(p => p.provider === 'claude')?.today.cost.amountUSD).toBe(0);
});

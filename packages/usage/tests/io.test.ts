import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { readMetadata } from '../src/metadata';
import { createReportEnvironment, runReport } from '../src/runner';
import { SnapshotStore } from '../src/cache';
import { buildSnapshot } from '../src/adapter';
import fixture from './fixtures/unified.json';

const dirs: string[] = [];
async function temp() { const p = await mkdtemp(join(tmpdir(), 'no-short-test-')); dirs.push(p); return p; }
afterEach(async () => { await Promise.all(dirs.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
const snapshot = () => buildSnapshot(fixture, { now: new Date(), timeZone: 'UTC', metadata: new Map() });

test('metadata reads titles and child status while ignoring partial lines and message text', async () => {
  const root = await temp(); await mkdir(join(root, 'sessions'));
  await writeFile(join(root, 'session_index.jsonl'), '{"id":"11111111-1111-4111-8111-111111111111","thread_name":"Báo cáo tuần"}\n{"unfinished":');
  await writeFile(join(root, 'sessions/rollout-11111111-1111-4111-8111-111111111111.jsonl'),
    JSON.stringify({ type: 'session_meta', payload: { id: '11111111-1111-4111-8111-111111111111', source: { subagent: {} }, base_instructions: 'SECRET' } }) + '\n' + JSON.stringify({ type: 'response_item', payload: { content: 'SECRET_MESSAGE' } }));
  const result = await readMetadata([root]);
  expect(result.get('rollout-11111111-1111-4111-8111-111111111111')).toEqual({ title: 'Báo cáo tuần', kind: 'subagent' });
  expect(JSON.stringify([...result])).not.toContain('SECRET');
});

test('CLI environment disables unrelated agents without changing HOME', () => {
  const env = createReportEnvironment({ HOME: '/unchanged-home', CLAUDE_CONFIG_DIR: '/private-claude', ANTHROPIC_API_KEY: 'secret' }, ['/codex'], '/empty');
  expect(env.HOME).toBe('/unchanged-home');
  expect(env.CLAUDE_CONFIG_DIR).toBe('/empty');
  expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  expect(env.CODEX_HOME).toBe('/codex');
  expect(env.COPILOT_OTEL_FILE_EXPORTER_PATH).toBe('/empty/no-export.jsonl');
});

test('report runner invokes the native CLI with fixed arguments and a private empty config', async () => {
  const root = await temp(); const binary = join(root, 'fake-ccusage');
  await writeFile(join(root, 'report.json'), JSON.stringify(fixture));
  await writeFile(binary, '#!/bin/sh\nprintf "%s\\n" "$@" > "$TEST_CAPTURE"\n/bin/cat "$TEST_REPORT"\n', { mode: 0o755 });
  const result = await runReport({ binary, roots: [root], cacheDir: join(root, 'cache'), timeZone: 'Asia/Ho_Chi_Minh', offline: true,
    environment: { ...process.env, TEST_CAPTURE: join(root, 'args'), TEST_REPORT: join(root, 'report.json') } });
  expect(result).toEqual(fixture);
  const args = (await readFile(join(root, 'args'), 'utf8')).split('\n');
  expect(args.slice(0, 6)).toEqual(['session', '--json', '--sections', 'daily,session', '--by-agent', '--timezone']);
  expect(args).toContain('--offline');
  expect(args).toContain('Asia/Ho_Chi_Minh');
});

test('report timeout kills the child and returns a safe error', async () => {
  const root = await temp(); const binary = join(root, 'slow');
  await writeFile(binary, '#!/bin/sh\nexec /bin/sleep 10\n', { mode: 0o755 });
  await expect(runReport({ binary, roots: [root], cacheDir: root, timeZone: 'UTC', offline: true, timeoutMs: 30 })).rejects.toThrow('REPORT_TIMEOUT');
});

const nativeCli = process.env.NO_SHORT_USAGE_CCUSAGE ?? new URL(`../runtime/darwin-${process.arch}/ccusage`, import.meta.url).pathname;
test.skipIf(!existsSync(nativeCli))('pinned native CLI reads only the controlled Codex root and returns unified model prices', async () => {
  const root = await temp(); await mkdir(join(root, 'sessions'));
  const log = [
    { type: 'session_meta', payload: { id: '11111111-1111-4111-8111-111111111111', source: 'cli', timestamp: '2026-10-17T03:00:00Z' } },
    { type: 'turn_context', payload: { model: 'gpt-6.1-sol' } },
    { type: 'event_msg', timestamp: '2026-10-17T03:00:00Z', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 100, cached_input_tokens: 50, output_tokens: 10, reasoning_output_tokens: 5, total_tokens: 110 } } } },
  ];
  await writeFile(join(root, 'sessions/rollout-2026-10-17T10-00-00-11111111-1111-4111-8111-111111111111.jsonl'), log.map(l => JSON.stringify(l)).join('\n') + '\n');
  const report = await runReport({ binary: nativeCli, roots: [root], cacheDir: join(root, 'cache'), timeZone: 'UTC', offline: true });
  const result = buildSnapshot(report, { now: new Date('2026-10-17T05:00:00Z'), timeZone: 'UTC', metadata: new Map() });
  expect(result.sessions).toHaveLength(1);
  expect(result.sessions[0].tokens).toEqual({ input: 50, output: 10, cacheRead: 50, cacheWrite: 0, total: 110 });
  expect(result.sessions[0].models[0].name).toBe('gpt-6.1-sol');
}, 15_000);

test('separate store instances share one calculation and atomic snapshot', async () => {
  const root = await temp(); let calculations = 0;
  const load = async () => { calculations++; await Bun.sleep(70); return snapshot(); };
  const a = new SnapshotStore(root, load); const b = new SnapshotStore(root, load);
  const values = await Promise.all([a.get(), b.get(), a.get()]);
  expect(calculations).toBe(1);
  expect(values[0].generatedAt).toBe(values[1].generatedAt);
  // Cache integrity must not depend on the fixture day being today's date.
  expect((await a.get()).sessions.find(s => s.id === fixture.session[0].period)?.cost.amountUSD).toBe(0.42);
  expect(calculations).toBe(1);
});

test('failed refresh preserves the last success and does not expose process errors', async () => {
  const root = await temp();
  const a = new SnapshotStore(root, async () => snapshot(), { ttlMs: 0 }); await a.get();
  const b = new SnapshotStore(root, async () => { throw new Error('/private/path SECRET'); }, { ttlMs: 0 });
  const result = await b.get();
  expect(result.status).toBe('stale');
  expect(result.sessions.find(s => s.id === fixture.session[0].period)?.cost.amountUSD).toBe(0.42);
  expect(JSON.stringify(result)).not.toContain('SECRET');
});

test('a failed first scan reports unavailable, never a successful zero-cost session', async () => {
  const root = await temp();
  const result = await new SnapshotStore(root, async () => { throw new Error('REPORT_TIMEOUT'); }).get();
  expect(result.status).toBe('error');
  expect(result.today.cost.amountUSD).toBeNull();
});

import { afterEach, expect, test } from 'bun:test';
import { appendFile, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createReportEnvironment, runReport } from '../src/runner';
import { buildSnapshot } from '../src/adapter';
import { createUsageExport, serializeUsageExport } from '../src/export';
import { createUsageService, usageCacheScope } from '../src/service';

const nativeCli = process.env.NO_SHORT_USAGE_CCUSAGE ?? new URL(`../runtime/darwin-${process.arch}/ccusage`, import.meta.url).pathname;
test.skipIf(process.env.NO_SHORT_REQUIRE_PATCHED_CCUSAGE !== '1')('macOS build delivers the patched reader required by real regressions', () => {
  expect(existsSync(nativeCli)).toBe(true);
});
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
const ids = ['a1111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
function event(timestamp = '2026-10-17T03:00:00Z', total = 110) {
  return { type: 'event_msg', timestamp, payload: { type: 'token_count', info: { total_token_usage: {
    input_tokens: total * 100 / 110, cached_input_tokens: total * 50 / 110, output_tokens: total * 10 / 110,
    reasoning_output_tokens: total * 5 / 110, total_tokens: total,
  } } } };
}
function content(id: string): string {
  return [
    { type: 'session_meta', payload: { id, source: 'cli', timestamp: '2026-10-17T03:00:00Z' } },
    { type: 'turn_context', payload: { model: 'gpt-6.1-sol' } },
    event(),
  ].map(row => JSON.stringify(row)).join('\n') + '\n';
}
test.skipIf(!existsSync(nativeCli))('distinct Codex sessions with identical usage count in daily history, while source copies count once', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'usage-collision-')); dirs.push(directory);
  const roots = [join(directory, 'first'), join(directory, 'second')];
  for (const root of roots) await mkdir(join(root, 'sessions'), { recursive: true });
  const path = (root: string, id: string) => join(root, `sessions/rollout-2026-10-17T03-00-00-${id}.jsonl`);
  await writeFile(path(roots[0], ids[0]), content(ids[0]));
  await copyFile(path(roots[0], ids[0]), path(roots[1], ids[0]));
  await writeFile(path(roots[1], ids[1]), content(ids[1]));
  const report = await runReport({ binary: nativeCli, roots, cacheDir: join(directory, 'cache'), timeZone: 'UTC', offline: true });
  const snapshot = buildSnapshot(report, { now: new Date('2026-10-17T12:00:00Z'), timeZone: 'UTC', metadata: new Map() });
  expect(snapshot.sessions).toHaveLength(2);
  expect(snapshot.sessions.map(row => row.tokens.total)).toEqual([110, 110]);
  expect(snapshot.today.tokens.total).toBe(220);
  expect(snapshot.history?.days[0].aggregate.tokens.total).toBe(220);
  expect(snapshot.today.models[0].tokens.total).toBe(220);
  expect(snapshot.today.cost.knownCostUSD).toBeCloseTo(snapshot.sessions.reduce((sum, row) => sum + row.cost.knownCostUSD, 0), 8);
  expect(snapshot.providerBreakdowns?.[0].today.tokens.total).toBe(220);
  const bounded = Bun.spawn([nativeCli, 'session', '--json', '--sections', 'daily,session', '--by-agent',
    '--since', '2026-10-17', '--until', '2026-10-17', '--timezone', 'UTC', '--offline', '--config', join(directory, 'cache/ccusage-config.json')],
    { cwd: directory, env: createReportEnvironment(process.env, roots, join(directory, 'cache/empty-sources')), stdout: 'pipe', stderr: 'pipe' });
  const [boundedOutput, boundedError, boundedCode] = await Promise.all([new Response(bounded.stdout).text(), new Response(bounded.stderr).text(), bounded.exited]);
  expect(boundedCode).toBe(0); expect(boundedError).toBe('');
  expect(buildSnapshot(JSON.parse(boundedOutput), { now: new Date('2026-10-17T12:00:00Z'), timeZone: 'UTC', metadata: new Map() }).today.tokens.total).toBe(220);
  const exported = createUsageExport(snapshot, 'codex', '2026-10-17', '2026-10-17')!;
  expect(JSON.parse(serializeUsageExport(exported, 'json')).aggregate.tokens.total).toBe(220);
  expect(serializeUsageExport(exported, 'csv')).toContain(',220,');
  const load = async (sources: string[]) => buildSnapshot(await runReport({ binary: nativeCli, roots: sources,
    cacheDir: join(directory, 'cache'), timeZone: 'UTC', offline: true }),
    { now: new Date('2026-10-17T12:00:00Z'), timeZone: 'UTC', metadata: new Map() });
  expect((await load([...roots].reverse())).today.tokens.total).toBe(220);
  await appendFile(path(roots[0], ids[0]), JSON.stringify(event('2026-10-17T03:01:00Z', 220)) + '\n');
  expect((await load(roots)).today.tokens.total).toBe(330);
  expect((await load([...roots].reverse())).today.tokens.total).toBe(330);
  expect((await load([roots[0]])).today.tokens.total).toBe(220);
  expect((await load([roots[1]])).today.tokens.total).toBe(220);
  expect((await load(roots)).today.tokens.total).toBe(330);
}, 15_000);

test.skipIf(!existsSync(nativeCli))('reader revision ignores a still-fresh undercounted legacy cache without deleting it', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'usage-reader-cache-')); dirs.push(directory);
  const root = join(directory, 'source'); await mkdir(join(root, 'sessions'), { recursive: true });
  for (const id of ids) await writeFile(join(root, `sessions/rollout-2026-10-17T03-00-00-${id}.jsonl`), content(id));
  const cacheDir = join(directory, 'cache'), roots = [root], timeZone = 'UTC';
  const oldScope = createHash('sha256').update(JSON.stringify({ roots, timeZone, ccusage: '20.0.34', schema: 1, history: 1 })).digest('hex').slice(0, 24);
  const currentScope = usageCacheScope(roots, timeZone);
  expect(currentScope).not.toBe(oldScope);
  const oldPath = join(cacheDir, oldScope, 'snapshot.json'); await mkdir(join(cacheDir, oldScope), { recursive: true });
  const old = { schemaVersion: 1, generatedAt: new Date().toISOString(), sessions: [], today: { cost: { amountUSD: 1 } }, month: { cost: { amountUSD: 1 } } };
  await writeFile(oldPath, JSON.stringify(old));
  await mkdir(join(cacheDir, currentScope), { recursive: true });
  await writeFile(join(cacheDir, currentScope, 'pricing-check.json'), JSON.stringify({ lastOnline: Date.now() }));
  const snapshot = await createUsageService({ binary: nativeCli, roots, cacheDir, timeZone }).get();
  expect(snapshot.status).toBe('ready');
  expect(snapshot.history?.days[0].aggregate.tokens.total).toBe(220);
  expect(await readFile(oldPath, 'utf8')).toBe(JSON.stringify(old));
}, 15_000);


test.skipIf(!existsSync(nativeCli))('explicit fork replay and compaction response identities still prevent copied usage from being counted again', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'usage-replay-')); dirs.push(directory);
  const root = join(directory, 'source'); await mkdir(join(root, 'sessions'), { recursive: true });
  const compact = [
    { timestamp: '2026-10-17T02:00:00Z', type: 'turn_context', payload: { model: 'gpt-6.1-sol' } },
    { timestamp: '2026-10-17T02:00:01Z', type: 'token_usage_record', payload: { response_id: 'shared-response', usage: { input_tokens: 100, output_tokens: 10 } } },
    { type: 'compacted', payload: { compaction_response_id: 'shared-response' } },
  ];
  const stringify = (rows: unknown[]) => rows.map(row => JSON.stringify(row)).join('\n') + '\n';
  for (const id of ids) await writeFile(join(root, `sessions/rollout-${id}.jsonl`), stringify([
    { type: 'session_meta', payload: { id, source: 'cli' } }, ...compact,
  ]));
  const load = async () => buildSnapshot(await runReport({ binary: nativeCli, roots: [root], cacheDir: join(directory, 'cache'), timeZone: 'UTC', offline: true }),
    { now: new Date('2026-10-17T12:00:00Z'), timeZone: 'UTC', metadata: new Map() });
  expect((await load()).today.tokens.total).toBe(110);
  await writeFile(join(root, `sessions/rollout-${ids[0]}.jsonl`), content(ids[0]));
  await writeFile(join(root, `sessions/rollout-${ids[1]}.jsonl`), stringify([
    { timestamp: '2026-10-17T03:01:00Z', type: 'session_meta', payload: { id: ids[1], forked_from_id: ids[0], source: 'cli' } },
    { type: 'turn_context', payload: { model: 'gpt-6.1-sol' } }, event(), event('2026-10-17T03:02:00Z', 220),
  ]));
  const replay = await load();
  expect(replay.today.tokens.total).toBe(220);
  expect(replay.sessions.map(row => row.tokens.total)).toEqual([110, 110]);
}, 15_000);


test.skipIf(!existsSync(nativeCli))('same UUID rollout moved or renamed across source folders is one logical session', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'usage-moved-copy-')); dirs.push(directory);
  const roots = [join(directory, 'first'), join(directory, 'second')];
  await mkdir(join(roots[0], 'sessions/2026/10/17'), { recursive: true });
  await mkdir(join(roots[1], 'sessions/moved'), { recursive: true });
  await writeFile(join(roots[0], `sessions/2026/10/17/rollout-${ids[0]}.jsonl`), content(ids[0]));
  await writeFile(join(roots[1], `sessions/moved/renamed-${ids[0].toUpperCase()}.jsonl`), content(ids[0]));
  await writeFile(join(roots[1], `sessions/moved/renamed-${ids[1]}.jsonl`), content(ids[1]));
  for (const sources of [roots, [...roots].reverse()]) {
    const report = await runReport({ binary: nativeCli, roots: sources, cacheDir: join(directory, 'cache'), timeZone: 'UTC', offline: true });
    const snapshot = buildSnapshot(report, { now: new Date('2026-10-17T12:00:00Z'), timeZone: 'UTC', metadata: new Map() });
    expect(snapshot.sessions).toHaveLength(2);
    expect(snapshot.today.tokens.total).toBe(220);
    expect(snapshot.sessions.reduce((sum, row) => sum + row.tokens.total, 0)).toBe(220);
  }
}, 15_000);

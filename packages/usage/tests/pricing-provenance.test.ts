import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runReport } from '../src/runner';
import { buildSnapshot } from '../src/adapter';
import { createUsageService, usageCacheScope } from '../src/service';
import { ccusagePatchRevision } from '../src/version';
import fixture from './fixtures/unified.json';

const binary = process.env.NO_SHORT_USAGE_CCUSAGE ?? new URL(`../runtime/darwin-${process.arch}/ccusage`, import.meta.url).pathname;
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
const options = { now: new Date('2026-10-17T05:00:00Z'), timeZone: 'UTC', metadata: new Map() };

async function mixedModelFixture() {
  const root = await mkdtemp(join(tmpdir(), 'ns16-provenance-')); dirs.push(root);
  const logs = join(root, 'codex'); await mkdir(join(logs, 'sessions'), { recursive: true });
  const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
  for (const [index, id] of ids.entries()) {
    const timestamp = `2026-10-17T0${3 + index}:00:00Z`;
    const rows: unknown[] = [{ type: 'session_meta', payload: { id, source: 'cli', timestamp } }];
    if (index) rows.push({ type: 'turn_context', payload: { model: 'gpt-5' } });
    rows.push({ type: 'event_msg', timestamp, payload: { type: 'token_count', info: { total_token_usage: {
      input_tokens: 1000000, cached_input_tokens: 500000, output_tokens: 100000, reasoning_output_tokens: 50000, total_tokens: 1100000,
    } } } });
    await writeFile(join(logs, `sessions/rollout-${id}.jsonl`), rows.map(row => JSON.stringify(row)).join('\n') + '\n');
  }
  return { root, logs, ids };
}

test.skipIf(!existsSync(binary))('real unified CLI preserves explicit fallback and genuine-model provenance through daily aggregation', async () => {
  const { root, logs, ids } = await mixedModelFixture();
  const raw: any = await runReport({ binary, roots: [logs], cacheDir: join(root, 'cache'), timeZone: 'UTC', offline: true });
  const fallback = raw.session.find((s: any) => s.period.includes(ids[0]));
  const genuine = raw.session.find((s: any) => s.period.includes(ids[1]));
  expect(fallback.modelBreakdowns[0].modelName).toBe('gpt-5');
  expect(genuine.modelBreakdowns[0].modelName).toBe('gpt-5');
  expect(raw.daily[0].totalCost).toBeCloseTo(3.375, 8);
  const s = buildSnapshot(raw, options);
  expect(s.sessions.find(s => s.id.includes(ids[0]))!.models[0].pricing?.source).toBe('fallback');
  expect(s.sessions.find(s => s.id.includes(ids[0]))!.cost.status).toBe('unknown');
  expect(s.sessions.find(s => s.id.includes(ids[1]))!.cost.status).toBe('estimated');
  expect(s.today.cost).toEqual({ amountUSD: null, knownCostUSD: 1.6875, status: 'partial' });
  expect(s.today.models).toHaveLength(1);
  expect(s.today.models[0].cost).toEqual(s.today.cost);
  expect(s.month.cost).toEqual(s.today.cost);
  const custom = buildSnapshot(raw, { ...options, pricing: { version: 1, overrides: [{ provider: 'codex', model: 'gpt-5', input: 1, output: 1, cacheRead: 1, cacheWrite: 1 }] } });
  expect(custom.today.cost.amountUSD).toBeCloseTo(2.2);
});

test('legacy nonempty Codex reports produce a clear localized runtime-update error, while empty sources remain valid', async () => {
  const unsupported = { agent: 'codex', period: 'old-session', inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0,
    totalTokens: 2, totalCost: .1, modelBreakdowns: [{ modelName: 'known-model', inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0, cost: .1 }] };
  const raw = { session: [unsupported], daily: [], totals: {} };
  expect(buildSnapshot({ session: [], daily: [], totals: {} }, options).status).toBe('empty');
  const root = await mkdtemp(join(tmpdir(), 'ns16-unsupported-')); dirs.push(root);
  const binary = join(root, 'old-reader');
  await writeFile(binary, '#!/bin/sh\ncat <<\'REPORT\'\n' + JSON.stringify(raw) + '\nREPORT\n', { mode: 0o700 });
  const s = await createUsageService({ binary, roots: [join(root, 'logs')], cacheDir: join(root, 'cache'), timeZone: 'UTC', pricingFile: join(root, 'missing.json') }).get();
  expect(s.status).toBe('error');
  expect(s.notice).toBe('Bộ đọc chưa cung cấp nguồn giá model Codex. Cập nhật runtime No Short Usage rồi thử lại.');
  expect(s.today.cost.amountUSD).toBeNull();
  expect(s.history).toBeUndefined();
  expect(() => buildSnapshot(raw, options)).toThrow('REPORT_PRICING_UNSUPPORTED');
});

// Missing validation would promote guessed raw costs into complete estimates.
for (const location of ['session', 'daily-source', 'daily-direct'] as const) {
  test.each([undefined, null, 'false', 'true', 0, 1])(`Codex ${location} rejects nonboolean fallback provenance %s`, flag => {
    const row = structuredClone(fixture.session[0]) as any;
    row.modelBreakdowns[0].isFallback = flag;
    const daily = { ...row, period: '2026-10-17' };
    const raw = { session: location === 'session' ? [row] : [],
      daily: location === 'daily-source' ? [{ ...daily, agent: 'all', agents: [row] }] : location === 'daily-direct' ? [daily] : [], totals: {} };
    expect(() => buildSnapshot(raw, options)).toThrow('REPORT_PRICING_UNSUPPORTED');
  });
  test.each(['tokens', 'cost', 'token-parts'])(`Codex ${location} rejects populated rows without model breakdowns (%s)`, populated => {
    const row = { agent: 'codex', period: 'session', inputTokens: populated === 'token-parts' ? 1 : 0,
      outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, totalTokens: populated === 'tokens' ? 1 : 0,
      totalCost: populated === 'cost' ? .1 : 0, modelBreakdowns: [] };
    const daily = { ...row, period: '2026-10-17' };
    expect(() => buildSnapshot({ session: location === 'session' ? [row] : [],
      daily: location === 'daily-source' ? [{ ...daily, agent: 'all', agents: [row] }] : location === 'daily-direct' ? [daily] : [], totals: {} }, options)).toThrow('REPORT_PRICING_UNSUPPORTED');
  });
}

test('empty Codex rows remain valid and Claude model rows need no fallback flag', () => {
  const empty = { agent: 'codex', period: 'empty', inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0,
    totalTokens: 0, totalCost: 0, modelBreakdowns: [] };
  const report = { session: [empty], daily: [{ ...empty, period: '2026-10-17' }], totals: {} };
  expect(buildSnapshot(report, options).today.cost).toEqual({ amountUSD: 0, knownCostUSD: 0, status: 'estimated' });
  const claude = structuredClone(fixture.session[0]) as any; claude.agent = 'claude';
  for (const model of claude.modelBreakdowns) delete model.isFallback;
  const snapshot = buildSnapshot({ session: [claude], daily: [{ ...claude, period: '2026-10-17' }], totals: {} }, { ...options, providers: ['claude'] });
  expect(snapshot.sessions[0].cost).toEqual({ amountUSD: .42, knownCostUSD: .42, status: 'estimated' });
  expect(snapshot.today.cost).toEqual(snapshot.sessions[0].cost);
});

test('adapter policy ignores a fresh unsafe same-reader cache without deleting old snapshots or pricing markers', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ns-policy-cache-')); dirs.push(root);
  const roots = [join(root, 'logs')], timeZone = 'UTC', cacheDir = join(root, 'cache');
  const oldScope = createHash('sha256').update(JSON.stringify({ roots, timeZone, ccusage: '20.0.34', reader: ccusagePatchRevision,
    schema: 1, history: 1, grouping: 1 })).digest('hex').slice(0, 24);
  const oldDirectory = join(cacheDir, oldScope); await mkdir(oldDirectory, { recursive: true });
  const unsafe = buildSnapshot(fixture, { ...options, now: new Date() });
  unsafe.month.cost = { amountUSD: 999, knownCostUSD: 999, status: 'estimated' };
  unsafe.history!.days = []; // A fresh unsafe cache must not hide the recorded history.
  const oldBytes = JSON.stringify(unsafe), markerBytes = JSON.stringify({ lastOnline: Date.now() });
  await writeFile(join(oldDirectory, 'snapshot.json'), oldBytes);
  await writeFile(join(oldDirectory, 'pricing-check.json'), markerBytes);
  const binary = join(root, 'reader');
  await writeFile(binary, '#!/bin/sh\ncat <<\'REPORT\'\n' + JSON.stringify(fixture) + '\nREPORT\n', { mode: 0o700 });
  const service = createUsageService({ binary, roots, cacheDir, timeZone, pricingFile: join(root, 'missing.json') });
  const actual = await service.get();
  // The fixture's two historical days cost .10 + .47, regardless of today's month.
  expect(actual.history?.days.reduce((total, day) => total + day.aggregate.cost.knownCostUSD, 0)).toBeCloseTo(.57, 8);
  expect(actual.sessions).toHaveLength(2);
  expect(usageCacheScope(roots, timeZone)).not.toBe(oldScope);
  expect(await readFile(join(oldDirectory, 'snapshot.json'), 'utf8')).toBe(oldBytes);
  expect(await readFile(join(oldDirectory, 'pricing-check.json'), 'utf8')).toBe(markerBytes);
});

test.each([null, 'false', 'true', 0, 1])('Claude still rejects malformed optional fallback flag %s', flag => {
  const row = structuredClone(fixture.session[0]) as any;
  row.agent = 'claude'; row.modelBreakdowns[0].isFallback = flag;
  expect(() => buildSnapshot({ session: [row], daily: [], totals: {} }, { ...options, providers: ['claude'] })).toThrow('REPORT_INVALID');
});

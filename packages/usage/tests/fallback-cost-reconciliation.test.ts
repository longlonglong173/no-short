import { afterEach, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { appendFile, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSnapshot, sumAggregates } from '../src/adapter';
import { runReport } from '../src/runner';
import { createUsageService, usageCacheScope } from '../src/service';
import { compareHistory, historyView, sessionUsageForRange } from '../src/history';
import { groupedUsage } from '../src/grouping';
import { createUsageExport, serializeUsageExport } from '../src/export';
import { usageInsights } from '../src/insights';
import type { Aggregate, UsageSnapshot } from '../src/types';
import type { PricingConfig } from '../src/pricing';
import sharedSnapshot from './fixtures/ns21-mixed-snapshot.json';

const binary = process.env.NO_SHORT_USAGE_CCUSAGE ?? new URL(`../runtime/darwin-${process.arch}/ccusage`, import.meta.url).pathname;
const real = test.skipIf(!existsSync(binary));
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))); });
const now = new Date('2026-10-17T12:00:00Z');
const idA = '11111111-1111-4111-8111-111111111111', idB = '22222222-2222-4222-8222-222222222222';
const jsonl = (rows: unknown[]) => rows.map(row => JSON.stringify(row)).join('\n') + '\n';
const header = (id: string) => ({ type: 'session_meta', payload: { id, source: 'cli' } });
const context = (model = 'gpt-5') => ({ type: 'turn_context', payload: { model } });
const usage = (timestamp = '2026-10-17T03:00:00Z') => ({ type: 'event_msg', timestamp, payload: { type: 'token_count', info: { last_token_usage: {
  input_tokens: 1000000, cached_input_tokens: 500000, output_tokens: 100000, reasoning_output_tokens: 50000, total_tokens: 1100000,
} } } });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'ns21-cost-')); dirs.push(root);
  const logs = join(root, 'codex'); await mkdir(join(logs, 'sessions'), { recursive: true });
  const path = (id: string, source = logs) => join(source, `sessions/rollout-${id}.jsonl`);
  const scan = async (roots = [logs], timeZone = 'UTC', date = now, pricing?: PricingConfig, claudeRoots?: string[]) => {
    const raw: any = await runReport({ binary, roots, claudeRoots, cacheDir: join(root, 'cache'), timeZone, offline: true });
    return { raw, snapshot: buildSnapshot(raw, { now: date, timeZone, metadata: new Map(), pricing, providers: claudeRoots ? ['codex', 'claude'] : ['codex'] }) };
  };
  return { root, logs, path, scan };
}
function cost(value: Aggregate, known: number, status: 'partial' | 'unknown' | 'estimated' = 'partial') {
  expect(value.cost.knownCostUSD).toBeCloseTo(known, 8);
  expect(value.cost.status).toBe(status);
  expect(value.cost.amountUSD).toBe(status === 'estimated' ? known : null);
}
function reconcile(snapshot: UsageSnapshot, start = '2026-10-17', end = start, provider: 'all' | 'codex' | 'claude' = 'all') {
  const history = historyView(snapshot, provider, start, end)!;
  const detail = sessionUsageForRange(snapshot, provider, start, end)!;
  expect(detail.reconciled).toBe(true);
  expect(detail.aggregate.cost).toEqual(history.aggregate.cost);
  const groups = groupedUsage(snapshot, provider, start, end)!;
  expect(groups.reconciled).toBe(true);
  expect(groups.aggregate.cost).toEqual(history.aggregate.cost);
  cost(sumAggregates(groups.projects.map(g => g.aggregate)), history.aggregate.cost.knownCostUSD, history.aggregate.cost.status);
  cost(sumAggregates(groups.works.map(g => g.aggregate)), history.aggregate.cost.knownCostUSD, history.aggregate.cost.status);
  for (const groupBy of ['project', 'work'] as const) {
    const doc = createUsageExport(snapshot, provider, start, end, { groupBy })!;
    expect(JSON.parse(serializeUsageExport(doc, 'json')).aggregate.cost).toEqual(history.aggregate.cost);
    // Cost columns are fixed: amountUSD stays empty for incomplete prices.
    const row = serializeUsageExport(doc, 'csv').split('\n').find(r => r.startsWith('"aggregate"'))!;
    expect(row).toBeDefined();
    const cells = row.split(',');
    expect(cells[10]).toBe(history.aggregate.cost.amountUSD === null ? '' : String(history.aggregate.cost.amountUSD));
    expect(Number(cells[11])).toBeCloseTo(history.aggregate.cost.knownCostUSD, 8);
    expect(cells[12]).toBe(`"${history.aggregate.cost.status}"`);
  }
  return history.aggregate;
}

real('one session retains identified price after earlier inferred usage of the same model', async () => {
  const f = await fixture();
  await writeFile(f.path(idA), jsonl([header(idA), usage(), context(), usage('2026-10-17T04:00:00Z')]));
  const { raw, snapshot: s } = await f.scan();
  expect(raw.session[0].modelBreakdowns.map((m: any) => m.isFallback).sort()).toEqual([false, true]);
  cost(s.sessions[0], 1.6875); cost(s.today, 1.6875); cost(s.month, 1.6875);
  expect(s.today.models).toHaveLength(1);
  expect(s.today.models[0].pricing?.source).toBe('mixed');
  expect(s.today.tokens.total).toBe(2200000);
  cost(reconcile(s), 1.6875);
});

real('two sessions reconcile through every scope in either valid time/provenance order', async () => {
  const f = await fixture();
  for (const explicitFirst of [false, true]) {
    await writeFile(f.path(idA), jsonl([header(idA), ...(explicitFirst ? [context()] : []), usage()]));
    await writeFile(f.path(idB), jsonl([header(idB), ...(!explicitFirst ? [context()] : []), usage('2026-10-17T04:00:00Z')]));
    const { snapshot: s } = await f.scan();
    if (!explicitFirst) expect(s).toEqual(sharedSnapshot as UsageSnapshot);
    cost(s.today, 1.6875); cost(s.month, 1.6875); cost(s.providerBreakdowns![0].today, 1.6875);
    expect(s.chart.at(-1)!.cost).toEqual(s.today.cost);
    expect(s.providerBreakdowns![0].chart.at(-1)!.cost).toEqual(s.today.cost);
    expect(s.today.models[0].cost).toEqual(s.today.cost);
    cost(sumAggregates(s.sessions), 1.6875);
    cost(reconcile(s), 1.6875); cost(reconcile(s, undefined, undefined, 'codex'), 1.6875);
  }
});

real('fallback-only remains unknown and a missing different model never erases an identified cost', async () => {
  const f = await fixture();
  await writeFile(f.path(idA), jsonl([header(idA), usage()]));
  const fallback = (await f.scan()).snapshot;
  cost(fallback.today, 0, 'unknown'); cost(reconcile(fallback), 0, 'unknown');
  await writeFile(f.path(idB), jsonl([header(idB), context(), usage('2026-10-17T04:00:00Z'), context('ns21-no-price-model'), usage('2026-10-17T05:00:00Z')]));
  const s = (await f.scan()).snapshot;
  cost(s.today, 1.6875); expect(s.today.models).toHaveLength(2);
  expect(s.today.models.find(m => m.name === 'ns21-no-price-model')!.cost.status).toBe('unknown');
  cost(reconcile(s), 1.6875);
});

real('provider scoped custom prices including zero price all partitions and restore safely from fresh cache', async () => {
  const f = await fixture();
  await writeFile(f.path(idA), jsonl([header(idA), usage()]));
  await writeFile(f.path(idB), jsonl([header(idB), context(), usage('2026-10-17T04:00:00Z')]));
  const claude = join(f.root, 'claude'); await mkdir(join(claude, 'projects/p'), { recursive: true });
  await writeFile(join(claude, 'projects/p/s.jsonl'), jsonl([{ timestamp: '2026-10-17T04:00:00Z', sessionId: 'claude-s', requestId: 'req', message: { id: 'msg', model: 'gpt-5', usage: { input_tokens: 12, output_tokens: 3 } } }]));
  const pricingFile = join(f.root, 'pricing.json');
  const store = createUsageService({ binary, roots: [f.logs], claudeRoots: [claude], cacheDir: join(f.root, 'service-cache'), timeZone: 'UTC', pricingFile });
  const oldOffline = process.env.NO_SHORT_USAGE_OFFLINE; process.env.NO_SHORT_USAGE_OFFLINE = '1';
  try {
    const first = await store.get();
    const known = first.history!.days.find(d => d.provider === 'codex')!.aggregate;
    cost(known, 1.6875);
    const claudeCost = first.sessions.find(s => s.provider === 'claude')!.cost;
    for (const rate of [1, 0]) {
      await writeFile(pricingFile, JSON.stringify({ version: 1, overrides: [{ provider: 'codex', model: 'gpt-5', input: rate, output: rate, cacheRead: rate, cacheWrite: rate }] }));
      const s = await store.get();
      cost(reconcile(s, undefined, undefined, 'codex'), rate * 2.2, 'estimated');
      expect(s.sessions.find(s => s.provider === 'claude')!.cost).toEqual(claudeCost);
      expect(s.sessions.filter(s => s.provider === 'codex').every(s => s.models[0].pricing?.source === 'custom')).toBe(true);
    }
    await rm(pricingFile);
    const restored = await store.get();
    cost(reconcile(restored, undefined, undefined, 'codex'), 1.6875);
    expect(restored.pricing?.configurationRevision).toBe(first.pricing?.configurationRevision);
  } finally { if (oldOffline === undefined) delete process.env.NO_SHORT_USAGE_OFFLINE; else process.env.NO_SHORT_USAGE_OFFLINE = oldOffline; }
});

real('midnight/month boundaries, copied roots and append retain cost by actual event day', async () => {
  const f = await fixture(), copy = join(f.root, 'copy'); await mkdir(join(copy, 'sessions'), { recursive: true });
  // Local UTC+7: first fallback+known pair belongs to Oct 31; next pair belongs to Nov 1.
  const path = f.path(idA);
  await writeFile(path, jsonl([header(idA), usage('2026-10-31T16:00:00Z'), context(), usage('2026-10-31T16:30:00Z')]));
  await copyFile(path, f.path(idA, copy));
  const extraFallback = idB;
  await writeFile(f.path(extraFallback), jsonl([header(idB), usage('2026-10-31T17:01:00Z')]));
  await appendFile(f.path(idA, copy), jsonl([usage('2026-10-31T17:30:00Z')]));
  for (const roots of [[f.logs, copy], [copy, f.logs]]) {
    const s = (await f.scan(roots, 'Asia/Saigon', new Date('2026-11-01T05:00:00Z'))).snapshot;
    cost(s.today, 1.6875); cost(s.month, 1.6875);
    cost(reconcile(s, '2026-10-31'), 1.6875); cost(reconcile(s, '2026-11-01'), 1.6875);
    cost(reconcile(s, '2026-10-31', '2026-11-01'), 3.375);
    cost(sumAggregates(s.sessions), 3.375);
    expect(s.sessions).toHaveLength(2); expect(s.sessions.find(s => s.sessionKey === idA)!.tokens.total).toBe(3300000);
  }
});

real('pre-NS21 fresh cache is bypassed without altering cache or source files', async () => {
  const f = await fixture();
  await writeFile(f.path(idA), jsonl([header(idA), usage()]));
  await writeFile(f.path(idB), jsonl([header(idB), context(), usage('2026-10-17T04:00:00Z')]));
  const roots = [f.logs], timeZone = 'UTC';
  const oldScope = createHash('sha256').update(JSON.stringify({ roots, timeZone, ccusage: '20.0.34', reader: 'ns20-session-scope-v2-ns16-pricing-provenance-v1-ns18-session-days-v1', schema: 1, history: 1, grouping: 1 })).digest('hex').slice(0, 24);
  expect(usageCacheScope(roots, timeZone)).not.toBe(oldScope);
  const cacheDir = join(f.root, 'service-cache'); await mkdir(join(cacheDir, oldScope), { recursive: true });
  const stale = JSON.stringify({ ...sharedSnapshot, generatedAt: new Date().toISOString(), month: { ...sharedSnapshot.month, cost: { amountUSD: null, knownCostUSD: 0, status: 'unknown' } } });
  const oldPath = join(cacheDir, oldScope, 'snapshot.json'); await writeFile(oldPath, stale);
  const before = await readFile(f.path(idA), 'utf8');
  // Seed offline pricing marker in the new scope; no network or real price file.
  await mkdir(join(cacheDir, usageCacheScope(roots, timeZone)), { recursive: true });
  await writeFile(join(cacheDir, usageCacheScope(roots, timeZone), 'pricing-check.json'), JSON.stringify({ lastOnline: Date.now() }));
  const s = await createUsageService({ binary, roots, cacheDir, timeZone, pricingFile: join(f.root, 'absent') }).get();
  cost(reconcile(s), 1.6875);
  expect(await readFile(oldPath, 'utf8')).toBe(stale);
  expect(await readFile(f.path(idA), 'utf8')).toBe(before);
});

test('shared reader snapshot retains lower bound in panel projections and refuses precise comparisons/forecasts', () => {
  const s = structuredClone(sharedSnapshot) as UsageSnapshot;
  cost(s.today, 1.6875); cost(reconcile(s), 1.6875);
  expect(compareHistory(s, 'all', { start: '2026-10-17', end: '2026-10-17' }, now)!.summary.cost).toBeNull();
  const insights = usageInsights(s, 'all', now);
  expect(insights.todayUSD).toBeNull(); expect(insights.recordedMonthUSD).toBeNull(); expect(insights.scenarioUSD).toBeNull();
  expect(usageInsights({ ...s, status: 'stale' }, 'all', now).scenarioReason).toBe('stale');
});

const helper = new URL(`../runtime/darwin-${process.arch}/no-short-usage`, import.meta.url).pathname;
test.skipIf(!existsSync(helper))('built snapshot helper preserves known cost using isolated offline sources and prices', async () => {
  const f = await fixture();
  await writeFile(f.path(idA), jsonl([header(idA), usage()]));
  await writeFile(f.path(idB), jsonl([header(idB), context(), usage('2026-10-17T04:00:00Z')]));
  const child = Bun.spawn([helper, '--snapshot'], { cwd: f.root, env: { ...process.env,
    CODEX_HOME: f.logs, NO_SHORT_USAGE_CLAUDE_ROOTS: '', NO_SHORT_USAGE_OFFLINE: '1',
    NO_SHORT_USAGE_CACHE_DIR: join(f.root, 'helper-cache'), NO_SHORT_USAGE_PRICING_FILE: join(f.root, 'missing-pricing.json'),
    NO_SHORT_USAGE_CCUSAGE: binary, TZ: 'UTC',
  }, stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  expect(code).toBe(0); expect(stderr).toBe('');
  const s: UsageSnapshot = JSON.parse(stdout);
  expect(s.status).toBe('ready'); expect(s.pricingSource).toBe('cached');
  cost(reconcile(s), 1.6875); cost(sumAggregates(s.sessions), 1.6875);
});

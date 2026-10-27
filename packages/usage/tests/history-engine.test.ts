import { afterEach, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSnapshot } from '../src/adapter';
import { SnapshotStore } from '../src/cache';
import { createUsageService } from '../src/service';
import { historyView } from '../src/history';
import raw from './fixtures/unified.json';

const options = { now: new Date('2026-10-17T05:00:00Z'), timeZone: 'UTC', metadata: new Map(), providers: ['codex', 'claude'] as const };
const dirs: string[] = [];
const temp = async () => { const d = await mkdtemp(join(tmpdir(), 'ns09-history-')); dirs.push(d); return d; };
afterEach(async () => { await Promise.all(dirs.splice(0).map(d => rm(d, { recursive: true, force: true }))); });

test('history retains all daily rows per provider, merges duplicates and never adds combined or lifetime totals', () => {
  const report = structuredClone(raw);
  report.daily[0].period = '2024-02-29';
  report.daily.push(structuredClone(report.daily[0]));
  report.daily[1].agents.push({ ...structuredClone(report.daily[1].agents[0]), agent: 'claude', totalCost: 2 });
  const snapshot = buildSnapshot(report, options);
  expect(snapshot.history?.version).toBe(1);
  expect(snapshot.history?.providers).toEqual(['codex', 'claude']);
  expect(snapshot.history?.days.map(d => [d.date, d.provider, d.aggregate.cost.amountUSD])).toEqual([
    ['2024-02-29', 'codex', 0.2], ['2026-10-17', 'codex', 0.47], ['2026-10-17', 'claude', 2],
  ]);
  expect(snapshot.today.cost.amountUSD).toBeCloseTo(2.47);
  expect(snapshot.chart).toHaveLength(7);
  expect(snapshot.sessions[0].cost.amountUSD).toBe(0.05);
  expect(JSON.stringify(snapshot.history)).not.toContain('rollout');
});

test('successful empty sources are explicit and missing mixed-provider attribution fails closed', () => {
  expect(buildSnapshot({ daily: [], session: [], totals: {} }, options).history).toEqual({ version: 1, providers: ['codex', 'claude'], days: [] });
  const report = structuredClone(raw);
  delete (report.daily[0] as { agents?: unknown }).agents;
  expect(() => buildSnapshot(report, options)).toThrow('Unexpected daily data source');
  report.daily[0].agent = 'codex';
  expect(buildSnapshot(report, options).history?.days[0].provider).toBe('codex');
});

test.each(['2026-02-29', '2024-02-30', '2026-04-31', '0000-01-01'])('daily input rejects impossible date %s', date => {
  const report = structuredClone(raw); report.daily[0].period = date;
  expect(() => buildSnapshot(report, options)).toThrow('Invalid daily period');
});

test('partial pricing with a known zero subtotal survives daily, month and model merging', () => {
  const report = structuredClone(raw);
  report.daily = [report.daily[1], structuredClone(report.daily[1])];
  for (const day of report.daily) {
    const source = day.agents[0]; source.totalCost = 0;
    source.modelBreakdowns[0].cost = 0;
    Object.assign(source.modelBreakdowns[1], { cost: 0, missingPricing: true });
  }
  const snapshot = buildSnapshot(report, options);
  const partial = { amountUSD: null, knownCostUSD: 0, status: 'partial' as const };
  expect(snapshot.today.cost).toEqual(partial);
  expect(snapshot.month.cost).toEqual(partial);
  expect(snapshot.history?.days[0].aggregate.cost).toEqual(partial);
  expect(snapshot.history?.days[0].aggregate.models.find(m => m.name === 'gpt-6-luna')?.cost.status).toBe('unknown');
});

test('source failure omits history without cache and preserves stale history with cache', async () => {
  const directory = await temp();
  const fail = async (): Promise<never> => { throw new Error('REPORT_FAILED'); };
  const unavailable = await new SnapshotStore(directory, fail).get();
  expect(unavailable.status).toBe('error'); expect(unavailable.history).toBeUndefined();
  const snapshot = await new SnapshotStore(directory, async () => buildSnapshot(raw, { ...options, now: new Date() }), { ttlMs: 0 }).get();
  const stale = await new SnapshotStore(directory, fail, { ttlMs: 0 }).get();
  expect(stale.status).toBe('stale'); expect(stale.history).toEqual(snapshot.history);
});

test('cache revision ignores legacy fresh cache, keeps old files, and projections need only one shared scan', async () => {
  const root = await temp(), roots = [join(root, 'codex')], cacheDir = join(root, 'cache'), binary = join(root, 'fake-ccusage');
  const legacyScope = createHash('sha256').update(JSON.stringify({ roots, timeZone: 'UTC', ccusage: '20.0.34', schema: 1 })).digest('hex').slice(0, 24);
  const legacyDir = join(cacheDir, legacyScope); await mkdir(legacyDir, { recursive: true });
  const legacy = buildSnapshot(raw, { ...options, now: new Date() }); delete legacy.history;
  await writeFile(join(legacyDir, 'snapshot.json'), JSON.stringify(legacy));
  await writeFile(join(root, 'report.json'), JSON.stringify(raw));
  await writeFile(binary, '#!/bin/sh\nprintf "scan\\n" >> "' + join(root, 'calls') + '"\n/bin/cat "' + join(root, 'report.json') + '"\n', { mode: 0o755 });
  const serviceOptions = { binary, roots, cacheDir, timeZone: 'UTC' };
  const results = await Promise.all([createUsageService(serviceOptions).get(), createUsageService(serviceOptions).get()]);
  expect(results[0].history?.days).toHaveLength(2);
  expect(results[1].history).toEqual(results[0].history);
  expect(await readFile(join(root, 'calls'), 'utf8')).toBe('scan\n');
  for (const provider of ['all', 'codex', 'claude'] as const) historyView(results[0], provider, '2026-10-01', '2026-10-17');
  expect(await readFile(join(root, 'calls'), 'utf8')).toBe('scan\n');
  expect(JSON.parse(await readFile(join(legacyDir, 'snapshot.json'), 'utf8')).history).toBeUndefined();
});

test('cache reads preserve legacy schema1 and discard only corrupt optional history', async () => {
  const directory = await temp();
  const original = buildSnapshot(raw, { ...options, now: new Date() });
  for (const history of [undefined, { ...original.history, version: 2 }]) {
    await writeFile(join(directory, 'snapshot.json'), JSON.stringify({ ...original, history }));
    let calls = 0;
    const value = await new SnapshotStore(directory, async () => { calls++; throw new Error('unexpected scan'); }).get();
    expect(calls).toBe(0); expect(value.status).toBe(original.status);
    expect(value.today).toEqual(original.today); expect(value.sessions).toEqual(original.sessions);
    expect(value.history).toBeUndefined();
  }
});

test.skipIf(!existsSync(new URL('../dist/panel/index.html', import.meta.url)))('source snapshot CLI transports six years of daily history without truncation or rescanning', async () => {
  const root = await temp(), codex = join(root, 'codex'), claude = join(root, 'claude'), binary = join(root, 'fake-ccusage');
  await mkdir(join(claude, 'projects'), { recursive: true });
  const report = structuredClone(raw);
  report.daily = Array.from({ length: 2200 }, (_, index) => {
    const day = structuredClone(raw.daily[0]);
    day.period = new Date(Date.UTC(2018, 0, index + 1)).toISOString().slice(0, 10);
    day.agents.push({ ...structuredClone(day.agents[0]), agent: 'claude' });
    return day;
  });
  await writeFile(join(root, 'report.json'), JSON.stringify(report));
  await writeFile(binary, '#!/bin/sh\nprintf "scan\\n" >> "' + join(root, 'calls') + '"\n/bin/cat "' + join(root, 'report.json') + '"\n', { mode: 0o755 });
  const child = Bun.spawn([process.execPath, new URL('../src/main.ts', import.meta.url).pathname, '--snapshot'], {
    stdout: 'pipe', stderr: 'pipe', env: { ...process.env, CODEX_HOME: codex, NO_SHORT_USAGE_CLAUDE_ROOTS: claude,
      NO_SHORT_USAGE_CCUSAGE: binary, NO_SHORT_USAGE_CACHE_DIR: join(root, 'cache'), NO_SHORT_USAGE_OFFLINE: '1', TZ: 'UTC' },
  });
  const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
  expect(await child.exited).toBe(0); expect(stderr).toBe('');
  expect(Buffer.byteLength(stdout)).toBeGreaterThan(1_000_000);
  const snapshot = JSON.parse(stdout);
  expect(snapshot.history.days).toHaveLength(4400);
  const view = historyView(snapshot, 'all', '2018-01-01', '2026-10-17')!;
  expect(view.days).toHaveLength(2200); expect(view.aggregate.tokens.total).toBe(52800);
  expect(view.aggregate.cost.amountUSD).toBeCloseTo(440);
  expect(await readFile(join(root, 'calls'), 'utf8')).toBe('scan\n');
}, 15_000);

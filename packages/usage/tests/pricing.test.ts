import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSnapshot } from '../src/adapter';
import { createUsageExport, serializeUsageExport } from '../src/export';
import raw from './fixtures/unified.json';

const options = { now: new Date('2026-10-17T05:00:00Z'), timeZone: 'UTC', metadata: new Map() };
const config = { version: 1 as const, updatedAt: '2026-10-17T04:00:00Z', overrides: [{ provider: 'codex' as const, model: 'gpt-6.1-sol', input: 2, output: 8, cacheRead: .5, cacheWrite: 3 }] };
const snapshot = (pricing = config) => buildSnapshot(structuredClone(raw), { ...options, pricing } as any);

test('custom rates reprice sessions, days and history with disjoint input/cache token classes', () => {
  const s = snapshot();
  const model = s.sessions.find(s => s.id === raw.session[0].period)!.models[0];
  expect(model.cost.amountUSD).toBeCloseTo((1000 * 2 + 60 * 8 + 600 * .5) / 1e6);
  expect(s.today.cost.amountUSD).toBeCloseTo(.15 + .00278);
  expect(s.month.cost.amountUSD).toBeCloseTo(.25 + .00278);
  expect(s.history!.days.find(d => d.date === '2026-10-17')!.aggregate.cost.amountUSD).toBe(s.today.cost.amountUSD);
  expect((model as any).pricing).toEqual({ source: 'custom', provider: 'codex', updatedAt: config.updatedAt, rates: { input: 2, output: 8, cacheRead: .5, cacheWrite: 3 } });
});

test('an explicit zero rate is priced zero and restore removes override metadata', () => {
  const zero = snapshot({ ...config, overrides: [{ ...config.overrides[0], input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }] });
  const m = zero.sessions.find(s => s.id === raw.session[0].period)!.models[0];
  expect(m.cost).toEqual({ amountUSD: 0, knownCostUSD: 0, status: 'estimated' });
  expect((m as any).pricing.source).toBe('custom');
  const restored = snapshot({ ...config, overrides: [] });
  expect(restored.sessions.find(s => s.id === raw.session[0].period)!.models[0].cost.amountUSD).toBe(.32);
  expect((restored.sessions[1].models[0] as any).pricing.source).toBe('ccusage');
});

test('provider-specific overrides never map aliases or another provider sharing the model name', () => {
  const report = structuredClone(raw);
  report.session.push({ ...structuredClone(report.session[0]), agent: 'claude' });
  const s = buildSnapshot(report, { ...options, providers: ['codex', 'claude'], pricing: config } as any);
  expect(s.sessions.find(s => s.provider === 'claude')!.models[0].cost.amountUSD).toBe(.32);
  const other = snapshot({ ...config, overrides: [{ ...config.overrides[0], model: 'gpt-6.1' }] });
  expect(other.sessions.find(s => s.id === raw.session[0].period)!.models[0].cost.amountUSD).toBe(.32);
});

test('fallback pricing is explicitly unavailable until a custom price establishes a basis', () => {
  const report = structuredClone(raw);
  Object.assign(report.session[0].modelBreakdowns[0], { isFallback: true });
  const s = buildSnapshot(report, options);
  const m = s.sessions.find(s => s.id === raw.session[0].period)!.models[0];
  expect(m.cost.status).toBe('unknown');
  expect((m as any).pricing.source).toBe('fallback');
  expect(s.sessions.find(s => s.id === raw.session[0].period)!.cost.knownCostUSD).toBeCloseTo(.1);
});

test('JSON and CSV export retain price origin, rates and the historical repricing basis', () => {
  const s = snapshot();
  const doc = createUsageExport(s, 'codex', '2026-10-16', '2026-10-17')!;
  const json = JSON.parse(serializeUsageExport(doc, 'json'));
  expect(json.pricing.basis).toBe('current-custom-rates');
  expect(json.aggregate.models.find((m: any) => m.name === 'gpt-6.1-sol').pricing.source).toBe('custom');
  const csv = serializeUsageExport(doc, 'csv');
  expect(csv).toContain('pricingOrigin');
  expect(csv).toContain('current-custom-rates');
  expect(csv).toContain('2026-10-17T04:00:00Z');
});

const dirs: string[] = [];
afterEach(async () => { for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true }); });
test('pricing config rejects duplicate/nonfinite/negative rows and loads an absent file as defaults', async () => {
  const api = await import('../src/pricing-store').catch(() => null);
  expect(api).not.toBeNull();
  const root = await mkdtemp(join(tmpdir(), 'usage-pricing-')); dirs.push(root);
  const file = join(root, 'pricing.json');
  expect((await api!.readPricingConfig(file)).config.overrides).toEqual([]);
  for (const overrides of [[{ ...config.overrides[0], input: -1 }], [config.overrides[0], config.overrides[0]]]) {
    await writeFile(file, JSON.stringify({ ...config, overrides }));
    await expect(api!.readPricingConfig(file)).rejects.toThrow('PRICING_CONFIG_INVALID');
  }
  await writeFile(file, '{');
  await expect(api!.readPricingConfig(file)).rejects.toThrow('PRICING_CONFIG_INVALID');
});

test('an existing service invalidates fresh snapshot cache on save and restore, and reports malformed config', async () => {
  const { createUsageService } = await import('../src/service');
  const root = await mkdtemp(join(tmpdir(), 'usage-pricing-service-')); dirs.push(root);
  const binary = join(root, 'report');
  await writeFile(binary, '#!/bin/sh\ncat <<\'REPORT\'\n' + JSON.stringify(raw) + '\nREPORT\n', { mode: 0o700 });
  const file = join(root, 'pricing.json');
  const store = createUsageService({ binary, roots: [join(root, 'empty')], cacheDir: join(root, 'cache'), timeZone: 'UTC', pricingFile: file } as any);
  const first = await store.get();
  await writeFile(file, JSON.stringify(config));
  const changed = await store.get();
  expect(changed.month.cost.amountUSD).not.toBe(first.month.cost.amountUSD);
  expect((changed as any).pricing.configurationRevision).not.toBe((first as any).pricing.configurationRevision);
  await writeFile(file, JSON.stringify({ ...config, overrides: [] }));
  const restored = await store.get();
  expect(restored.month.cost.amountUSD).toBe(first.month.cost.amountUSD);
  await writeFile(file, '{');
  const invalid = await store.get();
  expect(invalid.status).toBe('stale');
  expect(invalid.notice).toContain('đơn giá');
});

test('a price change during a scan cannot publish an apparently current snapshot with old rates', async () => {
  const { createUsageService } = await import('../src/service');
  const root = await mkdtemp(join(tmpdir(), 'usage-pricing-race-')); dirs.push(root);
  const binary = join(root, 'report');
  const started = join(root, 'started');
  await writeFile(binary, '#!/bin/sh\ntouch "' + started + '"\nsleep 0.1\ncat <<\'REPORT\'\n' + JSON.stringify(raw) + '\nREPORT\n', { mode: 0o700 });
  const file = join(root, 'pricing.json');
  const store = createUsageService({ binary, roots: [join(root, 'empty')], cacheDir: join(root, 'cache'), timeZone: 'UTC', pricingFile: file } as any);
  const pending = store.get();
  while (!(await import('node:fs')).existsSync(started)) await Bun.sleep(5);
  await writeFile(file, JSON.stringify(config));
  const interrupted = await pending;
  expect(['stale', 'error']).toContain(interrupted.status);
  expect(interrupted.notice).toContain('đơn giá');
  const next = await store.get();
  expect(next.status).toBe('ready');
  expect(next.month.cost.amountUSD).toBeCloseTo(.25278);
});

test('an unrelated override preserves recorded known costs in partially unpriced model groups', () => {
  const report = structuredClone(raw);
  Object.assign(report.session[0].modelBreakdowns[0], { missingPricing: true });
  Object.assign(report.daily[1].agents[0].modelBreakdowns[0], { missingPricing: true });
  const s = buildSnapshot(report, { ...options, pricing: { version: 1, overrides: [{ provider: 'codex', model: 'gpt-6-luna', input: 1, output: 1, cacheRead: 1, cacheWrite: 1 }] } });
  const session = s.sessions.find(s => s.id === report.session[0].period)!;
  expect(session.models[0].cost).toEqual({ amountUSD: null, knownCostUSD: .32, status: 'partial' });
  expect(session.cost.status).toBe('partial');
  expect(session.cost.knownCostUSD).toBeCloseTo(.32042);
  expect(s.today.cost.knownCostUSD).toBeCloseTo(.32048);
  expect(s.history!.days.find(d => d.date === '2026-10-17')!.aggregate.cost.knownCostUSD).toBeCloseTo(.32048);
  const doc = createUsageExport(s, 'codex', '2026-10-17', '2026-10-17')!;
  expect(doc.aggregate.cost.knownCostUSD).toBeCloseTo(.32048);
  expect(doc.aggregate.cost.status).toBe('partial');
});

test('a solely partially priced model retains known subtotal and valid history rather than becoming wholly unknown', () => {
  const report = structuredClone(raw);
  const day = report.daily[1].agents[0];
  day.modelBreakdowns = [day.modelBreakdowns[0]];
  Object.assign(day.modelBreakdowns[0], { missingPricing: true });
  day.totalCost = .32;
  const s = buildSnapshot(report, options);
  expect(s.today.cost).toEqual({ amountUSD: null, knownCostUSD: .32, status: 'partial' });
  const doc = createUsageExport(s, 'codex', '2026-10-17', '2026-10-17');
  expect(doc).not.toBeNull();
  expect(doc!.aggregate.models[0].cost.knownCostUSD).toBe(.32);
});

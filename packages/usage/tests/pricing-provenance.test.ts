import { afterEach, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runReport } from '../src/runner';
import { buildSnapshot } from '../src/adapter';
import { createUsageService } from '../src/service';

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
      input_tokens: 100, cached_input_tokens: 50, output_tokens: 10, reasoning_output_tokens: 5, total_tokens: 110,
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
  expect(fallback.modelBreakdowns[0].isFallback).toBe(true);
  expect(genuine.modelBreakdowns[0].isFallback).toBe(false);
  expect(raw.daily[0].agents.find((a: any) => a.agent === 'codex').modelBreakdowns[0].isFallback).toBe(true);
  const s = buildSnapshot(raw, options);
  expect(s.sessions.find(s => s.id.includes(ids[0]))!.models[0].pricing?.source).toBe('fallback');
  expect(s.sessions.find(s => s.id.includes(ids[0]))!.cost.status).toBe('unknown');
  expect(s.sessions.find(s => s.id.includes(ids[1]))!.cost.status).toBe('estimated');
  expect(s.today.cost.status).toBe('unknown');
  expect(s.today.cost.knownCostUSD).toBe(0);
  const custom = buildSnapshot(raw, { ...options, pricing: { version: 1, overrides: [{ provider: 'codex', model: 'gpt-5', input: 1, output: 1, cacheRead: 1, cacheWrite: 1 }] } });
  expect(custom.today.cost.amountUSD).toBeCloseTo(.00022);
});

test('legacy nonempty Codex reports produce a clear localized runtime-update error, while empty sources remain valid', async () => {
  const unsupported = { agent: 'codex', period: 'old-session', inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0,
    totalTokens: 2, totalCost: .1, modelBreakdowns: [{ modelName: 'known-model', inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0, cost: .1 }] };
  const raw = { session: [unsupported], daily: [], totals: {} };
  expect(() => buildSnapshot(raw, options)).toThrow('REPORT_PRICING_UNSUPPORTED');
  expect(buildSnapshot({ session: [], daily: [], totals: {} }, options).status).toBe('empty');
  const root = await mkdtemp(join(tmpdir(), 'ns16-unsupported-')); dirs.push(root);
  const binary = join(root, 'old-reader');
  await writeFile(binary, '#!/bin/sh\ncat <<\'REPORT\'\n' + JSON.stringify(raw) + '\nREPORT\n', { mode: 0o700 });
  const s = await createUsageService({ binary, roots: [join(root, 'logs')], cacheDir: join(root, 'cache'), timeZone: 'UTC', pricingFile: join(root, 'missing.json') }).get();
  expect(s.status).toBe('error');
  expect(s.notice).toContain('nguồn giá');
  expect(s.notice).toContain('Cập nhật');
});

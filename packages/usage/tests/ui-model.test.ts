import * as presentation from '../ui/model';
import moneyFixtures from './fixtures/money-presentation.json';
import type { Cost } from '../src/types';
import { expect, test } from 'bun:test';
import { costText, decodeResult, providerView, hasClaudeSource } from '../ui/model';
import { mixedDashboard } from './fixtures/mixed';
import { buildSnapshot } from '../src/adapter';
import raw from './fixtures/unified.json';

// Both runtimes consume these literal expectations, including half-cent boundaries.
for (const row of moneyFixtures) test(`money ${row.name} keeps amount and status in every language`, () => {
  for (const language of ['vi', 'en', 'zh-CN'] as const) {
    expect(costText(row.cost as Cost, language)).toBe(row.expected);
  }
});
test('widget reads hidden result metadata and rejects unsupported snapshot versions', () => {
  const snapshot = buildSnapshot(raw, { now: new Date(), timeZone: 'UTC', metadata: new Map() });
  const value = { snapshot, selectedSession: snapshot.sessions[0], requestedSessionId: null };
  expect(decodeResult({ _meta: { usage: value } })).toEqual(value);
  expect(decodeResult({ mcp_tool_result: { _meta: { usage: value } } })).toEqual(value);
  expect(decodeResult({ _meta: { usage: { ...value, snapshot: { ...snapshot, schemaVersion: 99 } } } })).toBeNull();
});

test('provider scopes use daily breakdowns, not lifetime sessions or combined totals', () => {
  const { snapshot } = mixedDashboard();
  const claude = providerView(snapshot, 'claude');
  expect(claude.sessions).toHaveLength(1);
  expect(claude.sessions[0].cost.amountUSD).toBe(4);
  expect(claude.today?.cost.amountUSD).toBe(1.25);
  expect(claude.month?.cost.amountUSD).toBe(3.75);
  expect(claude.chart.at(-1)?.cost.amountUSD).toBe(1.25);
  expect(claude.today?.models.map(m => m.name)).toEqual(['claude-fixture']);
  expect(providerView(snapshot, 'codex').today?.cost.amountUSD).toBe(0.47);
  expect(providerView(snapshot, 'all').today?.cost.amountUSD).toBeCloseTo(1.72);
  expect(providerView(snapshot, 'all').sessions).toHaveLength(3);
});

test('schema v1 without provider fields remains Codex-only; missing mixed breakdowns never leak totals', () => {
  const legacy = buildSnapshot(raw, { now: new Date('2026-10-17T05:00:00Z'), timeZone: 'UTC', metadata: new Map() });
  delete legacy.providerBreakdowns;
  legacy.sessions.forEach(s => { delete s.provider; });
  expect(hasClaudeSource(legacy)).toBe(false);
  expect(providerView(legacy, 'codex').today?.cost.amountUSD).toBe(0.47);
  expect(providerView(legacy, 'codex').sessions).toHaveLength(2);
  expect(providerView(legacy, 'claude').today).toBeNull();
  expect(providerView(legacy, 'claude').chart).toEqual([]);
  const { snapshot } = mixedDashboard();
  delete snapshot.providerBreakdowns;
  expect(hasClaudeSource(snapshot)).toBe(true);
  expect(providerView(snapshot, 'codex').today).toBeNull();
  expect(providerView(snapshot, 'claude').today).toBeNull();
});

test('configured empty Claude sources stay available and retain pricing statuses without mutation', () => {
  const { snapshot } = mixedDashboard();
  snapshot.sessions = snapshot.sessions.filter(s => s.provider !== 'claude');
  expect(hasClaudeSource(snapshot)).toBe(true);
  const breakdown = snapshot.providerBreakdowns!.find(p => p.provider === 'claude')!;
  breakdown.today.cost = { amountUSD: null, knownCostUSD: 1.25, status: 'partial' };
  breakdown.today.models.push({ name: 'claude-unpriced', tokens: { input: 10, output: 0, cacheRead: 0, cacheWrite: 0, total: 10 },
    cost: { amountUSD: null, knownCostUSD: 0, status: 'unknown' } });
  breakdown.today.tokens.input += 10; breakdown.today.tokens.total += 10;
  const before = JSON.stringify(snapshot);
  const view = providerView(snapshot, 'claude');
  expect(view.today?.cost).toEqual({ amountUSD: null, knownCostUSD: 1.25, status: 'partial' });
  expect(view.today?.models.at(-1)?.cost.status).toBe('unknown');
  expect(view.sessions).toHaveLength(0);
  expect(JSON.stringify(snapshot)).toBe(before);
});

test('money accessibility descriptions preserve localized missing-price states', () => {
  expect(typeof presentation.costLabel).toBe('function');
  const { costLabel } = presentation;
  const partial = { amountUSD: null, knownCostUSD: 0, status: 'partial' as const };
  const unknown = { amountUSD: null, knownCostUSD: 0, status: 'unknown' as const };
  expect(costLabel(partial, 'vi')).toBe('≥$0.00 · Chưa đầy đủ');
  expect(costLabel(partial, 'en')).toBe('≥$0.00 · Incomplete');
  expect(costLabel(partial, 'zh-CN')).toBe('≥$0.00 · 不完整');
  expect(costLabel(unknown, 'vi')).toBe('— · Chưa xác định');
  expect(costLabel(unknown, 'en')).toBe('— · Unknown');
  expect(costLabel(unknown, 'zh-CN')).toBe('— · 未知');
});

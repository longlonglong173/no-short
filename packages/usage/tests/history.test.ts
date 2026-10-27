import { describe, expect, test } from 'bun:test';
import { decodeHistory, historyRange, historyView } from '../src/history';
import type { DateRange, HistoryPreset } from '../src/history';
import { emptyAggregate } from '../src/adapter';
import type { UsageSnapshot } from '../src/types';
import fixture from './fixtures/history-snapshot.json';

const snapshot = () => structuredClone(fixture) as UsageSnapshot;

describe('calendar ranges', () => {
  test.each([
    ['7d', '2024-03-11T03:30:00Z', 'America/New_York', '2024-03-04', '2024-03-10'],
    ['7d', '2024-11-04T04:30:00Z', 'America/New_York', '2024-10-28', '2024-11-03'],
    ['30d', '2024-03-01T00:00:00Z', 'UTC', '2024-02-01', '2024-03-01'],
    ['month', '2026-01-01T02:00:00Z', 'America/Los_Angeles', '2025-12-01', '2025-12-31'],
    ['previous', '2024-03-15T12:00:00Z', 'UTC', '2024-02-01', '2024-02-29'],
    ['previous', '2025-03-15T12:00:00Z', 'UTC', '2025-02-01', '2025-02-28'],
    ['previous', '2026-01-15T12:00:00Z', 'UTC', '2025-12-01', '2025-12-31'],
    ['month', '2026-09-30T12:00:00Z', 'Pacific/Kiritimati', '2026-10-01', '2026-10-01'],
    ['7d', '0099-01-10T12:00:00Z', 'UTC', '0099-01-04', '0099-01-10'],
  ])('%s in %s %s follows calendar days', (preset, now, timeZone, start, end) => {
    expect(historyRange(preset as HistoryPreset, new Date(now), timeZone)).toEqual({ start, end });
  });
  test.each([
    { start: '2026-02-29', end: '2026-03-01' }, { start: '2024-02-30', end: '2024-03-01' },
    { start: '0000-01-01', end: '2026-10-01' }, { start: '2026-1-01', end: '2026-10-01' },
    { start: '2026-10-02', end: '2026-10-01' }, { start: '2026-10-01', end: '2026-10-02' },
    { start: '2026-10-01\n', end: '2026-10-01' },
  ])('rejects invalid custom range %j', custom => {
    expect(historyRange('custom', new Date('2026-10-01T12:00:00Z'), 'UTC', custom)).toBeNull();
  });
  test('custom endpoints are inclusive, accept leap dates, and reject missing parameters and bad clocks/zones', () => {
    const range: DateRange = { start: '2024-02-29', end: '2026-10-01' };
    expect(historyRange('custom', new Date(fixture.generatedAt), 'UTC', range)).toEqual(range);
    expect(historyRange('custom', new Date(fixture.generatedAt), 'UTC')).toBeNull();
    expect(historyRange('7d', new Date(NaN), 'UTC')).toBeNull();
    expect(historyRange('7d', new Date(), 'not/a-zone')).toBeNull();
    expect(historyRange('7d', new Date('0001-01-01T12:00:00Z'), 'UTC')).toBeNull();
  });
});

describe('independent optional history decoder', () => {
  test('accepts the shared schema1 fixture and legitimate empty configured sources', () => {
    expect(decodeHistory(fixture.history)).toEqual(snapshot().history!);
    expect(decodeHistory({ version: 1, providers: ['claude'], days: [] })).toEqual({ version: 1, providers: ['claude'], days: [] });
  });
  test.each([
    undefined, null, {}, { ...fixture.history, version: 2 }, { ...fixture.history, providers: ['other'] },
    { ...fixture.history, providers: ['codex', 'codex'] }, { ...fixture.history, providers: ['codex'] },
    { ...fixture.history, days: [...fixture.history.days, fixture.history.days[0]] },
    { ...fixture.history, days: [{ ...fixture.history.days[0], date: '2026-02-29' }] },
  ])('rejects malformed history independently', value => expect(decodeHistory(value)).toBeNull());
  test.each([-1, Infinity, NaN, '10', null])('rejects invalid token/cost numbers %s', value => {
    for (const path of ['tokens', 'modelTokens', 'amount', 'known']) {
      const history = structuredClone(fixture.history);
      const aggregate = history.days[0].aggregate;
      if (path === 'tokens') Object.assign(aggregate.tokens, { total: value });
      if (path === 'modelTokens') Object.assign(aggregate.models[0].tokens, { input: value });
      if (path === 'amount') Object.assign(aggregate.cost, { amountUSD: value });
      if (path === 'known') Object.assign(aggregate.cost, { knownCostUSD: value });
      expect(decodeHistory(history)).toBeNull();
    }
  });
  test.each([
    { amountUSD: null, knownCostUSD: 0, status: 'estimated' },
    { amountUSD: 0, knownCostUSD: 0, status: 'unknown' },
    { amountUSD: 1, knownCostUSD: 2, status: 'estimated' },
    { amountUSD: null, knownCostUSD: 1, status: 'unknown' },
    { amountUSD: null, knownCostUSD: 0, status: 'invalid' },
  ])('rejects inconsistent pricing %j', cost => {
    const history = structuredClone(fixture.history); Object.assign(history.days[0].aggregate, { cost });
    expect(decodeHistory(history)).toBeNull();
  });
});

describe('history projection', () => {
  test('shared hand-counted provider/date totals come only from daily aggregates', () => {
    const all = historyView(snapshot(), 'all', '2026-09-30', '2026-10-01')!;
    expect(all.aggregate.tokens).toEqual({ input: 250, output: 55, cacheRead: 60, cacheWrite: 10, total: 375 });
    expect(all.aggregate.cost).toEqual({ amountUSD: 7, knownCostUSD: 7, status: 'estimated' });
    expect(all.days.map(d => [d.date, d.aggregate.tokens.total, d.aggregate.cost.amountUSD])).toEqual([
      ['2026-09-30', 225, 3.25], ['2026-10-01', 150, 3.75],
    ]);
    expect(all.aggregate.models.map(m => [m.name, m.tokens.total, m.cost.amountUSD])).toEqual([
      ['claude-fixture', 165, 5], ['gpt-fixture', 210, 2],
    ]);
    expect(historyView(snapshot(), 'codex', '2026-10-01', '2026-10-01')?.aggregate.tokens.total).toBe(60);
    expect(historyView(snapshot(), 'claude', '2026-09-30', '2026-09-30')?.aggregate.cost.amountUSD).toBe(2);
    expect(snapshot().sessions[0].tokens.total).toBe(210);
  });
  test('missing history/provider and corrupt optional data stay unavailable without destroying the dashboard', () => {
    const legacy = snapshot(); delete legacy.history;
    expect(historyView(legacy, 'all', '2026-09-30', '2026-10-01')).toBeNull();
    const value = snapshot(); value.history!.providers = ['codex'];
    value.history!.days = value.history!.days.filter(d => d.provider === 'codex');
    expect(historyView(value, 'claude', '2026-09-30', '2026-10-01')).toBeNull();
    value.history!.days[0].date = '2026-02-30';
    expect(historyView(value, 'all', '2026-09-30', '2026-10-01')).toBeNull();
    expect(value.today.tokens.total).toBe(150);
  });
  test('successful empty ranges/sources are empty and do not allocate arrays across arbitrary calendar spans', () => {
    const value = snapshot(); value.history = { version: 1, providers: ['codex', 'claude'], days: [] };
    expect(historyView(value, 'claude', '0001-01-01', '9999-12-31')).toEqual({ aggregate: emptyAggregate(), days: [] });
    expect(historyView(snapshot(), 'all', '0001-01-01', '9999-12-31')?.days).toHaveLength(2);
    expect(historyView(snapshot(), 'all', '2025-01-01', '2025-01-02')).toEqual({ aggregate: emptyAggregate(), days: [] });
    expect(historyView(snapshot(), 'all', '2026-02-29', '2026-10-01')).toBeNull();
    expect(historyView(snapshot(), 'all', '2026-10-02', '2026-10-01')).toBeNull();
  });
  test('unknown, partial and priced-zero status uses pricing evidence, not a positive known subtotal', () => {
    const value = snapshot(); const rows = value.history!.days;
    rows[0].aggregate.cost = { amountUSD: 0, knownCostUSD: 0, status: 'estimated' };
    rows[1].aggregate.cost = { amountUSD: null, knownCostUSD: 0, status: 'unknown' };
    rows[2].aggregate.cost = { amountUSD: null, knownCostUSD: 0, status: 'partial' };
    expect(historyView(value, 'all', '2026-09-30', '2026-09-30')?.aggregate.cost.status).toBe('partial');
    expect(historyView(value, 'codex', '2026-10-01', '2026-10-01')?.aggregate.cost.status).toBe('partial');
    expect(historyView(value, 'codex', '2026-09-30', '2026-09-30')?.aggregate.cost.status).toBe('estimated');
    expect(historyView(value, 'claude', '2026-09-30', '2026-09-30')?.aggregate.cost.status).toBe('unknown');
  });
  test('model cost ties sort by name and projections never mutate the snapshot', () => {
    const value = snapshot();
    for (const row of value.history!.days) for (const model of row.aggregate.models) model.cost = { amountUSD: 0, knownCostUSD: 0, status: 'estimated' };
    const original = structuredClone(value);
    expect(historyView(value, 'all', '2026-09-30', '2026-10-01')?.aggregate.models.map(m => m.name)).toEqual(['claude-fixture', 'gpt-fixture']);
    expect(value).toEqual(original);
  });
});

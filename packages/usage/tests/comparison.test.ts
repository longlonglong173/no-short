import { expect, test } from 'bun:test';
import * as history from '../src/history';
import fixture from './fixtures/comparison-snapshot.json';
import type { UsageSnapshot } from '../src/types';
const snapshot = () => structuredClone(fixture) as UsageSnapshot;
const now = new Date(fixture.generatedAt);
const compareAtFixture: typeof history.compareHistory = (s, provider, range) => history.compareHistory(s, provider, range, now);
const range = { start: '2024-03-01', end: '2024-03-02' };
test('comparison uses the preceding equal calendar range across leap day and never changes source', () => {
  const compare = compareAtFixture;
  expect(typeof compare).toBe('function');
  const s = snapshot(), original = structuredClone(s);
  const value = compare(s, 'all', range)!;
  expect(value.previousRange).toEqual({ start: '2024-02-28', end: '2024-02-29' });
  expect(value.summary.tokens.absolute).toBe(160);
  expect(value.summary.tokens.percent).toBeCloseTo(133.333333);
  expect(value.summary.cost).toEqual({ absolute: 2, percent: 100 });
  expect(value.summary.cache.current).toBeCloseTo(100 / 240);
  expect(value.summary.cache.previous).toBe(.6);
  expect(value.summary.cache.percentagePoints).toBeCloseTo(-18.333333);
  expect(value.providers.map(r => r.name)).toEqual(['codex', 'claude']);
  expect(value.models.map(r => r.name)).toEqual(['codex / model-a', 'claude / model-b']);
  expect(value.models[1].cost).toEqual({ absolute: 1, percent: null });
  expect(s).toEqual(original);
});
test('provider filter, absent models and empty periods preserve measured zero vs undefined percentages', () => {
  const compare = compareAtFixture; expect(typeof compare).toBe('function');
  const value = compare(snapshot(), 'claude', range)!;
  expect(value.summary.tokens).toEqual({ absolute: 50, percent: null });
  expect(value.summary.cost).toEqual({ absolute: 1, percent: null });
  expect(value.summary.cache.previous).toBeNull();
  expect(value.summary.cache.percentagePoints).toBeNull();
  expect(value.providers).toHaveLength(1);
  const empty = compare(snapshot(), 'all', { start: '2024-01-01', end: '2024-01-07' })!;
  expect(empty.summary.tokens).toEqual({ absolute: 0, percent: null });
  expect(empty.summary.cost).toEqual({ absolute: 0, percent: null });
});
test('unpriced or stale data never produces an exact cost increase', () => {
  const compare = compareAtFixture; expect(typeof compare).toBe('function');
  for (const status of ['unknown', 'partial'] as const) {
    const value = snapshot(), a = value.history!.days[0].aggregate;
    a.cost = { amountUSD: null, knownCostUSD: 0, status }; a.models[0].cost = a.cost;
    const result = compare(value, 'all', range)!;
    expect(result.summary.cost).toBeNull();
    expect(result.models.find(r => r.name === 'codex / model-a')!.cost).toBeNull();
    expect(result.summary.tokens.absolute).toBe(160);
  }
  const stale = snapshot(); stale.status = 'stale';
  expect(compare(stale, 'all', range)!.summary.cost).toBeNull();
});
test('invalid, unsupported and minimum calendar ranges stay unavailable', () => {
  const compare = compareAtFixture; expect(typeof compare).toBe('function');
  expect(compare(snapshot(), 'all', { start: '2024-02-30', end: '2024-03-02' })).toBeNull();
  expect(compare(snapshot(), 'all', { start: '2024-03-02', end: '2024-03-01' })).toBeNull();
  expect(compare(snapshot(), 'all', { start: '0001-01-01', end: '0001-01-01' })).toBeNull();
  const s = snapshot(); delete s.history; expect(compare(s, 'all', range)).toBeNull();
});

test('ready comparison freshness matches native age, future-clock and local-day boundaries', () => {
  const compare = history.compareHistory;
  const s = snapshot();
  expect(compare(s, 'all', range, new Date('2024-03-02T12:00:45.000Z'))!.summary.cost?.absolute).toBe(2);
  for (const timestamp of ['2024-03-02T12:00:45.001Z', '2024-03-02T11:58:59.999Z']) {
    const value = compare(s, 'all', range, new Date(timestamp))!;
    expect(value.summary.cost).toBeNull();
    expect(value.providers.every(row => row.cost === null)).toBe(true);
    expect(value.models.every(row => row.cost === null)).toBe(true);
    expect(value.summary.tokens.absolute).toBe(160);
    expect(value.summary.cache.percentagePoints).toBeCloseTo(-18.333333);
  }
  expect(compare(s, 'all', range, new Date('2024-03-02T11:59:00.000Z'))!.summary.cost?.absolute).toBe(2);
  s.generatedAt = '2024-03-02T23:59:50Z';
  const afterMidnight = new Date('2024-03-03T00:00:05Z');
  expect(compare(s, 'all', range, afterMidnight)!.summary.cost).toBeNull();
  s.timeZone = 'Pacific/Honolulu';
  expect(compare(s, 'all', range, afterMidnight)!.summary.cost?.absolute).toBe(2);
});

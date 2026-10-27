import type { Aggregate, DashboardResult } from '../../src/types';
// Presentation-only fixture, independent of NS-21 aggregation acceptance.
export function moneyDashboard(known = 12.34): DashboardResult {
  const aggregate = (amount: number): Aggregate => {
    const tokens = { input: 10, output: 0, cacheRead: 0, cacheWrite: 0, total: 10 };
    return { tokens: { ...tokens, input: 20, total: 20 }, cost: { amountUSD: null, knownCostUSD: amount, status: 'partial' }, models: [
      { name: 'priced-model', tokens, cost: { amountUSD: null, knownCostUSD: amount, status: 'partial' }, pricing: { source: 'mixed' } },
      { name: 'missing-model', tokens, cost: { amountUSD: null, knownCostUSD: 0, status: 'unknown' }, pricing: { source: 'unpriced' } },
    ] };
  };
  const rows = [
    { date: '2026-10-27', provider: 'codex' as const, aggregate: aggregate(known), sessionId: 'money-current' },
    { date: '2026-10-26', provider: 'codex' as const, aggregate: aggregate(4.56), sessionId: 'money-previous' },
  ];
  return { selectedSession: null, requestedSessionId: null, snapshot: {
    schemaVersion: 1, source: 'ccusage', ccusageVersion: '20.0.34', generatedAt: '2026-10-27T12:00:00Z', timeZone: 'UTC', status: 'ready', pricingSource: 'cached',
    today: aggregate(known), month: aggregate(known + 4.56), chart: rows.map(r => ({ date: r.date, cost: r.aggregate.cost })).reverse(),
    sessions: rows.map(r => ({ id: r.sessionId, sessionKey: r.sessionId, title: r.sessionId, kind: 'main', provider: r.provider, lastActivity: r.date + 'T12:00:00Z', ...r.aggregate,
      grouping: { project: { id: 'a'.repeat(64), label: 'Money project', source: 'recorded-directory', confidence: 'recorded' } } })),
    history: { version: 1, providers: ['codex'], days: rows.map(({ sessionId, ...r }) => r), sessionDays: rows },
  } };
}

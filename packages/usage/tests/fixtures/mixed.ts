import { buildSnapshot } from '../../src/adapter';
import type { DashboardResult } from '../../src/types';
import raw from './unified.json' with { type: 'json' };

export function mixedDashboard(): DashboardResult {
  const report = structuredClone(raw);
  const claude = { ...structuredClone(report.session[0]), agent: 'claude', totalCost: 4,
    modelBreakdowns: [{ modelName: 'claude-fixture', inputTokens: 1200, outputTokens: 80,
      cacheReadTokens: 800, cacheCreationTokens: 0, cost: 4 }] };
  report.session.push(claude);
  for (const [index, amount] of [2.5, 1.25].entries()) {
    report.daily[index].agents.push({ ...structuredClone(claude), totalCost: amount,
      modelBreakdowns: [{ ...claude.modelBreakdowns[0], cost: amount }] });
  }
  return { snapshot: buildSnapshot(report, { now: new Date('2026-10-17T05:00:00Z'), timeZone: 'UTC',
    providers: ['codex', 'claude'], metadata: new Map([
      [raw.session[1].period, { title: 'Codex fixture', kind: 'main' }],
      [`claude:${raw.session[0].period}`, { title: 'Claude fixture', kind: 'main' }],
    ]) }), selectedSession: null, requestedSessionId: null };
}

import { expect, test } from 'bun:test';
import { buildSnapshot, sumAggregates } from '../src/adapter';
import { decodeHistory, historyView, sessionUsageForRange } from '../src/history';
import { createUsageExport, serializeUsageExport } from '../src/export';
import fixture from './fixtures/session-days-snapshot.json' with { type: 'json' };
import type { UsageSnapshot } from '../src/types';
const snapshot = () => structuredClone(fixture) as UsageSnapshot;
function withLedger() {
  const s = snapshot();
  const day = s.history!.days[0]!;
  s.history!.sessionDays = [{ ...structuredClone(day), sessionId: s.sessions[0]!.id }];
  // The rest is explicitly assigned to the same session on their actual day, independent of lastActivity.
  s.history!.sessionDays.push(...s.history!.days.slice(1).map(d => ({ ...structuredClone(d), sessionId: s.sessions.find(x => (x.provider ?? 'codex') === d.provider)?.id ?? s.sessions[0]!.id })));
  return s;
}
test('exact ledger range ignores lifetime/lastActivity, retains partial pricing, supports empty and legacy', () => {
  const s = withLedger(), day = s.history!.days[0]!;
  s.sessions[0]!.lastActivity = '2099-01-01T00:00:00Z';
  const result = sessionUsageForRange(s, day.provider, day.date, day.date)!;
  expect(result.sessions[0]!.aggregate).toEqual(day.aggregate);
  expect(result.aggregate).toEqual(historyView(s, day.provider, day.date, day.date)!.aggregate);
  expect(result.reconciled).toBe(true);
  expect(sessionUsageForRange(s, 'all', '2000-01-01', '2000-01-01')!.sessions).toEqual([]);
  delete s.history!.sessionDays;
  expect(sessionUsageForRange(s, 'all', day.date, day.date)).toBeNull();
});
test('malformed ledger is isolated from daily history and duplicates/mismatches fail closed', () => {
  const s = withLedger(), day = s.history!.days[0]!;
  (s.history as any).sessionDays = [{ date: 'bad' }];
  expect(decodeHistory(s.history)?.days).toEqual(s.history!.days);
  expect(sessionUsageForRange(s, 'all', day.date, day.date)).toBeNull();
  const good = withLedger();
  good.history!.sessionDays!.push(good.history!.sessionDays![0]!);
  expect(sessionUsageForRange(good, 'all', day.date, day.date)).toBeNull();
  const wrong = withLedger(); wrong.history!.sessionDays![0]!.aggregate = sumAggregates([]);
  expect(sessionUsageForRange(wrong, 'all', day.date, day.date)?.reconciled).toBe(false);
});
test('range merges session rows and provider scopes, default export omits ledger identifiers', () => {
  const s = withLedger();
  const first = s.history!.days[0]!.date, last = s.history!.days.at(-1)!.date;
  const result = sessionUsageForRange(s, 'all', first, last)!;
  expect(result.aggregate.tokens.total).toBe(historyView(s, 'all', first, last)!.aggregate.tokens.total);
  const doc = createUsageExport(s, 'all', first, last)!;
  for (const format of ['json', 'csv'] as const) {
    const out = serializeUsageExport(doc, format);
    expect(out).not.toContain('sessionDays'); expect(out).not.toContain(s.sessions[0]!.id);
  }
});

test('partial and fallback mixed pricing stay explicit; custom override restores distributive day attribution', () => {
  const t={inputTokens:100,outputTokens:10,cacheReadTokens:0,cacheCreationTokens:0,totalTokens:110};
  const row=(period:string,fallback:boolean,cost:number)=>({agent:'codex',period,...t,totalCost:cost,modelBreakdowns:[{...t,modelName:'gpt-5',cost,isFallback:fallback}]});
  const a=row('a',true,.2),b=row('b',false,.3);
  const raw={session:[a,b],daily:[{...row('2026-10-01',true,.5),inputTokens:200,outputTokens:20,totalTokens:220,
    modelBreakdowns:[{...t,inputTokens:200,outputTokens:20,totalTokens:220,modelName:'gpt-5',cost:.5,isFallback:true}]}],
    sessionDays:[{...a,date:'2026-10-01'},{...b,date:'2026-10-01'}],totals:{}};
  const opts={now:new Date('2026-10-01T12:00:00Z'),timeZone:'UTC',metadata:new Map()};
  const mixed=sessionUsageForRange(buildSnapshot(raw,opts),'all','2026-10-01','2026-10-01')!;
  expect(mixed.reconciled).toBe(false); expect(mixed.reconciliationIssue).toBe('pricing');
  expect(mixed.sessions).toHaveLength(2); expect(mixed.aggregate.cost.status).toBe('partial');
  expect(mixed.aggregate.cost.knownCostUSD).toBe(.3);
  const custom=sessionUsageForRange(buildSnapshot(raw,{...opts,pricing:{version:1,overrides:[{provider:'codex',model:'gpt-5',input:1,output:2,cacheRead:0,cacheWrite:0}]}}),'all','2026-10-01','2026-10-01')!;
  expect(custom.reconciled).toBe(true); expect(custom.aggregate.cost.amountUSD).toBeCloseTo(.00024);
  expect(custom.sessions.every(s=>s.aggregate.models[0]!.pricing?.source==='custom')).toBe(true);
  const partial=structuredClone(raw); partial.session= [b]; partial.daily=[{...b,period:'2026-10-01'}]; partial.sessionDays=[{...b,date:'2026-10-01'}];
  for(const r of [...partial.session,...partial.daily,...partial.sessionDays]) (r.modelBreakdowns[0] as any).missingPricing=true;
  const known=sessionUsageForRange(buildSnapshot(partial,opts),'all','2026-10-01','2026-10-01')!;
  expect(known.reconciled).toBe(true); expect(known.aggregate.cost.status).toBe('partial'); expect(known.aggregate.cost.knownCostUSD).toBe(.3);
});

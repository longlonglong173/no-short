import { expect, test } from 'bun:test';
import { groupSessions } from '../src/grouping';
import { sumAggregates } from '../src/adapter';
import type { Aggregate, UsageSnapshot, SessionUsage } from '../src/types';
const value = (n: number, unknown = false): Aggregate => ({ tokens: { input: n, output: 0, cacheRead: 0, cacheWrite: 0, total: n },
  cost: { amountUSD: unknown ? null : n, knownCostUSD: unknown ? 0 : n, status: unknown ? 'unknown' : 'estimated' },
  models: [{ name: 'm', tokens: { input: n, output: 0, cacheRead: 0, cacheWrite: 0, total: n }, cost: { amountUSD: unknown ? null : n, knownCostUSD: unknown ? 0 : n, status: unknown ? 'unknown' : 'estimated' } }] });
const project = { id: 'a'.repeat(64), label: 'App', source: 'recorded-directory' as const, confidence: 'recorded' as const };
function session(id: string, parent?: string, provider: 'codex'|'claude' = 'codex'): SessionUsage {
  return { ...value(999), id: provider === 'claude' ? 'claude:' + id : 'rollout-' + id, sessionKey: id, title: id, provider, kind: parent ? 'subagent' : 'main', lastActivity: '2026-10-27T00:00:00Z',
    grouping: { project, ...(parent ? { parent: { sessionKey: parent, source: 'codex-session-meta' } } : {}) } };
}
function snapshot(sessions: SessionUsage[]): UsageSnapshot {
  const sessionDays = sessions.flatMap(s => [{ date: '2026-10-26', sessionId: s.id, provider: s.provider!, aggregate: value(2) }, { date: '2026-10-27', sessionId: s.id, provider: s.provider!, aggregate: value(3, s.sessionKey === 'grandchild') }]);
  return { schemaVersion: 1, source: 'ccusage', ccusageVersion: '20.0.34', timeZone: 'UTC', generatedAt: '2026-10-27T00:00:00Z', status: 'ready', pricingSource: 'cached', sessions,
    today: value(0), month: value(0), chart: [], history: { version: 1, providers: ['codex', 'claude'], days: ['2026-10-26', '2026-10-27'].flatMap(date => ['codex', 'claude'].map(provider => ({ date, provider, aggregate: sum(sessionDays.filter(s => s.date === date && s.provider === provider).map(s => s.aggregate)) }))), sessionDays } } as UsageSnapshot;
}
function sum(values: Aggregate[]): Aggregate { const n = values.reduce((a,b) => a + b.tokens.total,0), known = values.reduce((a,b)=>a+b.cost.knownCostUSD,0), unknown = values.some(v=>v.cost.status==='unknown'); const v=value(n); v.cost={amountUSD:unknown?null:known,knownCostUSD:known,status:unknown?(known?'partial':'unknown'):'estimated'}; v.models[0].cost=v.cost;return v; }
// Exercise the graph against the exact canonical ledger contract independently of NS18's reader work.
function groupFixtureLedger(source:UsageSnapshot,provider:'all'|'codex'|'claude',start:string,end:string) {
 const rows=(source.history as any)?.sessionDays?.filter((r:any)=>r.date>=start&&r.date<=end&&(provider==='all'||r.provider===provider));
 if(!rows)return null;
 const by=new Map<string,any[]>(); for(const r of rows) {const key=r.provider+'|'+r.sessionId;by.set(key,[...(by.get(key)??[]),r]);}
 const sessions=[...by.values()].map(rs=>({sessionId:rs[0].sessionId,provider:rs[0].provider,aggregate:sumAggregates(rs.map(r=>r.aggregate))}));
 const aggregate=sumAggregates(sessions.map(r=>r.aggregate));return groupSessions(source.sessions,{sessions,aggregate,reconciled:true},aggregate);
}
test('project and multilevel work totals use exact date ledger, preserving unknown prices and direct breakdown', () => {
  const source = snapshot([session('root'), session('child', 'root'), session('grandchild', 'child'), session('other', undefined, 'claude')]);
  const result = groupFixtureLedger(source, 'codex', '2026-10-27', '2026-10-27')!;
  expect(result.projects).toHaveLength(1); expect(result.projects[0].aggregate.tokens.total).toBe(9);
  expect(result.works).toHaveLength(1); expect(result.works[0].aggregate.tokens.total).toBe(9);
  expect(result.works[0].aggregate.cost.status).toBe('partial');
  expect(result.works[0].sessions.map(s=>[s.depth,s.aggregate.tokens.total])).toEqual([[0,3],[1,3],[2,3]]);
  expect(result.reconciled).toBe(true);
});
test('missing metadata remains unknown, no cross-provider parent joins, absent ledger is unavailable', () => {
  const a = session('a'), b = session('b', 'a', 'claude'); delete a.grouping;
  const source = snapshot([a,b]); const result = groupFixtureLedger(source,'all','2026-10-26','2026-10-27')!;
  expect(result.projects.find(p=>p.id==='unknown')?.aggregate.tokens.total).toBe(5);
  expect(result.works).toHaveLength(2); expect(result.works.find(w=>w.id===b.id)?.issues).toContain('missing-parent');
  delete source.history!.sessionDays;
  expect(groupFixtureLedger(source,'all','2026-10-26','2026-10-27')).toBeNull();
});
test('cycles, self, orphan and conflicting metadata never silently roll up or recurse', () => {
  const a=session('a','b'), b=session('b','a'), c=session('c','c'), d=session('d','missing'), e=session('e','d'), f=session('f');
  f.grouping={issues:['conflicting-parent','conflicting-project']};
  const result=groupFixtureLedger(snapshot([a,b,c,d,e,f]),'codex','2026-10-27','2026-10-27')!;
  expect(result.works).toHaveLength(6); expect(result.works.reduce((a,b)=>a+b.aggregate.tokens.total,0)).toBe(18);
  expect(result.works.every(w=>w.issues.length>0)).toBe(true);
});
test('metadata-only ancestor with zero in-range usage retains exact descendant totals', () => {
  const source=snapshot([session('root'),session('child','root')]);
  source.history!.sessionDays=source.history!.sessionDays!.filter(s=>s.sessionId!=='rollout-root');
  source.history!.days=source.history!.days.map(d=>({...d,aggregate:d.provider==='codex'?value(d.date==='2026-10-26'?2:3):sum([])}));
  const result=groupFixtureLedger(source,'codex','2026-10-27','2026-10-27')!;
  expect(result.works).toHaveLength(1);expect(result.works[0].sessions.map(s=>s.aggregate.tokens.total)).toEqual([0,3]);
});
test('custom model rates and uncertainty remain attached to group sums and duplicate canonical rows count once',()=>{
 const s=session('root'),aggregate=value(4),rates={input:1,output:2,cacheRead:0,cacheWrite:0};
 aggregate.models[0].pricing={source:'custom',provider:'codex',rates,updatedAt:'2026-10-27T00:00:00Z'};
 const row={sessionId:s.id,provider:'codex' as const,aggregate};
 const result=groupSessions([s],{sessions:[row,row],aggregate,reconciled:false,reconciliationIssue:'pricing'},value(4,true));
 expect(result.projects[0].aggregate.tokens.total).toBe(4);expect(result.works[0].aggregate.tokens.total).toBe(4);
 expect(result.projects[0].aggregate.models[0].pricing?.rates).toEqual(rates);
 expect(result.reconciled).toBe(false);expect(result.reconciliationIssue).toBe('pricing');
});

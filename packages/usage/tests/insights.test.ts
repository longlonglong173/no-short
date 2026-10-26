import { expect, test } from 'bun:test';
import * as insights from '../src/insights';
import fixture from './fixtures/insights-snapshot.json';
import type { UsageSnapshot } from '../src/types';
const make = () => structuredClone(fixture) as UsageSnapshot;
const now = new Date(fixture.generatedAt);
const evaluate = (s = make(), provider: 'all' | 'codex' | 'claude' = 'codex', at = now) => insights.usageInsights(s, provider, at);
test('last7 observed days in30 use median2x and mean scenario, without modifying snapshot', () => {
  const s = make(), before = structuredClone(s), v = evaluate(s);
  expect(v.sampleDates).toEqual(['2024-02-20','2024-02-23','2024-02-25','2024-02-27','2024-02-28','2024-02-29','2024-03-01']);
  expect(v.sampleCount).toBe(7); expect(v.medianUSD).toBe(4); expect(v.thresholdUSD).toBe(8);
  expect(v.anomaly).toBe(true); expect(v.anomalyReason).toBeNull();
  expect(v.meanUSD).toBeCloseTo(26 / 7); expect(v.remainingDays).toBe(29);
  expect(v.recordedMonthUSD).toBe(13); expect(v.scenarioUSD).toBeCloseTo(13 + 26 / 7 * 29);
  expect(s).toEqual(before);
});
test('strict threshold and zero baseline never create an infinite increase', () => {
  const s = make(); s.history!.days.at(-1)!.aggregate.cost.amountUSD = s.history!.days.at(-1)!.aggregate.cost.knownCostUSD = 8;
  expect(evaluate(s).anomaly).toBe(false);
  for (const d of s.history!.days.slice(0,-1)) { d.aggregate.cost = {amountUSD:0, knownCostUSD:0, status:'estimated'}; d.aggregate.models[0].cost = d.aggregate.cost; }
  const v = evaluate(s); expect(v.anomalyReason).toBe('baseline'); expect(v.anomaly).toBeNull(); expect(v.scenarioUSD).toBe(8);
});
test('missing dates and providers do not fabricate zero observations', () => {
  const s = make(); s.history!.days = s.history!.days.slice(-7);
  expect(evaluate(s).sampleCount).toBe(6); expect(evaluate(s).anomalyReason).toBe('history'); expect(evaluate(s).scenarioUSD).toBeNull();
  expect(evaluate(make(),'claude').sampleCount).toBe(0);
  const t=make(); t.history!.days.pop(); expect(evaluate(t).anomalyReason).toBe('today'); expect(evaluate(t).scenarioReason).toBe('today'); expect(evaluate(t).scenarioUSD).toBeNull();
});
test('partial, unknown and fallback prices are explicit, never skipped as coverage', () => {
  for (const status of ['partial','unknown'] as const) {
    const s=make(), a=s.history!.days.at(-2)!.aggregate; a.cost={amountUSD:null,knownCostUSD:0,status}; a.models[0].cost=a.cost;
    const v=evaluate(s); expect(v.excludedUnpricedDays).toBe(1); expect(v.sampleCount).toBe(7); expect(v.anomalyReason).toBe('pricing'); expect(v.scenarioReason).toBe('pricing'); expect(v.scenarioUSD).toBeNull();
  }
  const s=make(); s.history!.days.at(-1)!.aggregate.models[0].pricing={source:'fallback'};
  expect(evaluate(s).anomalyReason).toBe('pricing'); expect(evaluate(s).scenarioReason).toBe('pricing');
});
test('stale, error, aged, future and crossed-local-day payloads suppress conclusions', () => {
  for (const status of ['error','stale'] as const) { const s=make(); s.status=status; expect(evaluate(s).scenarioReason).toBe('stale'); }
  for (const at of ['2024-03-02T12:00:45.001Z','2024-03-02T11:58:59.999Z','2024-03-03T00:00:00Z']) expect(evaluate(make(),'all',new Date(at)).anomalyReason).toBe('stale');
  expect(evaluate(make(),'all',new Date('2024-03-02T12:00:45Z')).anomaly).toBe(true);
  const s=make(); s.generatedAt='2024-03-02T23:59:50Z'; expect(evaluate(s,'all',new Date('2024-03-03T00:00:05Z')).scenarioUSD).toBeNull();
  s.timeZone='Pacific/Honolulu'; expect(evaluate(s,'all',new Date('2024-03-03T00:00:05Z')).scenarioUSD).not.toBeNull();
});
test('window is calendar30 and today excluded; leap month and month edges count AFTER today', () => {
  const s=make(); s.generatedAt='2024-02-29T12:00:00Z'; expect(evaluate(s,'all',new Date(s.generatedAt)).remainingDays).toBe(0);
  s.generatedAt='2024-03-01T12:00:00Z'; expect(evaluate(s,'all',new Date(s.generatedAt)).remainingDays).toBe(30);
  s.generatedAt='2024-03-31T12:00:00Z'; const v=evaluate(s,'all',new Date(s.generatedAt)); expect(v.remainingDays).toBe(0); expect(v.sampleCount).toBe(2); expect(v.scenarioReason).toBe('history');
});

test('an unpriced selected observation cannot backfill an older priced one', () => {
  const s=make(), a=s.history!.days[7].aggregate; a.cost={amountUSD:null,knownCostUSD:1,status:'partial'}; a.models[0].cost=a.cost;
  const v=evaluate(s); expect(v.sampleDates[0]).toBe('2024-02-20'); expect(v.anomalyReason).toBe('pricing'); expect(v.scenarioUSD).toBeNull();
});
test('calendar window excludes old/future rows and stale errors keep optional history isolated', () => {
  const s=make(); s.history!.days[0].date='2024-01-01';
  s.history!.days.push({...structuredClone(s.history!.days[0]),date:'2024-03-03'});
  expect(evaluate(s).sampleDates).not.toContain('2024-01-01'); expect(evaluate(s).sampleDates).not.toContain('2024-03-03');
  delete s.history; expect(evaluate(s).anomalyReason).toBe('unavailable'); expect(s.today.cost.status).toBe('estimated');
});
test('every one of the seven observations must be fully priced and old month gaps still block scenario', () => {
  for(let index=1;index<=7;index++) {
    const s=make(), a=s.history!.days[index].aggregate; a.cost={amountUSD:null,knownCostUSD:0,status:'unknown'}; a.models[0].cost=a.cost;
    expect(evaluate(s).anomalyReason).toBe('pricing'); expect(evaluate(s).scenarioUSD).toBeNull();
  }
  const s=make(); s.generatedAt='2024-03-15T12:00:00Z';
  s.history!.days=s.history!.days.map((d,i)=>({...d,date:`2024-03-${String(i+1).padStart(2,'0')}`}));
  s.history!.days.push({...structuredClone(s.history!.days.at(-1)!),date:'2024-03-15'});
  const a=s.history!.days[0].aggregate; a.cost={amountUSD:null,knownCostUSD:0,status:'unknown'}; a.models[0].cost=a.cost;
  const v=evaluate(s,'all',new Date(s.generatedAt)); expect(v.anomalyReason).toBeNull(); expect(v.scenarioReason).toBe('pricing');
});
test('fresh snapshots reprice the whole scenario consistently with zero/custom rates, not cached old totals', async () => {
  const {buildSnapshot}=await import('../src/adapter');
  const daily=fixture.history.days.map(d=>({agent:'codex',period:d.date,inputTokens:100,outputTokens:0,cacheReadTokens:0,cacheCreationTokens:0,totalTokens:100,totalCost:d.aggregate.cost.amountUSD,
    modelBreakdowns:[{isFallback:false,modelName:'model-a',inputTokens:100,outputTokens:0,cacheReadTokens:0,cacheCreationTokens:0,cost:d.aggregate.cost.amountUSD}]}));
  const options={now,timeZone:'UTC',metadata:new Map()};
  const report={session:[],daily,totals:{}};
  expect(evaluate(buildSnapshot(report,options)).thresholdUSD).toBe(8);
  for(const input of [0,10000]) {
    const s=buildSnapshot(report,{...options,pricing:{version:1,overrides:[{provider:'codex',model:'model-a',input,output:0,cacheRead:0,cacheWrite:0}]},pricingRevision:'custom-'+input});
    const v=evaluate(s); expect(v.meanUSD).toBeCloseTo(input / 10000); expect(v.scenarioUSD).toBeCloseTo((2+29)*input / 10000);
    expect(v.anomalyReason).toBe(input===0?'baseline':null); expect(s.pricing?.configurationRevision).toBe('custom-'+input);
  }
});

test('combined provider/day/month arithmetic overflow never exposes nonfinite costs or a positive anomaly', () => {
  for (const kind of ['today', 'sample', 'month'] as const) {
    const s=make(), index=kind==='sample'?7:8, row=s.history!.days[index];
    row.aggregate.cost={amountUSD:1e308,knownCostUSD:1e308,status:'estimated'};
    row.aggregate.models[0].cost={...row.aggregate.cost};
    if(kind==='month') {
      s.history!.days[7].aggregate.cost={...row.aggregate.cost};
      s.history!.days[7].aggregate.models[0].cost={...row.aggregate.cost};
    } else s.history!.days.push({...structuredClone(row),provider:'claude'});
    const v=evaluate(s,'all');
    expect(v.anomaly).toBeNull(); expect(v.anomalyReason).toBe('overflow');
    expect(v.scenarioUSD).toBeNull(); expect(v.scenarioReason).toBe('overflow');
    for(const cost of [v.todayUSD,v.recordedMonthUSD,v.medianUSD,v.meanUSD,v.thresholdUSD,v.scenarioUSD]) expect(cost===null||Number.isFinite(cost)).toBe(true);
  }
});
test('legitimate differing provider price origins remain usable after combined-amount checks', () => {
  const s=make();
  for(const row of [...s.history!.days]) {
    const other={...structuredClone(row),provider:'claude' as const};
    other.aggregate.models[0].pricing={source:'custom',provider:'claude',rates:{input:1,output:2,cacheRead:0,cacheWrite:0}};
    s.history!.days.push(other);
  }
  const v=evaluate(s,'all'); expect(v.anomaly).toBe(true); expect(v.thresholdUSD).toBe(16);
  expect(v.scenarioUSD).toBeCloseTo(2*(13+26/7*29));
});
test('future multiplication or scenario addition overflow stays unknown while finite daily math remains valid', () => {
  for(const [sampleCost,todayCost,anomaly] of [[1e307,9,false],[3e306,1e308,true]] as const) {
    const s=make();
    for(const row of s.history!.days) {
      row.aggregate.cost={amountUSD:row.date===s.generatedAt.slice(0,10)?todayCost:sampleCost,knownCostUSD:row.date===s.generatedAt.slice(0,10)?todayCost:sampleCost,status:'estimated'};
      row.aggregate.models[0].cost={...row.aggregate.cost};
    }
    const v=evaluate(s,'all'); expect(v.anomaly).toBe(anomaly); expect(v.scenarioUSD).toBeNull(); expect(v.scenarioReason).toBe('overflow');
    for(const cost of [v.todayUSD,v.recordedMonthUSD,v.medianUSD,v.meanUSD,v.thresholdUSD]) expect(cost===null||Number.isFinite(cost)).toBe(true);
  }
});

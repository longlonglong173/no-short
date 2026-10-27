import { dayKey } from './adapter';
import { comparisonIsStale, decodeHistory, historyView } from './history';
import type { Aggregate, UsageSnapshot } from './types';

export type InsightReason = 'stale' | 'unavailable' | 'history' | 'baseline' | 'today' | 'pricing' | 'overflow';
export interface UsageInsights {
  provider: string; today: string; windowStart: string; sampleDates: string[]; sampleCount: number;
  excludedUnpricedDays: number; medianUSD: number | null; meanUSD: number | null; thresholdUSD: number | null;
  todayUSD: number | null; anomaly: boolean | null; anomalyReason: InsightReason | null;
  recordedMonthUSD: number | null; remainingDays: number; scenarioUSD: number | null; scenarioReason: InsightReason | null;
}
function finiteAggregate(a: Aggregate): boolean {
  return [a, ...a.models].every(row => Object.values(row.tokens).every(Number.isFinite)
    && Number.isFinite(row.cost.knownCostUSD) && (row.cost.amountUSD === null || Number.isFinite(row.cost.amountUSD)));
}
function complete(a: Aggregate): boolean {
  return [a, ...a.models].every(row => row.cost.status === 'estimated' && Number.isFinite(row.cost.amountUSD))
    && a.models.every(row => !row.pricing || !['fallback', 'unpriced', 'mixed'].includes(row.pricing.source));
}
/** One consistent retained-log snapshot. Missing dates never become measured zero. */
export function usageInsights(snapshot: UsageSnapshot, provider: 'all' | 'codex' | 'claude', now = new Date()): UsageInsights {
  const value: UsageInsights = { provider, today: '', windowStart: '', sampleDates: [], sampleCount: 0, excludedUnpricedDays: 0,
    medianUSD: null, meanUSD: null, thresholdUSD: null, todayUSD: null, anomaly: null, anomalyReason: 'unavailable',
    recordedMonthUSD: null, remainingDays: 0, scenarioUSD: null, scenarioReason: 'unavailable' };
  try {
    value.today = dayKey(now, snapshot.timeZone);
    const date = new Date(value.today + 'T00:00:00Z'), start = new Date(date);
    start.setUTCDate(start.getUTCDate() - 30); value.windowStart = start.toISOString().slice(0,10);
    const last = new Date(date); last.setUTCMonth(last.getUTCMonth()+1,0);
    value.remainingDays = last.getUTCDate() - date.getUTCDate();
    if (comparisonIsStale(snapshot, now)) { value.anomalyReason = value.scenarioReason = 'stale'; return value; }
    const history = decodeHistory(snapshot.history);
    if (!history) return value;
    const view = historyView(snapshot, provider, value.windowStart, value.today);
    const month = historyView(snapshot, provider, value.today.slice(0,7) + '-01', value.today);
    if (!view || !month) return value;
    // Provider rows can each be finite while their projected day/range/model sums overflow.
    // Check numeric projection validity independently of the raw-row price-origin policy.
    if (![view.aggregate, month.aggregate, ...view.days.map(d => d.aggregate), ...month.days.map(d => d.aggregate)].every(finiteAggregate)) {
      value.anomalyReason = value.scenarioReason = 'overflow'; return value;
    }
    const rows = history.days.filter(r => provider === 'all' || r.provider === provider);
    const dayComplete = (date: string) => rows.filter(r => r.date === date).every(r => complete(r.aggregate));
    const prior = view.days.filter(d => d.date < value.today);
    value.excludedUnpricedDays = prior.filter(d => !dayComplete(d.date)).length;
    const sample = prior.slice(-7);
    value.sampleDates = sample.map(d => d.date); value.sampleCount = sample.length;
    const today = view.days.find(d => d.date === value.today);
    if (today && dayComplete(value.today)) value.todayUSD = today.aggregate.cost.amountUSD;
    const monthComplete = month.days.length > 0 && month.days.every(d => dayComplete(d.date));
    if (monthComplete) value.recordedMonthUSD = month.aggregate.cost.amountUSD;
    if (sample.length < 7) { value.anomalyReason = value.scenarioReason = 'history'; return value; }
    if (!sample.every(d => dayComplete(d.date))) { value.anomalyReason = value.scenarioReason = 'pricing'; return value; }
    const costs = sample.map(d => d.aggregate.cost.amountUSD!).sort((a,b) => a-b);
    const mean = costs.reduce((sum,c) => sum + c / 7,0);
    if (!Number.isFinite(mean)) { value.anomalyReason = value.scenarioReason = 'overflow'; return value; }
    value.medianUSD = costs[3]; value.meanUSD = mean;
    const threshold = value.medianUSD! * 2;
    if (Number.isFinite(threshold)) value.thresholdUSD = threshold;
    value.anomalyReason = !today ? 'today' : value.todayUSD === null ? 'pricing' : value.medianUSD! <= 0 ? 'baseline' : value.thresholdUSD === null ? 'overflow' : null;
    if (!value.anomalyReason) value.anomaly = value.todayUSD! > value.thresholdUSD!;
    value.scenarioReason = !today ? 'today' : !monthComplete ? 'pricing' : null;
    if (!value.scenarioReason) {
      const future = value.meanUSD! * value.remainingDays;
      const total = value.recordedMonthUSD! + future;
      if (Number.isFinite(future) && Number.isFinite(total)) value.scenarioUSD = total; else value.scenarioReason = 'overflow';
    }
    return value;
  } catch { return value; }
}

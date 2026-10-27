import { decodeGrouping } from './grouping-types';
import { z } from 'zod';
import { customCost, mergedPricing, type PricingConfig } from './pricing.ts';
import type { Aggregate, Cost, ModelUsage, SessionMetadata, SessionUsage, Tokens, UsageSnapshot, UsageProvider, UsageHistory } from './types.ts';
export interface SnapshotOptions { now: Date; timeZone: string; metadata: Map<string, SessionMetadata>; pricingSource?: 'online' | 'cached'; providers?: readonly UsageProvider[]; pricing?: PricingConfig; pricingRevision?: string }

const count = z.number().finite().nonnegative();
const tokenFields = { inputTokens: count, outputTokens: count, cacheReadTokens: count, cacheCreationTokens: count, totalTokens: count.optional() };
const modelSchema = z.object({ ...tokenFields, modelName: z.string().min(1), cost: count, missingPricing: z.boolean().optional(), isFallback: z.boolean().optional() });
const usageSchema = z.object({ ...tokenFields, totalTokens: count, totalCost: count, modelBreakdowns: z.array(modelSchema) });
const rowSchema = usageSchema.extend({ agent: z.string(), period: z.string(), metadata: z.object({ lastActivity: z.string().datetime().optional() }).optional() });
const dailySchema = rowSchema.extend({ agents: z.array(usageSchema.extend({ agent: z.string() })).optional() });
const reportSchema = z.object({ session: z.array(rowSchema), daily: z.array(dailySchema), sessionDays: z.unknown().optional(), totals: z.object({ unpricedModels: z.array(z.string()).optional() }) });
type UsageRow = z.infer<typeof usageSchema>;
export const emptyTokens = (): Tokens => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 });
const knownCost = (n: number): Cost => ({ amountUSD: n, knownCostUSD: n, status: 'estimated' });
export const emptyAggregate = (): Aggregate => ({ tokens: emptyTokens(), cost: knownCost(0), models: [] });

function tokens(row: z.infer<typeof modelSchema> | UsageRow): Tokens {
  return { input: row.inputTokens, output: row.outputTokens, cacheRead: row.cacheReadTokens, cacheWrite: row.cacheCreationTokens,
    total: row.totalTokens ?? row.inputTokens + row.outputTokens + row.cacheReadTokens + row.cacheCreationTokens };
}
function aggregate(row: UsageRow, unpriced: Set<string>, provider: UsageProvider, options: SnapshotOptions): Aggregate {
  if (provider === 'codex' && (row.modelBreakdowns.some(m => typeof m.isFallback !== 'boolean') || (!row.modelBreakdowns.length && row.totalTokens > 0))) {
    throw new Error('REPORT_PRICING_UNSUPPORTED');
  }
  let repriced = false;
  const parts: ModelUsage[] = row.modelBreakdowns.map(m => {
    const value = tokens(m);
    const override = options.pricing?.overrides.find(p => p.provider === provider && p.model === m.modelName);
    const rates = override && { input: override.input, output: override.output, cacheRead: override.cacheRead, cacheWrite: override.cacheWrite };
    const unavailable = m.missingPricing || unpriced.has(m.modelName) || m.isFallback;
    if (override || m.isFallback) repriced = true;
    return { name: m.modelName, tokens: value,
      cost: rates ? customCost(value, rates) : m.isFallback ? { amountUSD: null, knownCostUSD: 0, status: 'unknown' }
        : unavailable ? { amountUSD: null, knownCostUSD: m.cost, status: m.cost > 0 ? 'partial' : 'unknown' } : knownCost(m.cost),
      pricing: rates ? { source: 'custom', provider, ...(options.pricing?.updatedAt ? { updatedAt: options.pricing.updatedAt } : {}), rates }
        : { source: m.isFallback ? 'fallback' : unavailable ? 'unpriced' : 'ccusage', provider } };
  });
  // Reader rows are partitioned by provenance. Apply prices before merging so
  // inferred usage cannot erase an identified cost for the same model name.
  const merged = new Map(sumAggregates(parts.map(m => ({ tokens: m.tokens, cost: m.cost, models: [m] }))).models.map(m => [m.name, m]));
  const models = [...new Set(parts.map(m => m.name))].map(name => merged.get(name)!);
  const missing = models.some(m => m.cost.amountUSD === null);
  const known = repriced ? Number(models.reduce((n, m) => n + m.cost.knownCostUSD, 0).toPrecision(15)) : row.totalCost;
  return { tokens: tokens(row), models, cost: missing ? { amountUSD: null, knownCostUSD: known,
    status: models.some(m => m.cost.status !== 'unknown') ? 'partial' : 'unknown' } : knownCost(known) };
}
function sumCost(a: Cost, b: Cost): Cost {
  const knownCostUSD = a.knownCostUSD + b.knownCostUSD;
  if (a.amountUSD !== null && b.amountUSD !== null) return knownCost(knownCostUSD);
  return { amountUSD: null, knownCostUSD, status: a.status === 'unknown' && b.status === 'unknown' ? 'unknown' : 'partial' };
}
export function sumAggregates(rows: Aggregate[]): Aggregate {
  const result = emptyAggregate();
  const models = new Map<string, ModelUsage>();
  let hasCost = false;
  for (const row of rows) {
    for (const key of Object.keys(result.tokens) as (keyof Tokens)[]) result.tokens[key] += row.tokens[key];
    const neutral = row.cost.status === 'estimated' && row.cost.amountUSD === 0 && row.models.length === 0 && Object.values(row.tokens).every(n => n === 0);
    if (!neutral) {
      result.cost = hasCost ? sumCost(result.cost, row.cost) : { ...row.cost };
      hasCost = true;
    }
    for (const m of row.models) {
      const existing = models.get(m.name);
      if (!existing) models.set(m.name, structuredClone(m));
      else {
        for (const key of Object.keys(existing.tokens) as (keyof Tokens)[]) existing.tokens[key] += m.tokens[key];
        existing.cost = sumCost(existing.cost, m.cost);
        const pricing = mergedPricing(existing.pricing, m.pricing);
        if (pricing) existing.pricing = pricing; else delete existing.pricing;
      }
    }
  }
  result.models = [...models.values()].sort((a, b) => b.cost.knownCostUSD - a.cost.knownCostUSD || a.name.localeCompare(b.name));
  return result;
}

export function dayKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (key: string) => parts.find(p => p.type === key)!.value;
  return `${get('year').padStart(4, '0')}-${get('month')}-${get('day')}`;
}
function shortId(id: string): string { return id.match(/[0-9a-f]{8}-[0-9a-f-]{27,}/i)?.[0].slice(0, 8) ?? id.slice(-12); }
export function buildSnapshot(raw: unknown, options: SnapshotOptions): UsageSnapshot {
  const report = reportSchema.parse(raw);
  const providers = options.providers ?? ['codex'];
  const unpriced = new Set(report.totals.unpricedModels ?? []);
  const sessions: SessionUsage[] = report.session.map(row => {
    if (!providers.includes(row.agent as UsageProvider)) throw new Error('Unexpected data source');
    const provider = row.agent as UsageProvider;
    const sessionKey = row.period.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0] ?? row.period.split('/').at(-1)!;
    const prefix = provider === 'claude' ? 'claude:' : '';
    const meta = options.metadata.get(prefix + row.period) ?? options.metadata.get(prefix + row.period.split('/').at(-1)!) ?? options.metadata.get(prefix + sessionKey) ?? { title: `Phiên ${shortId(row.period)}`, kind: 'unknown' as const };
    return { id: prefix + row.period, provider, sessionKey, title: meta.title.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 160), kind: meta.kind, ...(decodeGrouping(meta.grouping) ? { grouping: decodeGrouping(meta.grouping) } : {}),
      lastActivity: row.metadata?.lastActivity ?? null, ...aggregate(row, unpriced, provider, options) };
  }).sort((a, b) => (b.lastActivity ?? '').localeCompare(a.lastActivity ?? '') || a.id.localeCompare(b.id));
  const daily = new Map<string, Aggregate>();
  const providerDaily = new Map<UsageProvider, Map<string, Aggregate>>(providers.map(provider => [provider, new Map()]));
  for (const row of report.daily) {
    const date = new Date(`${row.period}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.period) || row.period.startsWith('0000') || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== row.period) throw new Error('Invalid daily period');
    const sources = row.agents ?? (providers.includes(row.agent as UsageProvider) ? [row] : []);
    if (sources.some(a => !providers.includes(a.agent as UsageProvider)) || (!sources.length && row.totalTokens > 0)) throw new Error('Unexpected daily data source');
    const values = sources.map(source => {
      const value = aggregate(source, unpriced, source.agent as UsageProvider, options);
      const days = providerDaily.get(source.agent as UsageProvider)!;
      days.set(row.period, days.has(row.period) ? sumAggregates([days.get(row.period)!, value]) : value);
      return value;
    });
    const value = sumAggregates(values);
    daily.set(row.period, daily.has(row.period) ? sumAggregates([daily.get(row.period)!, value]) : value);
  }
  const today = dayKey(options.now, options.timeZone);
  const chart = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(`${today}T12:00:00Z`); date.setUTCDate(date.getUTCDate() - (6 - i));
    const key = date.toISOString().slice(0, 10);
    return { date: key, cost: daily.get(key)?.cost ?? knownCost(0) };
  });
  const providerBreakdowns = providers.map(provider => {
    const days = providerDaily.get(provider)!;
    return { provider, today: days.get(today) ?? emptyAggregate(),
      month: sumAggregates([...days].filter(([key]) => key.startsWith(today.slice(0, 7))).map(([, row]) => row)),
      chart: chart.map(point => ({ date: point.date, cost: days.get(point.date)?.cost ?? knownCost(0) })) };
  });
  const history: UsageHistory = { version: 1 as const, providers: [...providers], days: [...providerDaily].flatMap(([provider, days]) =>
    [...days].map(([date, aggregate]) => ({ date, provider, aggregate }))).sort((a, b) => a.date.localeCompare(b.date) || providers.indexOf(a.provider) - providers.indexOf(b.provider)) };
  // An optional ledger is decoded independently; malformed detail cannot discard daily history.
  const rawLedger = z.array(rowSchema.extend({ date: z.string() })).safeParse(report.sessionDays);
  if (rawLedger.success) {
    try {
      const values = rawLedger.data.map(row => {
        if (!providers.includes(row.agent as UsageProvider)) throw new Error('Unexpected ledger source');
        return { date: row.date, provider: row.agent as UsageProvider,
          sessionId: (row.agent === 'claude' ? 'claude:' : '') + row.period,
          aggregate: aggregate(row, unpriced, row.agent as UsageProvider, options) };
      });
      history.sessionDays = values;
    } catch { /* Keep legacy daily capability. */ }
  }
  return { schemaVersion: 1, source: 'ccusage', ccusageVersion: '20.0.34', generatedAt: options.now.toISOString(), timeZone: options.timeZone,
    status: sessions.length ? 'ready' : 'empty', pricingSource: options.pricingSource ?? 'online', sessions,
    today: daily.get(today) ?? emptyAggregate(), month: sumAggregates([...daily].filter(([key]) => key.startsWith(today.slice(0, 7))).map(([, row]) => row)), chart, providerBreakdowns, history,
    pricing: { basis: options.pricing?.overrides.length ? 'current-custom-rates' : 'ccusage-report',
      configurationRevision: options.pricingRevision ?? 'default-v1', ...(options.pricing?.updatedAt ? { updatedAt: options.pricing.updatedAt } : {}) } };
}
export function selectSession(sessions: SessionUsage[], id: string | null): SessionUsage | null {
  if (id !== null) return sessions.find(s => s.id === id) ?? null;
  return sessions.find(s => s.kind === 'main') ?? sessions.find(s => s.kind !== 'subagent') ?? null;
}

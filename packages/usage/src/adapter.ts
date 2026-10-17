import { z } from 'zod';
import type { Aggregate, Cost, ModelUsage, SessionMetadata, SessionUsage, Tokens, UsageSnapshot, UsageProvider } from './types.ts';
export interface SnapshotOptions { now: Date; timeZone: string; metadata: Map<string, SessionMetadata>; pricingSource?: 'online' | 'cached'; providers?: readonly UsageProvider[] }

const count = z.number().finite().nonnegative();
const tokenFields = { inputTokens: count, outputTokens: count, cacheReadTokens: count, cacheCreationTokens: count, totalTokens: count.optional() };
const modelSchema = z.object({ ...tokenFields, modelName: z.string().min(1), cost: count, missingPricing: z.boolean().optional(), isFallback: z.boolean().optional() });
const usageSchema = z.object({ ...tokenFields, totalTokens: count, totalCost: count, modelBreakdowns: z.array(modelSchema) });
const rowSchema = usageSchema.extend({ agent: z.string(), period: z.string(), metadata: z.object({ lastActivity: z.string().datetime().optional() }).optional() });
const dailySchema = rowSchema.extend({ agents: z.array(usageSchema.extend({ agent: z.string() })).optional() });
const reportSchema = z.object({ session: z.array(rowSchema), daily: z.array(dailySchema), totals: z.object({ unpricedModels: z.array(z.string()).optional() }) });
type UsageRow = z.infer<typeof usageSchema>;
export const emptyTokens = (): Tokens => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 });
const knownCost = (n: number): Cost => ({ amountUSD: n, knownCostUSD: n, status: 'estimated' });
export const emptyAggregate = (): Aggregate => ({ tokens: emptyTokens(), cost: knownCost(0), models: [] });

function tokens(row: z.infer<typeof modelSchema> | UsageRow): Tokens {
  return { input: row.inputTokens, output: row.outputTokens, cacheRead: row.cacheReadTokens, cacheWrite: row.cacheCreationTokens,
    total: row.totalTokens ?? row.inputTokens + row.outputTokens + row.cacheReadTokens + row.cacheCreationTokens };
}
function aggregate(row: UsageRow, unpriced: Set<string>): Aggregate {
  const models: ModelUsage[] = row.modelBreakdowns.map(m => ({ name: m.modelName, tokens: tokens(m),
    cost: m.missingPricing || unpriced.has(m.modelName) ? { amountUSD: null, knownCostUSD: 0, status: 'unknown' } : knownCost(m.cost) }));
  const missing = models.some(m => m.cost.amountUSD === null);
  return { tokens: tokens(row), models, cost: missing ? { amountUSD: null, knownCostUSD: row.totalCost,
    status: models.some(m => m.cost.amountUSD !== null) ? 'partial' : 'unknown' } : knownCost(row.totalCost) };
}
function sumCost(a: Cost, b: Cost): Cost {
  const knownCostUSD = a.knownCostUSD + b.knownCostUSD;
  if (a.amountUSD !== null && b.amountUSD !== null) return knownCost(knownCostUSD);
  return { amountUSD: null, knownCostUSD, status: knownCostUSD > 0 ? 'partial' : 'unknown' };
}
export function sumAggregates(rows: Aggregate[]): Aggregate {
  const result = emptyAggregate();
  const models = new Map<string, ModelUsage>();
  for (const row of rows) {
    for (const key of Object.keys(result.tokens) as (keyof Tokens)[]) result.tokens[key] += row.tokens[key];
    result.cost = sumCost(result.cost, row.cost);
    for (const m of row.models) {
      const existing = models.get(m.name);
      if (!existing) models.set(m.name, structuredClone(m));
      else {
        for (const key of Object.keys(existing.tokens) as (keyof Tokens)[]) existing.tokens[key] += m.tokens[key];
        existing.cost = sumCost(existing.cost, m.cost);
      }
    }
  }
  result.models = [...models.values()].sort((a, b) => b.cost.knownCostUSD - a.cost.knownCostUSD);
  return result;
}

export function dayKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (key: string) => parts.find(p => p.type === key)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
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
    return { id: prefix + row.period, provider, sessionKey, title: meta.title.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 160), kind: meta.kind,
      lastActivity: row.metadata?.lastActivity ?? null, ...aggregate(row, unpriced) };
  }).sort((a, b) => (b.lastActivity ?? '').localeCompare(a.lastActivity ?? '') || a.id.localeCompare(b.id));
  const daily = new Map<string, Aggregate>();
  for (const row of report.daily) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.period)) throw new Error('Invalid daily period');
    const sources = row.agents ?? (providers.includes(row.agent as UsageProvider) ? [row] : []);
    if (sources.some(a => !providers.includes(a.agent as UsageProvider)) || (!sources.length && row.totalTokens > 0)) throw new Error('Unexpected daily data source');
    const value = sumAggregates(sources.map(a => aggregate(a, unpriced)));
    daily.set(row.period, daily.has(row.period) ? sumAggregates([daily.get(row.period)!, value]) : value);
  }
  const today = dayKey(options.now, options.timeZone);
  const chart = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(`${today}T12:00:00Z`); date.setUTCDate(date.getUTCDate() - (6 - i));
    const key = date.toISOString().slice(0, 10);
    return { date: key, cost: daily.get(key)?.cost ?? knownCost(0) };
  });
  const providerBreakdowns = providers.map(provider => {
    const filtered = { ...report, session: report.session.filter(r => r.agent === provider), daily: report.daily.map(row => ({ ...row,
      agents: (row.agents ?? [row]).filter(a => a.agent === provider), totalTokens: 0,
    })) };
    // A focused view has identical date/price semantics to the overall report.
    const view = providers.length > 1 ? buildSnapshot(filtered, { ...options, providers: [provider] }) : null;
    return { provider, today: view?.today ?? daily.get(today) ?? emptyAggregate(),
      month: view?.month ?? sumAggregates([...daily].filter(([key]) => key.startsWith(today.slice(0, 7))).map(([, row]) => row)), chart: view?.chart ?? chart };
  });
  return { schemaVersion: 1, source: 'ccusage', ccusageVersion: '20.0.34', generatedAt: options.now.toISOString(), timeZone: options.timeZone,
    status: sessions.length ? 'ready' : 'empty', pricingSource: options.pricingSource ?? 'online', sessions,
    today: daily.get(today) ?? emptyAggregate(), month: sumAggregates([...daily].filter(([key]) => key.startsWith(today.slice(0, 7))).map(([, row]) => row)), chart, providerBreakdowns };
}
export function selectSession(sessions: SessionUsage[], id: string | null): SessionUsage | null {
  if (id !== null) return sessions.find(s => s.id === id) ?? null;
  return sessions.find(s => s.kind === 'main') ?? sessions.find(s => s.kind !== 'subagent') ?? null;
}

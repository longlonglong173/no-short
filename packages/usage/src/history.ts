import { z } from 'zod';
import { dayKey, sumAggregates } from './adapter.ts';
import type { Aggregate, UsageHistory, UsageSnapshot } from './types.ts';

export type HistoryPreset = '7d' | '30d' | 'month' | 'previous' | 'custom';
export interface DateRange { start: string; end: string }

function calendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function shift(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function historyRange(preset: HistoryPreset, now: Date, timeZone: string, custom?: DateRange): DateRange | null {
  try {
    const today = dayKey(now, timeZone);
    if (!calendarDate(today)) return null;
    let range: DateRange;
    switch (preset) {
      case '7d': range = { start: shift(today, -6), end: today }; break;
      case '30d': range = { start: shift(today, -29), end: today }; break;
      case 'month': range = { start: `${today.slice(0, 7)}-01`, end: today }; break;
      case 'previous': {
        const end = shift(`${today.slice(0, 7)}-01`, -1);
        range = { start: `${end.slice(0, 7)}-01`, end }; break;
      }
      case 'custom': if (!custom) return null; range = { ...custom }; break;
      default: return null;
    }
    return calendarDate(range.start) && calendarDate(range.end) && range.start <= range.end && range.end <= today ? range : null;
  } catch { return null; }
}

const count = z.number().finite().nonnegative();
const tokenSchema = z.object({ input: count, output: count, cacheRead: count, cacheWrite: count, total: count });
const costSchema = z.union([
  z.object({ amountUSD: count, knownCostUSD: count, status: z.literal('estimated') }).refine(c => c.amountUSD === c.knownCostUSD),
  z.object({ amountUSD: z.null(), knownCostUSD: count, status: z.literal('partial') }),
  z.object({ amountUSD: z.null(), knownCostUSD: z.literal(0), status: z.literal('unknown') }),
]);
const aggregateSchema = z.object({ tokens: tokenSchema, cost: costSchema,
  models: z.array(z.object({ name: z.string().min(1), tokens: tokenSchema, cost: costSchema })) });
const providerSchema = z.enum(['codex', 'claude']);
const historySchema = z.object({ version: z.literal(1), providers: z.array(providerSchema).min(1).max(2),
  days: z.array(z.object({ date: z.string().refine(calendarDate), provider: providerSchema, aggregate: aggregateSchema }))
}).refine(history => {
  if (new Set(history.providers).size !== history.providers.length) return false;
  const pairs = new Set<string>();
  for (const day of history.days) {
    const key = `${day.date}/${day.provider}`;
    if (!history.providers.includes(day.provider) || pairs.has(key)) return false;
    pairs.add(key);
  }
  return true;
});

// Optional history is a separate trust boundary: bad history cannot invalidate a legacy dashboard.
export function decodeHistory(value: unknown): UsageHistory | null {
  const result = historySchema.safeParse(value);
  return result.success ? result.data : null;
}

export function historyView(snapshot: UsageSnapshot, provider: 'all' | 'codex' | 'claude', start: string, end: string): { aggregate: Aggregate; days: { date: string; aggregate: Aggregate }[] } | null {
  if (snapshot.status === 'error' || !calendarDate(start) || !calendarDate(end) || start > end) return null;
  const history = decodeHistory(snapshot.history);
  if (!history || (provider !== 'all' && !history.providers.includes(provider))) return null;
  const grouped = new Map<string, Aggregate[]>();
  for (const row of history.days) {
    if (row.date < start || row.date > end || (provider !== 'all' && row.provider !== provider)) continue;
    const rows = grouped.get(row.date) ?? [];
    rows.push(row.aggregate); grouped.set(row.date, rows);
  }
  // Sparse by design: storage and projection grow with source rows, never with arbitrary range length.
  const days = [...grouped].sort(([a], [b]) => a.localeCompare(b)).map(([date, rows]) => ({ date, aggregate: sumAggregates(rows) }));
  return { aggregate: sumAggregates(days.map(day => day.aggregate)), days };
}

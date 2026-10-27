import type { Aggregate, Cost, DashboardResult, UsageSnapshot } from '../src/types';
import { translate, type Language } from './localization';
const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function costText(cost: Cost, language: Language = 'vi'): string {
  // USD typography is shared with native regardless of the UI language.
  switch (cost.status) {
    case 'estimated': return dollars.format(cost.amountUSD!);
    case 'partial': return '≥' + dollars.format(cost.knownCostUSD);
    default: return '—';
  }
}
// Keep screen-reader status descriptions localized when the visible value is a symbol.
export function costStatusText(cost: Cost, language: Language = 'vi'): string {
  const status = cost.status === 'partial' ? 'Chưa đầy đủ' : cost.status === 'unknown' ? 'Chưa xác định' : 'Ước tính';
  return translate(language, status);
}
export function costLabel(cost: Cost, language: Language = 'vi'): string {
  return `${costText(cost, language)} · ${costStatusText(cost, language)}`;
}
export const tokenText = (n: number) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
export function decodeResult(result: unknown): DashboardResult | null {
  if (!result || typeof result !== 'object') return null;
  const root = result as Record<string, any>;
  const value = root._meta?.usage ?? root.usage ?? root.mcp_tool_result?._meta?.usage ?? root.call_tool_result?._meta?.usage;
  return value?.snapshot?.schemaVersion === 1 && Array.isArray(value.snapshot.sessions) && Array.isArray(value.snapshot.chart) && value.snapshot.today?.cost && value.snapshot.month?.cost ? value : null;
}

export type ProviderFilter = 'all' | 'codex' | 'claude';
export function hasClaudeSource(snapshot: UsageSnapshot): boolean {
  return !!snapshot.providerBreakdowns?.some(p => p.provider === 'claude') || snapshot.sessions.some(s => s.provider === 'claude');
}
export function providerView(snapshot: UsageSnapshot, provider: ProviderFilter): {
  sessions: UsageSnapshot['sessions']; today: Aggregate | null; month: Aggregate | null; chart: UsageSnapshot['chart'];
} {
  if (provider === 'all') return snapshot;
  const breakdown = snapshot.providerBreakdowns?.find(p => p.provider === provider);
  // Old schema-v1 snapshots had only Codex totals and no provider fields.
  // Never relabel combined totals as Codex if Claude data is actually present.
  const periods = breakdown ?? (provider === 'codex' && snapshot.providerBreakdowns === undefined && !hasClaudeSource(snapshot) ? snapshot : null);
  return { sessions: snapshot.sessions.filter(s => (s.provider ?? 'codex') === provider),
    today: periods?.today ?? null, month: periods?.month ?? null, chart: periods?.chart ?? [] };
}

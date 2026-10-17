import type { Cost, DashboardResult } from '../src/types';
const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function costText(cost: Cost): string {
  return cost.amountUSD === null ? cost.status === 'partial' ? 'Chưa đầy đủ' : 'Chưa xác định' : dollars.format(cost.amountUSD);
}
export const tokenText = (n: number) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
export function decodeResult(result: unknown): DashboardResult | null {
  if (!result || typeof result !== 'object') return null;
  const root = result as Record<string, any>;
  const value = root._meta?.usage ?? root.usage ?? root.mcp_tool_result?._meta?.usage ?? root.call_tool_result?._meta?.usage;
  return value?.snapshot?.schemaVersion === 1 && Array.isArray(value.snapshot.sessions) && Array.isArray(value.snapshot.chart) && value.snapshot.today?.cost && value.snapshot.month?.cost ? value : null;
}

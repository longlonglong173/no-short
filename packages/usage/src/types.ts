export type PricingStatus = 'estimated' | 'partial' | 'unknown';
export type UsageProvider = 'codex' | 'claude';
export interface Cost { amountUSD: number | null; knownCostUSD: number; status: PricingStatus }
export interface Tokens { input: number; output: number; cacheRead: number; cacheWrite: number; total: number }
export interface ModelUsage { name: string; tokens: Tokens; cost: Cost }
export interface Aggregate { tokens: Tokens; cost: Cost; models: ModelUsage[] }
export interface SessionMetadata { title: string; kind: 'main' | 'subagent' | 'unknown' }
export interface SessionUsage extends Aggregate, SessionMetadata { id: string; provider?: UsageProvider; sessionKey?: string; lastActivity: string | null }
export interface ProviderBreakdown { provider: UsageProvider; today: Aggregate; month: Aggregate; chart: { date: string; cost: Cost }[] }
export interface UsageSnapshot {
  schemaVersion: 1;
  source: 'ccusage';
  ccusageVersion: '20.0.34';
  generatedAt: string;
  timeZone: string;
  status: 'ready' | 'empty' | 'stale' | 'error';
  pricingSource: 'online' | 'cached';
  notice?: string;
  sessions: SessionUsage[];
  today: Aggregate;
  month: Aggregate;
  chart: { date: string; cost: Cost }[];
  providerBreakdowns?: ProviderBreakdown[];
}
export interface DashboardResult { snapshot: UsageSnapshot; selectedSession: SessionUsage | null; requestedSessionId: string | null }

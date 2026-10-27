import type { Aggregate, UsageProvider, UsageSnapshot } from './types.ts';
import { z } from 'zod';
import { dayKey } from './adapter.ts';
import { groupedUsage, groupingExport, type GroupingExport } from './grouping';
import { historyView } from './history.ts';
import type { ModelPricing, SnapshotPricing } from './pricing';

export interface UsageExport {
  formatVersion: 1;
  costBasis: 'api-equivalent-estimate-not-billing';
  provider: 'all' | UsageProvider;
  start: string;
  end: string;
  timeZone: string;
  generatedAt: string;
  status: UsageSnapshot['status'];
  pricing?: SnapshotPricing;
  aggregate: Aggregate;
  days: { date: string; aggregate: Aggregate }[];
  grouping?: GroupingExport;
  sessionReferences?: {
    scope: 'last-activity-in-range-not-cost-attribution';
    items: { id: string; title: string; provider: UsageProvider; lastActivity: string }[];
  };
}

const timestamp = z.string().datetime({ offset: true });

function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

export function createUsageExport(snapshot: UsageSnapshot, provider: 'all' | 'codex' | 'claude', start: string, end: string, options?: { includeSessionIdentifiers?: boolean; groupBy?: 'none'|'project'|'work' }): UsageExport | null {
  const view = historyView(snapshot, provider, start, end);
  if (!view) return null;
  const document: UsageExport = { formatVersion: 1, costBasis: 'api-equivalent-estimate-not-billing',
    provider, start, end, timeZone: snapshot.timeZone, generatedAt: snapshot.generatedAt, status: snapshot.status,
    ...(snapshot.pricing ? { pricing: snapshot.pricing } : {}), aggregate: view.aggregate, days: view.days };
  if (options?.groupBy && options.groupBy !== 'none') {
    const groups=groupedUsage(snapshot,provider,start,end);
    if (!groups || groups.reconciliationIssue === 'tokens') return null;
    document.grouping=groupingExport(groups,options.groupBy,options.includeSessionIdentifiers);
  }
  if (options?.includeSessionIdentifiers) {
    const items: NonNullable<UsageExport['sessionReferences']>['items'] = [];
    for (const session of snapshot.sessions) {
      const sessionProvider = session.provider ?? 'codex';
      if ((provider !== 'all' && sessionProvider !== provider) || !snapshot.history!.providers.includes(sessionProvider) ||
        !timestamp.safeParse(session.lastActivity).success) continue;
      const lastActivity = session.lastActivity!;
      const date = dayKey(new Date(lastActivity), snapshot.timeZone);
      if (date >= start && date <= end) items.push({ id: session.id, title: session.title, provider: sessionProvider, lastActivity });
    }
    document.sessionReferences = { scope: 'last-activity-in-range-not-cost-attribution', items };
  }
  return freeze(structuredClone(document));
}

type Cell = string | number | null;
function csvCell(value: Cell): string {
  if (value === null) return '';
  if (typeof value === 'number') return String(value);
  const safe = /^\s*[=+\-@]/u.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function serializeUsageExport(document: UsageExport, format: 'csv' | 'json'): string {
  if (format === 'json') return JSON.stringify(document, null, 2) + '\n';
  const columns = ['recordType', 'scope', 'date', 'provider', 'model', 'input', 'output', 'cacheRead', 'cacheWrite', 'total',
    'amountUSD', 'knownCostUSD', 'pricingStatus', 'timezone', 'start', 'end', 'generatedAt', 'status', 'costBasis'];
  if (document.pricing) columns.push('pricingBasis', 'pricingOrigin', 'pricingUpdatedAt', 'inputUSDPerMillion', 'outputUSDPerMillion', 'cacheReadUSDPerMillion', 'cacheWriteUSDPerMillion');
  if (document.sessionReferences) columns.push('sessionId', 'sessionTitle', 'lastActivity');
  if (document.grouping) columns.push('groupBy','groupLabel','groupSource','groupConfidence','groupReconciled','groupReconciliationIssue','depth');
  const lines = [columns.map(csvCell).join(',')];
  const metadata = { timezone: document.timeZone, start: document.start, end: document.end, generatedAt: document.generatedAt,
    status: document.status, costBasis: document.costBasis, pricingBasis: document.pricing?.basis ?? 'ccusage-report' };
  const write = (row: Record<string, Cell>) => {
    const record: Record<string, Cell> = { ...metadata, ...row };
    lines.push(columns.map(column => csvCell(record[column] ?? null)).join(','));
  };
  const usage = (recordType: string, scope: string, date: string, value: Omit<Aggregate, 'models'>, model = '', pricing?: ModelPricing, extra:Record<string,Cell>={}) => write({
    recordType, scope, date, provider: document.provider, model, ...value.tokens,
    amountUSD: value.cost.amountUSD, knownCostUSD: value.cost.knownCostUSD, pricingStatus: value.cost.status, pricingOrigin: pricing?.source ?? null, pricingUpdatedAt: pricing?.updatedAt ?? null,
    inputUSDPerMillion: pricing?.rates?.input ?? null, outputUSDPerMillion: pricing?.rates?.output ?? null,
    cacheReadUSDPerMillion: pricing?.rates?.cacheRead ?? null, cacheWriteUSDPerMillion: pricing?.rates?.cacheWrite ?? null, ...extra,
  });
  usage('aggregate', 'selected-range', '', document.aggregate);
  for (const model of document.aggregate.models) usage('model', 'selected-range', '', model, model.name, model.pricing);
  for (const day of document.days) {
    usage('day', 'day', day.date, day.aggregate);
    for (const model of day.aggregate.models) usage('day-model', 'day', day.date, model, model.name, model.pricing);
  }
  if(document.grouping) for(const group of document.grouping.groups) {
    const extra={provider:group.provider??document.provider,groupBy:document.grouping.by,groupLabel:group.label,groupSource:group.source??'',groupConfidence:group.confidence??'',groupReconciled:String(document.grouping.reconciled),groupReconciliationIssue:document.grouping.reconciliationIssue??''};
    usage('group','selected-range-rollup','',group.aggregate,'',undefined,extra);
    for(const model of group.aggregate.models) usage('group-model','selected-range-rollup','',model,model.name,model.pricing,extra);
    for(const session of group.sessions??[]) {
      const fields={...extra,sessionId:session.id,sessionTitle:session.title,provider:session.provider,depth:session.depth};
      usage('group-session','selected-range-direct','',session.aggregate,'',undefined,fields);
      for(const model of session.aggregate.models) usage('group-session-model','selected-range-direct','',model,model.name,model.pricing,fields);
    }
  }
  for (const session of document.sessionReferences?.items ?? []) write({ recordType: 'session-reference',
    scope: document.sessionReferences!.scope, date: dayKey(new Date(session.lastActivity), document.timeZone),
    provider: session.provider, sessionId: session.id, sessionTitle: session.title, lastActivity: session.lastActivity,
  });
  return lines.join('\r\n') + '\r\n';
}

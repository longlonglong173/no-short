import { describe, expect, test } from 'bun:test';
import { createUsageExport, serializeUsageExport } from '../src/export';
import type { UsageSnapshot } from '../src/types';
import fixture from './fixtures/history-snapshot.json';

const snapshot = () => structuredClone(fixture) as UsageSnapshot;
const document = () => createUsageExport(snapshot(), 'all', '2026-09-30', '2026-10-01')!;

// Parse escaped fields, including quoted CR/LF, rather than splitting CSV lines.
function csvRows(csv: string): Record<string, string>[] {
  const rows: string[][] = []; let row: string[] = [], value = '', quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (char === '"') {
      if (quoted && csv[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (char === ',' || char === '\r' || char === '\n')) {
      row.push(value); value = '';
      if (char !== ',') { rows.push(row); row = []; if (char === '\r' && csv[i + 1] === '\n') i++; }
    } else value += char;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  const [headers, ...body] = rows;
  return body.map(values => Object.fromEntries(headers.map((key, i) => [key, values[i]])));
}

describe('selected usage export DTO', () => {
  test('shared fixture exports only daily range/provider totals: 375 tokens and $7', () => {
    const result = document();
    expect(result).toMatchObject({ formatVersion: 1, costBasis: 'api-equivalent-estimate-not-billing', provider: 'all',
      start: '2026-09-30', end: '2026-10-01', timeZone: 'UTC', generatedAt: fixture.generatedAt, status: 'ready' });
    expect(result.aggregate.tokens.total).toBe(375); expect(result.aggregate.cost.amountUSD).toBe(7);
    expect(result.days.map(d => [d.date, d.aggregate.tokens.total, d.aggregate.cost.amountUSD])).toEqual([
      ['2026-09-30', 225, 3.25], ['2026-10-01', 150, 3.75],
    ]);
    const codex = createUsageExport(snapshot(), 'codex', '2026-10-01', '2026-10-01')!;
    expect(codex.aggregate.tokens.total).toBe(60); expect(codex.aggregate.cost.amountUSD).toBe(0.75);
    const claude = createUsageExport(snapshot(), 'claude', '2026-09-30', '2026-10-01')!;
    expect(claude.aggregate.tokens.total).toBe(165); expect(claude.aggregate.cost.amountUSD).toBe(5);
  });
  test('default JSON and CSV contain no session identifiers, titles, reference objects or identifier columns', () => {
    const value = snapshot(); value.sessions[0].id = 'SECRET_ID'; value.sessions[0].title = 'SECRET_TITLE';
    Object.assign(value.history!.days[0].aggregate, { path: '/PRIVATE_PATH', conversation: 'PRIVATE_CONVERSATION' });
    const result = createUsageExport(value, 'all', '2026-09-30', '2026-10-01')!;
    expect(result.sessionReferences).toBeUndefined();
    for (const format of ['csv', 'json'] as const) {
      const output = serializeUsageExport(result, format);
      for (const excluded of ['SECRET_', 'PRIVATE_', 'sessionReferences', 'sessionId', 'sessionTitle', 'lastActivity']) expect(output).not.toContain(excluded);
    }
  });
  test('opt-in references use provider and last-activity calendar dates, never session costs/tokens', () => {
    const value = snapshot(); value.timeZone = 'America/Los_Angeles';
    const session = value.sessions[0];
    value.sessions = [
      { ...session, id: 'first', title: 'Đầu', lastActivity: '2026-10-01T07:00:00Z' },
      { ...session, id: 'last', title: 'Cuối', lastActivity: '2026-10-02T06:59:59Z' },
      { ...session, id: 'before', lastActivity: '2026-10-01T06:59:59Z' },
      { ...session, id: 'after', lastActivity: '2026-10-02T07:00:00Z' },
      { ...session, id: 'claude', provider: 'claude', lastActivity: '2026-10-01T12:00:00Z' },
      { ...session, id: 'missing', lastActivity: null },
      { ...session, id: 'bad', lastActivity: 'not-a-date' },
      { ...session, id: 'normalized-bad-date', lastActivity: '2026-02-30T10:00:00Z' },
      { ...session, id: 'no-zone', lastActivity: '2026-10-01T10:00:00' },
      { ...session, id: 'offset', lastActivity: '2026-10-01T11:00:00+02:00' },
      { ...session, id: 'legacy', provider: undefined, lastActivity: '2026-10-01T12:00:00Z' },
    ];
    const result = createUsageExport(value, 'codex', '2026-10-01', '2026-10-01', { includeSessionIdentifiers: true })!;
    expect(result.sessionReferences?.scope).toBe('last-activity-in-range-not-cost-attribution');
    expect(result.sessionReferences?.items.map(s => s.id)).toEqual(['first', 'last', 'offset', 'legacy']);
    expect(result.sessionReferences?.items[0]).toEqual({ id: 'first', title: 'Đầu', provider: 'codex', lastActivity: '2026-10-01T07:00:00Z' });
    for (const reference of result.sessionReferences!.items) expect(Object.keys(reference).sort()).toEqual(['id', 'lastActivity', 'provider', 'title']);
    expect(result.aggregate.cost.amountUSD).toBe(0.75);
    const rows = csvRows(serializeUsageExport(result, 'csv')).filter(r => r.recordType === 'session-reference');
    expect(rows.map(r => r.sessionId)).toEqual(['first', 'last', 'offset', 'legacy']);
    for (const row of rows) {
      expect(row.scope).toBe('last-activity-in-range-not-cost-attribution');
      for (const key of ['input', 'output', 'cacheRead', 'cacheWrite', 'total', 'amountUSD', 'knownCostUSD', 'pricingStatus', 'model']) expect(row[key]).toBe('');
    }
  });
  test('documents are detached deep-frozen copies including optional references', () => {
    const value = snapshot(); const result = createUsageExport(value, 'all', '2026-09-30', '2026-10-01', { includeSessionIdentifiers: true })!;
    const before = serializeUsageExport(result, 'json');
    value.sessions[0].title = 'changed'; value.history!.days[0].aggregate.models[0].name = 'changed';
    value.history!.days[0].aggregate.tokens.total = 99999; value.timeZone = 'Asia/Ho_Chi_Minh';
    expect(serializeUsageExport(result, 'json')).toBe(before);
    for (const object of [result, result.aggregate, result.aggregate.models, result.aggregate.models[0].tokens,
      result.days, result.days[0].aggregate.cost, result.sessionReferences, result.sessionReferences!.items[0]]) expect(Object.isFrozen(object)).toBe(true);
    expect(Object.isFrozen(value)).toBe(false);
  });
  test('successful empty ranges are exportable, independent of snapshot generation date or wall clock', () => {
    const result = createUsageExport(snapshot(), 'all', '2026-10-02', '2026-10-02')!;
    expect(result.aggregate.tokens.total).toBe(0); expect(result.aggregate.cost.amountUSD).toBe(0); expect(result.days).toEqual([]);
    expect(csvRows(serializeUsageExport(result, 'csv'))).toHaveLength(1);
    const value = snapshot(); value.history!.days = [];
    const empty = createUsageExport(value, 'claude', '2026-09-30', '2026-10-01', { includeSessionIdentifiers: true })!;
    expect(empty.aggregate.tokens.total).toBe(0); expect(empty.sessionReferences?.items).toHaveLength(1);
  });
  test('legacy, malformed, missing providers and source errors return unavailable', () => {
    const legacy = snapshot(); delete legacy.history;
    expect(createUsageExport(legacy, 'all', '2026-09-30', '2026-10-01')).toBeNull();
    const malformed = snapshot(); malformed.history!.days[0].date = '2026-02-30';
    expect(createUsageExport(malformed, 'all', '2026-09-30', '2026-10-01')).toBeNull();
    const codex = snapshot(); codex.history!.providers = ['codex']; codex.history!.days = codex.history!.days.filter(d => d.provider === 'codex');
    expect(createUsageExport(codex, 'claude', '2026-09-30', '2026-10-01')).toBeNull();
    const error = snapshot(); error.status = 'error';
    expect(createUsageExport(error, 'all', '2026-09-30', '2026-10-01')).toBeNull();
    const stale = snapshot(); stale.status = 'stale';
    expect(createUsageExport(stale, 'all', '2026-09-30', '2026-10-01')?.status).toBe('stale');
  });
  test.each([['2026-02-29', '2026-10-01'], ['2026-10-02', '2026-10-01'], ['2026-9-30', '2026-10-01']])('rejects invalid calendar range %s..%s', (start, end) => {
    expect(createUsageExport(snapshot(), 'all', start, end)).toBeNull();
  });
});

describe('export serialization', () => {
  test('JSON round-trips the versioned document with numeric data and no CSV sanitization', () => {
    const result = document(); const json = serializeUsageExport(result, 'json');
    expect(JSON.parse(json)).toEqual(result); expect(json).toContain('api-equivalent-estimate-not-billing');
  });
  test('CSV retains totals and model/day breakdowns with metadata on every row', () => {
    const result = document(), csv = serializeUsageExport(result, 'csv'), rows = csvRows(csv);
    expect(rows.map(r => r.recordType)).toEqual(['aggregate', 'model', 'model', 'day', 'day-model', 'day-model', 'day', 'day-model', 'day-model']);
    expect(rows[0]).toMatchObject({ total: '375', amountUSD: '7', knownCostUSD: '7', pricingStatus: 'estimated', provider: 'all' });
    expect(csv).toContain('"aggregate"'); expect(csv).toContain(',375,7,7,"estimated",');
    for (const row of rows) expect(row).toMatchObject({ costBasis: 'api-equivalent-estimate-not-billing',
      timezone: 'UTC', start: '2026-09-30', end: '2026-10-01', generatedAt: fixture.generatedAt, status: 'ready' });
    expect(rows.filter(r => r.recordType === 'day').map(r => [r.date, r.total, r.amountUSD])).toEqual([
      ['2026-09-30', '225', '3.25'], ['2026-10-01', '150', '3.75'],
    ]);
  });
  test.each(['unknown', 'partial'] as const)('%s amounts remain JSON null and CSV blank, including known subtotal zero', status => {
    const value = snapshot(); value.history!.days = [value.history!.days[0]];
    const aggregate = value.history!.days[0].aggregate;
    aggregate.cost = { amountUSD: null, knownCostUSD: 0, status };
    aggregate.models[0].cost = { amountUSD: null, knownCostUSD: 0, status };
    const result = createUsageExport(value, 'codex', '2026-09-30', '2026-09-30')!;
    expect(JSON.parse(serializeUsageExport(result, 'json')).aggregate.cost.amountUSD).toBeNull();
    for (const row of csvRows(serializeUsageExport(result, 'csv'))) expect(row).toMatchObject({ amountUSD: '', knownCostUSD: '0', pricingStatus: status });
  });
  test.each(['=SUM(1,2)', '+1', '-1', '@SUM(A1)', ' \t=HYPERLINK("x")', '\t+1', '\r\n-1', '\u00a0@formula'])('CSV neutralizes formula text %j in models and opted-in identifiers', text => {
    const value = snapshot(); value.history!.days[0].aggregate.models[0].name = text;
    value.sessions[0].id = text; value.sessions[0].title = text;
    const result = createUsageExport(value, 'all', '2026-09-30', '2026-10-01', { includeSessionIdentifiers: true })!;
    const rows = csvRows(serializeUsageExport(result, 'csv'));
    expect(rows.some(r => r.model === "'" + text)).toBe(true);
    expect(rows.find(r => r.recordType === 'session-reference')).toMatchObject({ sessionId: "'" + text, sessionTitle: "'" + text });
    expect(JSON.parse(serializeUsageExport(result, 'json')).sessionReferences.items[0].title).toBe(text);
  });
  test('CSV round-trips Unicode, commas, quotes and multiline text, and opt-in columns exist even without references', () => {
    const title = 'Báo cáo 🪷, "中文"\r\nDòng 2';
    const value = snapshot(); value.sessions[0].title = title;
    const result = createUsageExport(value, 'codex', '2026-09-30', '2026-10-01', { includeSessionIdentifiers: true })!;
    const csv = serializeUsageExport(result, 'csv');
    expect(csv).toContain('"Báo cáo 🪷, ""中文""\r\nDòng 2"');
    expect(csvRows(csv).find(r => r.recordType === 'session-reference')?.sessionTitle).toBe(title);
    const empty = createUsageExport(value, 'codex', '2025-01-01', '2025-01-02', { includeSessionIdentifiers: true })!;
    expect(csvRows(serializeUsageExport(empty, 'csv'))[0]).toMatchObject({ sessionId: '', sessionTitle: '', lastActivity: '' });
  });
});

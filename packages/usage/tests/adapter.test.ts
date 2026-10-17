import { describe, expect, test } from 'bun:test';
import raw from './fixtures/unified.json';
import { buildSnapshot, dayKey, selectSession } from '../src/adapter';

const options = { now: new Date('2026-10-17T05:00:00Z'), timeZone: 'Asia/Ho_Chi_Minh', metadata: new Map() };
const data = () => structuredClone(raw);

describe('ccusage report boundary', () => {
  test('preserves CLI totals and per-model costs without adding reasoning twice', () => {
    const snapshot = buildSnapshot(data(), options);
    const first = snapshot.sessions.find(s => s.id.includes('11111111'))!;
    expect(first.tokens.total).toBe(2080);
    expect(first.tokens.output).toBe(80);
    expect(first.cost.amountUSD).toBe(0.42);
    expect(first.models.map(m => m.cost.amountUSD)).toEqual([0.32, 0.10]);
    expect(snapshot.today.cost.amountUSD).toBe(0.47);
    expect(snapshot.month.cost.amountUSD).toBeCloseTo(0.57);
    expect(snapshot.chart).toHaveLength(7);
    expect(snapshot.chart.at(-1)?.date).toBe('2026-10-17');
  });
  test('unknown pricing never becomes a free session and partial totals stay incomplete', () => {
    const report = data();
    Object.assign(report.session[0].modelBreakdowns[0], { missingPricing: true, cost: 0 });
    report.session[0].totalCost = 0.10;
    const session = buildSnapshot(report, options).sessions.find(s => s.id.includes('11111111'))!;
    expect(session.cost.amountUSD).toBeNull();
    expect(session.cost.knownCostUSD).toBe(0.10);
    expect(session.cost.status).toBe('partial');
    expect(session.models[0].cost.status).toBe('unknown');
  });
  test('rejects incompatible, negative and non-finite reports instead of showing zero', () => {
    expect(() => buildSnapshot({ sessions: [] }, options)).toThrow();
    for (const n of [-1, Infinity, NaN]) {
      const report = data(); report.session[0].totalCost = n;
      expect(() => buildSnapshot(report, options)).toThrow();
    }
  });
  test('rejects unexpected sources rather than silently including their costs', () => {
    const report = data(); report.session[0].agent = 'claude';
    expect(() => buildSnapshot(report, options)).toThrow();
  });
  test('exports only usage and sanitized metadata, never paths or message payloads', () => {
    const report = data();
    Object.assign(report.session[0], { prompt: 'PRIVATE_PROMPT', directory: '/PRIVATE_PATH', content: 'PRIVATE_CONTENT' });
    const snapshot = buildSnapshot(report, options);
    expect(JSON.stringify(snapshot)).not.toContain('PRIVATE_');
    expect(snapshot.sessions[0].title.length).toBeGreaterThan(0);
  });
  test('pinned missing sessions remain missing; latest excludes subagents', () => {
    const metadata = new Map([[raw.session[1].period, { title: 'Tác vụ con', kind: 'subagent' as const }]]);
    const snapshot = buildSnapshot(data(), { ...options, metadata });
    expect(selectSession(snapshot.sessions, null)?.id).toBe(raw.session[0].period);
    expect(selectSession(snapshot.sessions, 'deleted-session')).toBeNull();
    expect(selectSession(snapshot.sessions, raw.session[1].period)?.title).toBe('Tác vụ con');
  });
  test('date-prefixed CLI IDs still resolve metadata and exclude subagents from default selection', () => {
    const report = data();
    const metadata = new Map(report.session.map((r, i) => [r.period, { title: i ? 'Tác vụ con' : 'Phiên chính', kind: i ? 'subagent' as const : 'main' as const }]));
    for (const row of report.session) row.period = `2026/10/17/${row.period}`;
    const snapshot = buildSnapshot(report, { ...options, metadata });
    expect(snapshot.sessions.find(s => s.kind === 'subagent')?.title).toBe('Tác vụ con');
    expect(selectSession(snapshot.sessions, null)?.title).toBe('Phiên chính');
    expect(snapshot.sessions.every(s => s.id.startsWith('2026/10/17/'))).toBe(true);
  });
  test('empty reports produce a genuine empty state and today follows local midnight', () => {
    expect(buildSnapshot({ session: [], daily: [], totals: {} }, options).sessions).toEqual([]);
    expect(dayKey(new Date('2026-10-16T18:30:00Z'), 'Asia/Ho_Chi_Minh')).toBe('2026-10-17');
    expect(dayKey(new Date('2026-10-16T18:30:00Z'), 'America/Los_Angeles')).toBe('2026-10-16');
  });
});

import { expect, test } from 'bun:test';
import { costText, decodeResult } from '../ui/model';
import { buildSnapshot } from '../src/adapter';
import raw from './fixtures/unified.json';

test('unknown and partial prices cannot be formatted as a zero-dollar charge', () => {
  expect(costText({ amountUSD: null, knownCostUSD: 0, status: 'unknown' })).toBe('Chưa xác định');
  expect(costText({ amountUSD: null, knownCostUSD: 0.1, status: 'partial' })).toBe('Chưa đầy đủ');
  expect(costText({ amountUSD: 0.42, knownCostUSD: 0.42, status: 'estimated' })).toBe('$0.42');
});
test('widget reads hidden result metadata and rejects unsupported snapshot versions', () => {
  const snapshot = buildSnapshot(raw, { now: new Date(), timeZone: 'UTC', metadata: new Map() });
  const value = { snapshot, selectedSession: snapshot.sessions[0], requestedSessionId: null };
  expect(decodeResult({ _meta: { usage: value } })).toEqual(value);
  expect(decodeResult({ mcp_tool_result: { _meta: { usage: value } } })).toEqual(value);
  expect(decodeResult({ _meta: { usage: { ...value, snapshot: { ...snapshot, schemaVersion: 99 } } } })).toBeNull();
});

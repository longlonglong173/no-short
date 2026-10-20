import { expect, test } from 'bun:test';
import { OpenAIUiResourceMetadataSchema } from '@openai/mcp-extensions';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { buildSnapshot } from '../src/adapter';
import { createServer } from '../src/server';
import fixture from './fixtures/unified.json';
import { mixedDashboard } from './fixtures/mixed';

test('MCP exposes exactly two read-only tools and a self-contained thread panel', async () => {
  const snapshot = buildSnapshot(fixture, { now: new Date('2026-10-17T05:00:00Z'), timeZone: 'UTC', metadata: new Map() });
  const server = createServer({ get: async () => snapshot }, '<html lang="vi"><body>No Short Usage</body></html>');
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'usage-test', version: '1.0.0' });
  await server.connect(a); await client.connect(b);
  try {
    const tools = await client.listTools();
    expect(tools.tools.map(t => t.name).sort()).toEqual(['get_session_usage', 'get_usage_dashboard']);
    expect(tools.tools.every(t => t.annotations?.readOnlyHint === true)).toBe(true);
    const open = tools.tools.find(t => t.name === 'get_usage_dashboard')!;
    expect((open._meta?.['openai/ui'] as any).entrypoints).toEqual([{ type: 'thread' }]);
    const result = await client.callTool({ name: 'get_usage_dashboard', arguments: {} });
    expect((result.structuredContent as any).sessionCount).toBe(2);
    expect((result.structuredContent as any).sessions).toBeUndefined();
    expect((result._meta?.usage as any).snapshot.sessions).toHaveLength(2);
    const resource = await client.readResource({ uri: 'ui://no-short/usage.html' });
    expect((resource.contents[0] as any).text).toContain('No Short Usage');
    expect(OpenAIUiResourceMetadataSchema.safeParse(resource.contents[0]._meta?.['openai/ui']).success).toBe(true);
    expect(resource.contents[0].mimeType).toBe('text/html;profile=mcp-app');
    snapshot.sessions[0].id = '2026/10/17/rollout-relative-id';
    const relative = await client.callTool({ name: 'get_session_usage', arguments: { sessionId: snapshot.sessions[0].id } });
    expect(relative.isError).not.toBe(true);
    expect((relative.structuredContent as any).selectedSession.id).toBe(snapshot.sessions[0].id);
    const missing = await client.callTool({ name: 'get_session_usage', arguments: { sessionId: 'deleted-session' } });
    expect((missing.structuredContent as any).selectedSession).toBeNull();
    const invalid = await client.callTool({ name: 'get_session_usage', arguments: { sessionId: '../../PRIVATE' } });
    expect(invalid.isError).toBe(true);
  } finally { await client.close(); await server.close(); }
});

test('MCP mixed-source summaries identify combined period totals and preserve an exact Claude session request', async () => {
  const { snapshot } = mixedDashboard();
  const server = createServer({ get: async () => snapshot }, '<html></html>');
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'mixed-usage-test', version: '1.0.0' });
  await server.connect(a); await client.connect(b);
  try {
    const sessionId = snapshot.sessions.find(s => s.provider === 'claude')!.id;
    const result = await client.callTool({ name: 'get_session_usage', arguments: { sessionId } });
    const summary = result.structuredContent as any;
    expect(summary.providers).toEqual(['codex', 'claude']);
    expect(summary.today.cost.amountUSD).toBeCloseTo(1.72);
    expect(summary.month.cost.amountUSD).toBeCloseTo(4.32);
    expect(summary.selectedSession.id).toBe(sessionId);
    expect(summary.selectedSession.cost.amountUSD).toBe(4);
    expect((result._meta?.usage as any).requestedSessionId).toBe(sessionId);
    expect(summary.sessions).toBeUndefined();
    expect(result.isError).not.toBe(true);
    snapshot.providerBreakdowns = [];
    const withoutBreakdowns = await client.callTool({ name: 'get_usage_dashboard', arguments: {} });
    expect((withoutBreakdowns.structuredContent as any).providers).toEqual(['codex', 'claude']);
  } finally { await client.close(); await server.close(); }
});

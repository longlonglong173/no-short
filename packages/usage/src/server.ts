import { usageVersion } from './version';
import { McpServer } from '@modelcontextprotocol/server';
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import type { OpenAIUiResourceMetadata } from '@openai/mcp-extensions';
import { OpenAIExtensions } from '@openai/mcp-extensions/server';
import { z } from 'zod';
import { selectSession } from './adapter.ts';
import type { DashboardResult, UsageSnapshot } from './types.ts';

const panelUri = 'ui://no-short/usage.html';
// IDs are opaque report keys, never resolved as filesystem paths.
const id = z.string().min(1).max(300).regex(/^[a-zA-Z0-9_:/.-]+$/)
  .refine(value => !value.startsWith('/') && !value.split('/').some(part => part === '.' || part === '..'));
const display = { preferredDisplayMode: 'inline', availableDisplayModes: ['inline', 'fullscreen'] } satisfies OpenAIUiResourceMetadata;
export function createServer(store: { get(): Promise<UsageSnapshot> }, html: string): McpServer {
  const server = new McpServer({ name: 'no-short-usage', version: '0.7.1' });
  new OpenAIExtensions(server);
  const ui = { csp: { connectDomains: [], resourceDomains: [] }, prefersBorder: false };
  registerAppResource(server, 'No Short Usage', panelUri, { _meta: { ui } }, async () => ({ contents: [{
    uri: panelUri, mimeType: RESOURCE_MIME_TYPE, text: html, _meta: { ui,
      'openai/widgetDescription': 'Local Codex and explicitly configured Claude Code usage, with estimated API-equivalent costs. Not subscription bills or credits.',
      'openai/ui': display },
  }] }));
  async function result(sessionId?: string) {
    const snapshot = await store.get();
    const data: DashboardResult = { snapshot, selectedSession: selectSession(snapshot.sessions, sessionId ?? null), requestedSessionId: sessionId ?? null };
    // Full history goes only to the widget; keep the model's context bounded.
    const providers = [...new Set([...(snapshot.providerBreakdowns?.map(p => p.provider) ?? []), ...snapshot.sessions.map(s => s.provider ?? 'codex')])];
    if (!providers.length) providers.push('codex');
    const summary = { providers, generatedAt: snapshot.generatedAt, status: snapshot.status, notice: snapshot.notice,
      costBasis: 'API-equivalent estimate; not ChatGPT billing or credits', sessionCount: snapshot.sessions.length,
      selectedSession: data.selectedSession, today: snapshot.today, month: snapshot.month };
    return { content: [{ type: 'text' as const, text: snapshot.status === 'error' ? snapshot.notice! : `No Short Usage: API-equivalent estimates from local ${providers.map(p => p === 'claude' ? 'Claude Code' : 'Codex').join(' and ')} logs. Today/month totals include all configured providers; the selected session covers its entire retained history.` }],
      structuredContent: summary, _meta: { usage: data } };
  }
  const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
  registerAppTool(server, 'get_usage_dashboard', {
    title: 'No Short Usage',
    description: 'Open the No Short Usage panel showing local Codex and explicitly configured Claude Code usage with provider filters and API-equivalent USD estimates. Period totals cover all configured providers; session costs cover retained session history. Not subscription charges, credits or the focused tab. Other agents are excluded. Pricing may be fetched from LiteLLM.',
    inputSchema: z.object({ sessionId: id.optional() }), annotations,
    _meta: { ui: { resourceUri: panelUri, visibility: ['model', 'app'] }, 'openai/ui': { entrypoints: [{ type: 'thread' }] },
      'openai/outputTemplate': panelUri, 'openai/widgetAccessible': true },
  }, async ({ sessionId }) => result(sessionId));
  registerAppTool(server, 'get_session_usage', {
    title: 'Thống kê phiên',
    description: 'Read usage for one session ID returned by the dashboard. An omitted ID selects the latest non-subagent session; a missing ID stays missing. No message contents are returned.',
    inputSchema: z.object({ sessionId: id.optional() }), annotations,
    _meta: { ui: { resourceUri: panelUri, visibility: ['model', 'app'] }, 'openai/outputTemplate': panelUri, 'openai/widgetAccessible': true },
  }, async ({ sessionId }) => result(sessionId));
  return server;
}

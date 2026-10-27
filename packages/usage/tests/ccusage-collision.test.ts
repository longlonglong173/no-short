import { expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runReport } from '../src/runner';
import { buildSnapshot } from '../src/adapter';
const binary = process.env.NO_SHORT_USAGE_CCUSAGE ?? new URL(`../runtime/darwin-${process.arch}/ccusage`, import.meta.url).pathname;
test.skipIf(!existsSync(binary))('patched ccusage preserves distinct-session totals even when timestamps and token counters match', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ns08-collision-'));
  try {
    await mkdir(join(root, 'sessions'));
    const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
    const write = async (secondTime: string) => {
      for (const [i, id] of ids.entries()) await writeFile(join(root, `sessions/rollout-${id}.jsonl`), [
        { type: 'session_meta', payload: { id, source: 'cli', timestamp: '2026-10-17T03:00:00Z' } },
        { type: 'turn_context', payload: { model: 'gpt-6.1-sol' } },
        { type: 'event_msg', timestamp: i ? secondTime : '2026-10-17T03:00:00Z', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 100, cached_input_tokens: 50, output_tokens: 10, reasoning_output_tokens: 5, total_tokens: 110 } } } },
      ].map(v => JSON.stringify(v)).join('\n') + '\n');
      const raw = await runReport({ binary, roots: [root], cacheDir: join(root, 'cache'), timeZone: 'UTC', offline: true });
      return buildSnapshot(raw, { now: new Date('2026-10-17T05:00:00Z'), timeZone: 'UTC', metadata: new Map() });
    };
    const collision = await write('2026-10-17T03:00:00Z');
    expect(collision.sessions).toHaveLength(2);
    expect(collision.today.tokens.total).toBe(220);
    const distinct = await write('2026-10-17T04:00:00Z');
    expect(distinct.today.tokens.total).toBe(220);
  } finally { await rm(root, { recursive: true, force: true }); }
}, 20_000);

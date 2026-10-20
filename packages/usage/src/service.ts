import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { buildSnapshot } from './adapter.ts';
import { readMetadata, readClaudeMetadata } from './metadata.ts';
import { runReport } from './runner.ts';
import { SnapshotStore } from './cache.ts';

export interface ServiceOptions { binary: string; roots?: string[]; claudeRoots?: string[]; cacheDir?: string; timeZone?: string }
export function createUsageService(options: ServiceOptions): SnapshotStore {
  const roots = (options.roots ?? (process.env.CODEX_HOME ?? join(homedir(), '.codex')).split(',')).map(p => p.trim()).filter(Boolean).map(p => resolve(p));
  if (!roots.length) roots.push(join(homedir(), '.codex'));
  const requestedClaudeRoots = options.claudeRoots ?? process.env.NO_SHORT_USAGE_CLAUDE_ROOTS?.split(',').filter(p => p.trim()).map(p => resolve(p.trim()));
  const claudeRoots = requestedClaudeRoots?.filter(root => existsSync(join(root,'projects')));
  const timeZone = options.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  new Intl.DateTimeFormat('en', { timeZone });
  const scope = createHash('sha256').update(JSON.stringify({ roots, timeZone, ccusage: '20.0.34', schema: 1, history: 1, ...(requestedClaudeRoots?.length ? { claudeRoots:requestedClaudeRoots } : {}) })).digest('hex').slice(0, 24);
  const directory = join(options.cacheDir ?? process.env.NO_SHORT_USAGE_CACHE_DIR ?? join(homedir(), 'Library/Caches/no-short/usage'), scope);
  return new SnapshotStore(directory, async () => {
    const priceMarker = join(directory, 'pricing-check.json');
    let lastOnline = 0;
    try { lastOnline = JSON.parse(await readFile(priceMarker, 'utf8')).lastOnline ?? 0; } catch { /* First launch. */ }
    let offline = process.env.NO_SHORT_USAGE_OFFLINE === '1' || Date.now() - lastOnline < 24 * 60 * 60_000;
    let report;
    try { report = await runReport({ ...options, roots, claudeRoots, cacheDir: directory, timeZone, offline }); }
    catch (e) { if (offline) throw e; offline = true; report = await runReport({ ...options, roots, claudeRoots, cacheDir: directory, timeZone, offline: true }); }
    const metadata = await readMetadata(roots, { cacheDir: join(directory, 'metadata') });
    if (claudeRoots?.length) for (const [key, value] of await readClaudeMetadata(claudeRoots, { cacheDir: join(directory, 'metadata') })) metadata.set(key, value);
    const value = buildSnapshot(report, { now: new Date(), timeZone, metadata, providers: requestedClaudeRoots?.length ? ['codex', 'claude'] : ['codex'], pricingSource: offline ? 'cached' : 'online' });
    if (!offline) { await mkdir(directory, { recursive: true, mode: 0o700 }); await writeFile(priceMarker, JSON.stringify({ lastOnline: Date.now() }), { mode: 0o600 }); }
    return value;
  }, { timeZone, ttlMs: process.env.NO_SHORT_USAGE_FRESH_MS === '1000' ? 1000 : undefined });
}

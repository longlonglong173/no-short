import { open, readdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { projectMetadata } from './project-metadata';
import { decodeGrouping, mergeGrouping } from './grouping-types';
import type { SessionMetadata } from './types.ts';
import { MetadataFileCache, type MetadataOptions, type CachedMetadata } from './metadata-file-cache';

const missing = (e: unknown) => ['ENOENT', 'ENOTDIR'].includes((e as NodeJS.ErrnoException).code ?? '');
async function firstLine(path: string): Promise<string> {
  const file = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(1024 * 1024);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    const newline = buffer.indexOf(10, 0);
    return buffer.subarray(0, newline >= 0 && newline < bytesRead ? newline : bytesRead).toString('utf8');
  } finally { await file.close(); }
}
async function* files(directory: string): AsyncGenerator<string> {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); } catch (e) { if (missing(e)) return; throw e; }
  for (const e of entries) {
    if (e.isDirectory()) yield* files(join(directory, e.name));
    else if (e.isFile() && /\.jsonl(?:\.zst)?$/.test(e.name)) yield join(directory, e.name);
  }
}
export async function readMetadata(roots: string[], options: MetadataOptions = {}): Promise<Map<string, SessionMetadata>> {
  const result = new Map<string, SessionMetadata>(), cache = await MetadataFileCache.open('codex', options);
  const projects = new Map<string, ReturnType<typeof projectMetadata>>();
  const projectFor = (cwd?: string) => { if (!cwd) return Promise.resolve(undefined); if (!projects.has(cwd)) projects.set(cwd, projectMetadata(cwd)); return projects.get(cwd)!; };
  for (const root of roots) {
    const titles = new Map<string, string>();
    try {
      const lines = createInterface({ input: createReadStream(join(root, 'session_index.jsonl')), crlfDelay: Infinity });
      for await (const line of lines) {
        try { const row = JSON.parse(line); if (typeof row.id === 'string' && typeof row.thread_name === 'string') titles.set(row.id, row.thread_name); }
        catch { /* An index append may end with an incomplete record. */ }
      }
    } catch (e) { if (!missing(e)) throw e; }
    for (const directory of ['sessions', 'archived_sessions']) {
      for await (const path of files(join(root, directory))) {
        const name = path.split('/').at(-1)!.replace(/\.jsonl(?:\.zst)?$/, '');
        let value: CachedMetadata;
        try { value = await cache.read(path, async () => {
          let id = name.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
          let kind: SessionMetadata['kind'] = 'unknown';
          let cwd: string | undefined, grouping: SessionMetadata['grouping'];
          if (!path.endsWith('.zst')) {
            const line = await firstLine(path);
            try {
              const record = JSON.parse(line);
              if (record.type === 'session_meta') {
                const meta = record.payload;
                if (typeof meta.id === 'string') id = meta.id;
                cwd = typeof meta.cwd === 'string' && meta.cwd.length <= 4096 ? meta.cwd : undefined;
                const parentId = meta.source?.subagent?.thread_spawn?.parent_thread_id;
                if (typeof parentId === 'string') grouping = decodeGrouping({ parent: { sessionKey: parentId, source: 'codex-session-meta' } });
                const source = meta.source;
                if (source && typeof source === 'object' && 'subagent' in source || source === 'subagent' || meta.thread_source === 'subagent') kind = 'subagent';
                else if (typeof source === 'string') kind = 'main';
              }
            } catch { /* Never infer metadata from messages. */ }
          }
          return { id, kind, ...(cwd ? { cwd } : {}), ...(grouping ? { grouping } : {}) };
        }); } catch (e) { if (missing(e)) continue; throw e; }
        const project = await projectFor(value.cwd);
        const grouping = mergeGrouping(value.grouping, project ? { project } : undefined);
        const existing = result.get(value.id ?? name) ?? result.get(name);
        const merged = mergeGrouping(existing?.grouping, grouping);
        const metadata = { title: titles.get(value.id ?? '') ?? `Phiên ${(value.id ?? name).slice(0, 8)}`, kind: value.kind, ...(merged ? { grouping: merged } : {}) };
        result.set(name, metadata);
        if (value.id && value.id !== name) result.set(value.id, metadata);
        // All aliases for copied source files receive the same conflict-safe metadata.
        if (existing) for (const [key, old] of result) if (old === existing) result.set(key, metadata);
      }
    }
  }
  await cache.save(); return result;
}

export async function readClaudeMetadata(roots: string[], options: MetadataOptions = {}): Promise<Map<string, SessionMetadata>> {
  const result = new Map<string, SessionMetadata>(), cache = await MetadataFileCache.open('claude', options);
  const projects = new Map<string, ReturnType<typeof projectMetadata>>();
  const projectFor = (cwd?: string) => { if (!cwd) return Promise.resolve(undefined); if (!projects.has(cwd)) projects.set(cwd, projectMetadata(cwd)); return projects.get(cwd)!; };
  for (const root of roots) for await (const path of files(join(root, 'projects'))) {
    if (!path.endsWith('.jsonl')) continue;
    const id = path.split('/').at(-1)!.replace(/\.jsonl$/, '');
    let value: CachedMetadata;
    try { value = await cache.read(path, async () => {
      let title = `Phiên ${id.slice(0, 8)}`;
      const kind = path.includes('/subagents/') || id.startsWith('agent-') ? 'subagent' : 'main';
      let cwd: string | undefined;
      try { const first = JSON.parse(await firstLine(path)); if (typeof first.cwd === 'string' && first.cwd.length <= 4096) cwd = first.cwd; } catch { /* Optional first-record metadata. */ }
      const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
      for await (const line of lines) {
        try { const row = JSON.parse(line); if (row.type === 'custom-title' && typeof row.customTitle === 'string') title = row.customTitle.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 160); }
        catch { /* Concurrent trailing append or optional metadata. */ }
      }
      return { title, kind, ...(cwd ? { cwd } : {}) };
    }); } catch (e) { if (missing(e)) continue; throw e; }
    const project = await projectFor(value.cwd);
    const key = `claude:${id}`, existing = result.get(key);
    const grouping = mergeGrouping(existing?.grouping, project ? { project } : undefined);
    result.set(key, { title: value.title ?? `Phiên ${id.slice(0, 8)}`, kind: value.kind, ...(grouping ? { grouping } : {}) });
  }
  await cache.save(); return result;
}

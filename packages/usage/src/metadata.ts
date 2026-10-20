import { open, readdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
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
        if (result.has(name)) continue;
        let value: CachedMetadata;
        try { value = await cache.read(path, async () => {
          let id = name.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
          let kind: SessionMetadata['kind'] = 'unknown';
          if (!path.endsWith('.zst')) {
            const line = await firstLine(path);
            try {
              const record = JSON.parse(line);
              if (record.type === 'session_meta') {
                const meta = record.payload;
                if (typeof meta.id === 'string') id = meta.id;
                const source = meta.source;
                if (source && typeof source === 'object' && 'subagent' in source || source === 'subagent' || meta.thread_source === 'subagent') kind = 'subagent';
                else if (typeof source === 'string') kind = 'main';
              }
            } catch { /* Never infer metadata from messages. */ }
          }
          return { id, kind };
        }); } catch (e) { if (missing(e)) continue; throw e; }
        result.set(name, { title: titles.get(value.id ?? '') ?? `Phiên ${(value.id ?? name).slice(0, 8)}`, kind: value.kind });
      }
    }
  }
  await cache.save(); return result;
}

export async function readClaudeMetadata(roots: string[], options: MetadataOptions = {}): Promise<Map<string, SessionMetadata>> {
  const result = new Map<string, SessionMetadata>(), cache = await MetadataFileCache.open('claude', options);
  for (const root of roots) for await (const path of files(join(root, 'projects'))) {
    if (!path.endsWith('.jsonl')) continue;
    const id = path.split('/').at(-1)!.replace(/\.jsonl$/, '');
    let value: CachedMetadata;
    try { value = await cache.read(path, async () => {
      let title = `Phiên ${id.slice(0, 8)}`;
      const kind = path.includes('/subagents/') || id.startsWith('agent-') ? 'subagent' : 'main';
      const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
      for await (const line of lines) {
        try { const row = JSON.parse(line); if (row.type === 'custom-title' && typeof row.customTitle === 'string') title = row.customTitle.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 160); }
        catch { /* Concurrent trailing append or optional metadata. */ }
      }
      return { title, kind };
    }); } catch (e) { if (missing(e)) continue; throw e; }
    result.set(`claude:${id}`, { title: value.title ?? `Phiên ${id.slice(0, 8)}`, kind: value.kind });
  }
  await cache.save(); return result;
}

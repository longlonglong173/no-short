import { open, readdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import type { SessionMetadata } from './types.ts';

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
export async function readMetadata(roots: string[]): Promise<Map<string, SessionMetadata>> {
  const result = new Map<string, SessionMetadata>();
  for (const root of roots) {
    const titles = new Map<string, string>();
    try {
      const lines = createInterface({ input: createReadStream(join(root, 'session_index.jsonl')), crlfDelay: Infinity });
      for await (const line of lines) {
        try { const row = JSON.parse(line); if (typeof row.id === 'string' && typeof row.thread_name === 'string') titles.set(row.id, row.thread_name); }
        catch { /* A concurrent append may leave a partial final record. */ }
      }
    } catch (e) { if (!missing(e)) throw e; }
    for (const directory of ['sessions', 'archived_sessions']) {
      for await (const path of files(join(root, directory))) {
        const name = path.split('/').at(-1)!.replace(/\.jsonl(?:\.zst)?$/, '');
        if (result.has(name)) continue; // Active copy wins, as in ccusage.
        let id = name.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
        let kind: SessionMetadata['kind'] = 'unknown';
        if (!path.endsWith('.zst')) {
          let line: string;
          try { line = await firstLine(path); } catch (e) { if (missing(e)) continue; throw e; }
          try {
            const record = JSON.parse(line);
            if (record.type === 'session_meta') {
              const meta = record.payload;
              if (typeof meta.id === 'string') id = meta.id;
              const source = meta.source;
              if (source && typeof source === 'object' && 'subagent' in source || source === 'subagent' || meta.thread_source === 'subagent') kind = 'subagent';
              else if (typeof source === 'string') kind = 'main';
            }
          } catch { /* Metadata is optional; never use message content as a title. */ }
        }
        result.set(name, { title: titles.get(id ?? '') ?? `Phiên ${(id ?? name).slice(0, 8)}`, kind });
      }
    }
  }
  return result;
}

export async function readClaudeMetadata(roots: string[]): Promise<Map<string, SessionMetadata>> {
  const result = new Map<string, SessionMetadata>();
  for (const root of roots) for await (const path of files(join(root, 'projects'))) {
    if (!path.endsWith('.jsonl')) continue;
    const id = path.split('/').at(-1)!.replace(/\.jsonl$/, '');
    let title = `Phiên ${id.slice(0, 8)}`;
    const kind = path.includes('/subagents/') || id.startsWith('agent-') ? 'subagent' : 'main';
    const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
    try {
      for await (const line of lines) {
        try { const row = JSON.parse(line); if (row.type === 'custom-title' && typeof row.customTitle === 'string') title = row.customTitle.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 160); }
        catch { /* Concurrent trailing append or optional metadata. */ }
      }
    } catch (e) { if (!missing(e)) throw e; }
    result.set(`claude:${id}`, { title, kind });
  }
  return result;
}

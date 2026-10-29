import { lstat, mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { decodeGrouping } from './grouping-types.ts';
import type { SessionMetadata } from './types.ts';
export interface MetadataOptions { cacheDir?: string; stats?: { hits: number; reads: number } }
export interface CachedMetadata { id?: string; title?: string; kind: SessionMetadata['kind']; cwd?: string; grouping?: SessionMetadata['grouping'] }
interface Entry { signature: string; value: CachedMetadata }
const valid = (v: any): v is Entry => typeof v?.signature === 'string' && v.signature.length < 200
  && ['main', 'subagent', 'unknown'].includes(v.value?.kind)
  && (v.value.id === undefined || typeof v.value.id === 'string' && v.value.id.length <= 1000)
  && (v.value.cwd === undefined || typeof v.value.cwd === 'string' && v.value.cwd.length <= 4096)
  && (v.value.grouping === undefined || decodeGrouping(v.value.grouping) !== undefined)
  && (v.value.title === undefined || typeof v.value.title === 'string' && v.value.title.length <= 160);
const signature = async (path: string) => {
  const s = await lstat(path, { bigint: true });
  if (!s.isFile()) throw Object.assign(new Error('Not a regular log'), { code: 'ENOENT' });
  return `${s.dev}:${s.ino}:${s.size}:${s.mtimeNs}:${s.ctimeNs}`;
};
/** Optional private disk cache; fresh directory discovery and per-file stat are never skipped. */
export class MetadataFileCache {
  private previous = new Map<string, Entry>();
  private next = new Map<string, Entry>();
  private constructor(private path: string | null, private options: MetadataOptions) {}
  static async open(provider: 'codex' | 'claude', options: MetadataOptions) {
    const cache = new MetadataFileCache(options.cacheDir ? join(options.cacheDir, `metadata-${provider}.json`) : null, options);
    if (cache.path) try {
      if ((await lstat(cache.path)).isSymbolicLink() || (await lstat(cache.path)).size > 16 * 1024 * 1024) return cache;
      const data = JSON.parse(await readFile(cache.path, 'utf8'));
      if (data.version === 2 && data.entries && typeof data.entries === 'object') {
        for (const [key, value] of Object.entries(data.entries).slice(0, 50_000)) if (valid(value)) cache.previous.set(key, value);
      }
    } catch { /* Cache is disposable; source errors still propagate below. */ }
    return cache;
  }
  async read(path: string, load: () => Promise<CachedMetadata>): Promise<CachedMetadata> {
    const before = await signature(path), existing = this.previous.get(path);
    if (existing?.signature === before) {
      if (this.options.stats) this.options.stats.hits++;
      this.next.set(path, existing); return existing.value;
    }
    if (this.options.stats) this.options.stats.reads++;
    const value = await load();
    // An actively appended/replaced file must not seed a falsely fresh entry.
    if (before === await signature(path)) this.next.set(path, { signature: before, value });
    return value;
  }
  async save() {
    if (!this.path) return;
    const entries = Object.fromEntries([...this.next].slice(0, 50_000));
    const data = JSON.stringify({ version: 2, entries });
    if (Buffer.byteLength(data) > 16 * 1024 * 1024) return;
    const temporary = `${this.path}-${randomUUID()}.tmp`;
    try {
      await mkdir(this.options.cacheDir!, { recursive: true, mode: 0o700 });
      await writeFile(temporary, data, { mode: 0o600, flag: 'wx' });
      await rename(temporary, this.path);
    } catch { /* Cache failure must not hide valid source metadata. */ }
    finally { await rm(temporary, { force: true }).catch(() => {}); }
  }
}

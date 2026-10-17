import { mkdir, readFile, writeFile, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildSnapshot } from './adapter.ts';
import type { UsageSnapshot } from './types.ts';

const notices: Record<string, string> = {
  REPORT_TIMEOUT: 'Đọc log quá lâu. Thử lại hoặc giảm số thư mục log.',
  RUNTIME_UNAVAILABLE: 'Không tìm thấy bộ đọc ccusage. Hãy cài lại gói runtime đúng phiên bản.',
  REPORT_INVALID: 'Dữ liệu ccusage không tương thích. Hãy cập nhật plugin.',
  REPORT_FAILED: 'Không đọc được báo cáo ccusage. Kiểm tra quyền đọc thư mục Codex và thử lại.',
  EACCES: 'Plugin chưa có quyền đọc log hoặc ghi cache. Kiểm tra quyền thư mục và thử lại.',
  EBUSY: 'Một panel khác đang cập nhật. Vui lòng thử lại sau.',
};
function safeNotice(e: unknown): string {
  return notices[(e as NodeJS.ErrnoException).code ?? ''] ?? notices[(e as Error).message] ?? 'Không cập nhật được thống kê. Kiểm tra quyền đọc log, kết nối và thử lại.';
}
async function readSnapshot(path: string): Promise<UsageSnapshot | null> {
  try {
    const value = JSON.parse(await readFile(path, 'utf8'));
    return value?.schemaVersion === 1 && Number.isFinite(Date.parse(value.generatedAt)) && Array.isArray(value.sessions) && value.today?.cost && value.month?.cost ? value : null;
  } catch { return null; }
}
function unavailable(timeZone: string, notice: string): UsageSnapshot {
  const value = buildSnapshot({ session: [], daily: [], totals: {} }, { now: new Date(), timeZone, metadata: new Map() });
  const unknown = { amountUSD: null, knownCostUSD: 0, status: 'unknown' as const };
  return { ...value, status: 'error', notice, today: { ...value.today, cost: unknown }, month: { ...value.month, cost: unknown }, chart: value.chart.map(p => ({ ...p, cost: unknown })) };
}
export class SnapshotStore {
  constructor(private directory: string, private load: () => Promise<UsageSnapshot>, private options: { ttlMs?: number; timeZone?: string } = {}) {}
  async get(): Promise<UsageSnapshot> {
    const path = join(this.directory, 'snapshot.json'); const lock = join(this.directory, 'scan.lock');
    let cached = await readSnapshot(path);
    const fresh = (v: UsageSnapshot | null) => v !== null && Date.now() - Date.parse(v.generatedAt) < (this.options.ttlMs ?? 15_000);
    if (fresh(cached)) return cached!;
    let ownsLock = false;
    try {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      const deadline = Date.now() + 65_000;
      while (!ownsLock) {
        try {
          await mkdir(lock, { mode: 0o700 }); ownsLock = true;
          await writeFile(join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, timestamp: Date.now() }), { mode: 0o600 });
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
          // Remove only abandoned locks; age alone must not evict a live calculation.
          try {
            if (Date.now() - (await stat(lock)).mtimeMs > 90_000) {
              let alive = false;
              try { const owner = JSON.parse(await readFile(join(lock, 'owner.json'), 'utf8')); process.kill(owner.pid, 0); alive = true; }
              catch (e) { if ((e as NodeJS.ErrnoException).code === 'EPERM') alive = true; }
              if (!alive) { await rm(lock, { recursive: true, force: true }); continue; }
            }
          } catch { /* The owner may have just removed its lock. */ }
          const newer = await readSnapshot(path);
          if (fresh(newer)) return newer!;
          if (cached) return { ...cached, status: 'stale', notice: 'Một panel khác đang cập nhật dữ liệu.' };
          if (Date.now() >= deadline) throw Object.assign(new Error('EBUSY'), { code: 'EBUSY' });
          await Bun.sleep(80);
        }
      }
      cached = await readSnapshot(path);
      if (fresh(cached)) return cached!;
      const value = await this.load();
      const temporary = join(this.directory, `snapshot-${randomUUID()}.tmp`);
      await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
      await rename(temporary, path);
      return value;
    } catch (e) {
      return cached ? { ...cached, status: 'stale', notice: safeNotice(e) } : unavailable(this.options.timeZone ?? 'UTC', safeNotice(e));
    } finally { if (ownsLock) await rm(lock, { recursive: true, force: true }).catch(() => {}); }
  }
}

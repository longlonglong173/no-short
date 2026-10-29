import { constants, type Stats } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const graceMs = 90_000;
interface Owner { pid: number; token: string; timestamp: number }
type OwnerFile = { kind: 'missing' } | { kind: 'unsafe' } |
  { kind: 'file'; stat: Stats; text: string; owner: Owner | null };
const sameFile = (a: Stats, b: Stats) => a.dev === b.dev && a.ino === b.ino && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
const code = (error: unknown) => (error as NodeJS.ErrnoException).code;

async function ownerFile(guard: string): Promise<OwnerFile> {
  let file;
  try {
    file = await open(join(guard, 'owner.json'), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 4096) return { kind: 'unsafe' };
    const text = await file.readFile('utf8');
    let owner: Owner | null = null;
    try {
      const value = JSON.parse(text);
      if (value && Number.isSafeInteger(value.pid) && value.pid > 0 && typeof value.token === 'string' && value.token.trim().length > 0 &&
        Number.isFinite(value.timestamp) && value.timestamp >= 0) owner = { pid: value.pid, token: value.token, timestamp: value.timestamp };
    } catch { /* An incomplete owner file is protected by the directory grace period. */ }
    return { kind: 'file', stat, text, owner };
  } catch (error) {
    return code(error) === 'ENOENT' ? { kind: 'missing' } : { kind: 'unsafe' };
  } finally { await file?.close(); }
}

function provablyDead(pid: number): boolean {
  try { process.kill(pid, 0); return false; }
  catch (error) { return code(error) === 'ESRCH'; } // EPERM and every uncertain result protect the owner.
}

async function active(root: string): Promise<boolean> {
  try {
    let rootStat: Stats;
    try { rootStat = await lstat(root); }
    catch (error) {
      if (code(error) !== 'ENOENT') throw error;
      // An ordinary reader can create the cache root after our first lookup.
      // Inspect that new root and its guard, rather than treating existence alone
      // as maintenance. Later disappearance remains conservative below.
      try { rootStat = await lstat(root); }
      catch (retryError) { if (code(retryError) === 'ENOENT') return false; throw retryError; }
    }
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) return true;
    const guard = join(root, '.maintenance.lock');
    let initial: Stats;
    try { initial = await lstat(guard); }
    catch (error) { if (code(error) === 'ENOENT') return false; throw error; }
    if (!initial.isDirectory() || initial.isSymbolicLink() || Date.now() - initial.mtimeMs <= graceMs) return true;
    const owner = await ownerFile(guard);
    if (owner.kind === 'unsafe') return true;
    if (owner.kind === 'file' && owner.owner &&
      (Date.now() - owner.owner.timestamp <= graceMs || !provablyDead(owner.owner.pid))) return true;
    // Unknown contents remain an active fence, even with a demonstrably abandoned owner.
    const entries = await readdir(guard);
    if (entries.some(name => name !== 'owner.json')) return true;
    const current = await ownerFile(guard);
    if (owner.kind !== current.kind) return true;
    if (owner.kind === 'file' && current.kind === 'file' &&
      (!sameFile(owner.stat, current.stat) || owner.text !== current.text || owner.owner?.token !== current.owner?.token)) return true;
    const rootAgain = await lstat(root), guardAgain = await lstat(guard);
    if (!rootAgain.isDirectory() || rootAgain.dev !== rootStat.dev || rootAgain.ino !== rootStat.ino || !sameFile(initial, guardAgain)) return true;
    // TS only ignores a validated abandoned fence; it never mutates the primary guard.
    // Native owns physical recovery under flock on the permanent .maintenance-recovery.lock.
    return false;
  } catch (error) {
    if (code(error) !== 'ENOENT') return true;
    // Disappearance during inspection is uncertain; retry on the next request.
    try { await lstat(root); return true; } catch (rootError) { return code(rootError) !== 'ENOENT'; }
  }
}

export async function assertNoCacheMaintenance(root?: string): Promise<void> {
  if (root !== undefined && await active(root)) throw Object.assign(new Error('CACHE_MAINTENANCE'), { code: 'CACHE_MAINTENANCE' });
}

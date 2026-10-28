import { mkdir, mkdtemp, readFile, writeFile, rename, lstat, rm, open } from 'node:fs/promises';
import { join, resolve } from 'node:path';

async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}
interface Entry { destination: string; staged: string; backup: string; previous: boolean }
interface Journal { phase: 'promoting' | 'committed'; entries: Entry[] }
async function rollback(entries: Entry[]) {
  for (const entry of [...entries].reverse()) {
    if (await exists(entry.backup)) {
      await rm(entry.destination, { recursive: true, force: true });
      await rename(entry.backup, entry.destination);
    } else if (!entry.previous && !await exists(entry.staged)) {
      await rm(entry.destination, { recursive: true, force: true });
    }
  }
}

/** Build a complete set in fresh owned paths, then promote it with a durable
 * rollback journal. Failed stages are retained for inspection. Destinations
 * must be task-owned generated outputs on the same filesystem as workspace. */
export async function buildTransaction<T extends Record<string, string>>(workspace: string, destinations: T, build: (stage: T) => Promise<void>): Promise<void> {
  workspace = resolve(workspace);
  await mkdir(workspace, { recursive: true });
  const lock = join(workspace, 'lock.json'), journalPath = join(workspace, 'promotion.json');
  let handle;
  try { handle = await open(lock, 'wx'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const { pid } = JSON.parse(await readFile(lock, 'utf8'));
    if (!Number.isSafeInteger(pid) || pid <= 0) throw Error(`Invalid build lock: ${lock}`);
    try { process.kill(pid, 0); throw Error(`Build already running: ${pid}`); }
    catch (alive) { if ((alive as NodeJS.ErrnoException).code !== 'ESRCH') throw alive; }
    await rm(lock); handle = await open(lock, 'wx');
  }
  await handle.writeFile(JSON.stringify({ pid: process.pid })); await handle.close();
  const save = async (journal: Journal) => { await writeFile(journalPath + '.tmp', JSON.stringify(journal)); await rename(journalPath + '.tmp', journalPath); };
  try {
    if (await exists(journalPath)) {
      const previous: Journal = JSON.parse(await readFile(journalPath, 'utf8'));
      if (previous.phase !== 'committed') await rollback(previous.entries);
      await rm(journalPath);
    }
    const directory = await mkdtemp(join(workspace, 'run-'));
    const stage = Object.fromEntries(Object.keys(destinations).map(key => [key, join(directory, key)])) as T;
    await build(stage);
    // Preflight the entire set before moving even the first destination.
    const entries: Entry[] = [];
    for (const key of Object.keys(destinations)) {
      if (!await exists(stage[key])) throw Error(`Incomplete build output: ${key}`);
      entries.push({ destination: resolve(destinations[key]), staged: stage[key], backup: join(directory, key + '.previous'), previous: await exists(destinations[key]) });
    }
    await save({ phase: 'promoting', entries });
    try {
      for (const entry of entries) {
        if (entry.previous) await rename(entry.destination, entry.backup);
        await rename(entry.staged, entry.destination);
      }
      await save({ phase: 'committed', entries });
    } catch (error) {
      await rollback(entries); await rm(journalPath); throw error;
    }
    // Keep backups; the next successful invocation need not delete prior evidence.
    await rm(journalPath);
  } finally { await rm(lock); }
}

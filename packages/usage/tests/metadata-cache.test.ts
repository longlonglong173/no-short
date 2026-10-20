import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, mkdir, writeFile, appendFile, rename, rm, readFile, symlink, chmod, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readClaudeMetadata, readMetadata } from '../src/metadata';
const dirs: string[] = [];
const temp = async () => { const d = await mkdtemp(join(tmpdir(), 'ns08-')); dirs.push(d); return d; };
afterEach(async () => { await Promise.all(dirs.splice(0).map(d => rm(d, { recursive: true, force: true }))); });

test('unchanged metadata uses persistent file cache, append and rename invalidate without message leakage', async () => {
  const root = await temp(), cacheDir = join(root, 'cache');
  await mkdir(join(root, 'projects/p'), { recursive: true });
  const file = join(root, 'projects/p/session.jsonl');
  await writeFile(file, '{"type":"custom-title","customTitle":"first"}\n{"type":"user","message":"PRIVATE_MESSAGE"}\n');
  const stats = { hits: 0, reads: 0 };
  expect((await readClaudeMetadata([root], { cacheDir, stats })).get('claude:session')?.title).toBe('first');
  expect(stats.reads).toBe(1);
  stats.hits = stats.reads = 0;
  expect((await readClaudeMetadata([root], { cacheDir, stats })).get('claude:session')?.title).toBe('first');
  expect(stats).toEqual({ hits: 1, reads: 0 });
  await appendFile(file, '{"type":"custom-title","customTitle":"second"}\n');
  expect((await readClaudeMetadata([root], { cacheDir, stats })).get('claude:session')?.title).toBe('second');
  await rename(file, join(root, 'projects/p/renamed.jsonl'));
  const renamed = await readClaudeMetadata([root], { cacheDir, stats });
  expect(renamed.has('claude:session')).toBe(false);
  expect(renamed.get('claude:renamed')?.title).toBe('second');
  expect(await readFile(join(cacheDir, 'metadata-claude.json'), 'utf8')).not.toContain('PRIVATE_MESSAGE');
  await rm(join(root, 'projects/p/renamed.jsonl'));
  expect((await readClaudeMetadata([root], { cacheDir, stats })).size).toBe(0);
});

test('Codex title index changes and switching roots do not reuse stale metadata', async () => {
  const root = await temp(), other = await temp(), cacheDir = join(root, 'cache');
  await mkdir(join(root, 'sessions')); await mkdir(join(other, 'sessions'));
  const id = '11111111-1111-4111-8111-111111111111', key = `rollout-${id}`;
  const content = JSON.stringify({ type: 'session_meta', payload: { id, source: 'cli' } }) + '\n';
  await writeFile(join(root, `sessions/${key}.jsonl`), content);
  await writeFile(join(other, `sessions/${key}.jsonl`), content.replace('"cli"', '"subagent"'));
  await writeFile(join(root, 'session_index.jsonl'), JSON.stringify({ id, thread_name: 'A' }) + '\n');
  expect((await readMetadata([root], { cacheDir })).get(key)).toEqual({ title: 'A', kind: 'main' });
  await writeFile(join(root, 'session_index.jsonl'), JSON.stringify({ id, thread_name: 'B' }) + '\n');
  expect((await readMetadata([root], { cacheDir })).get(key)).toEqual({ title: 'B', kind: 'main' });
  expect((await readMetadata([other], { cacheDir })).get(key)?.kind).toBe('subagent');
  const metrics = { hits: 0, reads: 0 };
  await readMetadata([root], { cacheDir, stats: metrics });
  // Entries for another source must not crowd stale files back into the result.
  expect(metrics.reads).toBe(1);
});

test('corrupt cache and symlinked log entries are safe', async () => {
  const root = await temp(), cacheDir = join(root, 'cache');
  await mkdir(join(root, 'projects/p'), { recursive: true }); await mkdir(cacheDir);
  await writeFile(join(cacheDir, 'metadata-claude.json'), '{broken');
  await writeFile(join(root, 'outside.jsonl'), '{"type":"custom-title","customTitle":"outside"}\n');
  await symlink(join(root, 'outside.jsonl'), join(root, 'projects/p/alias.jsonl'));
  await writeFile(join(root, 'projects/p/valid.jsonl'), '{"type":"custom-title","customTitle":"valid"}\n');
  const result = await readClaudeMetadata([root], { cacheDir });
  expect([...result.keys()]).toEqual(['claude:valid']);
});

test('same-size replacement with restored mtime invalidates using ctime/inode and permission changes are not hidden', async () => {
  const root = await temp(), cacheDir = join(root, 'cache');
  await mkdir(join(root, 'projects/p'), { recursive: true });
  const file = join(root, 'projects/p/a.jsonl');
  const line = (title: string) => JSON.stringify({ type: 'custom-title', customTitle: title }) + '\n';
  await writeFile(file, line('AAAA'));
  const { stat } = await import('node:fs/promises');
  const before = await stat(file);
  await readClaudeMetadata([root], { cacheDir });
  await writeFile(file + '.new', line('BBBB')); await rename(file + '.new', file);
  await utimes(file, before.atime, before.mtime);
  expect((await readClaudeMetadata([root], { cacheDir })).get('claude:a')?.title).toBe('BBBB');
  await chmod(file, 0);
  try { await expect(readClaudeMetadata([root], { cacheDir })).rejects.toThrow(); }
  finally { await chmod(file, 0o600); }
});

// Synthetic-only benchmark; never reads the user's Codex/Claude home.
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readMetadata, readClaudeMetadata } from '../src/metadata';
const root = await mkdtemp(join(tmpdir(), 'ns08-bench-'));
try {
  await mkdir(join(root, 'sessions')); await mkdir(join(root, 'projects/p'), { recursive: true });
  const body = JSON.stringify({ type: 'user', message: { content: 'SYNTHETIC_ONLY_'.repeat(64) } }) + '\n';
  for (let i = 0; i < 120; i++) {
    await writeFile(join(root, `sessions/rollout-${i}.jsonl`), JSON.stringify({ type: 'session_meta', payload: { id: `id-${i}`, source: 'cli' } }) + '\n' + body.repeat(500));
    await writeFile(join(root, `projects/p/session-${i}.jsonl`), body.repeat(500) + JSON.stringify({ type: 'custom-title', customTitle: `Synthetic ${i}` }) + '\n');
  }
  let baseline = '';
  for (const mode of ['uncached', 'cold-cache', 'warm-cache']) {
    const stats = { hits: 0, reads: 0 }, cacheDir = mode === 'uncached' ? undefined : join(root, 'cache');
    const start = performance.now();
    const output = JSON.stringify([...[...(await readMetadata([root], { cacheDir, stats }))], ...[...(await readClaudeMetadata([root], { cacheDir, stats }))]]);
    if (baseline && output !== baseline) throw new Error('Metadata changed across cache modes');
    baseline = output;
    console.log(JSON.stringify({ mode, files: 240, linesPerFile: 501, milliseconds: +(performance.now() - start).toFixed(2), ...stats, sameResults: true, platform: process.platform, architecture: process.arch }));
  }
} finally { await rm(root, { recursive: true, force: true }); }

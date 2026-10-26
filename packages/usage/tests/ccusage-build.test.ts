import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { verifySha256, applyVerifiedPatch } from '../scripts/build-ccusage';

test('build rejects changed source or pricing bytes instead of accepting an unpatched runtime', () => {
  const original = new TextEncoder().encode('locked asset');
  const expected = createHash('sha256').update(original).digest('hex');
  expect(() => verifySha256(original, expected, 'source')).not.toThrow();
  expect(() => verifySha256(new TextEncoder().encode('changed asset'), expected, 'source')).toThrow('source integrity mismatch');
});

test('build applies verified exact-context patch and refuses tampering or a changed upstream context', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ccusage-patch-'));
  try {
    const patch = join(directory, 'fix.patch');
    const bytes = new TextEncoder().encode('--- a/reader.txt\n+++ b/reader.txt\n@@ -1 +1 @@\n-unsafe\n+fixed\n');
    const hash = createHash('sha256').update(bytes).digest('hex');
    await writeFile(patch, bytes); await writeFile(join(directory, 'reader.txt'), 'unsafe\n');
    await applyVerifiedPatch(directory, patch, hash);
    expect(await readFile(join(directory, 'reader.txt'), 'utf8')).toBe('fixed\n');
    // Applying the same patch again must fail, never reverse or quietly skip.
    await expect(applyVerifiedPatch(directory, patch, hash)).rejects.toThrow('patch');
    await writeFile(patch, 'changed');
    await expect(applyVerifiedPatch(directory, patch, hash)).rejects.toThrow('patch integrity mismatch');
    expect(await readFile(join(directory, 'reader.txt'), 'utf8')).toBe('fixed\n');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

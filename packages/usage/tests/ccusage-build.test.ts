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

test('source-build pins both Rust commands despite upstream source-cwd toolchain override', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ccusage-toolchain-'));
  try {
    const { mkdir } = await import('node:fs/promises');
    const source = join(directory, 'source'), bin = join(directory, 'bin');
    await mkdir(source); await mkdir(bin);
    // Upstream currently carries this override, while CI installs 1.98.1.
    await writeFile(join(source, 'rust-toolchain.toml'), '[toolchain]\nchannel = "1.97.1"\n');
    await writeFile(join(bin, 'rustc'), '#!/bin/sh\n[ -f rust-toolchain.toml ] || exit 41\nprintf "rustc %s (fixture)\\n" "${RUSTUP_TOOLCHAIN:-1.97.1}"\n', { mode: 0o755 });
    await writeFile(join(bin, 'cargo'), '#!/bin/sh\n[ -f rust-toolchain.toml ] || exit 42\n[ "$RUSTUP_TOOLCHAIN" = "1.98.1" ] || exit 43\nmkdir -p "$CARGO_TARGET_DIR/aarch64-apple-darwin/release"\nprintf "built with selected toolchain" > "$CARGO_TARGET_DIR/aarch64-apple-darwin/release/ccusage"\n', { mode: 0o755 });
    const destination = join(directory, 'reader'), harness = join(directory, 'build.ts');
    const module = new URL('../scripts/build-ccusage.ts', import.meta.url).pathname;
    await writeFile(harness, `import { buildPatchedCcusage } from ${JSON.stringify(module)}; await buildPatchedCcusage(${JSON.stringify({ source, artifacts: directory, pricing: join(directory, 'pricing.json') })}, 'darwin-arm64', ${JSON.stringify(destination)});`);
    const child = Bun.spawn([process.execPath, harness], { cwd: directory,
      env: { ...process.env, PATH: bin + ':' + process.env.PATH, RUSTUP_TOOLCHAIN: '1.97.1' }, stdout: 'pipe', stderr: 'pipe' });
    const [output, error, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    expect({ output, error, code }).toEqual({ output: '', error: '', code: 0 });
    expect(await readFile(destination, 'utf8')).toBe('built with selected toolchain');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

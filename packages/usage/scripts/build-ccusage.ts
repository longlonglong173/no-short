import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rm, copyFile, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import lock from '../ccusage-source-lock.json';
import upstream from '../ccusage-lock.json';

export function verifySha256(bytes: Uint8Array, expected: string, label: string): void {
  if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error(`${label} integrity mismatch`);
}
async function run(args: string[], cwd: string, environment?: Record<string, string | undefined>): Promise<string> {
  const child = Bun.spawn(args, { cwd, env: environment ?? process.env, stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  if (code !== 0) throw new Error(`${args[0]} failed (${code}): ${stderr || stdout}`);
  return stdout;
}
export async function applyVerifiedPatch(directory: string, patch: string, expected: string): Promise<void> {
  verifySha256(await readFile(patch), expected, 'patch');
  // --forward prevents patch from reversing an already-applied delta. No fuzzy
  // context matching: upstream drift must stop the build, never ship unpatched.
  const args = ['/usr/bin/patch', '--batch', '--forward', '--fuzz=0', '-p1', '-i', patch];
  await run([...args, '--dry-run'], directory);
  await run(args, directory);
}
async function asset(directory: string, name: string, spec: { url: string; sha256: string }): Promise<string> {
  const path = join(directory, name);
  let bytes: Uint8Array;
  if (existsSync(path)) bytes = await readFile(path);
  else {
    const response = await fetch(spec.url);
    if (!response.ok) throw new Error(`ccusage ${name} download failed (${response.status})`);
    bytes = new Uint8Array(await response.arrayBuffer());
  }
  verifySha256(bytes, spec.sha256, name);
  await writeFile(path, bytes, { mode: 0o600 });
  return path;
}
export interface PreparedCcusage { source: string; pricing: string; artifacts: string }
export async function prepareCcusageSource(artifacts: string): Promise<PreparedCcusage> {
  if (lock.version !== upstream.version) throw new Error('ccusage source/upstream version mismatch');
  artifacts = resolve(artifacts);
  await mkdir(artifacts, { recursive: true, mode: 0o700 });
  const [archive, pricing] = await Promise.all([
    asset(artifacts, 'source.tar.gz', lock.source), asset(artifacts, 'pricing.json', lock.pricing),
  ]);
  const source = join(artifacts, 'source');
  // This fixed task-owned extraction directory is rebuilt from verified bytes;
  // cached patched files cannot silently replace the pinned source on a rerun.
  await rm(source, { recursive: true, force: true }); await mkdir(source);
  await run(['/usr/bin/tar', '-xzf', archive, '-C', source, '--strip-components=1'], artifacts);
  await applyVerifiedPatch(source, resolve(import.meta.dirname, '..', lock.patch.file), lock.patch.sha256);
  return { source, pricing, artifacts };
}
export async function buildPatchedCcusage(prepared: PreparedCcusage, platform: string, destination: string): Promise<void> {
  const target = platform === 'darwin-arm64' ? 'aarch64-apple-darwin' : platform === 'darwin-x64' ? 'x86_64-apple-darwin' : null;
  if (!target) throw new Error(`Unsupported ccusage target: ${platform}`);
  const rust = await run(['rustc', '--version'], prepared.source);
  if (!rust.startsWith(`rustc ${lock.rustVersion} `)) throw new Error(`ccusage requires Rust ${lock.rustVersion}; found ${rust.trim()}`);
  const targetDir = join(prepared.artifacts, 'target');
  await run(['cargo', 'build', '--manifest-path', join(prepared.source, 'rust/Cargo.toml'), '--locked', '--release', '--target', target, '-p', 'ccusage'], prepared.source, {
    ...process.env, CCUSAGE_VERSION: lock.version, CCUSAGE_PRICING_JSON_PATH: prepared.pricing,
    CARGO_TARGET_DIR: targetDir, CARGO_BUILD_JOBS: process.env.CARGO_BUILD_JOBS ?? '2',
  });
  await copyFile(join(targetDir, target, 'release/ccusage'), destination);
  await chmod(destination, 0o755);
}

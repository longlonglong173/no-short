import { assertSafeBundleLinks, verifySparkleBundle } from './sparkle-bundle';
import { readFile, readdir, lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

export const root = resolve(import.meta.dirname, '../../..');
export const usage = join(root, 'packages/usage-menubar');
export const output = join(root, '.artifacts/usage-menubar');
export const sha = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
export async function run(args: string[], options: { capture?: boolean; env?: Record<string, string | undefined> } = {}) {
  const p = Bun.spawn(args, { cwd: root, stdout: options.capture ? 'pipe' : 'inherit', stderr: 'inherit', env: options.env ?? process.env });
  const stdout = options.capture ? await new Response(p.stdout as ReadableStream).text() : '';
  if (await p.exited !== 0) throw new Error(`Failed: ${args[0]} ${args[1] ?? ''}`);
  return stdout.trim();
}
export interface RuntimeManifest { version: string; ccusageVersion: string; platforms: Record<string, { binaries: Record<string, string> }> }
export async function manifest(): Promise<RuntimeManifest> { return JSON.parse(await readFile(join(root, 'packages/usage/runtime-manifest.json'), 'utf8')); }
export async function verifyLayout(app: string, platform: string, runtime: RuntimeManifest) {
  await assertSafeBundleLinks(app);
  const plist = JSON.parse(await run(['/usr/bin/plutil', '-convert', 'json', '-o', '-', join(app, 'Contents/Info.plist')], { capture: true }));
  const expected = { CFBundleIdentifier: 'dev.noshort.usage.menubar', CFBundleExecutable: 'NoShortUsageMenuBar', LSUIElement: true, LSMinimumSystemVersion: '14.0' };
  for (const [key, value] of Object.entries(expected)) if (plist[key] !== value) throw new Error(`Invalid app plist ${key}`);
  if (plist.CFBundleShortVersionString !== runtime.version) throw new Error('App version mismatch');
  const executable = await readFile(join(app, 'Contents/MacOS/NoShortUsageMenuBar'));
  if (!executable.length) throw new Error('Missing app executable');
  const resourceBundle = join(app,'Contents/Resources/NoShortUsageMenuBar_NoShortUsageMenuBar.bundle');
  // SwiftPM 6.0 uses a flat bundle; newer toolchains use Contents/Resources.
  const icons = (await readdir(resourceBundle)).includes('Contents') ? join(resourceBundle,'Contents/Resources') : resourceBundle;
  for (const name of ['codex','claude']) {
    const icon = await readFile(join(icons,`${name}.pdf`));
    if (icon.subarray(0,5).toString() !== '%PDF-') throw new Error(`Invalid provider icon: ${name}`);
  }
  const provenance = JSON.parse(await readFile(join(app, 'Contents/Resources/runtime-checksums.json'), 'utf8'));
  if (provenance.version !== runtime.version || provenance.platform !== platform || runtime.ccusageVersion !== '20.0.34') throw new Error('Runtime version mismatch');
  for (const name of ['no-short-usage', 'ccusage']) {
    if (provenance.sourceBinaries?.[name] !== runtime.platforms[platform]?.binaries[name]) throw new Error('Runtime provenance mismatch');
    const bytes = await readFile(join(app, 'Contents/Resources/runtime', name));
    if (sha(bytes) !== provenance.binaries?.[name]) throw new Error(`Runtime checksum mismatch: ${name}`);
  }
}
export async function verifyBundle(app: string, platform: string, runtime: RuntimeManifest) {
  await verifyLayout(app, platform, runtime);
  await verifySparkleBundle(app, platform);
  const architecture = platform === 'darwin-arm64' ? 'arm64' : 'x86_64';
  for (const path of ['Contents/MacOS/NoShortUsageMenuBar', 'Contents/Resources/runtime/no-short-usage', 'Contents/Resources/runtime/ccusage']) {
    const file = join(app, path);
    if ((await run(['/usr/bin/lipo', '-archs', file], { capture: true })) !== architecture) throw new Error(`Wrong architecture: ${path}`);
    await run(['/usr/bin/codesign', '--verify', '--strict', file]);
  }
  await run(['/usr/bin/codesign', '--verify', '--deep', '--strict', app]);
}

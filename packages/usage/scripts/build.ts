import { mkdir, readFile, writeFile, copyFile, chmod, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import lock from '../ccusage-lock.json';

const root = resolve(import.meta.dirname, '../../..');
const usage = resolve(import.meta.dirname, '..');
const version = '0.7.1';
const output = join(root, '.artifacts/usage/releases');
const runtimeRoot = join(usage, 'runtime');
await mkdir(output, { recursive: true });
async function run(args: string[], cwd = usage) {
  const p = Bun.spawn(args, { cwd, stdout: 'inherit', stderr: 'inherit' });
  if (await p.exited !== 0) throw new Error(`Build step failed: ${args[0]}`);
}
const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
await run([process.execPath, 'run', 'build:ui']);
let notices = `No Short Usage ${version} — bundled dependency notices\n\n`;
for (const name of ['@modelcontextprotocol/server', '@modelcontextprotocol/core', '@modelcontextprotocol/client', '@modelcontextprotocol/ext-apps', '@openai/mcp-extensions', 'react', 'react-dom', 'zod']) {
  const directory = join(usage, 'node_modules', name);
  const pkg = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  notices += `\n${name} ${pkg.version} (${pkg.license})\n`;
  const file = (await readdir(directory)).find(n => /^licen[sc]e(?:\.|$)/i.test(n));
  if (file) notices += await readFile(join(directory, file), 'utf8');
}
for (const [label, url] of [
  ['Bun 1.3.13', 'https://raw.githubusercontent.com/oven-sh/bun/bun-v1.3.13/LICENSE.md'],
  ['ccusage 20.0.34', 'https://raw.githubusercontent.com/ccusage/ccusage/d7555844929ad76ec97a113d1d51c31de92bee35/apps/ccusage/LICENSE'],
]) {
  const r = await fetch(url); if (!r.ok) throw new Error(`License download failed: ${label}`);
  const text = await r.text();
  // The repository-root ccusage LICENSE is a symlink; raw GitHub returns its
  // target path, not license text. Never ship that placeholder as attribution.
  if (label.startsWith('ccusage ') && (!text.includes('MIT License') ||
    !text.includes('Copyright (c) 2025 ryoppippi') ||
    !text.includes('The above copyright notice and this permission notice shall be included'))) {
    throw new Error('Incomplete ccusage MIT license; refusing to package runtime');
  }
  notices += `\n\n${label}\n${text}\n`;
}
const platforms: Record<string, unknown> = {};
for (const [platform, entry] of Object.entries(lock.platforms)) {
  const directory = join(runtimeRoot, platform); await mkdir(directory, { recursive: true });
  const response = await fetch(entry.url); if (!response.ok) throw new Error(`Download failed: ${platform}`);
  const archive = new Uint8Array(await response.arrayBuffer());
  const integrity = `sha512-${createHash('sha512').update(archive).digest('base64')}`;
  if (integrity !== entry.integrity) throw new Error('ccusage npm integrity mismatch');
  const packagePath = join(output, `ccusage-${platform}.tgz`); await writeFile(packagePath, archive);
  await run(['/usr/bin/tar', '-xzf', packagePath, '-C', directory, '--strip-components=2', 'package/bin/ccusage']);
  const result = await Bun.build({ entrypoints: [join(usage, 'src/main.ts')], minify: true,
    compile: { target: platform === 'darwin-arm64' ? 'bun-darwin-arm64' : 'bun-darwin-x64', outfile: join(directory, 'no-short-usage') } });
  if (!result.success) throw new AggregateError(result.logs, `Compile failed: ${platform}`);
  await chmod(join(directory, 'no-short-usage'), 0o755); await chmod(join(directory, 'ccusage'), 0o755);
  await writeFile(join(directory, 'THIRD_PARTY_NOTICES.txt'), notices);
  if (process.env.NO_SHORT_SIGN_IDENTITY) {
    if (process.platform !== 'darwin') throw new Error('Signing requires macOS');
    for (const name of ['no-short-usage', 'ccusage']) await run(['/usr/bin/codesign', '--force', '--options', 'runtime', '--timestamp', '--entitlements', join(usage, 'signing-entitlements.plist'), '--sign', process.env.NO_SHORT_SIGN_IDENTITY, join(directory, name)]);
  } else {
    if (process.platform !== 'darwin') throw new Error('A macOS build host is required to ad-hoc sign development Mach-O executables.');
    // Bun's appended executable needs a fresh signature; its inherited linker
    // signature is invalid on arm64 and macOS otherwise kills it with SIGKILL.
    await run(['/usr/bin/codesign', '--force', '--sign', '-', '--entitlements', join(usage, 'signing-entitlements.plist'), join(directory, 'no-short-usage')]);
  }
  for (const name of ['no-short-usage', 'ccusage']) await run(['/usr/bin/codesign', '--verify', '--strict', join(directory, name)]);
  if (platform === `darwin-${process.arch}`) await run([join(directory, 'no-short-usage'), '--version']);
  const name = `no-short-usage-${platform}.tar.gz`;
  await run(['/usr/bin/tar', '-czf', join(output, name), '-C', directory, 'no-short-usage', 'ccusage', 'THIRD_PARTY_NOTICES.txt']);
  platforms[platform] = { url: `https://github.com/longlonglong173/no-short/releases/download/v${version}/${name}`,
    sha256: hash(await readFile(join(output, name))), binaries: { 'no-short-usage': hash(await readFile(join(directory, 'no-short-usage'))), ccusage: hash(await readFile(join(directory, 'ccusage'))) } };
  console.log(`Built ${platform}; ${process.env.NO_SHORT_SIGN_IDENTITY ? 'Developer ID signed' : 'development signing only; not notarized'}`);
}
await writeFile(join(usage, 'runtime-manifest.json'), JSON.stringify({ version, ccusageVersion: lock.version, platforms }, null, 2) + '\n');
console.log(`Runtime artifacts: ${output}`);

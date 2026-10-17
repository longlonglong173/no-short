import { test, expect } from 'bun:test';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { verifyLayout } from './bundle.ts';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const fixture = async () => {
  const app = await mkdtemp(join(tmpdir(), 'No Short app test '));
  await mkdir(join(app, 'Contents/MacOS'), { recursive: true });
  await mkdir(join(app, 'Contents/Resources/runtime'), { recursive: true });
  await writeFile(join(app, 'Contents/MacOS/NoShortUsageMenuBar'), 'executable');
  const info = { CFBundleIdentifier:'dev.noshort.usage.menubar', CFBundleExecutable:'NoShortUsageMenuBar', LSUIElement:true, LSMinimumSystemVersion:'14.0', CFBundleShortVersionString:'0.4.1' };
  await writeFile(join(app, 'Contents/Info.plist'), JSON.stringify(info));
  const p = Bun.spawn(['/usr/bin/plutil','-convert','xml1',join(app, 'Contents/Info.plist')]);
  if (await p.exited) throw new Error('Fixture plist failed');
  for (const name of ['no-short-usage','ccusage']) await writeFile(join(app,'Contents/Resources/runtime',name), name);
  const binaries = Object.fromEntries(['no-short-usage','ccusage'].map(n=>[n,sha(n)]));
  const manifest = { version:'0.4.1', ccusageVersion:'20.0.34', platforms: { 'darwin-arm64': { binaries } } };
  await writeFile(join(app,'Contents/Resources/runtime-checksums.json'), JSON.stringify({version:'0.4.1', platform:'darwin-arm64', binaries, sourceBinaries:binaries}));
  return { app, manifest };
};

test('bundle verifier accepts matching provenance and rejects tampering, missing helpers and symlinks', async () => {
  const {app, manifest} = await fixture();
  try {
    await verifyLayout(app, 'darwin-arm64', manifest);
    await writeFile(join(app, 'Contents/Resources/runtime/ccusage'), 'tampered');
    await expect(verifyLayout(app, 'darwin-arm64', manifest)).rejects.toThrow('checksum');
    await writeFile(join(app, 'Contents/Resources/runtime/ccusage'), 'ccusage');
    await rm(join(app, 'Contents/Resources/runtime/no-short-usage'));
    await expect(verifyLayout(app, 'darwin-arm64', manifest)).rejects.toThrow();
    await writeFile(join(app, 'Contents/Resources/runtime/no-short-usage'), 'no-short-usage');
    await symlink('/tmp', join(app, 'Contents/Resources/outside'));
    await expect(verifyLayout(app, 'darwin-arm64', manifest)).rejects.toThrow('symlink');
  } finally { await rm(app, {recursive:true,force:true}); }
});

test('bundle verifier refuses mixed versions and provenance from another runtime', async () => {
  const {app, manifest} = await fixture();
  try {
    await expect(verifyLayout(app, 'darwin-arm64', {...manifest,version:'0.0.0'})).rejects.toThrow('version');
    manifest.platforms['darwin-arm64'].binaries.ccusage = sha('other version');
    await expect(verifyLayout(app, 'darwin-arm64', manifest)).rejects.toThrow('provenance');
  } finally { await rm(app,{recursive:true,force:true}); }
});

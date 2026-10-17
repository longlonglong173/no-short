import { test, expect } from 'bun:test';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { verifyLayout } from './bundle.ts';

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const fixture = async (layout: 'structured' | 'flat' = 'structured') => {
  const app = await mkdtemp(join(tmpdir(), 'No Short app test '));
  await mkdir(join(app, 'Contents/MacOS'), { recursive: true });
  await mkdir(join(app, 'Contents/Resources/runtime'), { recursive: true });
  const bundle = join(app,'Contents/Resources/NoShortUsageMenuBar_NoShortUsageMenuBar.bundle');
  const icons = layout === 'structured' ? join(bundle,'Contents/Resources') : bundle;
  await mkdir(icons,{recursive:true});
  for (const name of ['codex','claude']) await writeFile(join(icons,`${name}.pdf`),'%PDF-1.4\nfixture');
  await writeFile(join(app, 'Contents/MacOS/NoShortUsageMenuBar'), 'executable');
  const info = { CFBundleIdentifier:'dev.noshort.usage.menubar', CFBundleExecutable:'NoShortUsageMenuBar', LSUIElement:true, LSMinimumSystemVersion:'14.0', CFBundleShortVersionString:'0.4.1' };
  await writeFile(join(app, 'Contents/Info.plist'), JSON.stringify(info));
  const p = Bun.spawn(['/usr/bin/plutil','-convert','xml1',join(app, 'Contents/Info.plist')]);
  if (await p.exited) throw new Error('Fixture plist failed');
  for (const name of ['no-short-usage','ccusage']) await writeFile(join(app,'Contents/Resources/runtime',name), name);
  const binaries = Object.fromEntries(['no-short-usage','ccusage'].map(n=>[n,sha(n)]));
  const manifest = { version:'0.4.1', ccusageVersion:'20.0.34', platforms: { 'darwin-arm64': { binaries } } };
  await writeFile(join(app,'Contents/Resources/runtime-checksums.json'), JSON.stringify({version:'0.4.1', platform:'darwin-arm64', binaries, sourceBinaries:binaries}));
  return { app, manifest, icons };
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

test('bundle verifier supports both SwiftPM resource layouts and rejects missing provider icons', async () => {
  for (const layout of ['structured','flat'] as const) {
    const {app,manifest,icons} = await fixture(layout);
    try {
      await verifyLayout(app,'darwin-arm64',manifest);
      await rm(join(icons,'claude.pdf'));
      await expect(verifyLayout(app,'darwin-arm64',manifest)).rejects.toThrow();
    } finally { await rm(app,{recursive:true,force:true}); }
  }
});

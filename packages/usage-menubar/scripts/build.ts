import { readFile, writeFile, mkdir, rm, cp, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { root, usage, output, sha, run, manifest, verifyBundle } from './bundle.ts';

if (process.platform !== 'darwin') throw new Error('Building the menu bar app requires macOS and Xcode command line tools');
const runtime = await manifest();
const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
if (version !== runtime.version) throw new Error('Runtime/root version mismatch; build Usage first');
const sdk = await run(['/usr/bin/xcrun', '--sdk', 'macosx', '--show-sdk-path'], { capture: true });
const identity = process.env.NO_SHORT_SIGN_IDENTITY;
const icons = join(output, 'AppIcon.iconset'); await mkdir(icons, { recursive: true });
for (const size of [16,32,128,256,512]) {
  for (const scale of [1,2]) await run(['/usr/bin/sips', '-z', String(size*scale), String(size*scale), join(root,'assets/long-mini.png'), '--out', join(icons,`icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`)], { capture: true });
}
const icon = join(output, 'AppIcon.icns'); await run(['/usr/bin/iconutil','-c','icns',icons,'-o',icon]);
for (const platform of ['darwin-arm64', 'darwin-x64']) {
  const arch = platform === 'darwin-arm64' ? 'arm64' : 'x86_64';
  const source = join(root, 'packages/usage/runtime', platform);
  for (const name of ['no-short-usage', 'ccusage']) {
    if (sha(await readFile(join(source,name))) !== runtime.platforms[platform]?.binaries[name]) throw new Error(`Source runtime checksum mismatch: ${platform}/${name}; build Usage first`);
  }
  const args = ['/usr/bin/swift', 'build', '--package-path', usage, '-c', 'release', '--triple', `${arch}-apple-macosx14.0`, '--sdk', sdk, '--product', 'NoShortUsageMenuBar'];
  await run(args);
  const bin = await run([...args, '--show-bin-path'], { capture: true });
  const app = join(output, platform, 'No Short Usage.app'); await rm(app, { recursive: true, force: true });
  const contents = join(app, 'Contents'), resources = join(contents, 'Resources'), helpers = join(resources, 'runtime');
  await mkdir(join(contents, 'MacOS'), { recursive: true }); await mkdir(helpers, { recursive: true });
  const executable = join(contents, 'MacOS/NoShortUsageMenuBar'); await cp(join(bin, 'NoShortUsageMenuBar'), executable); await chmod(executable, 0o755);
  await writeFile(join(contents, 'Info.plist'), (await readFile(join(usage,'Resources/Info.plist'), 'utf8')).replaceAll('__VERSION__', version));
  await cp(icon, join(resources,'AppIcon.icns'));
  for (const name of ['LICENSE', 'NOTICE.md']) await cp(join(root, name), join(resources, name));
  await cp(join(usage, 'Resources/PROVIDER_ICONS.md'), join(resources, 'PROVIDER_ICONS.md'));
  await cp(join(bin,'NoShortUsageMenuBar_NoShortUsageMenuBar.bundle'),join(resources,'NoShortUsageMenuBar_NoShortUsageMenuBar.bundle'),{recursive:true});
  const binaries: Record<string,string> = {};
  for (const name of ['no-short-usage','ccusage']) {
    const file = join(helpers,name); await cp(join(source,name),file); await chmod(file, 0o755);
    const sign = ['/usr/bin/codesign','--force','--sign',identity ?? '-'];
    if (identity) sign.push('--options','runtime','--timestamp','--entitlements',join(root,'packages/usage/signing-entitlements.plist'));
    else if (name === 'no-short-usage') sign.push('--entitlements',join(root,'packages/usage/signing-entitlements.plist'));
    await run([...sign,file]); binaries[name] = sha(await readFile(file));
  }
  await cp(join(source,'THIRD_PARTY_NOTICES.txt'),join(helpers,'THIRD_PARTY_NOTICES.txt'));
  await writeFile(join(resources,'runtime-checksums.json'), JSON.stringify({version, platform, binaries, sourceBinaries:runtime.platforms[platform].binaries},null,2)+'\n');
  const sign = ['/usr/bin/codesign','--force','--sign',identity ?? '-'];
  if (identity) sign.push('--options','runtime','--timestamp');
  await run([...sign,app]); await verifyBundle(app,platform,runtime);
  console.log(`Built ${platform}: ${app}; ${identity ? 'Developer ID signing requested; not notarized by this script' : 'ad-hoc development signature; not notarized'}`);
}

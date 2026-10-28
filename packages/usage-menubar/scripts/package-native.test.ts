import { test, expect } from 'bun:test';
import { mkdtemp, mkdir, writeFile, readFile, cp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha, run, type RuntimeManifest } from './bundle';
import { embedSparkle, sparkleFramework } from './sparkle-bundle';
import { updateFlags } from './update-channel';
import { packageNative, verifyNativeArchive } from './package-native';

// Real Mach-O fixtures and codesign/ditto boundaries: no mocked verifier.
async function fixture() {
 const dir=await mkdtemp(join(tmpdir(),'ns-native-package-')), builds=join(dir,'builds'), releases=join(dir,'releases');
 const runtime:RuntimeManifest={version:'0.7.1',ccusageVersion:'20.0.34',platforms:{}};
 await writeFile(join(dir,'main.c'),'int main(void) {return 0;}');
 const config=JSON.parse(await readFile(new URL('../update-channel.json',import.meta.url),'utf8'));
 for(const [platform,arch] of [['darwin-arm64','arm64'],['darwin-x64','x86_64']]) {
  const app=join(builds,platform,'No Short Usage.app'), resources=join(app,'Contents/Resources'), helpers=join(resources,'runtime');
  await mkdir(join(app,'Contents/MacOS'),{recursive:true});await mkdir(helpers,{recursive:true});
  const exe=join(app,'Contents/MacOS/NoShortUsageMenuBar');
  await run(['/usr/bin/clang','-target',`${arch}-apple-macosx14.0`,join(dir,'main.c'),'-F',join(sparkleFramework,'..'),'-framework','Sparkle','-Wl,-rpath,@executable_path/../Frameworks','-o',exe],{capture:true});
  const info={CFBundleIdentifier:'dev.noshort.usage.menubar',CFBundleExecutable:'NoShortUsageMenuBar',LSUIElement:true,LSMinimumSystemVersion:'14.0',CFBundleShortVersionString:'0.7.1',...updateFlags,NoShortUpdateCapability:arch==='arm64'?'configured':'unsupported-architecture',...(arch==='arm64'?{SUFeedURL:config.feedURL,SUPublicEDKey:config.publicKey}:{})};
  await writeFile(join(app,'Contents/Info.plist'),JSON.stringify(info)); await run(['/usr/bin/plutil','-convert','xml1',join(app,'Contents/Info.plist')]);
  const icons=join(resources,'NoShortUsageMenuBar_NoShortUsageMenuBar.bundle');await mkdir(icons);
  for(const name of ['codex','claude']) await cp(new URL(`../Sources/NoShortUsageMenuBar/Resources/${name}.pdf`,import.meta.url),join(icons,`${name}.pdf`));
  const binaries:Record<string,string>={};
  for(const name of ['ccusage','no-short-usage']) {const path=join(helpers,name);await cp(exe,path);await run(['/usr/bin/codesign','--force','--sign','-',path]);binaries[name]=sha(await readFile(path));}
  runtime.platforms[platform!]={binaries};await writeFile(join(resources,'runtime-checksums.json'),JSON.stringify({version:'0.7.1',platform,binaries,sourceBinaries:binaries}));
  await embedSparkle(app);await run(['/usr/bin/codesign','--force','--sign','-',app]);
 }
 return {dir,builds,releases,runtime};
}

test('distribution ZIP is canonical ARM only and extracted verification rejects altered architecture, signature, checksums and updater policy',async()=>{
 const f=await fixture();
 try {
  await mkdir(f.releases); await writeFile(join(f.releases,'previous.zip'),'previous complete package');
  await packageNative({...f,distribution:true});
  expect((await readdir(f.releases)).sort()).toEqual(['INSTALL.txt','NoShortUsage-0.7.1-arm64.zip']);
  const archive=join(f.releases,'NoShortUsage-0.7.1-arm64.zip');
  await verifyNativeArchive(archive,'darwin-arm64',f.runtime,true);
  const pristine=await readFile(archive);
  const app=join(f.builds,'darwin-arm64/No Short Usage.app');
  const mutations:[string,(app:string)=>Promise<void>][]=[
   ['checksum',async app=>{await writeFile(join(app,'Contents/Resources/runtime/ccusage'),'corrupt');}],
   ['architecture',async app=>{await cp(join(f.builds,'darwin-x64/No Short Usage.app/Contents/MacOS/NoShortUsageMenuBar'),join(app,'Contents/MacOS/NoShortUsageMenuBar'));}],
   ['signature',async app=>{await run(['/usr/bin/codesign','--remove-signature',join(app,'Contents/MacOS/NoShortUsageMenuBar')]);}],
   ['configuration',async app=>{await run(['/usr/bin/plutil','-remove','SUPublicEDKey',join(app,'Contents/Info.plist')]);await run(['/usr/bin/codesign','--force','--sign','-',app]);}],
  ];
  for(const [name,mutate] of mutations) {
   const copy=join(f.dir,`mutation-${name}`,'No Short Usage.app');await cp(app,copy,{recursive:true});await mutate(copy);
   const bad=join(f.dir,`${name}.zip`);await run(['/usr/bin/ditto','-c','-k','--keepParent',copy,bad]);
   await expect(verifyNativeArchive(bad,'darwin-arm64',f.runtime,true)).rejects.toThrow();
   // Rejecting a changed source bundle must retain the last complete ZIP.
   const saved=join(f.dir,'saved-app');await cp(app,saved,{recursive:true});await rm(app,{recursive:true});await cp(copy,app,{recursive:true});
   await expect(packageNative({...f,distribution:true})).rejects.toThrow();
   expect(await readFile(archive)).toEqual(pristine);
   await rm(app,{recursive:true});await cp(saved,app,{recursive:true});await rm(saved,{recursive:true});
  }
  await packageNative({...f,distribution:false});
  expect((await readdir(f.releases)).sort()).toEqual(['INSTALL.txt','no-short-usage-menubar-0.7.1-darwin-arm64.zip','no-short-usage-menubar-0.7.1-darwin-x64.zip']);
 } finally {await rm(f.dir,{recursive:true,force:true});}
},120000);

import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { mkdir, writeFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { buildTransaction } from '../../../scripts/build-transaction';
import { run, verifyBundle, type RuntimeManifest } from './bundle';
import { assertUpdateDistribution, loadUpdateChannel } from './update-channel';

/** Verify the actual archive, using the same bundle/update gates as build. */
export async function verifyNativeArchive(zip:string,platform:string,runtime:RuntimeManifest,distribution:boolean) {
 const entries=(await run(['/usr/bin/unzip','-Z','-1',zip],{capture:true})).split('\n');
 for(const entry of entries) {
  if(entry.includes('\\') || entry.split('/').some(p=>p==='..' || p==='.') ||
     !(entry==='No Short Usage.app/' || entry.startsWith('No Short Usage.app/') || entry.startsWith('__MACOSX/'))) throw Error('Unsafe native archive entry');
 }
 const extracted=await mkdtemp(join(tmpdir(),'ns-native-extract-'));
 try {
  await run(['/usr/bin/ditto','-x','-k',zip,extracted]);
  if((await readdir(extracted)).filter(n=>n!=='__MACOSX').join(',')!=='No Short Usage.app') throw Error('Unexpected native archive contents');
  const app=join(extracted,'No Short Usage.app');
  await verifyBundle(app,platform,runtime);
  if(distribution) await assertUpdateDistribution(app);
 } finally {await rm(extracted,{recursive:true,force:true});}
}
export async function packageNative(options:{builds:string;releases:string;runtime:RuntimeManifest;distribution:boolean}) {
 const {builds,releases,runtime,distribution}=options;
 if(distribution) await loadUpdateChannel(undefined,'distribution');
 // Both builds remain required, even though only ARM is publicly packaged.
 for(const platform of ['darwin-arm64','darwin-x64']) {
  const app=join(builds,platform,'No Short Usage.app');await verifyBundle(app,platform,runtime);
  if(distribution) await assertUpdateDistribution(app);
 }
 await buildTransaction(join(dirname(releases),'package-transactions'),{releases},async stage=>{
  await mkdir(stage.releases);
  for(const platform of distribution?['darwin-arm64']:['darwin-arm64','darwin-x64']) {
   const name=distribution?`NoShortUsage-${runtime.version}-arm64.zip`:`no-short-usage-menubar-${runtime.version}-${platform}.zip`;
   const zip=join(stage.releases,name);
   await run(['/usr/bin/ditto','-c','-k','--sequesterRsrc','--keepParent',join(builds,platform,'No Short Usage.app'),zip]);
   await verifyNativeArchive(zip,platform,runtime,distribution);
  }
  await writeFile(join(stage.releases,'INSTALL.txt'),distribution?'Apple Silicon only. Extract No Short Usage.app and move it into Applications. macOS 14+ required. Experimental ad-hoc builds are not notarized. No publication or installation is performed by packaging.\n':'Extract the ZIP for your Mac (arm64 = Apple Silicon, x64 = Intel development only). Move No Short Usage.app into Applications. macOS 14+ required. Development builds may have updates unconfigured and are not notarized. No publication or installation is performed by packaging.\n');
 });
}

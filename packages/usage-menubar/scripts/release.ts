import { assertUpdateDistribution } from './update-channel';
import { sparkleCode } from './sparkle-bundle';
// Explicit maintainer action. Never called by a normal build or pull-request CI.
import { cp, mkdir, mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { buildTransaction } from '../../../scripts/build-transaction';
import { assertDistributionSignature } from './distribution.ts';
import { root, output, manifest, verifyBundle, run, sha, type RuntimeManifest } from './bundle.ts';

export async function checkDistributionSigned(app:string,platform:string,runtime:RuntimeManifest,teamID:string) {
  await verifyBundle(app, platform, runtime);
  await assertUpdateDistribution(app);
  for (const relative of ['', 'Contents/Resources/runtime/no-short-usage', 'Contents/Resources/runtime/ccusage', ...(await sparkleCode(app)).map(p => p.slice(app.length + 1))]) {
    const p = Bun.spawn(['/usr/bin/codesign', '-d', '--verbose=4', join(app, relative)], {
      stdout: 'pipe', stderr: 'pipe', env: { ...process.env, LC_ALL: 'C' },
    });
    const [stdout, stderr, exit] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
    if (exit) throw new Error('Cannot inspect distribution signature');
    assertDistributionSignature(stdout + '\n' + stderr, teamID);
  }
}
interface ReleaseOptions {builds:string;releases:string;runtime:RuntimeManifest;teamID:string;profile:string;sourceCommit:string}
interface DistributionTools {run:typeof run;checkSigned:(app:string,platform:string)=>Promise<void>}
/** Apple service boundaries are explicit; production always uses the secure
 * wrappers above. Only a complete exact-archive-verified ARM set is promoted. */
export async function prepareNotarizedRelease(options:ReleaseOptions,tools:DistributionTools={run,checkSigned:(app,platform)=>checkDistributionSigned(app,platform,options.runtime,options.teamID)}) {
 const {builds,releases,runtime,teamID,profile,sourceCommit}=options;
 if(!/^[A-Z0-9]{10}$/.test(teamID))throw Error('Set NO_SHORT_APPLE_TEAM_ID to the expected 10-character team ID');
 if(!profile)throw Error('Set NO_SHORT_NOTARY_PROFILE to a notarytool keychain profile; never pass credentials in source');
 if(process.platform!=='darwin')throw Error('Distribution verification requires macOS');
 const license=await readFile(join(root,'LICENSE')),platform='darwin-arm64';
 // Intel remains a build/static CI gate, not a public native distribution.
 for(const target of ['darwin-arm64','darwin-x64'])await tools.checkSigned(join(builds,target,'No Short Usage.app'),target);
 await buildTransaction(join(dirname(releases),'notary-transactions'),{releases},async stage=>{
  await mkdir(stage.releases);
  const scratch=await mkdtemp(join(tmpdir(),'no-short-notary-'));
  try {
   const app=join(scratch,'No Short Usage.app');
   await cp(join(builds,platform,'No Short Usage.app'),app,{recursive:true});
   await tools.checkSigned(app,platform);
   const submission=join(scratch,'submission.zip');
   await tools.run(['/usr/bin/ditto','-c','-k','--sequesterRsrc','--keepParent',app,submission]);
   const response=await tools.run(['/usr/bin/xcrun','notarytool','submit',submission,'--keychain-profile',profile,'--wait','--timeout','20m','--output-format','json'],{capture:true});
   const result=JSON.parse(response);
   if(result.status!=='Accepted'||typeof result.id!=='string'||!result.id)throw Error(`Apple notarization was not accepted (${result.id??'no submission ID'})`);
   await tools.run(['/usr/bin/xcrun','stapler','staple',app]);
   await tools.run(['/usr/bin/xcrun','stapler','validate',app]);
   const name=`NoShortUsage-${runtime.version}-arm64.zip`,zip=join(stage.releases,name);
   await tools.run(['/usr/bin/ditto','-c','-k','--sequesterRsrc','--keepParent',app,zip]);
   const extracted=join(scratch,'extracted');await tools.run(['/usr/bin/ditto','-x','-k',zip,extracted]);
   const restored=join(extracted,'No Short Usage.app');
   await tools.checkSigned(restored,platform);
   await tools.run(['/usr/bin/xcrun','stapler','validate',restored]);
   await tools.run(['/usr/sbin/spctl','--assess','--type','execute','--verbose=2',restored]);
   const record={platform,file:name,sha256:sha(await readFile(zip)),notarizationID:result.id,status:'Accepted'};
   await writeFile(join(stage.releases,'release-validation.json'),JSON.stringify({version:runtime.version,teamID,sourceCommit,phase:'developer-id-notarized',records:[record]},null,2)+'\n');
   await writeFile(join(stage.releases,'INSTALL.txt'),'Apple Silicon only, macOS 14+. Verify SHA256SUMS, extract the ZIP, move No Short Usage.app to Applications, then open it. Intel native distribution remains pending separate device/channel acceptance. No DMG, Node/Bun or API key is needed. Context is estimated occupancy, not a subscription quota. Claude context and automatic tracking are separate opt-in settings. Disconnect both and disable Open at login before removing the app.\n');
   await writeFile(join(stage.releases,'LICENSE'),license);
   const names=[name,'release-validation.json','INSTALL.txt','LICENSE'];
   await writeFile(join(stage.releases,'SHA256SUMS'),(await Promise.all(names.map(async n=>`${sha(await readFile(join(stage.releases,n)))}  ${n}\n`))).join(''));
  }finally{await rm(scratch,{recursive:true,force:true});}
 });
}
if(import.meta.main) {
 await prepareNotarizedRelease({builds:output,releases:join(output,'distribution'),runtime:await manifest(),teamID:process.env.NO_SHORT_APPLE_TEAM_ID??'',profile:process.env.NO_SHORT_NOTARY_PROFILE??'',sourceCommit:await run(['git','rev-parse','HEAD'],{capture:true})});
 console.log(`Signed, notarized ARM ZIP verified: ${join(output,'distribution')}. No release was uploaded or published.`);
}

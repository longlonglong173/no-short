import { cp, mkdir, mkdtemp, readFile, symlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildTransaction } from './build-transaction';
import { artifactNames, publicAssetNames, verifyRelease } from './verify-release-artifacts';
import { command, assertPinnedRustVersions, assertFrozen, assertCandidateWritable, isolatedEnvironment, json, sha, sourceInputs, writeJson, type CommandResult } from './release/evidence';
/** Build from a committed detached clone, never alter the source checkout's outputs. */
export async function prepareRelease(version:string,destination?:string) {
 const root=resolve(import.meta.dirname,'..');
 if(!/^\d+\.\d+\.\d+$/.test(version)||(await json(join(root,'package.json'))).version!==version)throw Error('Source version mismatch');
 if(process.env.NO_SHORT_EXPECTED_ARCH&&process.env.NO_SHORT_EXPECTED_ARCH!==process.arch)throw Error('Host architecture mismatch');
 const target=resolve(destination??join(root,'.artifacts/release-recovery',`candidate-${version}-${process.arch}`));
 await assertCandidateWritable(target);
 const commit=await command(['git','rev-parse','HEAD'],root);await assertFrozen(root,commit);
 if(Bun.version!=='1.3.13')throw Error('Release preparation requires pinned Bun 1.3.13');
 if(process.platform!=='darwin')throw Error('Release preparation requires macOS');
 if(process.env.NO_SHORT_SIGN_IDENTITY)throw Error('Prepare is unsigned; owner signing is a separate phase');
 const owned=join(root,'.artifacts/release-recovery');await mkdir(owned,{recursive:true});
 const stage=await mkdtemp(join(owned,`prepare-${version}-`)),frozen=join(stage,'source'),records:CommandResult[]=[];
 await command(['git','clone','--shared','--no-checkout',root,frozen],root,process.env,records);
 await command(['git','checkout','--detach',commit],frozen,process.env,records);
 await command([process.execPath,'install','--cwd','packages/usage','--frozen-lockfile'],frozen,await isolatedEnvironment(join(stage,'install-environment')),records);
 // Copy verified download cache and reuse only the expensive compiler target
 // cache. prepareCcusageSource always re-extracts/re-patches pinned bytes.
 const lock=await json(join(frozen,'packages/usage/ccusage-source-lock.json'));
 const cacheRelative=join('.artifacts/usage/ccusage-source',lock.patchRevision),cache=join(frozen,cacheRelative),warm=join(root,cacheRelative);
 await mkdir(cache,{recursive:true});
 for(const name of ['source.tar.gz','pricing.json'])if(existsSync(join(warm,name)))await cp(join(warm,name),join(cache,name));
 if(existsSync(join(warm,'target')))await symlink(join(warm,'target'),join(cache,'target'),'dir');
 const env=await isolatedEnvironment(join(stage,'private-environment'));env.NO_SHORT_REQUIRE_PATCHED_CCUSAGE='1';
 const toolchains:Record<string,string>={};
 for(const [name,args]of Object.entries({bun:[process.execPath,'--version'],rust:['rustc','--version'],cargo:['cargo','--version'],swift:['swift','--version'],xcode:['xcodebuild','-version'],os:['sw_vers'],architecture:['uname','-m']}))toolchains[name]=await command(args,frozen,env,records);
 assertPinnedRustVersions(toolchains.rust!,toolchains.cargo!);
 for(const script of ['build:usage','test','build:usage-menubar','smoke:usage','smoke:usage-menubar','package:usage','package:usage-menubar']) {
  const args=[process.execPath,'run',script];if(script==='build:usage-menubar'||script==='package:usage-menubar')args.push('--distribution');
  console.log(`Preparing ${version}: ${script}`);await command(args,frozen,env,records);
  await assertFrozen(frozen,commit,true);await assertFrozen(root,commit);
 }

 await buildTransaction(join(owned,'candidate-transactions'),{candidate:target},async paths=>{
  await assertCandidateWritable(target);
  await mkdir(paths.candidate);
  await cp(join(frozen,'LICENSE'),join(paths.candidate,'LICENSE'));
  await cp(join(frozen,'packages/usage/runtime-manifest.json'),join(paths.candidate,'runtime-manifest.json'));
  for(const platform of ['darwin-arm64','darwin-x64'])await cp(join(frozen,'.artifacts/usage/releases',`no-short-usage-${platform}.tar.gz`),join(paths.candidate,`no-short-usage-${platform}.tar.gz`));
  await cp(join(frozen,'.artifacts/usage/releases',`no-short-${version}.zip`),join(paths.candidate,`no-short-${version}.zip`));
  await cp(join(frozen,'.artifacts/usage-menubar/releases',`NoShortUsage-${version}-arm64.zip`),join(paths.candidate,`NoShortUsage-${version}-arm64.zip`));
  await writeJson(join(paths.candidate,'source-provenance.json'),{sourceBuildCommit:commit,inputs:await sourceInputs(root,commit),sourceLock:lock,patchSHA256:sha(await readFile(join(frozen,'packages/usage',lock.patch.file)))});
  await writeJson(join(paths.candidate,'build-evidence.json'),{sourceBuildCommit:commit,toolchains,toolchainEnvironment:{cargoHome:env.CARGO_HOME,rustupHome:env.RUSTUP_HOME,rustupToolchain:env.RUSTUP_TOOLCHAIN},commands:records});
  const artifacts:Record<string,string>={};for(const name of artifactNames(version))artifacts[name]=sha(await readFile(join(paths.candidate,name)));
  await writeJson(join(paths.candidate,'candidate.json'),{schema:1,version,sourceBuildCommit:commit,phase:'unsigned-build',publicationReady:false,artifacts,publishAssets:publicAssetNames(version)});
  await verifyRelease(paths.candidate,version,{expectedArch:process.arch});
  await assertFrozen(frozen,commit,true);await assertFrozen(root,commit);await assertCandidateWritable(target);
 });
 console.log(`Unsigned Experimental candidate: ${target}. Owner archive/feed signing and acceptance remain required.`);
 return target;
}
if(import.meta.main){const [version,directory]=process.argv.slice(2);if(!version)throw Error('Usage: prepare-experimental-release.ts VERSION [CANDIDATE_DIRECTORY]');await prepareRelease(version,directory);}

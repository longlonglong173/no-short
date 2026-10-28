import { existsSync } from 'node:fs';
import { readFile, mkdtemp, rm, readdir, writeFile } from 'node:fs/promises';
import { tmpdir, release } from 'node:os';
import { join, resolve } from 'node:path';
import { verifyNativeArchive } from '../packages/usage-menubar/scripts/package-native';
import { verifyArchiveSignature } from '../packages/usage-menubar/scripts/appcast';
import { loadUpdateChannel } from '../packages/usage-menubar/scripts/update-channel';
import { command, json, sha, sourceInputs, writeJson, type CommandResult } from './release/evidence';
import { extract, runtimeFiles, safeEntry } from './release/archives';
import { probePlugin, probeRuntime } from './release/runtime-probes';
/** Sparkle 2.10 SPUExtractSignedFeed format; no Keychain/private-key access. */
export function verifyFeedSignature(bytes:Buffer,publicKey:string):boolean {
 const prefix=Buffer.from('<!-- sparkle-signatures:\n'),i=bytes.lastIndexOf(prefix);
 if(i<0)return false;
 const block=bytes.subarray(i).toString('utf8');
 const match=block.match(/^<!-- sparkle-signatures:\nedSignature: ([A-Za-z0-9+/=]+)\nlength: ([0-9]+)\n-->\n?$/);
 return !!match&&Number(match[2])===i&&verifyArchiveSignature(bytes.subarray(0,i),match[1]!,publicKey);
}
export function artifactNames(version:string){return ['LICENSE','runtime-manifest.json','source-provenance.json','build-evidence.json',`no-short-usage-darwin-arm64.tar.gz`,`no-short-usage-darwin-x64.tar.gz`,`NoShortUsage-${version}-arm64.zip`,`no-short-${version}.zip`].sort();}
/** Every file in the candidate is a public upload asset; no development ZIPs. */
export function publicAssetNames(version:string,signed=false){return [...artifactNames(version),'candidate.json','SHA256SUMS','release-validation.json',...(signed?['experimental-arm64.xml','signed-candidate.json']:[])].sort();}
export async function verifyRelease(candidate:string,version:string,options:{signedFeed?:string;expectedArch?:string}={}) {
 candidate=resolve(candidate);const root=resolve(import.meta.dirname,'..');
 const meta=await json(join(candidate,'candidate.json'));
 if(meta.schema!==1||meta.version!==version||!/^\d+\.\d+\.\d+$/.test(version))throw Error('Candidate version mismatch');
 for(const name of Object.keys(meta.artifacts??{})) {try{safeEntry(name);}catch{throw Error('Unsafe candidate artifact');}if(name.includes('/'))throw Error('Unsafe candidate artifact');}
 if(Object.keys(meta.artifacts??{}).sort().join(',')!==artifactNames(version).join(','))throw Error('Candidate artifact set mismatch');
 if(JSON.stringify(meta.publishAssets)!==JSON.stringify(publicAssetNames(version)))throw Error('Public release asset allowlist mismatch');
 if(!/^[0-9a-f]{40}$/.test(meta.sourceBuildCommit))throw Error('Invalid source build commit');
 if(options.expectedArch&&process.arch!==options.expectedArch)throw Error(`Host architecture mismatch: expected ${options.expectedArch}, actual ${process.arch}`);
 if(process.platform!=='darwin'||!['arm64','x64'].includes(process.arch))throw Error('Artifact runtime verification requires a native macOS host');
 const sealPath=join(candidate,'signed-candidate.json');
 const seal=existsSync(sealPath)?await json(sealPath):null;
 const signedFeed=options.signedFeed??(seal?join(candidate,'experimental-arm64.xml'):undefined);
 const hashes:Record<string,string>={};
 for(const name of [...artifactNames(version),'candidate.json']) {
  hashes[name]=sha(await readFile(join(candidate,name)));
  if(name!=='candidate.json'&&hashes[name]!==meta.artifacts[name])throw Error(`Candidate checksum mismatch: ${name}`);
 }
 const extra=(await readdir(candidate)).filter(n=>!([...artifactNames(version),'candidate.json','SHA256SUMS','release-validation.json',...(signedFeed?['signed-candidate.json','experimental-arm64.xml']:[])].includes(n)));
 if(extra.length)throw Error(`Unexpected candidate files: ${extra}`);
 const source=await json(join(candidate,'source-provenance.json'));
 if(source.sourceBuildCommit!==meta.sourceBuildCommit||JSON.stringify(source.inputs)!==JSON.stringify(await sourceInputs(root,meta.sourceBuildCommit)))throw Error('Source provenance mismatch');
 const committed=async(path:string)=>JSON.parse(await command(['git','show',`${meta.sourceBuildCommit}:${path}`],root));
 const lock=await committed('packages/usage/ccusage-source-lock.json'),manifest=await json(join(candidate,'runtime-manifest.json'));
 for(const path of ['package.json','plugin.json','packages/usage/package.json'])if((await committed(path)).version!==version)throw Error('Committed source version mismatch');
 if(manifest.version!==version||manifest.ccusageVersion!==lock.version||manifest.ccusagePatchRevision!==lock.patchRevision||manifest.ccusageSourceRevision!==lock.source.revision)throw Error('Runtime source pin mismatch');
 if(source.sourceLock?.source?.sha256!==lock.source.sha256||source.sourceLock?.patch?.sha256!==lock.patch.sha256||source.sourceLock?.pricing?.sha256!==lock.pricing.sha256)throw Error('Source/patch/pricing hash mismatch');
 if(source.patchSHA256!==lock.patch.sha256)throw Error('Source patch checksum mismatch');
 if(hashes.LICENSE!==source.inputs.LICENSE)throw Error('Standalone license mismatch');
 const build=await json(join(candidate,'build-evidence.json'));
 if(build.sourceBuildCommit!==meta.sourceBuildCommit||!Array.isArray(build.commands)||build.commands.some((c:any)=>c.code!==0))throw Error('Build command evidence incomplete');
 for(const name of ['build:usage','test','build:usage-menubar','package:usage','package:usage-menubar'])if(!build.commands.some((c:any)=>c.command.includes(name)))throw Error(`Missing required build command: ${name}`);
 const scratch=await mkdtemp(join(tmpdir(),'ns-final-artifacts-')),records:CommandResult[]=[],probes:any[]=[];
 try {
  for(const platform of ['darwin-arm64','darwin-x64']) {
   const spec=manifest.platforms[platform],name=`no-short-usage-${platform}.tar.gz`;
   if(spec?.url!==`https://github.com/longlonglong173/no-short/releases/download/v${version}/${name}`||spec.sha256!==hashes[name])throw Error('Runtime archive URL/hash mismatch');
   const directory=join(scratch,platform);await extract(join(candidate,name),directory,'tar');await runtimeFiles(directory,spec.binaries);
   for(const name of ['ccusage','no-short-usage']) {
    if((await command(['/usr/bin/lipo','-archs',join(directory,name)],root))!==(platform==='darwin-arm64'?'arm64':'x86_64'))throw Error('Runtime archive architecture mismatch');
    await command(['/usr/bin/codesign','--verify','--strict',join(directory,name)],root,process.env,records);
   }
   if(platform===`darwin-${process.arch}`)probes.push(await probeRuntime(directory,join(scratch,'tar-fixture'),records,'tar',version));
  }
  const zip=join(candidate,`NoShortUsage-${version}-arm64.zip`);await verifyNativeArchive(zip,'darwin-arm64',manifest,true);
  const native=join(scratch,'native');await extract(zip,native,'zip');
  const app=join(native,'No Short Usage.app'),resources=join(app,'Contents/Resources');
  for(const [name,sourcePath]of [['LICENSE','LICENSE'],['NOTICE.md','NOTICE.md'],['PROVIDER_ICONS.md','packages/usage-menubar/Resources/PROVIDER_ICONS.md']]) {
   const bytes=await readFile(join(resources,name!)).catch(()=>null);
   if(!bytes||sha(bytes)!==source.inputs[sourcePath!])throw Error(`Native license mismatch: ${name}`);
  }
  const nativeProvenance=await json(join(resources,'runtime-checksums.json'));
  await runtimeFiles(join(resources,'runtime'),nativeProvenance.binaries);
  if(sha(await readFile(join(resources,'runtime/THIRD_PARTY_NOTICES.txt')))!==sha(await readFile(join(scratch,'darwin-arm64/THIRD_PARTY_NOTICES.txt'))))throw Error('Native runtime license mismatch');
  if(process.arch==='arm64')probes.push(await probeRuntime(join(resources,'runtime'),join(scratch,'app-fixture'),records,'app',version));
  const pluginDir=join(scratch,'plugin');await extract(join(candidate,`no-short-${version}.zip`),pluginDir,'zip','no-short/');const plugin=join(pluginDir,'no-short');
  for(const path of ['package.json','plugin.json','packages/usage/package.json'])if((await json(join(plugin,path))).version!==version)throw Error('Plugin version mismatch');
  if(sha(await readFile(join(plugin,'packages/usage/runtime-manifest.json')))!==hashes['runtime-manifest.json'])throw Error('Plugin runtime manifest mismatch');
  for(const path of ['LICENSE','NOTICE.md','scripts/launch-usage-mcp.sh']) {
   const expected=await command(['git','show',`${meta.sourceBuildCommit}:${path}`],root);
   if((await readFile(join(plugin,path),'utf8')).trim()!==expected)throw Error(`Plugin source/license mismatch: ${path}`);
  }
  for(const platform of ['darwin-arm64','darwin-x64'])await runtimeFiles(join(plugin,'packages/usage/runtime',platform),manifest.platforms[platform].binaries);
  probes.push(await probeRuntime(join(plugin,'packages/usage/runtime',`darwin-${process.arch}`),join(scratch,'plugin-fixture'),records,'plugin-bundled',version));
  probes.push(await probePlugin(plugin,join(candidate,`no-short-usage-darwin-${process.arch}.tar.gz`),join(scratch,'installer-fixture'),records));
  const requiredPairs=process.arch==='arm64'?4:3;
  if(probes.length!==requiredPairs||probes.some(p=>p.requiredSkips!==0)||records.filter(r=>r.command[0]==='required-runtime-probes').length!==requiredPairs)throw Error('Missing required real-reader/helper tests');
  let signed=false,feedHash:string|undefined;
  if(signedFeed) {
   const feedBytes=await readFile(signedFeed),feed=feedBytes.toString('utf8'),channel=await loadUpdateChannel(undefined,'distribution');
   const url=`https://github.com/longlonglong173/no-short/releases/download/v${version}/NoShortUsage-${version}-arm64.zip`;
   const signature=feed.match(/sparkle:edSignature="([^"]+)"/)?.[1];
   if(!channel||!verifyFeedSignature(feedBytes,channel.publicKey)||!signature||!feed.includes(`url="${url}"`)||!feed.includes(`length="${(await readFile(zip)).length}"`)||!feed.includes(`<sparkle:version>${version}</sparkle:version>`)||!verifyArchiveSignature(await readFile(zip),signature,channel.publicKey))throw Error('Owner-signed archive/feed verification failed');
   feedHash=sha(feedBytes);if(sha(await readFile(signedFeed))!==feedHash)throw Error('Signed feed changed during verification');signed=true;
  }
  for(const [name,hash]of Object.entries(hashes))if(sha(await readFile(join(candidate,name)))!==hash)throw Error('Candidate changed during verification');
  const validation={schema:1,version,sourceBuildCommit:meta.sourceBuildCommit,metadataReleaseCommit:null,phase:signed?'owner-signed-experimental':'unsigned-build-validation',publicationReady:signed,host:{platform:process.platform,arch:process.arch,os:release()},toolchains:build.toolchains,source,artifactHashes:hashes,feedSHA256:feedHash,probes,requiredReaderHelperPairs:requiredPairs,requiredRegressionFamilies:requiredPairs*7,requiredBootstrapChecks:3,requiredSkips:0,commands:[...build.commands,...records],publishAssets:publicAssetNames(version,signed),scope:{nativeApp:'ARM archive structure/provenance/signatures/update configuration/licenses',nativeAppExecuted:process.arch==='arm64',runtimeExecuted:`darwin-${process.arch}`,crossArchitectureExecution:false},manualAcceptanceLimits:['No publication performed','No macOS 14 device acceptance','No Intel GUI/device acceptance','No interactive/performance acceptance','No notarization claim']};
  if(seal){
   if(!signed||seal.feedSHA256!==feedHash||JSON.stringify(seal.artifactHashes)!==JSON.stringify(hashes)||seal.validationSHA256!==sha(await readFile(join(candidate,'release-validation.json'))))throw Error('Signed candidate seal mismatch');
   const allHashes={...hashes,'experimental-arm64.xml':feedHash!,'release-validation.json':seal.validationSHA256,'signed-candidate.json':sha(await readFile(sealPath))};
   const expected=Object.entries(allHashes).sort(([a],[b])=>a.localeCompare(b)).map(([n,h])=>`${h}  ${n}\n`).join('');
   if(await readFile(join(candidate,'SHA256SUMS'),'utf8')!==expected)throw Error('Signed candidate checksum evidence changed');
   return validation;
  }
  await writeJson(join(candidate,'release-validation.json'),validation);
  const baseHashes={...hashes};
  hashes['release-validation.json']=sha(await readFile(join(candidate,'release-validation.json')));
  if(signed){
   const canonicalFeed=join(candidate,'experimental-arm64.xml');
   if(resolve(signedFeed!)!==canonicalFeed)await writeFile(canonicalFeed,await readFile(signedFeed!));
   if(sha(await readFile(canonicalFeed))!==feedHash)throw Error('Signed feed changed during finalization');
   await writeJson(sealPath,{sourceBuildCommit:meta.sourceBuildCommit,feedSHA256:feedHash,artifactHashes:baseHashes,validationSHA256:hashes['release-validation.json']});
   hashes['experimental-arm64.xml']=feedHash!;hashes['signed-candidate.json']=sha(await readFile(sealPath));
  }
  await writeFile(join(candidate,'SHA256SUMS'),Object.entries(hashes).sort(([a],[b])=>a.localeCompare(b)).map(([n,h])=>`${h}  ${n}\n`).join(''));
  return validation;
 }finally{await rm(scratch,{recursive:true,force:true});}
}
if(import.meta.main){const [candidate,version,...args]=process.argv.slice(2);if(!candidate||!version)throw Error('Usage: verify-release-artifacts.ts CANDIDATE VERSION [--signed-feed PATH] [--expected-arch arm64|x64]');const option=(name:string)=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};const result=await verifyRelease(candidate,version,{signedFeed:option('--signed-feed'),expectedArch:option('--expected-arch')});console.log(`${result.phase}: ${result.requiredReaderHelperPairs} extracted reader/helper pairs; zero required skips. Publication ready: ${result.publicationReady}`);}

import { expect, test, afterEach } from 'bun:test';
import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { verifyRelease } from '../verify-release-artifacts';
import { json, sha, writeJson } from './evidence';
import { probeRuntime } from './runtime-probes';
// This is a mandatory final-artifact gate, separate from portable source tests.
// Missing artifacts are failures, never skipIf or source-runtime fallback.
const source=process.env.NO_SHORT_RELEASE_CANDIDATE;
if(!source)throw Error('NO_SHORT_RELEASE_CANDIDATE is required for final-artifact integration tests');
const version=process.env.NO_SHORT_RELEASE_VERSION;
if(!version)throw Error('NO_SHORT_RELEASE_VERSION is required');
const temps:string[]=[];afterEach(async()=>{for(const d of temps.splice(0))await rm(d,{recursive:true,force:true});});
async function fixture(){const d=await mkdtemp(join(tmpdir(),'ns-artifact-negative-'));temps.push(d);await cp(source!,d,{recursive:true});return d;}
async function rebind(d:string,name:string){const m=await json(join(d,'candidate.json'));m.artifacts[name]=sha(await readFile(join(d,name)));await writeJson(join(d,'candidate.json'),m);}
test('mandatory final artifact runtime matrix passes without required skips',async()=>{const r=await verifyRelease(await fixture(),version!);expect(r.requiredSkips).toBe(0);expect(r.requiredReaderHelperPairs).toBe(process.arch==='arm64'?4:3);expect(r.publicationReady).toBe(false);},180000);
test('changing an archive invalidates the bound candidate',async()=>{const d=await fixture();await writeFile(join(d,'no-short-usage-darwin-arm64.tar.gz'),'changed');await expect(verifyRelease(d,version!)).rejects.toThrow('Candidate checksum mismatch');},30000);
test('changing a generated manifest pin remains invalid after recomputing its file hash',async()=>{const d=await fixture();const m=await json(join(d,'runtime-manifest.json'));m.ccusagePatchRevision='old-reader';await writeJson(join(d,'runtime-manifest.json'),m);await rebind(d,'runtime-manifest.json');await expect(verifyRelease(d,version!)).rejects.toThrow('Runtime source pin mismatch');},30000);
test('missing real reader execution evidence cannot satisfy build requirements',async()=>{const d=await fixture();const m=await json(join(d,'build-evidence.json'));m.commands=m.commands.filter((c:any)=>!c.command.includes('build:usage'));await writeJson(join(d,'build-evidence.json'),m);await rebind(d,'build-evidence.json');await expect(verifyRelease(d,version!)).rejects.toThrow('Missing required build command');},30000);
test('tampered extracted reader behavior fails synthetic runtime probes',async()=>{const d=await mkdtemp(join(tmpdir(),'ns-tampered-reader-'));temps.push(d);await writeFile(join(d,'ccusage'),'#!/bin/sh\nprintf \'{}\\n\'\n',{mode:0o755});await writeFile(join(d,'no-short-usage'),'#!/bin/sh\nprintf \'{}\\n\'\n',{mode:0o755});await expect(probeRuntime(d,join(d,'fixtures'),[],'tampered')).rejects.toThrow();},30000);

async function tamperNative(mutator:(app:string)=>Promise<void>) {
 const {extract}=await import('./archives');const {command}=await import('./evidence');
 const d=await fixture(),zip=join(d,`NoShortUsage-${version}-arm64.zip`),unpacked=join(d,'unpacked');
 await extract(zip,unpacked,'zip');const app=join(unpacked,'No Short Usage.app');await mutator(app);
 await rm(zip);await command(['/usr/bin/ditto','-c','-k','--sequesterRsrc','--keepParent',app,zip],d);await rm(unpacked,{recursive:true});await rebind(d,`NoShortUsage-${version}-arm64.zip`);return d;
}
test('a final ZIP missing Sparkle is rejected even with a recomputed ZIP hash',async()=>{
 const d=await tamperNative(async app=>{await rm(join(app,'Contents/Frameworks/Sparkle.framework'),{recursive:true});});
 await expect(verifyRelease(d,version!)).rejects.toThrow();
},180000);
test('mismatched helper provenance is rejected in the extracted final ZIP',async()=>{
 const d=await tamperNative(async app=>{const path=join(app,'Contents/Resources/runtime-checksums.json'),m=await json(path);m.sourceBinaries.ccusage='0'.repeat(64);await writeJson(path,m);});
 await expect(verifyRelease(d,version!)).rejects.toThrow('Runtime provenance mismatch');
},180000);

test('re-signed native archive still requires the committed application license',async()=>{
 const {command}=await import('./evidence');
 const d=await tamperNative(async app=>{await rm(join(app,'Contents/Resources/LICENSE'));await command(['/usr/bin/codesign','--force','--sign','-',app],app);});
 let message='';try{await verifyRelease(d,version!);}catch(e){message=String(e);}
 expect(message).toContain('Native license mismatch');
},180000);

test('public allowlist export verifies with the same gate and complete SHA256SUMS',async()=>{
 const {command}=await import('./evidence');const d=await mkdtemp(join(tmpdir(),'ns-public-export-'));temps.push(d);
 const metadata=await json(join(source!,'candidate.json'));
 for(const name of metadata.publishAssets)await cp(join(source!,name),join(d,name));
 const result=await verifyRelease(d,version!);expect(result.requiredSkips).toBe(0);
 await command(['/usr/bin/shasum','-a','256','-c','SHA256SUMS'],d);
 await rm(join(d,'no-short-usage-darwin-x64.tar.gz'));
 await expect(verifyRelease(d,version!)).rejects.toThrow();
},180000);

test('a rehashed TAR with valid binary hashes still requires the complete upstream MIT block',async()=>{
 const {extract}=await import('./archives');const {command}=await import('./evidence');
 const d=await fixture(),archive=join(d,'no-short-usage-darwin-arm64.tar.gz'),unpacked=join(d,'unpacked');
 await extract(archive,unpacked,'tar');
 await writeFile(join(unpacked,'THIRD_PARTY_NOTICES.txt'),'MIT License\nCopyright (c) 2025 ryoppippi\nThe above copyright notice and this permission notice shall be included\n');
 await command(['/usr/bin/tar','-czf',archive,'-C',unpacked,'ccusage','no-short-usage','THIRD_PARTY_NOTICES.txt'],d);await rm(unpacked,{recursive:true});
 const m=await json(join(d,'runtime-manifest.json'));m.platforms['darwin-arm64'].sha256=sha(await readFile(archive));await writeJson(join(d,'runtime-manifest.json'),m);
 await rebind(d,'no-short-usage-darwin-arm64.tar.gz');await rebind(d,'runtime-manifest.json');
 await expect(verifyRelease(d,version!)).rejects.toThrow('Incomplete runtime license');
},180000);
test('a rehashed final plugin with complete binaries but truncated upstream license is rejected',async()=>{
 const {extract}=await import('./archives');const {command}=await import('./evidence');
 const d=await fixture(),archive=join(d,`no-short-${version}.zip`),unpacked=join(d,'unpacked');
 await extract(archive,unpacked,'zip','no-short/');
 for(const platform of ['darwin-arm64','darwin-x64'])await writeFile(join(unpacked,'no-short/packages/usage/runtime',platform,'THIRD_PARTY_NOTICES.txt'),'MIT License\nCopyright (c) 2025 ryoppippi\nThe above copyright notice and this permission notice shall be included\n');
 await rm(archive);await command(['/usr/bin/zip','-qr',archive,'no-short'],unpacked);await rm(unpacked,{recursive:true});await rebind(d,`no-short-${version}.zip`);
 await expect(verifyRelease(d,version!)).rejects.toThrow('Incomplete runtime license');
},180000);
test('standalone license cannot be replaced by another text after rehashing candidate metadata',async()=>{
 const d=await fixture();await writeFile(join(d,'LICENSE'),'truncated license');await rebind(d,'LICENSE');
 await expect(verifyRelease(d,version!)).rejects.toThrow('Standalone license mismatch');
},30000);

test('returned validation hashes are an immutable snapshot matching serialized metadata',async()=>{
 const d=await fixture(),result=await verifyRelease(d,version!);
 expect(result.artifactHashes).toEqual((await json(join(d,'release-validation.json'))).artifactHashes);
 expect(Object.isFrozen(result.artifactHashes)).toBe(true);
},180000);

async function markerCandidate() {
 const {extract}=await import('./archives');const {command}=await import('./evidence');
 const d=await fixture(),work=await mkdtemp(join(tmpdir(),'ns-auth-order-'));temps.push(work);
 const marker=join(work,'executed'),archive=join(d,`no-short-usage-darwin-${process.arch}.tar.gz`),unpacked=join(work,'runtime');
 await extract(archive,unpacked,'tar');
 await writeFile(join(work,'marker.c'),`#include <stdio.h>\nint main(void){FILE *f=fopen("${marker}","w");if(f){fputs("executed",f);fclose(f);}puts("{}");return 0;}`);
 await command(['/usr/bin/clang',join(work,'marker.c'),'-o',join(unpacked,'ccusage')],work);
 await command(['/usr/bin/codesign','--force','--sign','-',join(unpacked,'ccusage')],work);
 const manifest=await json(join(d,'runtime-manifest.json'));
 manifest.platforms[`darwin-${process.arch}`].binaries.ccusage=sha(await readFile(join(unpacked,'ccusage')));
 await command(['/usr/bin/tar','-czf',archive,'-C',unpacked,'ccusage','no-short-usage','THIRD_PARTY_NOTICES.txt'],work);
 manifest.platforms[`darwin-${process.arch}`].sha256=sha(await readFile(archive));await writeJson(join(d,'runtime-manifest.json'),manifest);
 await rebind(d,`no-short-usage-darwin-${process.arch}.tar.gz`);await rebind(d,'runtime-manifest.json');
 return {d,work,marker};
}
test('unauthenticated signed feed cannot execute any packaged reader',async()=>{
 const {existsSync}=await import('node:fs');const {d,work,marker}=await markerCandidate(),feed=join(work,'invalid.xml');await writeFile(feed,'invalid owner signature');
 let error='';try{await verifyRelease(d,version!,{signedFeed:feed});}catch(e){error=String(e);}
 expect(existsSync(marker)).toBe(false);expect(error).toContain('Owner-signed archive/feed verification failed');
},180000);
test('TAR readers must bind to the owner app source binaries before execution',async()=>{
 const {existsSync}=await import('node:fs');const {d,marker}=await markerCandidate();
 let error='';try{await verifyRelease(d,version!);}catch(e){error=String(e);}
 expect(existsSync(marker)).toBe(false);expect(error).toContain('Runtime provenance mismatch');
},180000);


test('signed x64 verification fails closed before any packaged execution',async()=>{
 const {existsSync}=await import('node:fs');const {d,work,marker}=await markerCandidate(),feed=join(work,'invalid.xml');await writeFile(feed,'invalid owner signature');
 // Branch simulation only. Real native Intel execution remains its separate CI gate.
 const child=Bun.spawn([process.execPath,'-e',`Object.defineProperty(process,"arch",{value:"x64"}); const {verifyRelease}=await import("./scripts/verify-release-artifacts"); try{await verifyRelease(process.argv[1],process.argv[2],{signedFeed:process.argv[3]});process.exit(9);}catch(e){console.log(String(e));}` ,d,version!,feed],{cwd:process.cwd(),stdout:'pipe',stderr:'pipe'});
 const out=await new Response(child.stdout).text();expect(await child.exited).toBe(0);
 expect(out).toContain('Owner-signed verification requires ARM execution');expect(existsSync(marker)).toBe(false);
},30000);

test('actual ad-hoc candidate cannot enter the Developer ID notary workflow',async()=>{
 const {prepareNotarizedRelease}=await import('../../packages/usage-menubar/scripts/release');const {extract}=await import('./archives');
 const d=await mkdtemp(join(tmpdir(),'ns-adhoc-notary-negative-'));temps.push(d);
 const builds=join(d,'builds'),releases=join(d,'distribution');await extract(join(source!,`NoShortUsage-${version}-arm64.zip`),join(builds,'darwin-arm64'),'zip');
 const {mkdir}=await import('node:fs/promises');await mkdir(releases);await writeFile(join(releases,'previous.zip'),'previous complete distribution');
 await expect(prepareNotarizedRelease({builds,releases,runtime:await json(join(source!,'runtime-manifest.json')),teamID:'ABCDEFGHIJ',profile:'test-only-do-not-contact-Apple',sourceCommit:(await json(join(source!,'candidate.json'))).sourceBuildCommit})).rejects.toThrow('Public distribution requires timestamped Developer ID');
 expect(await readFile(join(releases,'previous.zip'),'utf8')).toBe('previous complete distribution');
},30000);

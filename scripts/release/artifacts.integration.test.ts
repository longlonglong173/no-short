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
test('mandatory final artifact runtime matrix passes without required skips',async()=>{const r=await verifyRelease(source!,version!);expect(r.requiredSkips).toBe(0);expect(r.requiredReaderHelperPairs).toBe(process.arch==='arm64'?4:3);expect(r.publicationReady).toBe(false);},180000);
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

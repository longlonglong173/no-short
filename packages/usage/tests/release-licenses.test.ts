import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { extract, runtimeFiles } from '../../../scripts/release/archives';
import { command, sha } from '../../../scripts/release/evidence';
const temporary:string[]=[];
afterEach(async()=>{for(const p of temporary.splice(0))await rm(p,{recursive:true,force:true});});
const license=await readFile(new URL('../../../scripts/release/licenses/ccusage-20.0.34-LICENSE.txt',import.meta.url),'utf8');
const markers='MIT License\nCopyright (c) 2025 ryoppippi\nThe above copyright notice and this permission notice shall be included\n';
async function fixture(notices:string){
 const d=await mkdtemp(join(tmpdir(),'ns-complete-mit-'));temporary.push(d);
 const runtime=join(d,'runtime');await mkdir(runtime);
 const hashes:Record<string,string>={};
 for(const name of ['ccusage','no-short-usage']){const bytes=`#!/bin/sh\n# ${name}\nexit 0\n`;await writeFile(join(runtime,name),bytes,{mode:0o755});hashes[name]=sha(bytes);}
 await writeFile(join(runtime,'THIRD_PARTY_NOTICES.txt'),notices);return {d,runtime,hashes};
}
for(const [name,notices]of [
 ['three-marker counterfeit',markers],
 ['removed permission grant',license.replace(/Permission is hereby granted,[\s\S]*?following conditions:\n\n/,'')],
 ['removed warranty and liability disclaimer',license.slice(0,license.indexOf('THE SOFTWARE IS PROVIDED'))],
] as const)test(`runtimeFiles refuses ${name} despite valid executable hashes`,async()=>{
 const f=await fixture(notices);await expect(runtimeFiles(f.runtime,f.hashes)).rejects.toThrow('Incomplete runtime license');
});
test('runtimeFiles accepts the complete pinned upstream license within the complete notice document',async()=>{
 const f=await fixture(`Other dependency notices\n\n${license}\nNo Short patch attribution\n`);await runtimeFiles(f.runtime,f.hashes);
});
test('real TAR extraction cannot turn three license markers into an acceptable runtime',async()=>{
 const f=await fixture(markers),archive=join(f.d,'runtime.tar.gz'),unpacked=join(f.d,'unpacked');
 await command(['/usr/bin/tar','-czf',archive,'-C',f.runtime,'ccusage','no-short-usage','THIRD_PARTY_NOTICES.txt'],f.d);
 await extract(archive,unpacked,'tar');await expect(runtimeFiles(unpacked,f.hashes)).rejects.toThrow('Incomplete runtime license');
});

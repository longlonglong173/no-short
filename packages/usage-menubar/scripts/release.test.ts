import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareNotarizedRelease } from './release';
import { run } from './bundle';

test('notarization stages only ARM, preserves source and promotes only a complete exact verified ZIP',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ns-notary-transaction-')),builds=join(dir,'builds'),releases=join(dir,'distribution');
 const app=join(builds,'darwin-arm64/No Short Usage.app');await mkdir(app,{recursive:true});await mkdir(join(builds,'darwin-x64/No Short Usage.app'),{recursive:true});await writeFile(join(builds,'darwin-x64/No Short Usage.app/original'),'build bytes');await mkdir(releases);await writeFile(join(app,'original'),'build bytes');await writeFile(join(releases,'previous.zip'),'previous complete distribution');
 let fail=true,submissions=0;const verified:string[]=[];
 // Apple identity/service/Gatekeeper are unavailable: replace ONLY these boundaries.
 // Real owned filesystem, ditto ZIP/extraction, checksums and transaction run below.
 const tools={checkSigned:async(path:string)=>{verified.push(path);expect(await readFile(join(path,'original'),'utf8')).toBe('build bytes');},run:async(args:string[],options?:{capture?:boolean})=>{
  if(args[0]==='/usr/bin/xcrun') {
   if(args[1]==='notarytool'){submissions++;return JSON.stringify({id:'test-only-submission',status:'Accepted'});}
   if(args[2]==='staple')await writeFile(join(args[3]!,'test-ticket'),'test-only-ticket');
   return '';
  }
  if(args[0]==='/usr/sbin/spctl'){if(fail)throw Error('test exact archive assessment failed');expect(await readFile(join(args.at(-1)!,'test-ticket'),'utf8')).toBe('test-only-ticket');return '';}
  return run(args,options);
 }};
 const options={builds,releases,runtime:{version:'0.7.1',ccusageVersion:'20.0.34',platforms:{}},teamID:'ABCDEFGHIJ',profile:'test-only',sourceCommit:'a'.repeat(40)};
 try {
  await expect(prepareNotarizedRelease(options,tools)).rejects.toThrow('test exact archive assessment failed');
  expect(await readdir(releases)).toEqual(['previous.zip']);expect(await readdir(app)).toEqual(['original']);
  fail=false;await prepareNotarizedRelease(options,tools);
  expect((await readdir(releases)).sort()).toEqual(['INSTALL.txt','LICENSE','NoShortUsage-0.7.1-arm64.zip','SHA256SUMS','release-validation.json']);
  expect(await readdir(app)).toEqual(['original']);expect(submissions).toBe(2);
  expect(verified.filter(p=>p.includes('/extracted/'))).toHaveLength(2);
  expect(verified.filter(p=>p.includes('/builds/darwin-x64/'))).toHaveLength(2);
  expect((await readFile(join(releases,'INSTALL.txt'),'utf8'))).toContain('Apple Silicon only');
  const p=Bun.spawn(['/usr/bin/shasum','-a','256','-c','SHA256SUMS'],{cwd:releases,stdout:'pipe',stderr:'pipe'});expect(await p.exited).toBe(0);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('missing notary configuration stops before signing or Apple boundaries',async()=>{
 let touched=false;const tools={checkSigned:async()=>{touched=true;},run:async()=>{touched=true;return '';}};
 for(const config of [{teamID:'',profile:'test-only'},{teamID:'ABCDEFGHIJ',profile:''}]) {
  await expect(prepareNotarizedRelease({builds:'/not-used',releases:'/not-used',runtime:{version:'0.7.1',ccusageVersion:'20.0.34',platforms:{}},sourceCommit:'a'.repeat(40),...config},tools)).rejects.toThrow();
 }
 expect(touched).toBe(false);
});

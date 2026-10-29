import {test,expect} from 'bun:test';
import {mkdtemp,mkdir,rm,symlink} from 'node:fs/promises';import{join,resolve}from'node:path';
import {assertIsolatedUpdateHarness,isOwnedHarnessProcess,assertHarnessVersion} from './update-e2e';
test('harness refuses production identities, paths, feeds and symlinked roots',async()=>{
 const base=resolve('.artifacts/ns14-e2e');await mkdir(base,{recursive:true});const root=await mkdtemp(join(base,'00000000-0000-4000-8000-'));
 const input={root,bundleID:'dev.noshort.usage.updater-test.00000000000040008000000000000001',feedURL:'http://127.0.0.1:45321/feed.xml',key:Buffer.alloc(32,1).toString('base64'),appPath:join(root,'install/No Short Usage.app')};
 try{
  await expect(assertIsolatedUpdateHarness(input)).resolves.toBeUndefined();
  for(const bad of [{...input,appPath:'/Applications/No Short Usage.app'},{...input,root:process.env.HOME!},{...input,bundleID:'dev.noshort.usage.menubar'},{...input,feedURL:'https://no-short.io.vn/updates/experimental-arm64.xml'},{...input,feedURL:'http://evil.example/feed.xml'}]) await expect(assertIsolatedUpdateHarness(bad)).rejects.toThrow();
  await symlink(process.env.HOME!,join(root,'install'));try{await expect(assertIsolatedUpdateHarness(input)).rejects.toThrow()}finally{await rm(join(root,'install'))}
  const proc={pid:42,expectedPID:42,bundleID:input.bundleID,expectedBundleID:input.bundleID,appPath:input.appPath,command:input.appPath+'/Contents/MacOS/NoShortUsageMenuBar -AppleLanguages (en)'};
  expect(isOwnedHarnessProcess(proc)).toBe(true);
  for(const bad of [{...proc,pid:1},{...proc,bundleID:'dev.noshort.usage.menubar'},{...proc,command:'/Applications/No Short Usage.app/Contents/MacOS/NoShortUsageMenuBar'}])expect(isOwnedHarnessProcess(bad)).toBe(false);
  const alias=join(base,'test-alias');await symlink(root,alias);try{await expect(assertIsolatedUpdateHarness({...input,root:alias,appPath:join(alias,'install/Test.app')})).rejects.toThrow()}finally{await rm(alias)}
 }finally{await rm(root,{recursive:true,force:true})}
});

test('a negative fixture can never pass by unexpectedly installing B',()=>{
 expect(()=>assertHarnessVersion('success','0.6.1')).not.toThrow();
 for(const scenario of ['cancel','wrong-architecture','corrupt-archive','wrong-key','corrupt-feed','unsigned-feed','equal-version','network','wrong-version'])for(const version of ['0.6.1','0.5.9','0.6.2'])expect(()=>assertHarnessVersion(scenario,version)).toThrow();
});

test('negative acceptance requires actual feed, archive policy and SDK outcome',async()=>{
 const {assertNegativeEvidence}=await import('./update-e2e');
 const feed=['http://127.0.0.1:45555/feed.xml'],zip=[...feed,'http://127.0.0.1:45555/update.zip'];
 expect(()=>assertNegativeEvidence('corrupt-feed',[],['failed(verification)'])).toThrow();
 expect(()=>assertNegativeEvidence('corrupt-feed',feed,[])).toThrow();
 expect(()=>assertNegativeEvidence('corrupt-feed',zip,['failed(verification)'])).toThrow();
 expect(()=>assertNegativeEvidence('corrupt-archive',feed,['failed(verification)'])).toThrow();
 expect(()=>assertNegativeEvidence('cancel',feed,['available(version: "0.6.1")'])).toThrow();
 expect(()=>assertNegativeEvidence('cancel',feed,['available(version: "0.6.1")','idle'])).not.toThrow();
 for(const scenario of ['corrupt-feed','unsigned-feed','wrong-architecture','network'])expect(()=>assertNegativeEvidence(scenario,feed,['failed(verification)'])).not.toThrow();
 for(const scenario of ['corrupt-archive','wrong-key'])expect(()=>assertNegativeEvidence(scenario,zip,['failed(verification)'])).not.toThrow();
 expect(()=>assertNegativeEvidence('equal-version',feed,['current'])).not.toThrow();
});

test('bundle preservation fingerprint detects non-executable changes and symlink changes',async()=>{
 const {bundleFingerprint}=await import('./update-e2e');
 const {writeFile}=await import('node:fs/promises');
 const base=resolve('.artifacts/ns14-e2e');await mkdir(base,{recursive:true});const root=await mkdtemp(join(base,'fingerprint-'));
 try {
  await mkdir(join(root,'Contents'));await writeFile(join(root,'Contents/Info.plist'),'fixture-A');await symlink('Info.plist',join(root,'Contents/link'));
  const before=await bundleFingerprint(root);expect(await bundleFingerprint(root)).toBe(before);
  await writeFile(join(root,'Contents/Info.plist'),'fixture-B');expect(await bundleFingerprint(root)).not.toBe(before);
  await writeFile(join(root,'Contents/Info.plist'),'fixture-A');await rm(join(root,'Contents/link'));await symlink('elsewhere',join(root,'Contents/link'));expect(await bundleFingerprint(root)).not.toBe(before);
 } finally {await rm(root,{recursive:true,force:true});}
});

test('explicit fixture versions preserve A and reject every ineligible replacement',()=>{
 for(const scenario of ['success','maintenance','worker-drain']){expect(()=>assertHarnessVersion(scenario,'0.7.0','0.7.0','0.7.2')).not.toThrow();expect(()=>assertHarnessVersion(scenario,'0.7.2','0.7.0','0.7.2')).not.toThrow();}
 for(const scenario of ['cancel','wrong-version','older-version','equal-version']){expect(()=>assertHarnessVersion(scenario,'0.7.0','0.7.0','0.7.2')).not.toThrow();for(const version of ['0.6.1','0.7.1','0.7.2'])expect(()=>assertHarnessVersion(scenario,version,'0.7.0','0.7.2')).toThrow();}
});

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

test('negative acceptance requires the scenario-specific mapped SDK failure and request boundary',async()=>{
 const {assertNegativeEvidence}=await import('./update-e2e');
 const feed=['http://127.0.0.1:45555/feed.xml'],zip=[...feed,'http://127.0.0.1:45555/update.zip'];
 const failed=(category:string)=>`failed(UsageCore.NativeUpdateFailure.${category})`;
 const available='available(version: "0.6.1")';
 const cases=[
  ['network',feed,'network',false],
  ...['corrupt-feed','unsigned-feed','wrong-architecture'].map(scenario=>[scenario,feed,'verification',false] as const),
  ...['corrupt-archive','wrong-key','wrong-version'].map(scenario=>[scenario,zip,'unexpected',true] as const),
 ] as const;
 for(const [scenario,urls,category,downloaded] of cases){
  const prefix=downloaded?['checking',available,'downloading']:['checking'];
  expect(()=>assertNegativeEvidence(scenario,urls,[...prefix,failed(category)])).not.toThrow();
  for(const wrong of ['network','verification','unexpected','notConfigured','unsupportedArchitecture'].filter(value=>value!==category)){
   expect(()=>assertNegativeEvidence(scenario,urls,[...prefix,failed(wrong)])).toThrow();
  }
  expect(()=>assertNegativeEvidence(scenario,urls,[])).toThrow();
  expect(()=>assertNegativeEvidence(scenario,urls,[failed(category)])).toThrow();
  expect(()=>assertNegativeEvidence(scenario,downloaded?feed:zip,[...prefix,failed(category)])).toThrow();
  if(downloaded)expect(()=>assertNegativeEvidence(scenario,zip,['checking',available,failed(category)])).toThrow();
 }
 expect(()=>assertNegativeEvidence('corrupt-feed',[],['checking',failed('verification')])).toThrow();
 for(const scenario of ['equal-version','older-version']){
  expect(()=>assertNegativeEvidence(scenario,feed,['checking','current'])).not.toThrow();
  expect(()=>assertNegativeEvidence(scenario,feed,['checking','idle'])).toThrow();
 }
});

test('download cancellation requires available then downloading then idle in the observed check',async()=>{
 const {assertNegativeEvidence}=await import('./update-e2e');
 const feed=['http://127.0.0.1:45555/feed.xml'],zip=[...feed,'http://127.0.0.1:45555/update.zip'];
 const available='available(version: "0.6.1")';
 expect(()=>assertNegativeEvidence('cancel',feed,['checking',available,'idle'])).not.toThrow();
 expect(()=>assertNegativeEvidence('cancel-download',zip,['checking',available,'downloading','idle'])).not.toThrow();
 // Repeated observations of the same actual phase are harmless.
 expect(()=>assertNegativeEvidence('cancel-download',zip,['checking',available,available,'downloading','downloading','idle'])).not.toThrow();
 for(const states of [
  ['idle'],['checking','idle'],['checking',available,'idle'],
  ['checking','downloading',available,'idle'],['checking','downloading','idle'],
  ['checking',available,'downloading','current','idle'],
  ['checking',available,'downloading','failed(UsageCore.NativeUpdateFailure.network)','idle'],
  ['checking',available,'idle','checking','idle'],
 ])expect(()=>assertNegativeEvidence('cancel-download',zip,states)).toThrow();
 expect(()=>assertNegativeEvidence('cancel-download',feed,['checking',available,'downloading','idle'])).toThrow();
 expect(()=>assertNegativeEvidence('cancel',feed,['checking',available,'downloading','idle'])).toThrow();
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

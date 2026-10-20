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
 for(const scenario of ['cancel','wrong-architecture','corrupt-archive','wrong-key','corrupt-feed','unsigned-feed','equal-version','network'])expect(()=>assertHarnessVersion(scenario,'0.6.1')).toThrow();
});

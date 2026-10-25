import {test,expect} from 'bun:test';
import {mkdir,mkdtemp,readlink,rm,lstat,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {prepareSDKCache} from './update-e2e-cache';
test('SDK test cache needs explicit consent, never reuses an existing path, and only removes its owned link',async()=>{
 const base=resolve('.artifacts/ns14-e2e');await mkdir(base,{recursive:true});const root=await mkdtemp(join(base,'cache-'));
 const options={root,bundleID:'dev.noshort.usage.updater-test.00000000000040008000000000000001',systemCacheRoot:join(root,'mock-system-caches'),allow:false};
 try{
  await expect(prepareSDKCache(options)).rejects.toThrow('consent');
  const cleanup=await prepareSDKCache({...options,allow:true}),link=join(options.systemCacheRoot,options.bundleID);
  expect(await readlink(link)).toBe(join(root,'sdk-cache'));
  await expect(prepareSDKCache({...options,allow:true})).rejects.toThrow();
  await rm(link);await writeFile(link,'unrelated');await expect(cleanup()).rejects.toThrow('changed');
  expect((await lstat(link)).isFile()).toBe(true);await rm(link);
  const cleanup2=await prepareSDKCache({...options,allow:true});await cleanup2();await expect(lstat(link)).rejects.toThrow();
 }finally{await rm(root,{recursive:true,force:true})}
});

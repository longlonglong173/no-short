import {test,expect} from 'bun:test';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {loadUpdateChannel,validateUpdateChannel,updateFlags} from './update-channel';
test('canonical update configuration, no private fields or placeholders',()=>{
 const good={feedURL:'https://no-short.io.vn/updates/experimental-arm64.xml',publicKey:Buffer.alloc(32,1).toString('base64')};
 expect(validateUpdateChannel(good)).toEqual(good);
 for(const value of [{...good,privateKey:'SECRET'},{...good,feedURL:'http://evil.example/feed'},{...good,publicKey:Buffer.alloc(32).toString('base64')},{...good,publicKey:good.publicKey+'\n'}]) expect(()=>validateUpdateChannel(value)).toThrow();
 expect(updateFlags.SURequireSignedFeed).toBe(true);expect(updateFlags.SUEnableAutomaticChecks).toBe(false);expect(updateFlags.SUSignedFeedFailureExpirationInterval).toBe(0);
});
test('dev missing configuration is explicit; test files cannot enter distribution',async()=>{
 expect(await loadUpdateChannel(undefined,'development')).toBeNull();
 await expect(loadUpdateChannel(undefined,'distribution')).rejects.toThrow();
 const dir=await mkdtemp(join(tmpdir(),'ns14-config-'));try {
  const p=join(dir,'config.json');await writeFile(p,JSON.stringify({feedURL:'https://no-short.io.vn/updates/experimental-arm64.xml',publicKey:Buffer.alloc(32,1).toString('base64')}));
  expect((await loadUpdateChannel(p,'development'))?.publicKey).toBeTruthy();
  await expect(loadUpdateChannel(p,'distribution')).rejects.toThrow();
 }finally{await rm(dir,{recursive:true,force:true})}
});

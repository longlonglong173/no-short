import {test,expect} from 'bun:test';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {sha,copyVerifiedRuntime} from './bundle';

test('native build binds exact copied pre-sign bytes to the captured manifest after source replacement',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ns-runtime-copy-'));
 try {
  const source=join(dir,'reader'),destination=join(dir,'copied');await writeFile(source,'reviewed runtime');
  // The original builder performed this check before waiting for Swift.
  const expected=sha(await readFile(source));
  await writeFile(source,'runtime promoted during Swift build');
  await expect(copyVerifiedRuntime(source,destination,expected)).rejects.toThrow('checksum');
  expect(await Bun.file(destination).exists()).toBe(false);
  await writeFile(source,'reviewed runtime');await copyVerifiedRuntime(source,destination,expected);
  expect(await readFile(destination,'utf8')).toBe('reviewed runtime');
 } finally {await rm(dir,{recursive:true,force:true});}
});

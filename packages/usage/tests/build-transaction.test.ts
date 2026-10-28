import { test, expect } from 'bun:test';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildTransaction } from '../../../scripts/build-transaction';

// Removing staging or promoting ARM before the x64 command exits would destroy
// the previous complete runtime set; these assertions read the actual files.
for (const previous of [false, true]) test(`x64 command failure after ARM success preserves ${previous ? 'previous' : 'absent'} complete outputs`, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ns-build-'));
  const targets = { runtime: join(dir, 'runtime'), releases: join(dir, 'releases'), manifest: join(dir, 'manifest.json') };
  try {
    if (previous) { await mkdir(targets.runtime); await writeFile(join(targets.runtime, 'arm64'), 'old-arm'); await mkdir(targets.releases); await writeFile(targets.manifest, 'old-manifest'); }
    await expect(buildTransaction(join(dir, 'transaction'), targets, async stage => {
      await mkdir(stage.runtime, {recursive:true}); await writeFile(join(stage.runtime, 'arm64'), 'new-arm');
      const child = Bun.spawn(['/bin/sh', '-c', 'exit 17']);
      if (await child.exited) throw Error('x64 compiler failed');
      await writeFile(stage.manifest, 'complete');
    })).rejects.toThrow('x64 compiler failed');
    expect(await Bun.file(targets.manifest).exists()).toBe(previous);
    expect(await Bun.file(join(targets.runtime, 'arm64')).exists()).toBe(previous);
    if (previous) { expect(await readFile(targets.manifest, 'utf8')).toBe('old-manifest'); expect(await readFile(join(targets.runtime, 'arm64'), 'utf8')).toBe('old-arm'); }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('failed second promotion rolls back the first and remains recoverable for the next build', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ns-promote-'));
  const targets = { runtime: join(dir, 'runtime'), manifest: join(dir, 'missing-parent/manifest') };
  try {
    await writeFile(targets.runtime, 'old');
    await expect(buildTransaction(join(dir, 'transaction'), targets, async stage => {
      await writeFile(stage.runtime, 'new'); await writeFile(stage.manifest, 'complete');
    })).rejects.toThrow();
    expect(await readFile(targets.runtime, 'utf8')).toBe('old');
    await mkdir(join(dir, 'missing-parent'));
    await buildTransaction(join(dir, 'transaction'), targets, async stage => {
      await writeFile(stage.runtime, 'new'); await writeFile(stage.manifest, 'complete');
    });
    expect(await readFile(targets.runtime, 'utf8')).toBe('new');
    expect(await readFile(targets.manifest, 'utf8')).toBe('complete');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('missing staged manifest cannot promote any runtime outputs', async () => {
 const dir=await mkdtemp(join(tmpdir(),'ns-incomplete-'));
 try { const target=join(dir,'runtime'); await writeFile(target,'old');
  await expect(buildTransaction(join(dir,'transaction'),{runtime:target,manifest:join(dir,'manifest')},async stage=>{await writeFile(stage.runtime,'new');})).rejects.toThrow();
  expect(await readFile(target,'utf8')).toBe('old');
 } finally {await rm(dir,{recursive:true,force:true});}
});

// Kill a separate builder while it is actually renaming a multi-file set.
// The next builder must restore the old set before its callback can observe it.
test('interrupted promotion is recovered before the next builder runs', async () => {
 const dir=await mkdtemp(join(tmpdir(),'ns-interrupted-'));
 try {
  const module=join(import.meta.dirname,'../../../scripts/build-transaction.ts');
  const targets=Object.fromEntries(Array.from({length:400},(_,i)=>[`item${i}`,join(dir,`item${i}`)]));
  for(const path of Object.values(targets)) await writeFile(path,'old');
  const script=join(dir,'builder.ts');
  await writeFile(script,`import {buildTransaction} from ${JSON.stringify(module)}; import {writeFile} from 'node:fs/promises'; await buildTransaction(${JSON.stringify(join(dir,'transaction'))},${JSON.stringify(targets)},async stage=>{for(const path of Object.values(stage)) await writeFile(path,'new');});`);
  const child=Bun.spawn([process.execPath,script],{stdout:'ignore',stderr:'pipe'});
  let observed=false;
  for(let n=0;n<2000;n++) {
   try {if(await readFile(targets.item0!,'utf8')==='new'){observed=true;break;}} catch {}
   await Bun.sleep(2);
  }
  child.kill('SIGKILL');await child.exited;
  expect(observed).toBe(true);
  await expect(buildTransaction(join(dir,'transaction'),targets,async()=>{
   for(const path of Object.values(targets)) expect(await readFile(path,'utf8')).toBe('old');
   throw Error('recovery checked');
  })).rejects.toThrow('recovery checked');
 } finally {await rm(dir,{recursive:true,force:true});}
},20000);

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

async function waitForFile(path: string) {
 for(let attempt=0;attempt<2500;attempt++) {
  if(await Bun.file(path).exists()) return;
  await Bun.sleep(2);
 }
 throw Error(`Timed out waiting for fixture: ${path}`);
}

test('crash after lock-file creation cannot leave an unreadable permanent lock', async () => {
 const dir=await mkdtemp(join(tmpdir(),'ns-early-lock-'));
 const workspace=join(dir,'transaction'); await mkdir(workspace);
 let child:ReturnType<typeof Bun.spawn>|undefined;
 try {
  const script=join(dir,'early.ts');
  // Reproduce the old open(wx) -> PID write interruption with real process/FS.
  await writeFile(script,`import {open,writeFile} from 'node:fs/promises'; await open(${JSON.stringify(join(workspace,'lock.json'))},'wx'); await writeFile(${JSON.stringify(join(dir,'opened'))},''); await Bun.sleep(30000);`);
  child=Bun.spawn([process.execPath,script],{stdout:'ignore',stderr:'pipe'});
  await waitForFile(join(dir,'opened'));expect(child.exitCode).toBeNull();child.kill('SIGKILL');await child.exited;expect(child.signalCode).toBe('SIGKILL');
  expect(await readFile(join(workspace,'lock.json'),'utf8')).toBe('');
  const destination=join(dir,'complete');
  await buildTransaction(workspace,{destination},async stage=>{await writeFile(stage.destination,'complete');});
  expect(await readFile(destination,'utf8')).toBe('complete');
 } finally {child?.kill('SIGKILL');await rm(dir,{recursive:true,force:true});}
});

test('competing stale-lock recoveries have one writer and rejected contenders cannot release its ownership', async () => {
 const dir=await mkdtemp(join(tmpdir(),'ns-contending-lock-')), workspace=join(dir,'transaction');
 const children:ReturnType<typeof Bun.spawn>[]=[];
 const release=join(dir,'release');
 try {
  await mkdir(workspace);await writeFile(join(workspace,'lock.json'),JSON.stringify({pid:2147483647}));
  const module=join(import.meta.dirname,'../../../scripts/build-transaction.ts'), count=16;
  const destination=join(dir,'complete');await writeFile(destination,'old');
  const script=join(dir,'contender.ts');
  await writeFile(script,`import {open,writeFile,rm} from 'node:fs/promises'; import {existsSync} from 'node:fs'; import {buildTransaction} from ${JSON.stringify(module)};
   const id=process.argv[2],dir=${JSON.stringify(dir)};
   await writeFile(dir+'/ready-'+id,'');while(!existsSync(dir+'/start'))await Bun.sleep(2);
   try {await buildTransaction(${JSON.stringify(workspace)},{destination:${JSON.stringify(destination)}},async stage=>{
    let guard;try {guard=await open(dir+'/critical','wx');} catch(error) {await writeFile(dir+'/violation-'+id,'overlap');throw error;}
    try {await writeFile(dir+'/outcome-'+id,'acquired');while(!existsSync(dir+'/release'))await Bun.sleep(2);await writeFile(stage.destination,'writer-'+id);}
    finally {await guard.close();await rm(dir+'/critical');}
   });}catch(error){await writeFile(dir+'/outcome-'+id,'rejected');}
  `);
  children.push(Bun.spawn([process.execPath,script,'0'],{stdout:'ignore',stderr:'pipe'}));
  await waitForFile(join(dir,'ready-0'));await writeFile(join(dir,'start'),'');await waitForFile(join(dir,'outcome-0'));
  // Recreate the stale PID snapshot that another contender read before owner 0
  // claimed the lock. Metadata cannot revoke that live owner's OS ownership.
  await writeFile(join(workspace,'lock.json'),JSON.stringify({pid:2147483647}));
  for(let index=1;index<count;index++) children.push(Bun.spawn([process.execPath,script,String(index)],{stdout:'ignore',stderr:'pipe'}));
  await Promise.all(children.map((_,index)=>waitForFile(join(dir,`outcome-${index}`))));
  const outcomes=await Promise.all(children.map((_,index)=>readFile(join(dir,`outcome-${index}`),'utf8')));
  expect(outcomes.filter(value=>value==='acquired')).toHaveLength(1);
  for(let index=0;index<count;index++) expect(await Bun.file(join(dir,`violation-${index}`)).exists()).toBe(false);
  // All losers have completed cleanup. Their release must not unlock the winner.
  await expect(buildTransaction(workspace,{destination},async stage=>{await writeFile(stage.destination,'intruder');})).rejects.toThrow();
  expect(await readFile(destination,'utf8')).toBe('old');
  await writeFile(release,'');await Promise.all(children.map(child=>child.exited));
  await buildTransaction(workspace,{destination},async stage=>{await writeFile(stage.destination,'next complete build');});
  expect(await readFile(destination,'utf8')).toBe('next complete build');
 } finally {await writeFile(release,'');for(const child of children)child.kill('SIGKILL');await Promise.all(children.map(child=>child.exited));await rm(dir,{recursive:true,force:true});}
},20000);

test('owner killed before its first staged write releases ownership for the next build', async () => {
 const dir=await mkdtemp(join(tmpdir(),'ns-owner-crash-')), workspace=join(dir,'transaction');
 let child:ReturnType<typeof Bun.spawn>|undefined;
 try {
  const destination=join(dir,'complete');await writeFile(destination,'old');
  const module=join(import.meta.dirname,'../../../scripts/build-transaction.ts'),script=join(dir,'owner.ts');
  await writeFile(script,`import {writeFile} from 'node:fs/promises';import {buildTransaction} from ${JSON.stringify(module)};await buildTransaction(${JSON.stringify(workspace)},{destination:${JSON.stringify(destination)}},async()=>{await writeFile(${JSON.stringify(join(dir,'entered'))},'');await Bun.sleep(30000);});`);
  child=Bun.spawn([process.execPath,script],{stdout:'ignore',stderr:'pipe'});await waitForFile(join(dir,'entered'));expect(child.exitCode).toBeNull();child.kill('SIGKILL');await child.exited;expect(child.signalCode).toBe('SIGKILL');
  expect(await readFile(destination,'utf8')).toBe('old');
  await buildTransaction(workspace,{destination},async stage=>{await writeFile(stage.destination,'after owner crash');});
  expect(await readFile(destination,'utf8')).toBe('after owner crash');
 } finally {child?.kill('SIGKILL');await rm(dir,{recursive:true,force:true});}
});

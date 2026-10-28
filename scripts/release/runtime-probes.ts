import { strict as assert } from 'node:assert';
import { mkdir, writeFile, cp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { runReport } from '../../packages/usage/src/runner';
import { buildSnapshot } from '../../packages/usage/src/adapter';
import { historyView, sessionUsageForRange } from '../../packages/usage/src/history';
import { groupedUsage } from '../../packages/usage/src/grouping';
import { createUsageExport, serializeUsageExport } from '../../packages/usage/src/export';
import { command, isolatedEnvironment, type CommandResult } from './evidence';
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
const header=(id:string)=>({type:'session_meta',payload:{id,source:'cli',cwd:'/synthetic/project'}});
const context={type:'turn_context',payload:{model:'gpt-5'}};
const event=(n:number,time='2026-10-17T03:00:00Z')=>({type:'event_msg',timestamp:time,payload:{type:'token_count',info:{last_token_usage:{input_tokens:n,cached_input_tokens:n/2,output_tokens:n/10,reasoning_output_tokens:n/20,total_tokens:n*1.1}}}});
const jsonl=(rows:unknown[])=>rows.map(r=>JSON.stringify(r)).join('\n')+'\n';
function coherent(s:any,start:string,end:string,known:number,status:string,provider:'all'|'codex'|'claude'='all') {
 const h=historyView(s,provider,start,end)!,d=sessionUsageForRange(s,provider,start,end)!,g=groupedUsage(s,provider,start,end)!;
 assert.ok(h&&d&&g,'Required history/session/project partitions');assert.equal(d.reconciled,true);assert.equal(g.reconciled,true);
 const aggregate=h.aggregate;assert.ok(Math.abs(aggregate.models.reduce((v:any,m:any)=>v+m.cost.knownCostUSD,0)-known)<1e-8,'Model subtotal coherence');
 for(const a of [h.aggregate,d.aggregate,g.aggregate]) {assert.equal(a.cost.status,status);assert.ok(Math.abs(a.cost.knownCostUSD-known)<1e-8);assert.equal(a.cost.amountUSD,status==='estimated'?known:null);}
 for(const groupBy of ['project','work'] as const){const doc=createUsageExport(s,provider,start,end,{groupBy})!;assert.deepEqual(JSON.parse(serializeUsageExport(doc,'json')).aggregate.cost,h.aggregate.cost);assert.ok(serializeUsageExport(doc,'csv').includes('"aggregate"'));}
 for(const partition of [g.projects,g.works])assert.ok(Math.abs(partition.reduce((v:any,p:any)=>v+p.aggregate.cost.knownCostUSD,0)-known)<1e-8);
}
/** Both executables are mandatory paths extracted from the same final artifact. */
export async function probeRuntime(directory:string,fixture:string,records:CommandResult[],label:string,version?:string) {
 const env=await isolatedEnvironment(fixture),reader=join(directory,'ccusage'),helper=join(directory,'no-short-usage');
 env.NO_SHORT_USAGE_CCUSAGE=reader;
 const helperVersion=await command([helper,'--version'],fixture,env,records);if(version)assert.ok(helperVersion.startsWith(`no-short-usage ${version} (`),'Extracted helper version identity');
 assert.ok((await command([reader,'--version'],fixture,env,records)).includes('20.0.34'),'Pinned reader version identity');
 const codex=env.CODEX_HOME!,copy=join(fixture,'copied-codex');await mkdir(join(copy,'sessions'),{recursive:true});
 async function write(i:number,rows:unknown[]){await writeFile(join(codex,'sessions',`${ids[i]}.jsonl`),jsonl([header(ids[i]),...rows]));}
 async function snapshots() {
  const raw=await runReport({binary:reader,roots:env.CODEX_HOME!.split(','),claudeRoots:[env.NO_SHORT_USAGE_CLAUDE_ROOTS!],cacheDir:join(fixture,'reader-cache'),timeZone:'UTC',offline:true,environment:env});
  const readerSnapshot=buildSnapshot(raw,{now:new Date(),timeZone:'UTC',metadata:new Map(),providers:['codex','claude']});
  const compiled=JSON.parse(await command([helper,'--snapshot'],fixture,{...env,NO_SHORT_USAGE_CACHE_DIR:join(fixture,`helper-cache-${records.length}`)},records));
  assert.equal(compiled.status,'ready','Compiled helper must produce data');return [readerSnapshot,compiled];
 }
 await write(0,[context,event(100)]);await write(1,[context,event(100)]);
 await cp(join(codex,'sessions'),join(copy,'sessions'),{recursive:true});env.CODEX_HOME=`${codex},${copy}`;
 for(const s of await snapshots()){assert.equal(s.sessions.length,2);assert.equal(s.history!.days.reduce((n:any,d:any)=>n+d.aggregate.tokens.total,0),220);assert.ok(s.history!.sessionDays?.length);}
 await writeFile(join(copy,'sessions',`${ids[0]}.jsonl`),jsonl([header(ids[0]),context,event(100),event(10,'2026-10-18T03:00:00Z')]));
 for(const s of await snapshots()){assert.equal(s.sessions.reduce((n:any,d:any)=>n+d.tokens.total,0),231);assert.equal(sessionUsageForRange(s,'codex','2026-10-17','2026-10-17')!.aggregate.tokens.total,220);assert.equal(sessionUsageForRange(s,'codex','2026-10-18','2026-10-18')!.aggregate.tokens.total,11);}
 env.CODEX_HOME=codex;await rm(copy,{recursive:true});
 await write(0,[event(1000000)]);await write(1,[context,event(1000000)]);
 for(const s of await snapshots()) {coherent(s,'2026-10-17','2026-10-17',1.6875,'partial','codex');assert.equal(s.sessions.reduce((n:any,d:any)=>n+d.tokens.total,0),2200000);const models=s.history!.days.flatMap((d:any)=>d.aggregate.models);assert.ok(models.some((m:any)=>m.cost.status==='partial'||m.cost.status==='estimated'));}
 await writeFile(join(env.NO_SHORT_USAGE_CLAUDE_ROOTS!,'projects','claude.jsonl'),jsonl([{timestamp:'2026-10-17T04:00:00Z',sessionId:'claude-s',requestId:'req',message:{id:'msg',model:'claude-sonnet-4-20250514',usage:{input_tokens:12,output_tokens:3}}}]));
 for(const s of await snapshots()){coherent(s,'2026-10-17','2026-10-17',1.6875,'partial','codex');coherent(s,'2026-10-17','2026-10-17',0.000081,'estimated','claude');}
 await writeFile(env.NO_SHORT_USAGE_PRICING_FILE!,JSON.stringify({version:1,overrides:[{provider:'codex',model:'gpt-5',input:0,output:0,cacheRead:0,cacheWrite:0}]}));
 const zero=JSON.parse(await command([helper,'--snapshot'],fixture,{...env,NO_SHORT_USAGE_CACHE_DIR:join(fixture,'zero-cache')},records));coherent(zero,'2026-10-17','2026-10-17',0,'estimated','codex');coherent(zero,'2026-10-17','2026-10-17',0.000081,'estimated','claude');
 records.push({command:['required-runtime-probes',label,reader,helper],cwd:fixture,code:0,stdout:'collision=220; copied-session dedup; append/sessionDays=220+11; fallback known subtotal=1.6875; custom zero; provider/model/project/work/JSON/CSV coherence',stderr:''});
 return {label,checks:7,requiredSkips:0,reader,helper};
}

export async function probePlugin(plugin:string,tar:string,fixture:string,records:CommandResult[]) {
 const env=await isolatedEnvironment(fixture),launcher=join(plugin,'scripts/launch-usage-mcp.sh');env.PATH='/usr/bin:/bin:/usr/sbin:/sbin';
 const bundled=await command(['/bin/sh',launcher,'--version'],fixture,env,records);assert.ok(bundled.startsWith('no-short-usage '));
 await rm(join(plugin,'packages/usage/runtime'),{recursive:true});
 // Instrument only the transport in this disposable extracted copy. Production
 // canonical HTTPS URL, all curl security arguments, archive/binary checksum
 // gates and installer remain byte-for-byte unchanged.
 const curl=join(fixture,'fixture-curl.sh');
 const manifest=JSON.parse(await Bun.file(join(plugin,'packages/usage/runtime-manifest.json')).text());
 const url=manifest.platforms[`darwin-${process.arch}`].url;
 await writeFile(curl,`#!/bin/sh\nset -eu\n[ "$#" -eq 16 ] || exit 90\n[ "$1" = --fail ] && [ "$5" = --proto ] && [ "$6" = '=https' ] && [ "$7" = --proto-redir ] && [ "$8" = '=https' ] && [ "$9" = --tlsv1.2 ] || exit 91\n[ "\${14}" = --output ] && [ "\${16}" = '${url}' ] || exit 92\n/bin/cp '${tar.replaceAll("'","'\\''")}' "\${15}"\n`,{mode:0o700});
 const original=await Bun.file(launcher).text();assert.equal(original.split('/usr/bin/curl').length,2);
 await writeFile(launcher,original.replace('/usr/bin/curl',`'${curl.replaceAll("'","'\\''")}'`));
 assert.equal(await command(['/bin/sh',launcher,'--version'],fixture,env,records),bundled);
 const cache=join(env.XDG_CACHE_HOME!,'no-short/runtime',manifest.version,`darwin-${process.arch}`);
 const runtime=await probeRuntime(cache,join(fixture,'download-probes'),records,'plugin-downloaded',manifest.version);
 // A fresh cache must refuse altered bytes before extraction/execution.
 await rm(join(env.XDG_CACHE_HOME!,'no-short'),{recursive:true});
 await writeFile(tar+'.bad','tampered');await writeFile(curl,(await Bun.file(curl).text()).replace(tar,tar+'.bad'));
 let refused=false;try{await command(['/bin/sh',launcher,'--version'],fixture,env,records);}catch(e){refused=String(e).includes('Archive sai checksum');}assert.ok(refused,'Installer must reject tampered download');
 return {label:'plugin-launcher-bundled-and-controlled-download',runtime,checks:10,requiredSkips:0,transport:'disposable extracted launcher curl substitution; exact canonical URL and HTTPS flags asserted; production policy unchanged'};
}

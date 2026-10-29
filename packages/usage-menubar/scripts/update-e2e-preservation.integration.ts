// Explicit real fixture bootstrap regression. Requires the current distribution
// app/resources; never launches the installed app or opens GUI windows.
import {runUpdateE2E} from './update-e2e';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
const base=resolve('.artifacts/ns14-e2e');await mkdir(base,{recursive:true});
const root=await mkdtemp(join(base,'preservation-'));
await runUpdateE2E({root,interactive:false,prepareOnly:true});
const exe=(stage:string)=>join(root,stage,'No Short Usage.app/Contents/MacOS/NoShortUsageMenuBar');
async function launch(stage:string,args=['--version'],extra:Record<string,string>={}){const p=Bun.spawn([exe(stage),...args],{env:{...process.env,HOME:join(root,'home'),CFFIXED_USER_HOME:join(root,'home'),...extra},stdout:'pipe',stderr:'pipe'});const [stderr,stdout]=await Promise.all([new Response(p.stderr).text(),new Response(p.stdout).text()]);if(await p.exited)throw Error(stderr);return stdout;}
const keys=['usageLanguage','selectedCodexHomes','selectedClaudeHomes'];
async function prefs(){const value:Record<string,unknown>={};for(const key of keys){const p=Bun.spawn(['/usr/bin/plutil','-extract',key,key==='usageLanguage'?'raw':'json','-o','-',join(root,'test-preferences.plist')],{stdout:'pipe',stderr:'ignore'});const output=await new Response(p.stdout).text();if(await p.exited===0)value[key]=key==='usageLanguage'?output.trim():JSON.parse(output);}return value;}
await launch('install');
const customized:Record<string,unknown>={...await prefs(),usageLanguage:'zh-CN',selectedCodexHomes:[join(root,'codex-custom')],selectedClaudeHomes:[join(root,'claude-custom')]};
for(const key of keys){const p=Bun.spawn(['/usr/bin/plutil','-replace',key,'-json',JSON.stringify(customized[key]),join(root,'test-preferences.plist')]);if(await p.exited)throw Error('private plist update');}
await launch('payload');
const restored=await prefs();
for(const key of ['usageLanguage','selectedCodexHomes','selectedClaudeHomes'])if(JSON.stringify(restored[key])!==JSON.stringify(customized[key]))throw Error(`Relaunch reset ${key}: ${JSON.stringify(restored[key])}`);
// The actual worker must honor the source selected by SnapshotClient, rather
// than resetting its environment to bootstrap's original data root.
const alternate=join(root,'selected-source-fixture');await mkdir(join(alternate,'sessions'),{recursive:true});
const id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',timestamp=new Date().toISOString();
await writeFile(join(alternate,'sessions',`rollout-${timestamp.slice(0,19).replaceAll(':','-')}-${id}.jsonl`),[
 {type:'session_meta',payload:{id,source:'cli'}},{type:'turn_context',payload:{model:'gpt-5'}},
 {type:'event_msg',timestamp,payload:{type:'token_count',info:{last_token_usage:{input_tokens:100,cached_input_tokens:0,output_tokens:10,total_tokens:110}}}},
].map(row=>JSON.stringify(row)).join('\n')+'\n');
const output=await launch('install',['--snapshot-worker',join(root,'install/No Short Usage.app/Contents/Resources/runtime/no-short-usage')],{CODEX_HOME:alternate,NO_SHORT_USAGE_CLAUDE_ROOTS:''});
const worker=JSON.parse(output.slice('NO_SHORT_WORKER_READY\n'.length));
if(!output.startsWith('NO_SHORT_WORKER_READY\n')||worker.sessions.length!==1||worker.sessions[0].tokens.total!==110)throw Error(`Fixture worker selected-source mismatch: ${worker.sessions.length} sessions, ${worker.sessions[0]?.tokens.total} tokens`);
// Reject both a direct escape and a symlink to an external source before the
// worker can open any log. Only test-owned targets are used for the symlink.
await (await import('node:fs/promises')).symlink('/Applications',join(root,'escape'));
for(const path of ['/Applications',join(root,'escape')]){
 let refused=false;
 try {await launch('install',['--snapshot-worker',join(root,'install/No Short Usage.app/Contents/Resources/runtime/no-short-usage')],{CODEX_HOME:path,NO_SHORT_USAGE_CLAUDE_ROOTS:''});}catch(error){refused=String(error).includes('Refusing non-private worker source');}
 if(!refused)throw Error('Worker accepted a source outside its private namespace');
}
// Losing preferences must be reported, never recreated by B bootstrap.
await writeFile(join(root,'test-preferences.plist'),'{}');await launch('payload');
const missing=await prefs();
for(const key of ['usageLanguage','selectedCodexHomes','selectedClaudeHomes'])if(key in missing)throw Error(`Relaunch recreated lost ${key}`);
await writeFile(join(root,'preservation-regression.json'),JSON.stringify({passed:true,customized,restored,missing},null,2));
console.log(JSON.stringify({passed:true,root}));

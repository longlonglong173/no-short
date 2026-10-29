import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {isolatedEnvironment,command} from '../../../scripts/release/evidence';
const base=resolve('.artifacts/release-recovery');await mkdir(base,{recursive:true});
const root=await mkdtemp(join(base,'task5-performance-')),env=await isolatedEnvironment(root);
const large=process.argv.includes('--large'),supportedLarge=process.argv.includes('--supported-large'),count=large?10000:supportedLarge?5000:2000,events=large?50:supportedLarge?100:10;let sourceBytes=0;
for(let i=0;i<count;i++){
 const id=`12345678-1234-4234-8234-${String(i).padStart(12,'0')}`;
 const rows:unknown[]=[{type:'session_meta',payload:{id,source:'cli',cwd:`/synthetic/project-${i%20}`}},{type:'turn_context',payload:{model:'gpt-5'}}];
 for(let j=0;j<events;j++)rows.push({type:'event_msg',timestamp:new Date(Date.UTC(2026,9,28,supportedLarge?0:j,0,supportedLarge?j:0)).toISOString(),payload:{type:'token_count',info:{last_token_usage:{input_tokens:100,cached_input_tokens:50,output_tokens:10,reasoning_output_tokens:5,total_tokens:110}}}});
 const text=rows.map(v=>JSON.stringify(v)).join('\n')+'\n';sourceBytes+=Buffer.byteLength(text);await writeFile(join(env.CODEX_HOME!,'sessions',`${id}.jsonl`),text);
}
const app=resolve('.artifacts/usage-menubar/darwin-arm64/No Short Usage.app'),exe=join(app,'Contents/MacOS/NoShortUsageMenuBar'),helper=join(app,'Contents/Resources/runtime/no-short-usage');
const runs:unknown[]=[];
for(let n=0;n<(supportedLarge?2:6);n++){
 const start=performance.now(),output=await command([exe,'--snapshot-worker',helper],root,env),elapsedMs=performance.now()-start;
 if(!output.startsWith('NO_SHORT_WORKER_READY\n'))throw Error('Actual native worker handshake missing');
 const json=JSON.parse(output.slice('NO_SHORT_WORKER_READY\n'.length));
 if(json.status!=='ready'||json.sessions.length!==count||json.history.days.reduce((v:number,d:any)=>v+d.aggregate.tokens.total,0)!==count*events*110)throw Error('Large dataset reconciliation failed');
 runs.push({kind:n?'warm':'cold',elapsedMs,outputBytes:Buffer.byteLength(output),sessions:json.sessions.length,status:json.status});
}
const metadata={root,methodology:`One cold and ${supportedLarge?'one':'five'} warm fresh process launches through actual native snapshot-worker and bundled helper; private cache reused; no GUI/device responsiveness inference.`,dataset:{sessions:count,eventsPerSession:events,totalEvents:count*events,sourceBytes,totalTokens:count*events*110,projects:20},hardware:{os:await command(['/usr/bin/sw_vers','-productVersion'],root),cpu:await command(['/usr/sbin/sysctl','-n','machdep.cpu.brand_string'],root),ramBytes:Number(await command(['/usr/sbin/sysctl','-n','hw.memsize'],root))},runs};
await writeFile(join(root,'performance.json'),JSON.stringify(metadata,null,2));console.log(JSON.stringify(metadata,null,2));
const swiftSources=(await command(['rg','--files',resolve('packages/usage-menubar/Sources/UsageCore')],root)).split('\n').filter(path=>path.endsWith('.swift'));
const responsiveness=join(root,'acceptance-responsiveness');
await command(['/usr/bin/swiftc','-parse-as-library',...swiftSources,resolve('packages/usage-menubar/scripts/AcceptanceResponsiveness.swift'),'-o',responsiveness],root,env);
const responsivenessOutput=await command([responsiveness,root,exe,helper,String(count),large?'expected-overflow':'expected-success'],root,env);
console.log(responsivenessOutput);


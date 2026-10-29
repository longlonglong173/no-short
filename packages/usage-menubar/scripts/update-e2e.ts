import {createUsageExport,serializeUsageExport} from '../../usage/src/export';
import {mkdir,lstat,realpath,readFile,writeFile,cp,mkdtemp,readdir,readlink} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';import {generateKeyPairSync,createHash} from 'node:crypto';
import {runSigningTool,sparkleTools} from './appcast';
import {prepareSDKCache} from './update-e2e-cache';
import {productionConfig} from './update-channel';
const repo=resolve(import.meta.dirname,'../../..');
const base=join(repo,'.artifacts/ns14-e2e');
export async function assertIsolatedUpdateHarness(i:{root:string;bundleID:string;feedURL:string;key:string;appPath:string}):Promise<void>{
 const root=resolve(i.root),app=resolve(i.appPath),url=new URL(i.feedURL),raw=Buffer.from(i.key,'base64');
 if(!root.startsWith(base+'/')||root===process.env.HOME||app===root||!app.startsWith(root+'/')||!/^dev\.noshort\.usage\.updater-test\.[a-f0-9]{32}$/.test(i.bundleID)||url.protocol!=='http:'||url.hostname!=='127.0.0.1'||Number(url.port)<1024||url.pathname!=='/feed.xml'||url.search||url.hash||url.username||raw.length!==32||raw.toString('base64')!==i.key) throw Error('Unsafe update harness identity/path/feed');
 const info=await lstat(root);if(!info.isDirectory()||(info.mode&0o077)!==0||info.uid!==process.getuid?.()||await realpath(root)!==root)throw Error('Harness root is not private/canonical');
 let existing=app;while(!(await Bun.file(existing).exists())){try{await lstat(existing);break}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;existing=dirname(existing)}}
 if(existing!==root && !(await realpath(existing)).startsWith(root+'/'))throw Error('Harness app escapes private root');
 try {const p=JSON.parse(await readFile(productionConfig,'utf8'));if(p.publicKey===i.key)throw Error('Production key cannot be used for tests')}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e}
}
export function isOwnedHarnessProcess(i:{pid:number;expectedPID:number;bundleID:string;expectedBundleID:string;appPath:string;command:string}):boolean {
 const exe=join(i.appPath,'Contents/MacOS/NoShortUsageMenuBar');
 return Number.isInteger(i.pid)&&i.pid>1&&i.pid===i.expectedPID&&i.bundleID===i.expectedBundleID&&/^dev\.noshort\.usage\.updater-test\.[a-f0-9]{32}$/.test(i.bundleID)&&(i.command===exe||i.command.startsWith(exe+' '));
}
export function assertHarnessVersion(scenario:string,version:string,versionA='0.6.0',versionB='0.6.1'):void {
 if(![versionA,versionB].includes(version)||(version!==versionA&&!['success','maintenance','worker-drain'].includes(scenario)))throw Error('Rejected fixture unexpectedly changed the installed version');
}
export async function bundleFingerprint(root:string):Promise<string> {
 const rows:string[]=[];
 async function walk(relative:string){
  const path=join(root,relative),info=await lstat(path);
  rows.push(JSON.stringify([relative,info.mode,info.isSymbolicLink()?await readlink(path):info.isFile()?createHash('sha256').update(await readFile(path)).digest('hex'):'directory']));
  if(info.isDirectory())for(const child of (await readdir(path)).sort())await walk(join(relative,child));
 }
 await walk('');return createHash('sha256').update(rows.join('\n')).digest('hex');
}
export function assertNegativeEvidence(scenario:string,urls:string[],states:string[]):void {
 const paths=urls.map(url=>new URL(url).pathname);
 if(!paths.includes('/feed.xml'))throw Error('No feed request: rejection not exercised');
 const archiveExpected=['corrupt-archive','wrong-key','wrong-version','cancel-download'].includes(scenario);
 if(paths.includes('/update.zip')!==archiveExpected)throw Error('Incorrect rejection archive request boundary');
 const outcome=['cancel','cancel-download'].includes(scenario)?states.some(s=>s.startsWith('available('))&&states.at(-1)==='idle'
  :['equal-version','older-version'].includes(scenario)?states.at(-1)==='current'
  :states.at(-1)?.startsWith('failed(');
 if(!outcome)throw Error('No observed SDK refusal/cancel outcome');
}
async function exec(args:string[],env?:Record<string,string|undefined>):Promise<string>{const p=Bun.spawn(args,{cwd:repo,env,stdout:'pipe',stderr:'pipe'});const[out,err,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);if(code)throw Error(`${args[0]} failed: ${err}`);return out.trim()}
export async function runUpdateE2E({root,interactive,scenario="success",language="en",frameworkLanguage=language,allowSystemTestCache=false,prepareOnly=false,theme="dark",versionA="0.6.0",versionB="0.6.1",holdProbe=false}:{root:string;interactive:boolean;scenario?:string;language?:string;frameworkLanguage?:string;allowSystemTestCache?:boolean;prepareOnly?:boolean;theme?:string;versionA?:string;versionB?:string;holdProbe?:boolean}):Promise<void>{
 if(![versionA,versionB].every(v=>/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(v))||versionA===versionB)throw Error('Explicit distinct fixture versions required');
 await mkdir(root,{recursive:true,mode:0o700});
 const pair=generateKeyPairSync('ed25519'),publicKey=pair.publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64');
 const secret=Buffer.from(pair.privateKey.export({format:'der',type:'pkcs8'}).subarray(-32).toString('base64'));
 const bundleID=`dev.noshort.usage.updater-test.${crypto.randomUUID().replaceAll('-','')}`;
 let feed:Uint8Array=Buffer.from('pending'),archive:Uint8Array=Buffer.from('pending');
 const requests:{url:string;headers:Record<string,string>;at:number}[]=[];
 const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){requests.push({url:req.url,headers:Object.fromEntries(req.headers.entries()),at:Date.now()}); const path=new URL(req.url).pathname;if(path==='/update.zip'&&scenario==='cancel-download'){let offset=0;return new Response(new ReadableStream({async pull(controller){await Bun.sleep(30);if(offset>=archive.length){controller.close();return;}controller.enqueue(archive.slice(offset,offset+65536));offset+=65536;}}),{headers:{'Content-Type':'application/octet-stream','Content-Length':String(archive.length)}});}return new Response(path==='/feed.xml'?new Uint8Array(feed):path==='/update.zip'?new Uint8Array(archive):'missing',{status:(scenario==='network'||scenario==='probe-network')&&path==='/feed.xml'?503:path==='/feed.xml'||path==='/update.zip'?200:404,headers:{'Content-Type':path==='/feed.xml'?'application/rss+xml':'application/octet-stream'}})}});
 const feedURL=`http://127.0.0.1:${server.port}/feed.xml`,app=join(root,'install/No Short Usage.app');
 await assertIsolatedUpdateHarness({root,bundleID,feedURL,key:publicKey,appPath:app});
 const dirs=['home','xdg','project-alpha','project-beta','codex/sessions','claude/projects','cache','activity','context','install','payload','exports'];for(const d of dirs)await mkdir(join(root,d),{recursive:true,mode:0o700});
 for(const project of ['project-alpha','project-beta'])await exec(['/usr/bin/git','-c','init.templateDir=','init','--quiet',join(root,project)],{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'});
 const log=join(root,'codex/sessions/sentinel.jsonl');const preservedLog=JSON.stringify({type:'session_meta',timestamp:'2026-10-20T00:00:00Z',payload:{id:'ns14-sentinel'}})+'\n';await writeFile(log,preservedLog);await writeFile(join(root,'exports/sentinel.csv'),'NS14-PRESERVE-EXPORT\n');
 const pricing=JSON.stringify({version:1,updatedAt:'2026-10-28T00:00:00Z',overrides:[{provider:'codex',model:'gpt-5',input:0,output:0,cacheRead:0,cacheWrite:0},{provider:'claude',model:'claude-sonnet-4-5-20250929',input:2,output:6,cacheRead:0.2,cacheWrite:2.5}]});
 await writeFile(join(root,'pricing.json'),pricing);
 const preservedInputs=new Map<string,string>([['pricing.json',pricing],['codex/sessions/sentinel.jsonl',preservedLog],['exports/sentinel.csv','NS14-PRESERVE-EXPORT\n']]);
 for(let index=0;index<6;index++){
  const id=`11111111-1111-4111-8111-${String(index+1).padStart(12,'0')}`,timestamp=new Date(Date.now()-index*86400000).toISOString();
  const rows:unknown[]=[{type:'session_meta',payload:{id,source:'cli',timestamp,cwd:join(root,index%2?'project-alpha':'project-beta')}}];
  if(index!==1)rows.push({type:'turn_context',payload:{model:index===2?'unknown-synthetic-model':'gpt-5'}});
  rows.push({type:'event_msg',timestamp,payload:{type:'token_count',info:{last_token_usage:{input_tokens:10000,cached_input_tokens:5000,output_tokens:1000,reasoning_output_tokens:50,total_tokens:11000}}}});
  const path=`codex/sessions/rollout-${timestamp.slice(0,19).replaceAll(':','-')}-${id}.jsonl`,text=rows.map(v=>JSON.stringify(v)).join('\n')+'\n';await writeFile(join(root,path),text);preservedInputs.set(path,text);
 }
 await mkdir(join(root,'claude/projects/synthetic'),{recursive:true});
 const claude=JSON.stringify({type:'assistant',timestamp:new Date().toISOString(),sessionId:'22222222-2222-4222-8222-222222222222',requestId:'synthetic-request',message:{id:'synthetic-message',role:'assistant',model:'claude-sonnet-4-5-20250929',usage:{input_tokens:10000,output_tokens:1000,cache_creation_input_tokens:200,cache_read_input_tokens:5000}}})+'\n';
 await writeFile(join(root,'claude/projects/synthetic/session.jsonl'),claude);preservedInputs.set('claude/projects/synthetic/session.jsonl',claude);
 await mkdir(join(root,'alternate/sessions'),{recursive:true});
 const alternate=JSON.stringify({type:'session_meta',payload:{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',source:'cli'}})+'\n'+JSON.stringify({type:'turn_context',payload:{model:'gpt-5'}})+'\n'+JSON.stringify({type:'event_msg',timestamp:new Date().toISOString(),payload:{type:'token_count',info:{last_token_usage:{input_tokens:100,cached_input_tokens:0,output_tokens:10,total_tokens:110}}}})+'\n';
 await writeFile(join(root,'alternate/sessions/rollout-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jsonl'),alternate);preservedInputs.set('alternate/sessions/rollout-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jsonl',alternate);
 async function assertInputsPreserved(){for(const [path,text]of preservedInputs)if(await readFile(join(root,path),'utf8')!==text)throw Error(`Fixture data changed: ${path}`);}

 const build=['/usr/bin/swift' ,'build','--package-path',join(repo,'packages/usage-menubar'),'--scratch-path',join(root,'swift-build'),'-c','debug','--product','NoShortUsageMenuBar','-Xswiftc','-DNO_SHORT_UPDATER_E2E'];
 await exec(build);const bin=await exec([...build,'--show-bin-path']);
 const source=join(repo,'.artifacts/usage-menubar/darwin-arm64/No Short Usage.app');
 for(const [dir,version]of[['install',versionA],['payload',scenario==='wrong-version'?'0.5.9':versionB]]){
  const dest=join(root,dir,'No Short Usage.app');await cp(source,dest,{recursive:true,verbatimSymlinks:true});
  await cp(join(bin,'NoShortUsageMenuBar'),join(dest,'Contents/MacOS/NoShortUsageMenuBar'));
  const file=join(dest,'Contents/Info.plist');
  const p=JSON.parse(await exec(['/usr/bin/plutil','-convert','json','-o','-',file]));
  Object.assign(p,{CFBundleIdentifier:bundleID,CFBundleVersion:version,CFBundleShortVersionString:version,SUFeedURL:feedURL,SUPublicEDKey:publicKey,NoShortUpdateCapability:'configured',NS14HarnessRoot:root,NS14Language:language,NS14Theme:theme,NS14InitialVersion:versionA,NS14CustomSources:scenario==='success',NS14HoldMaintenance:scenario==='maintenance',NS14HoldSnapshotWorker:scenario==='worker-drain'&&dir==='install',NS14ProbeOnly:scenario.startsWith('probe-')||scenario==='product',NS14AutomaticChecks:scenario!=='product',NSAppTransportSecurity:{NSAllowsArbitraryLoads:true}});
  await writeFile(file,JSON.stringify(p));await exec(['/usr/bin/plutil','-convert','xml1',file]);await exec(['/usr/bin/codesign','--force','--sign','-',dest]);
 }
 const zip=join(root,'update.zip');await exec(['/usr/bin/ditto','-c','-k','--sequesterRsrc','--keepParent',join(root,'payload/No Short Usage.app'),zip]);archive=await readFile(zip);
 const other=generateKeyPairSync('ed25519');const archiveSecret=scenario==='wrong-key'?Buffer.from(other.privateKey.export({format:'der',type:'pkcs8'}).subarray(-32).toString('base64')):secret;
 const sig=await runSigningTool([join(sparkleTools,'sign_update'),'--ed-key-file','-','-p',zip],archiveSecret);
 const xml=join(root,'feed.xml');await writeFile(xml,`<?xml version="1.0"?><rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle"><channel><title>NS14 isolated fixture</title><item><title>${versionB} fixture</title><sparkle:version>${(scenario==='equal-version'||scenario==='probe-equal-version')?versionA:scenario==='older-version'?'0.5.9':versionB}</sparkle:version><sparkle:hardwareRequirements>${scenario==='wrong-architecture'?'x86_64':'arm64'}</sparkle:hardwareRequirements><sparkle:minimumSystemVersion>14.0.0</sparkle:minimumSystemVersion><description>Isolated update acceptance fixture only.</description><enclosure url="http://127.0.0.1:${server.port}/update.zip" sparkle:edSignature="${sig}" length="${archive.length}" type="application/octet-stream"/></item></channel></rss>`);
 await runSigningTool([join(sparkleTools,'sign_update'),'--ed-key-file','-',xml],secret);secret.fill(0);archiveSecret.fill(0);feed=await readFile(xml);
 if(scenario==='corrupt-feed'||scenario==='probe-corrupt-feed')feed=Buffer.from(Buffer.from(feed).toString().replace('Isolated update acceptance fixture only.','TAMPERED release notes'));
 if(scenario==='unsigned-feed')feed=Buffer.from('<?xml version="1.0"?><rss version="2.0"><channel><title>Unsigned fixture</title></channel></rss>');
 if(scenario==='corrupt-archive'){archive=Buffer.from(archive);archive[archive.length-1]^=1;}
 await writeFile(join(root,'harness.json'),JSON.stringify({bundleID,feedURL,publicKey,app,scenario,versionA,versionB,archiveSHA256:createHash('sha256').update(archive).digest('hex')},null,2));
 const env={...process.env,HOME:join(root,'home'),CFFIXED_USER_HOME:join(root,'home'),CODEX_HOME:join(root,'codex'),CLAUDE_CONFIG_DIR:join(root,'claude'),XDG_CACHE_HOME:join(root,'xdg'),NO_SHORT_USAGE_CCUSAGE:join(app,'Contents/Resources/runtime/ccusage'),NO_SHORT_USAGE_PRICING_FILE:join(root,'pricing.json'),NO_SHORT_USAGE_CLAUDE_ROOTS:join(root,'claude'),NO_SHORT_USAGE_CACHE_DIR:join(root,'cache'),NO_SHORT_USAGE_ACTIVITY_DIR:join(root,'activity'),NO_SHORT_USAGE_CONTEXT_DIR:join(root,'context'),NO_SHORT_USAGE_OFFLINE:'1'};
 const exportSnapshot=JSON.parse(await exec([join(app,'Contents/Resources/runtime/no-short-usage'),'--snapshot'],{...env,CODEX_HOME:join(root,scenario==='success'?'alternate':'codex')}));
 const dates=exportSnapshot.history.days.map((day:any)=>day.date).sort();
 const exportDocument=createUsageExport(exportSnapshot,'all',dates[0],dates.at(-1));if(!exportDocument)throw Error('Pre-update fixture export unavailable');
 for(const format of ['json','csv'] as const){const path=`exports/pre-update.${format}`,text=serializeUsageExport(exportDocument,format);await writeFile(join(root,path),text);preservedInputs.set(path,text);}
 await assertIsolatedUpdateHarness({root,bundleID,feedURL,key:publicKey,appPath:app});
 await exec([join(app,'Contents/MacOS/NoShortUsageMenuBar'),'--version'],env);
 if(await readFile(join(root,'private-bootstrap'),'utf8')!=='E2E-private-bootstrap'||!(await Bun.file(join(root,'expected-preferences.plist')).exists()))throw Error('Fixture is not the isolated E2E build');
 const before=await readFile(join(app,'Contents/MacOS/NoShortUsageMenuBar')),beforeBundle=await bundleFingerprint(app),payloadBundle=await bundleFingerprint(join(root,'payload/No Short Usage.app'));
 await writeFile(join(root,'bundle-fingerprints.json'),JSON.stringify({beforeBundle,payloadBundle},null,2));
 if(prepareOnly){server.stop(true);return;}
 const cleanupSDKCache=await prepareSDKCache({root,bundleID,allow:allowSystemTestCache});
 let maintenanceObservations=0,workerObservations=0;
 const child=Bun.spawn([join(app,'Contents/MacOS/NoShortUsageMenuBar'),'-AppleLanguages',`(${frameworkLanguage})`],{cwd:root,env,stdout:Bun.file(join(root,'app.stdout.log')),stderr:Bun.file(join(root,'app.stderr.log'))});
 console.log(JSON.stringify({root,bundleID,pid:child.pid,app,interactive,scenario}));
 try{
  for(let n=0;n<(scenario==='product'?36000:6000);n++){
   await Bun.sleep(50);
   await writeFile(join(root,'requests.json'),JSON.stringify(requests,null,2));
   if(scenario==='product'&&await Bun.file(join(root,'finish-product')).exists()){await writeFile(join(root,'result.json'),JSON.stringify({scenario,scope:'Recorded CUA product exercise only',requests},null,2));return;}
   if(scenario.startsWith('probe-') && await Bun.file(join(root,'probe-result.json')).exists()) {
    const probe=JSON.parse(await readFile(join(root,'probe-result.json'),'utf8'));
    await Bun.sleep(300);
    const failed=['probe-corrupt-feed','probe-network'].includes(scenario),current=scenario==='probe-equal-version';
    if(probe.version!==versionA||!probe.canCheck||probe.failed!==failed||probe.checked===failed||probe.outdated!==(!failed&&!current)||(!failed&&probe.latestVersion!==(current?versionA:versionB)))throw Error('Incorrect quiet-probe result');
    if(requests.length!==1||new URL(requests[0].url).pathname!=='/feed.xml'||beforeBundle!==await bundleFingerprint(app)||!before.equals(await readFile(join(app,'Contents/MacOS/NoShortUsageMenuBar'))))throw Error('Probe downloaded, retried or replaced the app');
    if(await readFile(log,'utf8')!==preservedLog||await readFile(join(root,'exports/sentinel.csv'),'utf8')!=='NS14-PRESERVE-EXPORT\n')throw Error('Probe changed source/export');
    if(holdProbe&&!(await Bun.file(join(root,'finish-probe')).exists()))continue;
    child.kill('SIGTERM');await child.exited;
    const next=Bun.spawn([join(app,'Contents/MacOS/NoShortUsageMenuBar'),'-AppleLanguages',`(${frameworkLanguage})`],{cwd:root,env,stdout:Bun.file(join(root,'relaunch.stdout.log')),stderr:Bun.file(join(root,'relaunch.stderr.log'))});
    await Bun.sleep(1500);
    const relaunched=JSON.parse(await readFile(join(root,'ready.json'),'utf8'));
    if(next.exitCode!==null||relaunched.pid!==next.pid||requests.length!==1||beforeBundle!==await bundleFingerprint(app))throw Error('Quiet cadence not preserved across actual fixture relaunch');
    await assertInputsPreserved();
    await writeFile(join(root,'result.json'),JSON.stringify({passed:true,scenario,probe,relaunched,requests,bundleSHA256:beforeBundle,bytesUnchanged:true},null,2));console.log('Real signed informational probe passed; exactly1 feed request, no archive/install.');return;
   }
   if(scenario==='worker-drain'&&await Bun.file(join(root,'worker-start.json')).exists()&&!(await Bun.file(join(root,'termination-start')).exists())){
    const worker=JSON.parse(await readFile(join(root,'worker-start.json'),'utf8'));
    const command=await exec(['/bin/ps','-p',String(worker.pid),'-o','command=']);
    if(worker.group!==worker.pid||worker.path!==app||!command.startsWith(join(app,'Contents/MacOS/NoShortUsageMenuBar')+' --snapshot-worker '))throw Error('No actual owned snapshotworker');
    process.kill(worker.pid,0);workerObservations++;
   }
   if(scenario==='maintenance' && await Bun.file(join(root,'maintenance-start')).exists() && !(await Bun.file(join(root,'maintenance-end')).exists())){
    const info=JSON.parse(await exec(['/usr/bin/plutil','-convert','json','-o','-',join(app,'Contents/Info.plist')]));
    if(info.CFBundleVersion!==versionA)throw Error('App replaced during active maintenance');maintenanceObservations++;
   }
   try {const ready=JSON.parse(await readFile(join(root,'ready.json'),'utf8'));assertHarnessVersion(scenario,ready.version,versionA,versionB);if(ready.version===versionB){
    const observed=JSON.parse(await readFile(join(root,'snapshot-observed.json'),'utf8'));
    if(observed.version!==versionB)continue;
    if(scenario==='success'&&(observed.status!=='ready'||observed.roots!==join(root,'alternate')||observed.codexSessions!==1||observed.codexTokens!==110))throw Error('B did not read the preserved selected source');
    if(payloadBundle!==await bundleFingerprint(app))throw Error('Installed bundle differs from fixture B');
    if(ready.pid===child.pid||ready.bundleID!==bundleID||ready.path!==app)throw Error('Unexpected relaunch identity');
    if(await readFile(log,'utf8')!==preservedLog||await readFile(join(root,'exports/sentinel.csv'),'utf8')!=='NS14-PRESERVE-EXPORT\n'||await readFile(join(root,'pricing.json'),'utf8')!==pricing||!ready.prefsPreserved||ready.prefsPath!==join(root,'test-preferences.plist'))throw Error('Preservation failed');
    if(await Bun.file(join(process.env.HOME!,'Library/Preferences',bundleID+'.plist')).exists())throw Error('Test preferences escaped private store');
    if(scenario==='worker-drain'){
     const worker=JSON.parse(await readFile(join(root,'worker-start.json'),'utf8')),start=Number(await readFile(join(root,'termination-start'),'utf8')),drained=Number(await readFile(join(root,'termination-drained'),'utf8'));
     let alive=true;try{process.kill(worker.pid,0)}catch(e){if((e as NodeJS.ErrnoException).code==='ESRCH')alive=false;else throw e;}
     if(alive||workerObservations===0||drained<start||ready.time<drained||drained-worker.at>=60)throw Error('SDK installation did not drain the active owned worker first');
    }
    if(scenario==='maintenance'){const end=Number(await readFile(join(root,'maintenance-end'),'utf8'));if(!end||ready.time<end||maintenanceObservations===0)throw Error('Replacement did not wait for maintenance');}
    await assertInputsPreserved();
    await writeFile(join(root,'result.json'),JSON.stringify({passed:true,scenario,maintenanceObservations,workerObservations,...ready,observed,installedBundleSHA256:payloadBundle,requests,archiveSHA256:createHash('sha256').update(archive).digest('hex')},null,2));console.log('Real Sparkle A→B replacement/relaunch passed');return;
   }}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e}
   if(scenario!=='success'&&scenario!=='maintenance'&&scenario!=='worker-drain'&&await Bun.file(join(root,'finish-negative')).exists()){
    const states=JSON.parse(await readFile(join(root,'sdk-states.json'),'utf8')) as string[];
    assertNegativeEvidence(scenario,requests.map(r=>r.url),states);
    const after=await readFile(join(app,'Contents/MacOS/NoShortUsageMenuBar')),info=JSON.parse(await exec(['/usr/bin/plutil','-convert','json','-o','-',join(app,'Contents/Info.plist')]));
    if(beforeBundle!==await bundleFingerprint(app)||!before.equals(after)||info.CFBundleVersion!==versionA||await readFile(log,'utf8')!==preservedLog||await readFile(join(root,'exports/sentinel.csv'),'utf8')!=='NS14-PRESERVE-EXPORT\n')throw Error('Rejected update changed the installed app');
    await assertInputsPreserved();
    await writeFile(join(root,'result.json'),JSON.stringify({passed:true,scenario,installedVersion:info.CFBundleVersion,bundleSHA256:beforeBundle,bytesUnchanged:true,states,requests},null,2));console.log('Rejected/cancelled update preserved A:',scenario);return;
   }
   if(await Bun.file(join(root,'stop')).exists())throw Error('Harness stopped; acceptance not complete');
  }
  throw Error('A→B acceptance timed out; do not claim installation proof');
 }finally{server.stop(true);await writeFile(join(root,'requests.json'),JSON.stringify(requests,null,2));
  // Only the original owned process; relaunched process is identified from the guarded marker.
  if(child.exitCode===null)child.kill('SIGTERM');
  try{const ready=JSON.parse(await readFile(join(root,'ready.json'),'utf8'));if(ready.bundleID===bundleID && ready.pid!==child.pid && Number.isInteger(ready.pid)) { const command=await exec(['/bin/ps','-p',String(ready.pid),'-o','command=']);if(isOwnedHarnessProcess({pid:ready.pid,expectedPID:ready.pid,bundleID:ready.bundleID,expectedBundleID:bundleID,appPath:app,command}))process.kill(ready.pid,'SIGTERM') }}catch{}
  await cleanupSDKCache();
 }
}
if(import.meta.main){await mkdir(base,{recursive:true});const root=await mkdtemp(join(base,crypto.randomUUID()+'-'));await runUpdateE2E({root,interactive:true,scenario:process.argv.find(a=>a.startsWith('--scenario='))?.split('=')[1],language:process.argv.find(a=>a.startsWith('--language='))?.split('=')[1],frameworkLanguage:process.argv.find(a=>a.startsWith('--framework-language='))?.split('=')[1],holdProbe:process.argv.includes('--hold-probe'),versionA:process.argv.find(a=>a.startsWith('--version-a='))?.split('=')[1],versionB:process.argv.find(a=>a.startsWith('--version-b='))?.split('=')[1],theme:process.argv.find(a=>a.startsWith('--theme='))?.split('=')[1],allowSystemTestCache:process.argv.includes('--allow-system-test-cache')})}

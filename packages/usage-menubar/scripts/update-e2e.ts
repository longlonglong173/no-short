import {mkdir,lstat,realpath,readFile,writeFile,cp,mkdtemp} from 'node:fs/promises';
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
export function assertHarnessVersion(scenario:string,version:string):void {
 if(version==='0.6.1'&&!['success','maintenance'].includes(scenario))throw Error('Rejected fixture unexpectedly installed B');
}
async function exec(args:string[],env?:Record<string,string|undefined>):Promise<string>{const p=Bun.spawn(args,{cwd:repo,env,stdout:'pipe',stderr:'pipe'});const[out,err,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);if(code)throw Error(`${args[0]} failed: ${err}`);return out.trim()}
export async function runUpdateE2E({root,interactive,scenario="success",language="en",frameworkLanguage=language,allowSystemTestCache=false}:{root:string;interactive:boolean;scenario?:string;language?:string;frameworkLanguage?:string;allowSystemTestCache?:boolean}):Promise<void>{
 await mkdir(root,{recursive:true,mode:0o700});
 const pair=generateKeyPairSync('ed25519'),publicKey=pair.publicKey.export({format:'der',type:'spki'}).subarray(-32).toString('base64');
 const secret=Buffer.from(pair.privateKey.export({format:'der',type:'pkcs8'}).subarray(-32).toString('base64'));
 const bundleID=`dev.noshort.usage.updater-test.${crypto.randomUUID().replaceAll('-','')}`;
 let feed:Uint8Array=Buffer.from('pending'),archive:Uint8Array=Buffer.from('pending');
 const requests:{url:string;headers:Record<string,string>;at:number}[]=[];
 const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){requests.push({url:req.url,headers:Object.fromEntries(req.headers.entries()),at:Date.now()}); const path=new URL(req.url).pathname;return new Response(path==='/feed.xml'?feed:path==='/update.zip'?archive:'missing',{status:scenario==='network'&&path==='/feed.xml'?503:path==='/feed.xml'||path==='/update.zip'?200:404,headers:{'Content-Type':path==='/feed.xml'?'application/rss+xml':'application/octet-stream'}})}});
 const feedURL=`http://127.0.0.1:${server.port}/feed.xml`,app=join(root,'install/No Short Usage.app');
 await assertIsolatedUpdateHarness({root,bundleID,feedURL,key:publicKey,appPath:app});
 const dirs=['home','codex/sessions','claude/projects','cache','activity','context','install','payload','exports'];for(const d of dirs)await mkdir(join(root,d),{recursive:true,mode:0o700});
 const log=join(root,'codex/sessions/sentinel.jsonl');const preservedLog=JSON.stringify({type:'session_meta',timestamp:'2026-10-20T00:00:00Z',payload:{id:'ns14-sentinel'}})+'\n';await writeFile(log,preservedLog);await writeFile(join(root,'exports/sentinel.csv'),'NS14-PRESERVE-EXPORT\n');
 const build=['/usr/bin/swift','build','--package-path',join(repo,'packages/usage-menubar'),'-c','debug','--product','NoShortUsageMenuBar','-Xswiftc','-DNO_SHORT_UPDATER_E2E'];
 await exec(build);const bin=await exec([...build,'--show-bin-path']);
 const source=join(repo,'.artifacts/usage-menubar/darwin-arm64/No Short Usage.app');
 for(const [dir,version]of[['install','0.6.0'],['payload','0.6.1']]){
  const dest=join(root,dir,'No Short Usage.app');await cp(source,dest,{recursive:true,verbatimSymlinks:true});
  await cp(join(bin,'NoShortUsageMenuBar'),join(dest,'Contents/MacOS/NoShortUsageMenuBar'));
  const file=join(dest,'Contents/Info.plist');
  const p=JSON.parse(await exec(['/usr/bin/plutil','-convert','json','-o','-',file]));
  Object.assign(p,{CFBundleIdentifier:bundleID,CFBundleVersion:version,CFBundleShortVersionString:version,SUFeedURL:feedURL,SUPublicEDKey:publicKey,NoShortUpdateCapability:'configured',NS14HarnessRoot:root,NS14Language:language,NS14HoldMaintenance:scenario==='maintenance',NSAppTransportSecurity:{NSAllowsArbitraryLoads:true}});
  await writeFile(file,JSON.stringify(p));await exec(['/usr/bin/plutil','-convert','xml1',file]);await exec(['/usr/bin/codesign','--force','--sign','-',dest]);
 }
 const zip=join(root,'update.zip');await exec(['/usr/bin/ditto','-c','-k','--sequesterRsrc','--keepParent',join(root,'payload/No Short Usage.app'),zip]);archive=await readFile(zip);
 const other=generateKeyPairSync('ed25519');const archiveSecret=scenario==='wrong-key'?Buffer.from(other.privateKey.export({format:'der',type:'pkcs8'}).subarray(-32).toString('base64')):secret;
 const sig=await runSigningTool([join(sparkleTools,'sign_update'),'--ed-key-file','-','-p',zip],archiveSecret);
 const xml=join(root,'feed.xml');await writeFile(xml,`<?xml version="1.0"?><rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle"><channel><title>NS14 isolated fixture</title><item><title>0.6.1 fixture</title><sparkle:version>${scenario==='equal-version'?'0.6.0':'0.6.1'}</sparkle:version><sparkle:hardwareRequirements>${scenario==='wrong-architecture'?'x86_64':'arm64'}</sparkle:hardwareRequirements><sparkle:minimumSystemVersion>14.0.0</sparkle:minimumSystemVersion><description>Isolated update acceptance fixture only.</description><enclosure url="http://127.0.0.1:${server.port}/update.zip" sparkle:edSignature="${sig}" length="${archive.length}" type="application/octet-stream"/></item></channel></rss>`);
 await runSigningTool([join(sparkleTools,'sign_update'),'--ed-key-file','-',xml],secret);secret.fill(0);archiveSecret.fill(0);feed=await readFile(xml);
 if(scenario==='corrupt-feed')feed=Buffer.from(Buffer.from(feed).toString().replace('Isolated update acceptance fixture only.','TAMPERED release notes'));
 if(scenario==='unsigned-feed')feed=Buffer.from('<?xml version="1.0"?><rss version="2.0"><channel><title>Unsigned fixture</title></channel></rss>');
 if(scenario==='corrupt-archive'){archive=Buffer.from(archive);archive[archive.length-1]^=1;}
 await writeFile(join(root,'harness.json'),JSON.stringify({bundleID,feedURL,publicKey,app,scenario,archiveSHA256:createHash('sha256').update(archive).digest('hex')},null,2));
 const env={...process.env,HOME:join(root,'home'),CFFIXED_USER_HOME:join(root,'home'),CODEX_HOME:join(root,'codex'),NO_SHORT_USAGE_CLAUDE_ROOTS:join(root,'claude'),NO_SHORT_USAGE_CACHE_DIR:join(root,'cache'),NO_SHORT_USAGE_ACTIVITY_DIR:join(root,'activity'),NO_SHORT_USAGE_CONTEXT_DIR:join(root,'context'),NO_SHORT_USAGE_OFFLINE:'1'};
 await assertIsolatedUpdateHarness({root,bundleID,feedURL,key:publicKey,appPath:app});
 const before=await readFile(join(app,'Contents/MacOS/NoShortUsageMenuBar'));
 const cleanupSDKCache=await prepareSDKCache({root,bundleID,allow:allowSystemTestCache});
 let maintenanceObservations=0;
 const child=Bun.spawn([join(app,'Contents/MacOS/NoShortUsageMenuBar'),'-AppleLanguages',`(${frameworkLanguage})`],{cwd:root,env,stdout:Bun.file(join(root,'app.stdout.log')),stderr:Bun.file(join(root,'app.stderr.log'))});
 console.log(JSON.stringify({root,bundleID,pid:child.pid,app,interactive,scenario}));
 try{
  for(let n=0;n<6000;n++){
   await Bun.sleep(50);
   await writeFile(join(root,'requests.json'),JSON.stringify(requests,null,2));
   if(scenario==='maintenance' && await Bun.file(join(root,'maintenance-start')).exists() && !(await Bun.file(join(root,'maintenance-end')).exists())){
    const info=JSON.parse(await exec(['/usr/bin/plutil','-convert','json','-o','-',join(app,'Contents/Info.plist')]));
    if(info.CFBundleVersion!=='0.6.0')throw Error('App replaced during active maintenance');maintenanceObservations++;
   }
   try {const ready=JSON.parse(await readFile(join(root,'ready.json'),'utf8'));assertHarnessVersion(scenario,ready.version);if(ready.version==='0.6.1'){
    if(ready.pid===child.pid||ready.bundleID!==bundleID||ready.path!==app)throw Error('Unexpected relaunch identity');
    if(await readFile(log,'utf8')!==preservedLog||await readFile(join(root,'exports/sentinel.csv'),'utf8')!=='NS14-PRESERVE-EXPORT\n'||!ready.prefsPreserved||ready.prefsPath!==join(root,'test-preferences.plist'))throw Error('Preservation failed');
    if(await Bun.file(join(process.env.HOME!,'Library/Preferences',bundleID+'.plist')).exists())throw Error('Test preferences escaped private store');
    if(scenario==='maintenance'){const end=Number(await readFile(join(root,'maintenance-end'),'utf8'));if(!end||ready.time<end||maintenanceObservations===0)throw Error('Replacement did not wait for maintenance');}
    await writeFile(join(root,'result.json'),JSON.stringify({passed:true,scenario,maintenanceObservations,...ready,requests,archiveSHA256:createHash('sha256').update(archive).digest('hex')},null,2));console.log('Real Sparkle A→B replacement/relaunch passed');return;
   }}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e}
   if(scenario!=='success'&&scenario!=='maintenance'&&await Bun.file(join(root,'finish-negative')).exists()){
    const after=await readFile(join(app,'Contents/MacOS/NoShortUsageMenuBar')),info=JSON.parse(await exec(['/usr/bin/plutil','-convert','json','-o','-',join(app,'Contents/Info.plist')]));
    if(!before.equals(after)||info.CFBundleVersion!=='0.6.0'||await readFile(log,'utf8')!==preservedLog||await readFile(join(root,'exports/sentinel.csv'),'utf8')!=='NS14-PRESERVE-EXPORT\n')throw Error('Rejected update changed the installed app');
    await writeFile(join(root,'result.json'),JSON.stringify({passed:true,scenario,installedVersion:info.CFBundleVersion,bytesUnchanged:true,requests},null,2));console.log('Rejected/cancelled update preserved A:',scenario);return;
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
if(import.meta.main){await mkdir(base,{recursive:true});const root=await mkdtemp(join(base,crypto.randomUUID()+'-'));await runUpdateE2E({root,interactive:true,scenario:process.argv.find(a=>a.startsWith('--scenario='))?.split('=')[1],language:process.argv.find(a=>a.startsWith('--language='))?.split('=')[1],frameworkLanguage:process.argv.find(a=>a.startsWith('--framework-language='))?.split('=')[1],allowSystemTestCache:process.argv.includes('--allow-system-test-cache')})}

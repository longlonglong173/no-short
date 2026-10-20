import {readFile,lstat,realpath} from 'node:fs/promises';
import {resolve,join} from 'node:path';
export const productionFeed='https://no-short.io.vn/updates/experimental-arm64.xml';
export const productionConfig=resolve(import.meta.dirname,'../update-channel.json');
export const updateFlags={SUEnableAutomaticChecks:false,SUAutomaticallyUpdate:false,SUAllowsAutomaticUpdates:false,SUEnableSystemProfiling:false,SUEnableJavaScript:false,SUVerifyUpdateBeforeExtraction:true,SURequireSignedFeed:true,SUSignedFeedFailureExpirationInterval:0} as const;
export interface UpdateChannel {feedURL:string;publicKey:string}
export function validateUpdateChannel(value:unknown):UpdateChannel {
 const v=value as UpdateChannel;
 if(!v || Object.keys(v).sort().join(',')!=='feedURL,publicKey' || v.feedURL!==productionFeed || typeof v.publicKey!=='string') throw Error('Invalid public update channel configuration');
 const bytes=Buffer.from(v.publicKey,'base64');
 if(bytes.length!==32 || bytes.toString('base64')!==v.publicKey || !bytes.some(b=>b!==0)) throw Error('Invalid updater public key');
 return {feedURL:v.feedURL,publicKey:v.publicKey};
}
export async function loadUpdateChannel(path:string|undefined,mode:'development'|'distribution'):Promise<UpdateChannel|null> {
 if(!path && mode==='development') return null;
 const file=resolve(path??productionConfig);
 if(!(await lstat(file)).isFile() || (mode==='distribution' && await realpath(file)!==file)) throw Error('Update configuration must be a regular canonical file');
 if(mode==='distribution') {
  if(file!==productionConfig) throw Error('Distribution requires the reviewed production configuration');
  const p=Bun.spawn(['git','ls-files','--error-unmatch','packages/usage-menubar/update-channel.json'],{cwd:resolve(import.meta.dirname,'../../..'),stdout:'ignore',stderr:'ignore'});
  if(await p.exited!==0) throw Error('Production public key must be reviewed and tracked in Git');
 }
 return validateUpdateChannel(JSON.parse(await readFile(file,'utf8')));
}
export async function readPlist(app:string):Promise<Record<string,any>> {
 const p=Bun.spawn(['/usr/bin/plutil','-convert','json','-o','-',join(app,'Contents/Info.plist')],{stdout:'pipe',stderr:'pipe'});
 const out=await new Response(p.stdout).text();if(await p.exited) throw Error('Invalid app plist');return JSON.parse(out);
}
export async function assertAppArchitecture(app:string, expected: string):Promise<void> {
 const info=await readPlist(app),executable=info.CFBundleExecutable;
 if(typeof executable!=="string" || !/^[A-Za-z0-9_-]+$/.test(executable))throw Error("Invalid executable identity");
 const p=Bun.spawn(["/usr/bin/lipo","-archs",join(app,"Contents/MacOS",executable)],{stdout:"pipe",stderr:"ignore"});
 const arch=(await new Response(p.stdout).text()).trim();
 if(await p.exited || arch!==expected)throw Error("Update architecture mismatch");
}
export async function assertUpdateDistribution(app:string):Promise<void> {
 const info=await readPlist(app);
 for(const [key,value] of Object.entries(updateFlags)) if(info[key]!==value) throw Error(`Unsafe update policy: ${key}`);
 await assertAppArchitecture(app,info.NoShortUpdateCapability==='unsupported-architecture'?'x86_64':'arm64');
 if(info.NoShortUpdateCapability==='unsupported-architecture') {
  if(info.SUFeedURL || info.SUPublicEDKey) throw Error('Unsupported architecture cannot have an ARM update feed');return;
 }
 const channel=await loadUpdateChannel(undefined,'distribution');
 if(info.NoShortUpdateCapability!=='configured' || info.SUFeedURL!==channel?.feedURL || info.SUPublicEDKey!==channel?.publicKey) throw Error('App is not configured for signed distribution updates');
}

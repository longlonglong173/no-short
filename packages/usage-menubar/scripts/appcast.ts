import {createPublicKey,verify,createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,mkdtemp,rm,open,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {basename,join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {readPlist} from './update-channel';
export const sparkleTools=resolve(import.meta.dirname,'../.build/artifacts/sparkle/Sparkle/bin');
export function verifyArchiveSignature(bytes:Uint8Array,signature:string,publicKey:string):boolean {
 try {
  const sig=Buffer.from(signature,'base64'),raw=Buffer.from(publicKey,'base64');
  if(sig.length!==64 || raw.length!==32 || sig.toString('base64')!==signature || raw.toString('base64')!==publicKey) return false;
  return verify(null,bytes,createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),raw]),type:'spki',format:'der'}),sig);
 } catch {return false}
}
function version(value:string):bigint[] {
 if(!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)) throw Error('Invalid release version');return value.split('.').map(BigInt);
}
export function validateUpdateArtifact(o:{archive:string;version:string;previousVersion?:string;bundleVersion:string}):void {
 const v=version(o.version);if(o.bundleVersion!==o.version || basename(o.archive)!==`NoShortUsage-${o.version}-arm64.zip`) throw Error('Update archive identity mismatch');
 if(o.previousVersion){const p=version(o.previousVersion);let order=0;for(let i=0;i<3;i++){if(v[i]!==p[i]){order=v[i]>p[i]?1:-1;break}}if(order<=0)throw Error('Update must increase the release version')}
}
async function secretBytes(path:string):Promise<Buffer> {
 if(path==='-')return Buffer.from((await Bun.stdin.text()).trim());
 const f=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{
  const s=await f.stat();if(!s.isFile()||s.size>4096||(s.mode&0o077)!==0||s.uid!==process.getuid?.())throw Error('Signing key file must be private and owned');
  return Buffer.from((await f.readFile('utf8')).trim());
 }finally{await f.close()}
}
// Always explicitly provide the private key via stdin. SDK tools otherwise default to login Keychain.
export async function runSigningTool(args:string[],secret:Uint8Array):Promise<string> {
 const p=Bun.spawn(args,{stdin:'pipe',stdout:'pipe',stderr:'pipe'});p.stdin.write(secret);p.stdin.write('\n');p.stdin.end();
 const [out,_err,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);
 if(code)throw Error('Sparkle signing/verification failed (output redacted)');return out.trim();
}
export async function createSignedAppcast(o:{archive:string;version:string;publicKey:string;tools:string;output:string;signingKeyFile:string;previousVersion?:string}):Promise<void> {
 if(resolve(o.tools)!==sparkleTools || await realpath(o.tools)!==sparkleTools)throw Error('Use the pinned Sparkle signing tools');
 const out=resolve(o.output),website=resolve(import.meta.dirname,'../../../website');
 if(out===website||out.startsWith(website+'/'))throw Error('Generate outside website; publication requires a separate review');
 const bytes=await readFile(o.archive),secret=await secretBytes(o.signingKeyFile);
 const scratch=await mkdtemp(join(tmpdir(),'ns14-appcast-'));
 try {
  const signature=await runSigningTool([join(o.tools,'sign_update'),'--ed-key-file','-','-p',resolve(o.archive)],secret);
  if(!verifyArchiveSignature(bytes,signature,o.publicKey))throw Error('Archive signature does not match the pinned public key');
  const listing=Bun.spawn(['/usr/bin/unzip','-Z','-1',resolve(o.archive)],{stdout:'pipe',stderr:'pipe'});
  const names=(await new Response(listing.stdout).text()).trim().split('\n');
  if(await listing.exited || names.some(n=>(n!=='__MACOSX/'&&!n.startsWith('No Short Usage.app/')&&!n.startsWith('__MACOSX/No Short Usage.app/'))||n.split('/').includes('..')))throw Error('Unexpected archive paths');
  const unzip=Bun.spawn(['/usr/bin/ditto','-x','-k',resolve(o.archive),scratch],{stdout:'ignore',stderr:'ignore'});if(await unzip.exited)throw Error('Cannot inspect app archive');
  const app=join(scratch,'No Short Usage.app'),info=await readPlist(app);
  validateUpdateArtifact({...o,bundleVersion:info.CFBundleVersion});
  if(info.CFBundleShortVersionString!==o.version||info.CFBundleIdentifier!=='dev.noshort.usage.menubar'||info.SUPublicEDKey!==o.publicKey||info.LSMinimumSystemVersion!=='14.0')throw Error('App metadata does not match update');
  const signed=Bun.spawn(['/usr/bin/codesign','--verify','--deep','--strict',app],{stdout:'ignore',stderr:'ignore'});if(await signed.exited)throw Error('App code signature failed');
  await mkdir(out,{recursive:true});
  const xml=join(out,'experimental-arm64.xml');
  const url=`https://github.com/longlonglong173/no-short/releases/download/v${o.version}/${basename(o.archive)}`;
  await writeFile(xml,`<?xml version="1.0" encoding="utf-8"?>\n<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle"><channel><title>No Short Usage Experimental — Apple Silicon</title><item><title>${o.version}</title><sparkle:version>${o.version}</sparkle:version><sparkle:shortVersionString>${o.version}</sparkle:shortVersionString><sparkle:minimumSystemVersion>14.0.0</sparkle:minimumSystemVersion><sparkle:hardwareRequirements>arm64</sparkle:hardwareRequirements><description>Signed Experimental update. API-equivalent estimates, not subscription billing.</description><enclosure url="${url}" sparkle:edSignature="${signature}" length="${bytes.length}" type="application/octet-stream" /></item></channel></rss>\n`);
  await runSigningTool([join(o.tools,'sign_update'),'--ed-key-file','-',xml],secret);
  await runSigningTool([join(o.tools,'sign_update'),'--verify','--ed-key-file','-',xml],secret);
  if(createHash('sha256').update(await readFile(o.archive)).digest('hex')!==createHash('sha256').update(bytes).digest('hex'))throw Error('Archive changed during signing');
  await writeFile(join(out,'verification.json'),JSON.stringify({version:o.version,archive:basename(o.archive),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),publicKey:o.publicKey,archiveSignature:signature,feedSHA256:createHash('sha256').update(await readFile(xml)).digest('hex')},null,2)+'\n');
 }finally{secret.fill(0);await rm(scratch,{recursive:true,force:true})}
}
if(import.meta.main){
 const [archive,v,pub,out,key,previous]=process.argv.slice(2);if(!archive||!v||!pub||!out||!key)throw Error('Usage: appcast.ts ARCHIVE VERSION PUBLIC_KEY OUTPUT PRIVATE_KEY_FILE_OR_- [PREVIOUS_VERSION]');
 await createSignedAppcast({archive,version:v,publicKey:pub,tools:sparkleTools,output:out,signingKeyFile:key,previousVersion:previous});console.log('Signed feed prepared locally; nothing published.');
}

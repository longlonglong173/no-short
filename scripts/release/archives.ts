import { lstat, readFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { command, sha } from './evidence';
export function safeEntry(name:string,prefix?:string) {
 if(!name||name.startsWith('/')||name.includes('\\')||name.split('/').some(p=>p==='.'||p==='..')||(prefix&&!name.startsWith(prefix)))throw Error(`Unsafe archive entry: ${name}`);
}
export async function extract(archive:string,destination:string,kind:'tar'|'zip',prefix?:string) {
 await mkdir(destination,{recursive:true});
 const list=await command(kind==='tar'?['/usr/bin/tar','-tzf',archive]:['/usr/bin/unzip','-Z','-1',archive],destination);
 for(const name of list.split('\n'))safeEntry(name,prefix);
 if(kind==='tar') {
  const types=await command(['/usr/bin/tar','-tvzf',archive],destination);
  if(types.split('\n').some(l=>!l.startsWith('-')))throw Error('Runtime TAR contains links or non-files');
 } else {
  // Zip symlinks are forbidden for plugin packages; native app symlinks are
  // checked by verifyNativeArchive/verifyBundle instead.
  const types=await command(['/usr/bin/unzip','-Z','-l',archive],destination);
  if(prefix&&types.split('\n').some(l=>/^l[rwx-]{9}\s/.test(l)))throw Error('Plugin ZIP contains symlinks');
 }
 await mkdir(destination,{recursive:true});
 await command(kind==='tar'?['/usr/bin/tar','-xzf',archive,'-C',destination,'--no-same-owner']:['/usr/bin/ditto','-x','-k',archive,destination],destination);
}
export async function runtimeFiles(directory:string,binaries:Record<string,string>) {
 if(Object.keys(binaries??{}).sort().join(',')!=='ccusage,no-short-usage'||Object.values(binaries).some(h=>!/^([0-9a-f]{64})$/.test(h)))throw Error('Runtime binary manifest mismatch');
 const names=(await readdir(directory)).sort();
 if(names.join(',')!==['THIRD_PARTY_NOTICES.txt','ccusage','no-short-usage'].join(','))throw Error('Runtime contents mismatch');
 for(const [name,hash]of Object.entries(binaries)) {
  if(!['ccusage','no-short-usage'].includes(name))throw Error('Unexpected runtime binary');
  const path=join(directory,name),stat=await lstat(path);
  if(!stat.isFile()||stat.isSymbolicLink()||!(stat.mode&0o111)||sha(await readFile(path))!==hash)throw Error(`Runtime checksum/provenance mismatch: ${name}`);
 }
 const expectedLicense=await readFile(new URL('./licenses/ccusage-20.0.34-LICENSE.txt',import.meta.url));
 // Exact upstream apps/ccusage/LICENSE from SHA-locked source revision
 // d7555844929ad76ec97a113d1d51c31de92bee35; require the whole grant and disclaimer.
 if(sha(expectedLicense)!=='ffa4dd2d15c2e9f87d21367a007593002366c308d90b4a666d5bd43f57df7563')throw Error('Pinned upstream license mismatch');
 const notices=await readFile(join(directory,'THIRD_PARTY_NOTICES.txt'),'utf8');
 if(!notices.includes(expectedLicense.toString('utf8')))throw Error('Incomplete runtime license');
}

import {lstat,realpath,mkdir,symlink,readlink,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {homedir} from 'node:os';
const base=resolve(import.meta.dirname,'../../../.artifacts/ns14-e2e');
export async function prepareSDKCache(o:{root:string;bundleID:string;allow:boolean;systemCacheRoot?:string}):Promise<()=>Promise<void>> {
 if(!o.allow)throw Error('Explicit consent required for a test-ID-only SDK cache bridge');
 const root=resolve(o.root),system=resolve(o.systemCacheRoot??join(homedir(),'Library/Caches'));
 if(!root.startsWith(base+'/')||await realpath(root)!==root||!/^dev\.noshort\.usage\.updater-test\.[a-f0-9]{32}$/.test(o.bundleID)||(system!==join(homedir(),'Library/Caches')&&!system.startsWith(root+'/')))throw Error('Unsafe SDK cache isolation');
 const info=await lstat(root);if(info.uid!==process.getuid?.()||(info.mode&0o077)!==0)throw Error('Unowned test root');
 await mkdir(system,{recursive:true});const target=join(root,'sdk-cache'),link=join(system,o.bundleID);
 await mkdir(target,{mode:0o700,recursive:true});
 if(await realpath(target)!==target)throw Error("Escaping SDK cache target");
 // Never replace an existing cache, even if its name looks like a test ID.
 await symlink(target,link);
 return async()=>{const info=await lstat(link);if(!info.isSymbolicLink()||await readlink(link)!==target)throw Error('SDK cache bridge changed; refusing cleanup');await rm(link)};
}

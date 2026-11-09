import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { command, isolatedEnvironment } from './evidence';
const root=resolve(import.meta.dirname,'../..'),directories:string[]=[];
afterEach(async()=>{for(const d of directories.splice(0))await rm(d,{recursive:true,force:true});}, 30_000);
async function detached(){
 const d=await mkdtemp(join(tmpdir(),'ns-real-rustup-'));directories.push(d);
 const source=join(d,'source');await command(['git','clone','--shared','--no-checkout',root,source],root);
 await command(['git','checkout','--detach','HEAD'],source);return {d,source};
}
test('actual rustup proxy reproduces no-default failure after HOME is privatized without toolchain preservation',async()=>{
 const {d,source}=await detached();await mkdir(join(d,'empty-home'));
 // rustup is a multicall executable: a rustc-named link invokes its real proxy
 // dispatch, even when the installed layout has no CARGO_HOME/bin/rustc shim.
 const rustup=Bun.which('rustup');if(!rustup)throw Error('Installed rustup is required for the actual no-default reproducer');
 const proxy=join(d,'rustc');await symlink(rustup,proxy);
 console.log(JSON.stringify({rustup,realRustup:await realpath(rustup),proxy,realProxy:await realpath(proxy),path:process.env.PATH}));
 const originalCargo=process.env.CARGO_HOME??join(process.env.HOME!,'.cargo');
 const emptyHome=join(d,'empty-home');
 // Isolate rustup's fallback home explicitly: macOS runners can otherwise resolve
 // the account home even when HOME is overridden. Keep the real Cargo home.
 const env:NodeJS.ProcessEnv={...process.env,HOME:emptyHome,CFFIXED_USER_HOME:emptyHome,CARGO_HOME:originalCargo,RUSTUP_HOME:join(emptyHome,'.rustup')};delete env.RUSTUP_TOOLCHAIN;
 const child=Bun.spawn([proxy,'--version'],{cwd:source,env,stdout:'pipe',stderr:'pipe'});
 const [out,err,code]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
 expect(code, `stdout: ${out}\nstderr: ${err}`).not.toBe(0);expect(out).toBe('');expect(err).toContain('no default is configured');
 console.log(JSON.stringify({case:'actual-no-default-reproducer',rustup,ownedProxy:proxy,code,stderr:err.trim()}));
}, 30_000);
test('actual installed pinned compiler and Cargo work from detached cwd, overriding a floating project toolchain, without changing defaults',async()=>{
 const {d,source}=await detached();
 const rustupHome=process.env.RUSTUP_HOME??join(process.env.HOME!,'.rustup');
 const before=await readFile(join(rustupHome,'settings.toml'),'utf8').catch(()=>null);
 await writeFile(join(source,'rust-toolchain.toml'),'[toolchain]\nchannel = "stable"\n');
 const env=await isolatedEnvironment(join(d,'private'),{...process.env,RUSTUP_TOOLCHAIN:'stable'});
 expect(env.RUSTUP_TOOLCHAIN).toBe('1.98.1');expect(env.RUSTUP_HOME).toBe(rustupHome);
 const rust=await command(['rustc','--version'],source,env),cargo=await command(['cargo','--version'],source,env);
 expect(rust).toStartWith('rustc 1.98.1 ');expect(cargo).toStartWith('cargo 1.98.1 ');
 expect(await readFile(join(rustupHome,'settings.toml'),'utf8').catch(()=>null)).toBe(before);
 console.log(JSON.stringify({case:'actual-pinned-detached-toolchain',rust,cargo,selected:env.RUSTUP_TOOLCHAIN,cargoHome:env.CARGO_HOME,rustupHome:env.RUSTUP_HOME,privateHome:env.HOME,projectOverride:'stable',defaultSettingsUnchanged:true}));
});

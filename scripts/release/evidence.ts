import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import readerLock from '../../packages/usage/ccusage-source-lock.json' with { type: 'json' };
export const sha=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
export interface CommandResult {command:string[];cwd:string;code:number;stdout:string;stderr:string;expectedFailure?:boolean}
export async function command(args:string[],cwd:string,env:NodeJS.ProcessEnv=process.env,records?:CommandResult[]) {
 const p=Bun.spawn(args,{cwd,env,stdout:'pipe',stderr:'pipe'});
 const [stdout,stderr,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);
 records?.push({command:args,cwd,code,stdout,stderr});
 if(code!==0)throw Error(`Command failed (${code}): ${args.join(' ')}\n${stderr}\n${stdout}`);
 return stdout.trim();
}
/** Supply all data roots, including optional settings, from one private fixture. */
export async function isolatedEnvironment(directory:string,base:NodeJS.ProcessEnv=process.env):Promise<NodeJS.ProcessEnv> {
 // Resolve installed build-tool homes before privatizing data HOME. Carry them
 // explicitly through nested isolation and detached source clones.
 const toolOwnerHome=base.HOME??homedir();
 const cargoHome=resolve(base.CARGO_HOME||join(toolOwnerHome,'.cargo'));
 const rustupHome=resolve(base.RUSTUP_HOME||join(toolOwnerHome,'.rustup'));
 for(const path of ['home','codex/sessions','claude/projects','cache','activity','context','xdg']) await mkdir(join(directory,path),{recursive:true,mode:0o700});
 return {...base,CARGO_HOME:cargoHome,RUSTUP_HOME:rustupHome,RUSTUP_TOOLCHAIN:readerLock.rustVersion,HOME:join(directory,'home'),CFFIXED_USER_HOME:join(directory,'home'),CODEX_HOME:join(directory,'codex'),CLAUDE_CONFIG_DIR:join(directory,'claude'),NO_SHORT_USAGE_CLAUDE_ROOTS:join(directory,'claude'),NO_SHORT_USAGE_CACHE_DIR:join(directory,'cache'),NO_SHORT_USAGE_PRICING_FILE:join(directory,'pricing.json'),NO_SHORT_USAGE_ACTIVITY_DIR:join(directory,'activity'),NO_SHORT_USAGE_CONTEXT_DIR:join(directory,'context'),XDG_CACHE_HOME:join(directory,'xdg'),NO_SHORT_USAGE_OFFLINE:'1',TZ:'UTC'};
}
export function assertPinnedRustVersions(rust:string,cargo:string) {
 if(!rust.startsWith(`rustc ${readerLock.rustVersion} `))throw Error(`Pinned Rust toolchain mismatch: ${rust}`);
 if(!cargo.startsWith(`cargo ${readerLock.rustVersion} `))throw Error(`Pinned Cargo toolchain mismatch: ${cargo}`);
}
export async function sourceInputs(root:string,commit:string) {
 const files=(await command(['git','ls-tree','-r','--name-only',commit],root)).split('\n');
 const hashes:Record<string,string>={};
 for(const file of files){const child=Bun.spawn(['git','show',`${commit}:${file}`],{cwd:root,stdout:'pipe',stderr:'pipe'});const bytes=await new Response(child.stdout).arrayBuffer();if(await child.exited)throw Error(`Cannot hash source input: ${file}`);hashes[file]=sha(new Uint8Array(bytes));}
 return hashes;
}
export async function assertFrozen(root:string,commit:string,allowManifest=false) {
 const changes=await command(['git','diff','--name-only',commit,'--'],root);
 if(changes.split('\n').filter(Boolean).some(p=>!(allowManifest&&p==='packages/usage/runtime-manifest.json')))throw Error(`Build inputs changed: ${changes}`);
 if((await command(['git','rev-parse','HEAD'],root))!==commit)throw Error('Source commit changed during prepare');
 const untracked=await command(['git','ls-files','--others','--exclude-standard'],root);
 if(untracked)throw Error(`Uncommitted build inputs: ${untracked}`);
}
export async function assertCandidateWritable(directory:string){if(existsSync(join(directory,'signed-candidate.json')))throw Error('Signed candidate is immutable; choose a new candidate directory');}
export async function json(path:string){return JSON.parse(await readFile(path,'utf8'));}
export async function writeJson(path:string,value:unknown){await writeFile(path,JSON.stringify(value,null,2)+'\n');}

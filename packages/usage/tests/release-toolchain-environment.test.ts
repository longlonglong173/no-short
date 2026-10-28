import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isolatedEnvironment } from '../../../scripts/release/evidence';
const directories:string[]=[];
afterEach(async()=>{for(const d of directories.splice(0))await rm(d,{recursive:true,force:true});});
async function fixture(){const d=await mkdtemp(join(tmpdir(),'ns-toolchain-env-'));directories.push(d);return d;}
test('private data HOME retains explicit installed tool homes and overrides a floating toolchain selection',async()=>{
 const d=await fixture(),base={HOME:'/owned/tool-owner',CARGO_HOME:'/owned/installed-cargo',RUSTUP_HOME:'/owned/installed-rustup',RUSTUP_TOOLCHAIN:'stable',PATH:'/owned/bin:/usr/bin'};
 const env=await isolatedEnvironment(d,base);
 expect(env.HOME).toBe(join(d,'home'));expect(env.CARGO_HOME).toBe('/owned/installed-cargo');expect(env.RUSTUP_HOME).toBe('/owned/installed-rustup');expect(env.RUSTUP_TOOLCHAIN).toBe('1.98.1');expect(env.PATH).toBe(base.PATH);
});
test('default installed tool homes are captured before HOME changes and survive nested isolation',async()=>{
 const d=await fixture(),first=await isolatedEnvironment(join(d,'first'),{HOME:'/owned/tool-owner',PATH:'/usr/bin'});
 const second=await isolatedEnvironment(join(d,'second'),first);
 expect(first.CARGO_HOME).toBe('/owned/tool-owner/.cargo');expect(first.RUSTUP_HOME).toBe('/owned/tool-owner/.rustup');
 expect(second.HOME).not.toBe(first.HOME);expect(second.CARGO_HOME).toBe(first.CARGO_HOME);expect(second.RUSTUP_HOME).toBe(first.RUSTUP_HOME);expect(second.RUSTUP_TOOLCHAIN).toBe('1.98.1');
});
test('Rust/Cargo version verification rejects a mismatched compiler or Cargo rather than accepting stable',async()=>{
 const {assertPinnedRustVersions}=await import('../../../scripts/release/evidence') as any;
 expect(typeof assertPinnedRustVersions).toBe('function');
 expect(()=>assertPinnedRustVersions('rustc 1.98.1 (fixture)','cargo 1.98.1 (fixture)')).not.toThrow();
 expect(()=>assertPinnedRustVersions('rustc 1.99.0 (fixture)','cargo 1.98.1 (fixture)')).toThrow('Pinned Rust toolchain mismatch');
 expect(()=>assertPinnedRustVersions('rustc 1.98.1 (fixture)','cargo 1.99.0 (fixture)')).toThrow('Pinned Cargo toolchain mismatch');
});

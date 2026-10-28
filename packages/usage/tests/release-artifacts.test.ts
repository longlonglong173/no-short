import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const root=resolve(import.meta.dirname,'../../..');
const dirs:string[]=[];
afterEach(async()=>{for(const d of dirs.splice(0))await rm(d,{recursive:true,force:true});});
async function verify(metadata:unknown,version='0.7.1') {
 const d=await mkdtemp(join(tmpdir(),'ns-release-negative-'));dirs.push(d);
 await writeFile(join(d,'candidate.json'),JSON.stringify(metadata));
 const p=Bun.spawn([process.execPath,join(root,'scripts/verify-release-artifacts.ts'),d,version],{stdout:'pipe',stderr:'pipe'});
 const [out,err,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);
 expect(code).not.toBe(0); return out+err;
}
test('mixed candidate version fails before executing anything',async()=>{
 expect(await verify({schema:1,version:'0.6.0'})).toContain('Candidate version mismatch');
});
test('missing required artifacts cannot become a successful candidate',async()=>{
 expect(await verify({schema:1,version:'0.7.1',sourceBuildCommit:'a'.repeat(40),artifacts:{}})).toContain('Candidate artifact set mismatch');
});
test('candidate path traversal is rejected before hashing or extraction',async()=>{
 expect(await verify({schema:1,version:'0.7.1',sourceBuildCommit:'a'.repeat(40),artifacts:{'../runtime-manifest.json':'a'.repeat(64)}})).toContain('Unsafe candidate artifact');
});
test('source-only prepare refuses version mismatch before building or reading provider data',async()=>{
 const p=Bun.spawn([process.execPath,join(root,'scripts/prepare-experimental-release.ts'),'99.0.0'],{stdout:'pipe',stderr:'pipe'});
 const [err,code]=await Promise.all([new Response(p.stderr).text(),p.exited]);
 expect(code).not.toBe(0);expect(err).toContain('Source version mismatch');
});

test('frozen input guard rejects a tracked modification and an untracked build input',async()=>{
 const {assertFrozen,command}=await import('../../../scripts/release/evidence');
 const d=await mkdtemp(join(tmpdir(),'ns-frozen-source-'));dirs.push(d);
 await command(['git','init',d],root);await command(['git','config','user.name','Fixture'],d);await command(['git','config','user.email','fixture@example.invalid'],d);
 await writeFile(join(d,'input.txt'),'committed');await command(['git','add','.'],d);await command(['git','commit','-m','fixture'],d);
 const commit=await command(['git','rev-parse','HEAD'],d);await assertFrozen(d,commit);
 await writeFile(join(d,'input.txt'),'modified');await expect(assertFrozen(d,commit)).rejects.toThrow('Build inputs changed');
 await writeFile(join(d,'input.txt'),'committed');await writeFile(join(d,'injected.ts'),'not committed');await expect(assertFrozen(d,commit)).rejects.toThrow('Uncommitted build inputs');
});

test('signed-feed boundary requires the pinned key and unchanged whole feed bytes',async()=>{
 const {generateKeyPairSync,sign}=await import('node:crypto');
 const {verifyFeedSignature}=await import('../../../scripts/verify-release-artifacts') as any;
 expect(typeof verifyFeedSignature).toBe('function');
 const {publicKey,privateKey}=generateKeyPairSync('ed25519');const pub=(publicKey.export({format:'der',type:'spki'}) as Buffer).subarray(-32).toString('base64');
 const xml=Buffer.from('<?xml version="1.0"?><rss><channel>fixture</channel></rss>\n');
 const signature=sign(null,xml,privateKey).toString('base64');
 const signed=Buffer.concat([xml,Buffer.from(`<!-- sparkle-signatures:\nedSignature: ${signature}\nlength: ${xml.length}\n-->\n`)]);
 expect(verifyFeedSignature(signed,pub)).toBe(true);
 expect(verifyFeedSignature(xml,pub)).toBe(false);
 expect(verifyFeedSignature(Buffer.from(signed.toString().replace('fixture','changed')),pub)).toBe(false);
 expect(verifyFeedSignature(Buffer.concat([signed,Buffer.from('<item>injection</item>')]),pub)).toBe(false);
 const other=generateKeyPairSync('ed25519').publicKey.export({format:'der',type:'spki'}) as Buffer;
 expect(verifyFeedSignature(signed,other.subarray(-32).toString('base64'))).toBe(false);
});

test('development Intel app cannot enter the public asset allowlist',async()=>{
 const {artifactNames,publicAssetNames}=await import('../../../scripts/verify-release-artifacts') as any;
 expect(typeof publicAssetNames).toBe('function');
 expect(await verify({schema:1,version:'0.7.1',sourceBuildCommit:'a'.repeat(40),artifacts:Object.fromEntries(artifactNames('0.7.1').map((n:string)=>[n,'a'.repeat(64)])),publishAssets:[...publicAssetNames('0.7.1'),'host-app-darwin-x64.zip']})).toContain('Public release asset allowlist mismatch');
});

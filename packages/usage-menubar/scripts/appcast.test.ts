import {test,expect} from 'bun:test';
import {generateKeyPairSync,sign} from 'node:crypto';
import {verifyArchiveSignature,validateUpdateArtifact} from './appcast';
test('real Ed25519 rejects corrupted archive, wrong key and signature length',()=>{
 const a=generateKeyPairSync('ed25519'),b=generateKeyPairSync('ed25519');
 const key=(k:any)=>k.export({format:'der',type:'spki'}).subarray(-32).toString('base64');
 const bytes=Buffer.from('immutable archive bytes'),signature=sign(null,bytes,a.privateKey).toString('base64');
 expect(verifyArchiveSignature(bytes,signature,key(a.publicKey))).toBe(true);
 expect(verifyArchiveSignature(Buffer.from('corrupted'),signature,key(a.publicKey))).toBe(false);
 expect(verifyArchiveSignature(bytes,signature,key(b.publicKey))).toBe(false);
 expect(verifyArchiveSignature(bytes,'bad',key(a.publicKey))).toBe(false);
});
test('artifact identity is immutable ARM ZIP, version increases and metadata matches',()=>{
 const args={archive:'NoShortUsage-0.6.1-arm64.zip',version:'0.6.1',previousVersion:'0.6.0',bundleVersion:'0.6.1'};
 expect(()=>validateUpdateArtifact(args)).not.toThrow();
 for(const value of [{...args,archive:'NoShortUsage-0.6.1-x64.zip'},{...args,bundleVersion:'0.5.0'},{...args,version:'0.6.0'},{...args,previousVersion:'0.6.1'},{...args,version:'../bad'}]) expect(()=>validateUpdateArtifact(value)).toThrow();
});

test.skipIf(process.platform!=='darwin')('pinned SDK signs/verifies the real fixture ZIP and feed without Keychain',async()=>{
 const {mkdtemp,mkdir,writeFile,copyFile,readFile,rm}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const {createSignedAppcast,sparkleTools,runSigningTool}=await import('./appcast');
 const root=await mkdtemp(join(tmpdir(),'ns14-signing-'));
 const exec=async(args:string[])=>{const p=Bun.spawn(args,{stdout:'pipe',stderr:'pipe'});await new Response(p.stdout).text();const err=await new Response(p.stderr).text();if(await p.exited)throw Error(err)};
 try {
  const pair=generateKeyPairSync('ed25519'),pub=pair.publicKey.export({format:'der',type:'spki'}).subarray(-32);
  const secret=pair.privateKey.export({format:'der',type:'pkcs8'}).subarray(-32).toString('base64');
  const keyFile=join(root,'test-key');await writeFile(keyFile,secret,{mode:0o600});
  const app=join(root,'No Short Usage.app');await mkdir(join(app,'Contents/MacOS'),{recursive:true});
  await writeFile(join(root,'fixture.c'),'int main(void) { return 0; }');
  await exec(['/usr/bin/xcrun','clang','-arch','arm64','-mmacosx-version-min=14.0',join(root,'fixture.c'),'-o',join(app,'Contents/MacOS/TestExecutable')]);
  const plist={CFBundleIdentifier:'dev.noshort.usage.menubar',CFBundleExecutable:'TestExecutable',CFBundlePackageType:'APPL',CFBundleShortVersionString:'0.6.1',CFBundleVersion:'0.6.1',LSMinimumSystemVersion:'14.0',SUPublicEDKey:pub.toString('base64')};
  await writeFile(join(app,'Contents/Info.plist'),JSON.stringify(plist));await exec(['/usr/bin/plutil','-convert','xml1',join(app,'Contents/Info.plist')]);
  await exec(['/usr/bin/codesign','--force','--sign','-',app]);
  const archive=join(root,'NoShortUsage-0.6.1-arm64.zip');await exec(['/usr/bin/ditto','-c','-k','--keepParent',app,archive]);
  await expect(createSignedAppcast({archive,version:'0.6.1',previousVersion:'0.6.0',publicKey:pub.toString('base64'),tools:sparkleTools,output:join(root,'feed'),signingKeyFile:keyFile})).rejects.toThrow();
  expect(await Bun.file(join(root,"feed/experimental-arm64.xml")).exists()).toBe(false);
  // Synthetic crypto fixture is test-only: it cannot pass the production producer.
  await mkdir(join(root,'feed'));
  const signature=await runSigningTool([join(sparkleTools,'sign_update'),'--ed-key-file','-','-p',archive],Buffer.from(secret));
  expect(verifyArchiveSignature(await readFile(archive),signature,pub.toString('base64'))).toBe(true);
  await writeFile(join(root,'feed/experimental-arm64.xml'),`<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle"><channel><title>0.6.1</title><item><enclosure url="https://example.invalid/fixture.zip" sparkle:edSignature="${signature}"/></item></channel></rss>`);
  await runSigningTool([join(sparkleTools,'sign_update'),'--ed-key-file','-',join(root,'feed/experimental-arm64.xml')],Buffer.from(secret));
  const xml=join(root,'feed/experimental-arm64.xml'),feed=await readFile(xml,'utf8');expect(feed).toContain('sparkle:edSignature');
  await runSigningTool([join(sparkleTools,'sign_update'),'--verify','--ed-key-file','-',xml],Buffer.from(secret));
  await writeFile(xml,feed.replace('0.6.1','0.6.2'));
  await expect(runSigningTool([join(sparkleTools,'sign_update'),'--verify','--ed-key-file','-',xml],Buffer.from(secret))).rejects.toThrow('redacted');
  const {assertUpdateDistribution,updateFlags}=await import('./update-channel');
  await writeFile(join(app,'Contents/Info.plist'),JSON.stringify({...plist,...updateFlags,NoShortUpdateCapability:'unsupported-architecture',SUPublicEDKey:undefined}));
  await exec(['/usr/bin/plutil','-convert','xml1',join(app,'Contents/Info.plist')]);
  await expect(assertUpdateDistribution(app)).rejects.toThrow('architecture');
  await writeFile(join(app,'Contents/Info.plist'),JSON.stringify(plist));
  await exec(['/usr/bin/plutil','-convert','xml1',join(app,'Contents/Info.plist')]);
  await exec(['/usr/bin/xcrun','clang','-arch','x86_64','-mmacosx-version-min=14.0',join(root,'fixture.c'),'-o',join(app,'Contents/MacOS/TestExecutable')]);
  await exec(['/usr/bin/codesign','--force','--sign','-',app]);
  await rm(archive);await exec(['/usr/bin/ditto','-c','-k','--keepParent',app,archive]);
  await expect(createSignedAppcast({archive,version:'0.6.1',publicKey:pub.toString('base64'),tools:sparkleTools,output:join(root,'wrong-arch'),signingKeyFile:keyFile})).rejects.toThrow('architecture');
  await expect(createSignedAppcast({archive,version:'0.6.1',publicKey:Buffer.alloc(32,1).toString('base64'),tools:sparkleTools,output:join(root,'bad'),signingKeyFile:keyFile})).rejects.toThrow('public key');
 }finally{await rm(root,{recursive:true,force:true})}
});

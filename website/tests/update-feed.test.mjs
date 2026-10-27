import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPublicKey,verify} from 'node:crypto';
import test from 'node:test';

const read=(path)=>readFileSync(new URL(path,import.meta.url));
test('public ARM feed is signed by the bundled owner key and selects the immutable bootstrap archive',()=>{
 const bytes=read('../updates/experimental-arm64.xml');
 const text=bytes.toString('utf8');
 const block=/<!-- sparkle-signatures:\nedSignature: ([A-Za-z0-9+/=]+)\nlength: (\d+)\n-->\n$/.exec(text);
 assert.ok(block,'SDK signature block missing');
 const length=Number(block[2]),signature=Buffer.from(block[1],'base64');
 const config=JSON.parse(read('../../packages/usage-menubar/update-channel.json'));
 const key=createPublicKey({format:'der',type:'spki',key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.from(config.publicKey,'base64')])});
 assert.equal(bytes.subarray(0,length).toString('utf8')+block[0],text);
 assert.equal(verify(null,bytes.subarray(0,length),key,signature),true);
 const corrupt=Buffer.from(bytes.subarray(0,length));corrupt[corrupt.indexOf('0.7.0')]^=1;
 assert.equal(verify(null,corrupt,key,signature),false);
 assert.match(text,/<sparkle:version>0\.7\.0<\/sparkle:version>/);
 assert.match(text,/<sparkle:hardwareRequirements>arm64<\/sparkle:hardwareRequirements>/);
 assert.match(text,/https:\/\/github\.com\/longlonglong173\/no-short\/releases\/download\/v0\.7\.0\/NoShortUsage-0\.7\.0-arm64\.zip/);
 assert.match(text,/sparkle:edSignature="[A-Za-z0-9+/=]+" length="[1-9]\d*"/);
 assert.doesNotMatch(text,/127\.0\.0\.1|localhost|latest\/download/);
});

test('feed responses declare RSS and refresh promptly',()=>{
 const config=JSON.parse(read('../vercel.json'));
 const route=config.headers.find(x=>x.source==='/updates/(.*)');
 assert.ok(route);
 assert.ok(route.headers.some(x=>x.key.toLowerCase()==='content-type'&&x.value==='application/rss+xml; charset=utf-8'));
 assert.ok(route.headers.some(x=>x.key.toLowerCase()==='cache-control'&&x.value==='public, max-age=300, must-revalidate'));
});

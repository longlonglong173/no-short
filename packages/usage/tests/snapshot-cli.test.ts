import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildSnapshot } from '../src/adapter';
import fixture from './fixtures/unified.json';

const helper = new URL(`../runtime/darwin-${process.arch}/no-short-usage`, import.meta.url).pathname;
test.skipIf(!existsSync(helper))('native snapshot CLI flushes a large JSON document to a slow pipe before exit', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'no-short-large-snapshot-'));
  try {
    const roots = [resolve(join(temp, 'codex'))], timeZone = 'UTC';
    const cache = join(temp, 'cache');
    const scope = createHash('sha256').update(JSON.stringify({ roots, timeZone, ccusage:'20.0.34', schema:1 })).digest('hex').slice(0,24);
    const directory = join(cache,scope); await mkdir(directory,{recursive:true});
    const snapshot = buildSnapshot(fixture,{now:new Date(), timeZone, metadata:new Map()});
    snapshot.sessions = Array.from({length:1500},(_,i)=>({...snapshot.sessions[0], id:`synthetic-${i}`, title:`Tổng hợp 🪷 ${i}`}));
    const expected = JSON.stringify(snapshot)+'\n';
    expect(Buffer.byteLength(expected)).toBeGreaterThan(65536);
    await writeFile(join(directory,'snapshot.json'),expected);
    const child = Bun.spawn(['/usr/bin/python3','-c',`
import subprocess,json,sys,time
p=subprocess.Popen([sys.argv[1],'--snapshot'],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
time.sleep(0.1)
try:
 out,err=p.communicate(timeout=5)
 expected=open(sys.argv[2],'rb').read()
 print(json.dumps({'exit':p.returncode,'complete':out==expected,'bytes':len(out),'expectedBytes':len(expected),'stderrBytes':len(err)}))
except subprocess.TimeoutExpired:
 p.kill();p.communicate();print(json.dumps({'timeout':True}))
`,helper,join(directory,'snapshot.json')],{stdout:'pipe',stderr:'pipe', env:{...process.env,CODEX_HOME:roots[0],NO_SHORT_USAGE_CACHE_DIR:cache,NO_SHORT_USAGE_OFFLINE:'1',TZ:timeZone}});
    const [output, error] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
    expect(await child.exited).toBe(0);
    expect(error).toBe('');
    const result = JSON.parse(output);
    expect(result.timeout).toBeUndefined();
    expect(result.exit).toBe(0);
    expect(result.bytes).toBe(Buffer.byteLength(expected));
    expect(result.complete).toBe(true);
    expect(result.stderrBytes).toBe(0);
  } finally { await rm(temp,{recursive:true,force:true}); }
},15000);

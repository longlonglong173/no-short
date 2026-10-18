import { join } from 'node:path';
import { mkdtemp, rm, mkdir, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { output, run, manifest, verifyBundle } from './bundle.ts';

const runtime = await manifest();
for (const platform of ['darwin-arm64','darwin-x64']) {
  const app = join(output,platform,'No Short Usage.app');
  await verifyBundle(app,platform,runtime);
  console.log(`Verified structure, provenance, architecture and signatures: ${platform}`);
  if (platform !== `darwin-${process.arch}`) continue;
  const env = {...process.env, PATH:'/usr/bin:/bin:/usr/sbin:/sbin'};
  const executable = join(app,'Contents/MacOS/NoShortUsageMenuBar');
  const helper = join(app,'Contents/Resources/runtime/no-short-usage');
  const version = await run([executable,'--version'],{capture:true,env});
  if (!version.includes(runtime.version)) throw new Error('App version failed');
  const icons = await run([executable,'--verify-resources'],{capture:true,env});
  if (icons !== 'Provider icons verified') throw new Error('Packaged provider icons failed');
  const temp = await mkdtemp(join(tmpdir(),'No Short isolated smoke '));
  try {
    const codex = join(temp,'codex'); await mkdir(codex); await mkdir(join(codex,'sessions'));
    const data = await run([executable,'--snapshot-worker',helper],{capture:true,env:{...env,CODEX_HOME:codex,NO_SHORT_USAGE_OFFLINE:'1',NO_SHORT_USAGE_CACHE_DIR:join(temp,'cache')}});
    const marker = 'NO_SHORT_WORKER_READY\n'; if (!data.startsWith(marker)) throw new Error('Worker handshake missing');
    const snapshot = JSON.parse(data.slice(marker.length));
    if (snapshot.schemaVersion !== 1 || snapshot.status !== 'empty' || snapshot.sessions.length !== 0 || snapshot.today.cost.amountUSD !== 0) throw new Error('Bundled worker snapshot failed');
    console.log(`${version}; controlled empty-root worker passed without Node/Bun on PATH`);
    const contextDir=join(temp,'context');
    const statusLine=Bun.spawn([executable,'--claude-context-statusline'],{
      cwd:temp,env:{...env,NO_SHORT_USAGE_CONTEXT_DIR:contextDir},stdin:'pipe',stdout:'pipe',stderr:'pipe',
    });
    statusLine.stdin.write(JSON.stringify({ session_id:'smoke-main',context_window:{context_window_size:200000,used_percentage:37},prompt:'PRIVATE_PROMPT',transcript_path:'/PRIVATE_PATH' }));
    statusLine.stdin.end();
    const [line,stderr,code]=await Promise.all([new Response(statusLine.stdout).text(),new Response(statusLine.stderr).text(),statusLine.exited]);
    if (code !== 0 || line.trim() !== 'Context 37%' || stderr) throw new Error('Bundled Claude status line failed');
    const context=await readFile(join(contextDir,'smoke-main.json'),'utf8');
    if (context.includes('PRIVATE') || JSON.parse(context).usedTokens !== 74000 || (await readdir(contextDir)).length !== 1) throw new Error('Claude context privacy or percentage failed');
    console.log('Bundled status line collected numeric context only, with system tools on PATH');
  } finally { await rm(temp,{recursive:true,force:true}); }
}

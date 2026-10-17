import { join } from 'node:path';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
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
  const temp = await mkdtemp(join(tmpdir(),'No Short isolated smoke '));
  try {
    const codex = join(temp,'codex'); await mkdir(codex); await mkdir(join(codex,'sessions'));
    const data = await run([executable,'--snapshot-worker',helper],{capture:true,env:{...env,CODEX_HOME:codex,NO_SHORT_USAGE_OFFLINE:'1',NO_SHORT_USAGE_CACHE_DIR:join(temp,'cache')}});
    const marker = 'NO_SHORT_WORKER_READY\n'; if (!data.startsWith(marker)) throw new Error('Worker handshake missing');
    const snapshot = JSON.parse(data.slice(marker.length));
    if (snapshot.schemaVersion !== 1 || snapshot.status !== 'empty' || snapshot.sessions.length !== 0 || snapshot.today.cost.amountUSD !== 0) throw new Error('Bundled worker snapshot failed');
    console.log(`${version}; controlled empty-root worker passed without Node/Bun on PATH`);
  } finally { await rm(temp,{recursive:true,force:true}); }
}

import { test, expect } from 'bun:test';
import { mkdtemp, mkdir, cp, symlink, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// A package bump without edits to CLI/MCP must change both advertised versions.
test('CLI and MCP identities derive from a changed package version', async () => {
 const dir=await mkdtemp(join(tmpdir(),'ns-version-')), usage=resolve(import.meta.dirname,'..');
 try {
  await cp(join(usage,'src'),join(dir,'src'),{recursive:true}); await mkdir(join(dir,'dist/panel'),{recursive:true}); await writeFile(join(dir,'dist/panel/index.html'),'<html></html>');
  for(const name of ['ccusage-lock.json','ccusage-source-lock.json','package.json']) await cp(join(usage,name),join(dir,name));
  await symlink(join(usage,'node_modules'),join(dir,'node_modules'));
  const pkg=JSON.parse(await readFile(join(dir,'package.json'),'utf8')); pkg.version='9.8.7'; await writeFile(join(dir,'package.json'),JSON.stringify(pkg));
  const cli=Bun.spawn([process.execPath,join(dir,'src/main.ts'),'--version'],{stdout:'pipe',stderr:'pipe'});
  expect(await new Response(cli.stdout).text()).toBe('no-short-usage 9.8.7 (ccusage 20.0.34)\n'); expect(await cli.exited).toBe(0);
  await writeFile(join(dir,'identity.ts'),`import {Client,InMemoryTransport} from '@modelcontextprotocol/client'; import {createServer} from './src/server'; const server=createServer({get:async()=>null} as any,''); const [a,b]=InMemoryTransport.createLinkedPair(); const client=new Client({name:'identity',version:'1'}); await server.connect(a); await client.connect(b); console.log(client.getServerVersion()?.version); await client.close(); await server.close();`);
  const mcp=Bun.spawn([process.execPath,join(dir,'identity.ts')],{stdout:'pipe',stderr:'pipe'});
  expect(await new Response(mcp.stdout).text()).toBe('9.8.7\n'); expect(await mcp.exited).toBe(0);
 } finally {await rm(dir,{recursive:true,force:true});}
});

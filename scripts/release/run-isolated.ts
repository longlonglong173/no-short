import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { isolatedEnvironment } from './evidence';
const args=process.argv.slice(2);if(!args.length)throw Error('Usage: run-isolated.ts COMMAND [ARGS...]');
const directory=await mkdtemp(join(tmpdir(),'ns-isolated-command-'));
try {const p=Bun.spawn(args,{cwd:process.cwd(),env:await isolatedEnvironment(directory),stdout:'inherit',stderr:'inherit',stdin:'inherit'});process.exitCode=await p.exited;}
finally{await rm(directory,{recursive:true,force:true});}

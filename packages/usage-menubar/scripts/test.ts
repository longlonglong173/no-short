import { run, usage } from './bundle.ts';
await run(['/usr/bin/swift','test','--package-path',usage]);
await run([process.execPath,'test','packages/usage-menubar/scripts/layout.test.ts']);

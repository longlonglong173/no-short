import { run, usage } from './bundle.ts';
await run(['/usr/bin/swift','test','--package-path',usage]);
await run([process.execPath,'test','packages/usage-menubar/scripts/layout.test.ts','packages/usage-menubar/scripts/distribution.test.ts','packages/usage-menubar/scripts/sparkle-bundle.test.ts','packages/usage-menubar/scripts/update-channel.test.ts','packages/usage-menubar/scripts/appcast.test.ts']);

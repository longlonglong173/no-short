import { assertUpdateDistribution } from './update-channel';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { output, run, manifest, verifyBundle } from './bundle.ts';
const runtime = await manifest(), releases = join(output,'releases'); await mkdir(releases,{recursive:true});
for (const platform of ['darwin-arm64','darwin-x64']) {
  const app = join(output,platform,'No Short Usage.app'); await verifyBundle(app,platform,runtime);
  if(process.argv.includes('--distribution')) await assertUpdateDistribution(app);
  const zip = join(releases,`no-short-usage-menubar-${runtime.version}-${platform}.zip`);
  await rm(zip,{force:true}); await run(['/usr/bin/ditto','-c','-k','--sequesterRsrc','--keepParent',app,zip]);
  console.log(`Local app ZIP: ${zip}`);
}
await writeFile(join(releases,'INSTALL.txt'),'Extract the ZIP for your Mac (arm64 = Apple Silicon, x64 = Intel). Move No Short Usage.app into Applications and open it. macOS 14+ required. Open at login is off until you enable it in the menu. Development builds may have signed updates unconfigured; they are ad-hoc signed and not notarized; do not disable Gatekeeper globally. Remove the login item before deleting the app. No publish, installation or login-item registration is performed by packaging.\n');

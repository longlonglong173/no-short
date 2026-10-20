import { assertUpdateDistribution } from './update-channel';
import { sparkleCode } from './sparkle-bundle';
// Explicit maintainer action. Never called by a normal build or pull-request CI.
import { mkdir, mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertDistributionSignature } from './distribution.ts';
import { root, output, manifest, verifyBundle, run, sha } from './bundle.ts';

const teamID = process.env.NO_SHORT_APPLE_TEAM_ID ?? '';
const profile = process.env.NO_SHORT_NOTARY_PROFILE;
if (!/^[A-Z0-9]{10}$/.test(teamID)) throw new Error('Set NO_SHORT_APPLE_TEAM_ID to the expected 10-character team ID');
if (!profile) throw new Error('Set NO_SHORT_NOTARY_PROFILE to a notarytool keychain profile; never pass credentials in source');
if (process.platform !== 'darwin') throw new Error('Distribution verification requires macOS');
const runtime = await manifest();
// An explicit source license is a release prerequisite, separate from dependency notices.
await readFile(join(root, 'LICENSE'));
const platforms = ['darwin-arm64', 'darwin-x64'];
async function checkSigned(app: string, platform: string) {
  await verifyBundle(app, platform, runtime);
  await assertUpdateDistribution(app);
  for (const relative of ['', 'Contents/Resources/runtime/no-short-usage', 'Contents/Resources/runtime/ccusage', ...(await sparkleCode(app)).map(p => p.slice(app.length + 1))]) {
    const p = Bun.spawn(['/usr/bin/codesign', '-d', '--verbose=4', join(app, relative)], {
      stdout: 'pipe', stderr: 'pipe', env: { ...process.env, LC_ALL: 'C' },
    });
    const [stdout, stderr, exit] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
    if (exit) throw new Error('Cannot inspect distribution signature');
    assertDistributionSignature(stdout + '\n' + stderr, teamID);
  }
}
// Check BOTH targets before sending anything to Apple. Ad-hoc/Development builds fail closed.
for (const platform of platforms) await checkSigned(join(output, platform, 'No Short Usage.app'), platform);
const release = join(output, 'distribution');
await rm(release, { recursive: true, force: true });
await mkdir(release, { recursive: true });
const records = [];
for (const platform of platforms) {
  const app = join(output, platform, 'No Short Usage.app');
  const scratch = await mkdtemp(join(tmpdir(), 'no-short-notary-'));
  try {
    const submission = join(scratch, 'submission.zip');
    await run(['/usr/bin/ditto', '-c', '-k', '--sequesterRsrc', '--keepParent', app, submission]);
    const response = await run(['/usr/bin/xcrun', 'notarytool', 'submit', submission,
      '--keychain-profile', profile, '--wait', '--timeout', '20m', '--output-format', 'json'], { capture: true });
    const result = JSON.parse(response);
    if (result.status !== 'Accepted') throw new Error(`Apple notarization was not accepted (${result.id ?? 'no submission ID'})`);
    await run(['/usr/bin/xcrun', 'stapler', 'staple', app]);
    await run(['/usr/bin/xcrun', 'stapler', 'validate', app]);
    const name = `no-short-usage-menubar-${runtime.version}-${platform}.zip`;
    const zip = join(release, name);
    await run(['/usr/bin/ditto', '-c', '-k', '--sequesterRsrc', '--keepParent', app, zip]);
    // Verify the EXACT packaged bytes after extraction, not only the original build.
    const extracted = join(scratch, 'extracted');
    await run(['/usr/bin/ditto', '-x', '-k', zip, extracted]);
    const restored = join(extracted, 'No Short Usage.app');
    await checkSigned(restored, platform);
    await run(['/usr/bin/xcrun', 'stapler', 'validate', restored]);
    await run(['/usr/sbin/spctl', '--assess', '--type', 'execute', '--verbose=2', restored]);
    records.push({ platform, file: name, sha256: sha(await readFile(zip)), notarizationID: result.id, status: 'Accepted' });
  } finally { await rm(scratch, { recursive: true, force: true }); }
}
await writeFile(join(release, 'SHA256SUMS'), records.map(r => `${r.sha256}  ${r.file}`).join('\n') + '\n');
await writeFile(join(release, 'release-validation.json'), JSON.stringify({ version: runtime.version, teamID,
  sourceCommit: await run(['git', 'rev-parse', 'HEAD'], { capture: true }), records }, null, 2) + '\n');
await writeFile(join(release, 'INSTALL.txt'), 'macOS 14+. Choose arm64 for Apple Silicon or x64 for Intel. Verify SHA256SUMS, extract the ZIP, move No Short Usage.app to Applications, then open it. No DMG, Node/Bun or API key is needed. Context is estimated occupancy, not a subscription quota. Claude context and automatic tracking are separate opt-in settings. Disconnect both and disable Open at login before removing the app.\n');
await writeFile(join(release, 'LICENSE'), await readFile(join(root, 'LICENSE')));
console.log(`Signed, notarized ZIPs verified: ${release}. No release was uploaded or published.`);

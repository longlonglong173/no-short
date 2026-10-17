import { resolve } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
const root = resolve(import.meta.dirname, '../../..');
const manifestPath = resolve(root, 'packages/usage/runtime-manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const profile = process.env.NO_SHORT_NOTARY_PROFILE;
if (!profile) throw new Error('Set NO_SHORT_NOTARY_PROFILE to an existing notarytool keychain profile. Never put Apple credentials in source or chat.');
for (const target of ['darwin-arm64', 'darwin-x64']) {
  for (const name of ['no-short-usage', 'ccusage']) {
    const binary = resolve(root, 'packages/usage/runtime', target, name);
    const check = Bun.spawn(['/usr/bin/codesign', '-dv', '--verbose=4', binary], { stdout: 'pipe', stderr: 'pipe' });
    const output = await new Response(check.stderr).text();
    if (await check.exited !== 0 || !output.includes('Authority=Developer ID Application:')) throw new Error('A Developer ID signed build is required before notarization.');
  }
  // Bare command-line executables have no staplable bundle. Submit a ZIP;
  // retain Apple's result and verify Gatekeeper online on a clean Mac.
  const archive = resolve(root, '.artifacts/usage/releases', `notarize-${target}.zip`);
  const zip = Bun.spawn(['/usr/bin/zip', '-qj', archive, resolve(root, 'packages/usage/runtime', target, 'no-short-usage'), resolve(root, 'packages/usage/runtime', target, 'ccusage')]);
  if (await zip.exited !== 0) throw new Error('Notarization archive failed');
  const request = Bun.spawn(['/usr/bin/xcrun', 'notarytool', 'submit', archive, '--keychain-profile', profile, '--wait', '--output-format', 'json'], { stdout: 'pipe', stderr: 'inherit' });
  const receipt = await new Response(request.stdout).text();
  const status = JSON.parse(receipt);
  await writeFile(resolve(root, '.artifacts/usage/releases', `notarization-${target}.json`), receipt);
  if (await request.exited !== 0 || status.status !== 'Accepted') throw new Error(`Notarization not accepted: ${target}`);
  console.log(`Notarization accepted: ${target}. Clean-machine Gatekeeper verification is still required.`);
}

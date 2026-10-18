import { mkdir, cp, rm, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dirname, '../../..');
const out = join(root, '.artifacts/usage/releases');
const staging = join(root, '.artifacts/usage/package');
const destination = join(staging, 'no-short');
const manifest = JSON.parse(await readFile(join(root, 'packages/usage/runtime-manifest.json'), 'utf8'));
for (const [platform, value] of Object.entries(manifest.platforms) as [string, any][]) {
  for (const [name, expected] of Object.entries(value.binaries)) {
    const bytes = await readFile(join(root, 'packages/usage/runtime', platform, name));
    if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error(`Runtime checksum mismatch: ${platform}/${name}; rebuild first`);
  }
}
await rm(staging, { recursive: true, force: true }); await mkdir(destination, { recursive: true }); await mkdir(out, { recursive: true });
for (const path of ['plugin.json', 'mcp.json', 'package.json', 'README.md', 'PRIVACY.md', 'CONTRIBUTING.md', 'LICENSE', 'NOTICE.md', '.agents', 'assets',
  'scripts/launch-usage-mcp.sh', 'scripts/validate.mjs', 'packages/usage/runtime-manifest.json', 'packages/usage/runtime', 'docs/no-short-usage.md',
  'docs/no-short-usage-menubar.md', 'docs/migration-to-no-short-skills.md', 'docs/releases/0.4.2.md', 'CHANGELOG.md']) {
  await cp(join(root, path), join(destination, path), { recursive: true });
}
const validate = Bun.spawn([process.execPath, 'run', 'scripts/validate.mjs'], { cwd: destination, stdout: 'inherit', stderr: 'inherit' });
if (await validate.exited !== 0) throw new Error('Packaged plugin validation failed');
const archive = join(out, `no-short-${manifest.version}.zip`);
await rm(archive, { force: true });
const zip = Bun.spawn(['/usr/bin/zip', '-qr', archive, 'no-short'], { cwd: staging, stdout: 'inherit', stderr: 'inherit' });
if (await zip.exited !== 0) throw new Error('Plugin archive creation failed');
console.log(`Plugin archive: ${archive}`);
console.log('Local package only. No upload or public release has been performed.');

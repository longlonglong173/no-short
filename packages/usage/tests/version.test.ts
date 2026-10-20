import { expect, test } from 'bun:test';
import root from '../../../package.json';
import plugin from '../../../plugin.json';
import usage from '../package.json';
import runtime from '../runtime-manifest.json';
import ccusage from '../ccusage-lock.json';
import { usageVersion, ccusageVersion } from '../src/version';

test('all release identities and exact runtime URLs follow the package version', () => {
  expect(usageVersion).toBe(usage.version);
  expect(ccusageVersion).toBe(ccusage.version);
  expect(root.version).toMatch(/^\d+\.\d+\.\d+$/);
  expect([plugin.version, usage.version, runtime.version]).toEqual(Array(3).fill(root.version));
  expect(runtime.ccusageVersion).toBe(ccusage.version);
  for (const [target, artifact] of Object.entries(runtime.platforms)) {
    expect(artifact.url).toBe(`https://github.com/longlonglong173/no-short/releases/download/v${root.version}/no-short-usage-${target}.tar.gz`);
    expect(artifact.sha256).toMatch(/^[a-f0-9]{64}$/);
  }
});

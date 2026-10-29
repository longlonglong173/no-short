import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Public recommendations follow the owner-signed channel, which can remain on
// the previous release while a private source candidate is being prepared.
const signedFeed = readFileSync(new URL('../updates/experimental-arm64.xml', import.meta.url), 'utf8');
const expected = /<enclosure\s+url="([^"]+)"/.exec(signedFeed)?.[1];
assert.ok(expected, 'signed channel must identify the public download');
for (const page of ['index.html', 'usage.html']) {
  test(`${page} links directly to the current experimental app download`, () => {
    const html = readFileSync(new URL(`../${page}`, import.meta.url), 'utf8');
    const downloads = [...html.matchAll(/href="([^"]+\.zip)"/g)].map(match => match[1]);
    assert.deepEqual(downloads, page === 'index.html' ? [expected, expected] : [expected]);
    if (page === 'index.html') {
      assert.doesNotMatch(html, /href="#install"/);
      assert.match(html, /data-i18n="hero.installGuide"/);
      assert.match(html, /class="download-platform-icon"/);
      assert.match(html, /aria-describedby="hero-download-support hero-download-status"/);
    } else {
      assert.match(html, /data-i18n="download.languages"/);
      assert.match(html, /data-i18n="guide.language"/);
    }
  });
}

test('packaged README primary download targets the source package version', () => {
  const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
  const downloadSection = /^## Download the macOS app\n([\s\S]*?)(?=^## )/m.exec(readme)?.[1];
  assert.ok(downloadSection, 'README must expose its primary app installation section');
  const downloads = [...downloadSection.matchAll(/\]\((https:\/\/[^)]+\.zip)\)/g)].map(match => match[1]);
  assert.deepEqual(downloads, [
    `https://github.com/longlonglong173/no-short/releases/download/v${version}/NoShortUsage-${version}-arm64.zip`
  ]);
});


// The public download boundary must never silently select the faulty release.
test('the guide resolves release-specific documentation against the recommended artifact', () => {
  const html = readFileSync(new URL('../usage.html', import.meta.url), 'utf8');
  const targets = [...html.matchAll(/href="([^"]+\/blob\/v[^/]+\/[^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(targets, [
    'https://github.com/longlonglong173/no-short/blob/v0.7.2/PRIVACY.md',
    'https://github.com/longlonglong173/no-short/blob/v0.7.2/docs/no-short-usage-menubar.md'
  ]);
});

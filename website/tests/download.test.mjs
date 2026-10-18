import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const expected = 'https://github.com/longlonglong173/no-short/releases/download/v0.4.2/NoShortUsage-0.4.2-arm64.zip';
for (const page of ['index.html', 'usage.html']) {
  test(`${page} links directly to the multi-source app download`, () => {
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

test('repository installation link matches the website download', () => {
  const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
  assert.ok(readme.includes(`](${expected})`));
});

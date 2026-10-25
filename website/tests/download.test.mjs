import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const expected = 'https://github.com/longlonglong173/no-short/releases/download/v0.6.1/NoShortUsage-0.6.1-arm64.zip';
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

test('repository installation link matches the website download', () => {
  const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
  assert.ok(readme.includes(`](${expected})`));
});


test('release labels and versioned guidance match the shipped 0.6.1 artifact', () => {
  const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const guide = readFileSync(new URL('../usage.html', import.meta.url), 'utf8');
  const translations = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(index, /v0\.6\.1 · Experimental/);
  assert.match(index, /Version 0\.6\.1: app version and daily update notices/);
  assert.match(guide, /blob\/v0\.6\.1\/PRIVACY\.md/);
  assert.match(guide, /blob\/v0\.6\.1\/docs\/no-short-usage-menubar\.md/);
  assert.doesNotMatch(index + guide + translations, /0\.4\.3/);
  assert.match(translations, /v0\.6\.1 · Thử nghiệm/);
  assert.match(translations, /v0\.6\.1 · 实验版/);
  assert.match(index, /Experimental app\. macOS may block its first launch/);
  assert.match(guide, /not notarized by Apple/);
  assert.match(guide, /Intel/);
});

test('tagged technical guides describe this release rather than sending users to an older app', () => {
  const native = readFileSync(new URL('../../docs/no-short-usage-menubar.md', import.meta.url), 'utf8');
  const plugin = readFileSync(new URL('../../docs/no-short-usage.md', import.meta.url), 'utf8');
  assert.ok(native.includes('releases/tag/v0.6.1'));
  assert.ok(native.includes('NoShortUsage-0.6.1-arm64.zip'));
  assert.doesNotMatch(native + plugin, /unreleased source|not yet in v0\.4\.3 downloads/);
});

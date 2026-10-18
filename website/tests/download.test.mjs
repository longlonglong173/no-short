import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const expected = 'https://github.com/longlonglong173/no-short/releases/download/v0.4.2/no-short-usage-menubar-0.4.2-darwin-arm64-multilingual-experimental.zip';
for (const page of ['index.html', 'usage.html']) {
  test(`${page} downloads the multilingual app and explains how to change language`, () => {
    const html = readFileSync(new URL(`../${page}`, import.meta.url), 'utf8');
    const downloads = [...html.matchAll(/href="([^"]+\.zip)"/g)].map(match => match[1]);
    assert.deepEqual(downloads, [expected]);
    assert.match(html, /data-i18n="download.languages"/);
    if (page === 'usage.html') assert.match(html, /data-i18n="guide.language"/);
  });
}

test('repository installation link matches the website download', () => {
  const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
  assert.ok(readme.includes(`](${expected})`));
});

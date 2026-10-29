import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const script = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const signedFeed = readFileSync(new URL('../updates/experimental-arm64.xml', import.meta.url), 'utf8');
const recommendedVersion = /<sparkle:version>([^<]+)<\/sparkle:version>/.exec(signedFeed)[1];

// A stale locale must not advertise a different release from the signed channel.
for (const language of ['en', 'vi', 'zh-CN']) {
  test(`${language} renders the release badge for the signed download channel`, () => {
    const initialBadge = /data-i18n="usage.status">([^<]+)</.exec(html)[1];
    const badge = { dataset: { i18n: 'usage.status' }, innerHTML: initialBadge };
    const context = vm.createContext({
      document: {
        documentElement: { dataset: {} },
        querySelectorAll: selector => selector === '[data-i18n]' ? [badge] : [],
        querySelector: selector => selector.startsWith('meta[') ? { content: '' } : null,
        getElementById: () => null
      },
      location: { href: `https://no-short.test/?lang=${language}`, search: `?lang=${language}`, pathname: '/', origin: 'https://no-short.test', hash: '' },
      URL, URLSearchParams,
      localStorage: { getItem: () => null, setItem: () => {} },
      history: { replaceState: () => {} },
      window: { dispatchEvent: () => {}, addEventListener: () => {} },
      CustomEvent: class {}
    });
    vm.runInContext(script, context);
    assert.equal(/\bv(\d+\.\d+\.\d+)\b/.exec(badge.innerHTML)?.[1], recommendedVersion);
  });
}

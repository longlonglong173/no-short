import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const script = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
function page({ query = '', stored } = {}) {
  const previews = ['light', 'dark'].map(theme => ({ dataset: { preview: theme }, src: '' }));
  const location = { href: `https://no-short.test/${query}`, search: query, pathname: '/', origin: 'https://no-short.test' };
  const document = {
    documentElement: { dataset: {} },
    querySelectorAll: selector => selector === '[data-preview]' ? previews : [],
    querySelector: selector => selector.startsWith('meta[') ? { content: '' } : null,
    getElementById: () => null
  };
  const context = vm.createContext({
    document, location, URL, URLSearchParams,
    localStorage: { getItem: () => stored, setItem: () => {} },
    history: { replaceState: () => {} },
    window: { dispatchEvent: () => {}, addEventListener: () => {} },
    CustomEvent: class {}
  });
  vm.runInContext(script, context);
  return { previews, switchTo: language => vm.runInContext(`setLanguage(${JSON.stringify(language)}, true)`, context) };
}

test('initial and live language choices select both matching native screenshots', () => {
  const current = page({ query: '?lang=zh-CN', stored: 'vi' });
  for (const language of ['zh-CN', 'vi', 'en', 'zh-CN']) {
    current.switchTo(language);
    for (const image of current.previews) {
      assert.equal(image.src, `/images/popover-${language}-${image.dataset.preview}.png`);
    }
  }
});
test('stored preference and unsupported language fallback select the corresponding images', () => {
  assert.equal(page({ stored: 'vi' }).previews[0].src, '/images/popover-vi-light.png');
  assert.equal(page({ query: '?lang=bad' }).previews[0].src, '/images/popover-en-light.png');
});
test('all six preview files exist with the dimensions declared in HTML', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const theme of ['light', 'dark']) {
    assert.match(html, new RegExp(`data-preview="${theme}"`));
    for (const language of ['en', 'vi', 'zh-CN']) {
      const png = readFileSync(new URL(`../images/popover-${language}-${theme}.png`, import.meta.url));
      assert.equal(png.toString('ascii', 1, 4), 'PNG');
      assert.equal(png.readUInt32BE(16), 800);
      assert.equal(png.readUInt32BE(20), 1512);
    }
  }
});

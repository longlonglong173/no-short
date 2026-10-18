import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const path = new URL('../theme.js', import.meta.url);
const source = existsSync(path) ? readFileSync(path, 'utf8') : '';

// These doubles expose only browser boundaries. Every test executes the real boot script.
function browser({ stored, systemDark = false, storageBlocked = false } = {}) {
  const root = { dataset: {}, style: {} };
  const meta = { content: '' };
  const handlers = {};
  const values = new Map(stored === undefined ? [] : [['no-short-theme', stored]]);
  const media = { matches: systemDark, addEventListener: (_, fn) => { handlers.media = fn; } };
  const storage = {
    getItem: key => { if (storageBlocked) throw new Error('blocked'); return values.get(key) ?? null; },
    setItem: (key, value) => { if (storageBlocked) throw new Error('blocked'); values.set(key, value); }
  };
  const window = {
    matchMedia: () => media,
    addEventListener: (name, fn) => { handlers[name] = fn; },
    dispatchEvent: () => {}
  };
  const document = {
    documentElement: root,
    querySelector: () => meta,
    addEventListener: (name, fn) => { handlers[name] = fn; }
  };
  vm.runInNewContext(source, { window, document, localStorage: storage, Event: class { constructor(type) { this.type = type; } } });
  return {
    root, meta, values,
    toggle: () => handlers.click?.({ target: { closest: () => ({}) } }),
    changeSystem: dark => { media.matches = dark; handlers.media?.({ matches: dark }); },
    sync: value => { if (value === null) values.delete('no-short-theme'); else values.set('no-short-theme', value); handlers.storage?.({ key: 'no-short-theme' }); }
  };
}

test('first visit follows the system and continues following system changes', () => {
  const page = browser({ systemDark: true });
  assert.equal(page.root.dataset.theme, 'dark');
  assert.equal(page.root.style.colorScheme, 'dark');
  page.changeSystem(false);
  assert.equal(page.root.dataset.theme, 'light');
});

test('a manual choice survives reload and overrides later system changes', () => {
  const page = browser({ systemDark: false });
  page.toggle();
  assert.equal(page.root.dataset.theme, 'dark');
  assert.equal(page.values.get('no-short-theme'), 'dark');
  page.changeSystem(false);
  assert.equal(page.root.dataset.theme, 'dark');
  const reloaded = browser({ stored: page.values.get('no-short-theme'), systemDark: false });
  assert.equal(reloaded.root.dataset.theme, 'dark');
  reloaded.toggle();
  assert.equal(reloaded.values.get('no-short-theme'), 'light');
});

test('unavailable storage does not break rendering or the theme toggle', () => {
  const page = browser({ systemDark: true, storageBlocked: true });
  assert.equal(page.root.dataset.theme, 'dark');
  page.toggle();
  assert.equal(page.root.dataset.theme, 'light');
});

test('invalid saved preferences fall back to the system', () => {
  const page = browser({ stored: 'invalid', systemDark: false });
  assert.equal(page.root.dataset.theme, 'light');
  page.changeSystem(true);
  assert.equal(page.root.dataset.theme, 'dark');
});

test('changes in another tab sync without losing system fallback when cleared', () => {
  const page = browser({ stored: 'light', systemDark: true });
  assert.equal(page.root.dataset.theme, 'light');
  page.sync('dark');
  assert.equal(page.root.dataset.theme, 'dark');
  page.sync(null);
  page.changeSystem(false);
  assert.equal(page.root.dataset.theme, 'light');
});

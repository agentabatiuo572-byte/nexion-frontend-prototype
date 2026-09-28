import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const targets = [
  ['components/home/network-pulse-card.vue', null, 1],
  ['components/home/on-grid-section.vue', null, 2],
  ['components/home/market-board-card.vue', null, 1],
  ['components/store/product-card.vue', 'footerStyle', 1],
  ['components/home/product-trust-card.vue', 'specStyle', 1],
  ['components/home/trust-chip-wall.vue', 'metricStyle', 2],
  ['components/daily/streak-power-ups.vue', 'footerNextStyle', 1],
  ['components/store/genesis-showcase-card.vue', 'lockRowStyle', 1],
  ['pages/globe/globe.vue', 'drawerStatStyle', 3],
  ['pages/developer/developer.vue', 'requestStatusStyle', 2],
];

test('glass content bands inherit the readable parent instead of opaque inner slabs', () => {
  for (const [file, binding, count] of targets) {
    const source = read('src/' + file);
    const bands = [...source.matchAll(/<view\b(?:[^"'>]|"[^"]*"|'[^']*')*>/g)]
      .map(match => match[0]).filter(tag => /class="[^"]*\bnx-glass-inset\b/.test(tag));
    assert.equal(bands.length, count, file + ' explicit content bands');
    for (const tag of bands) assert.doesNotMatch(tag, /background:\s*var\(--v5-surface/, file);
    if (binding) {
      const declaration = source.match(new RegExp('const ' + binding + '[^=]*=\\s*\\{([\\s\\S]*?)\\};'));
      assert.ok(declaration, file + ' style declaration');
      assert.doesNotMatch(declaration[1], /background\s*:/, file + ' inline fill overrides shared band');
      assert.equal(bands.filter(tag => tag.includes(':style="' + binding + '"')).length, count, file);
    }
  }
  const css = read('src/styles/glass-surfaces.css').match(/\.nx-glass-inset\s*\{([^}]+)\}/)?.[1];
  assert.ok(css);
  assert.match(css, /color-mix\(in srgb, var\(--v5-ink\) 2%, transparent\)/);
  assert.doesNotMatch(css, /box-shadow|transform|animation|backdrop-filter|!important/);
});

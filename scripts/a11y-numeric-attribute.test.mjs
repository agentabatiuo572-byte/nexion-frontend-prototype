import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
const source = readFileSync(new URL('./a11y-activate-gate.mjs', import.meta.url), 'utf8');
const start = source.indexOf('function attr(');
const end = source.indexOf('\n/** role ', start);
const attr = new Function('esc', `${source.slice(start, end)}; return attr;`)(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
test('numeric tabindex ignores string literals in the condition', () => {
  assert.equal(attr(` :tabindex="tab === 'activity' ? 0 : -1"`, 'tabindex', { numeric: true }).value, '0');
});
test('complex expressions do not acquire a fabricated numeric tabindex', () => {
  for (const expression of ['fn(0)', '0 + unknown', "ready ? 'button' : unknown", 'ready ? 0 : unknown']) {
    assert.equal(attr(` :tabindex="${expression}"`, 'tabindex', { numeric: true }).kind, 'opaque');
  }
});

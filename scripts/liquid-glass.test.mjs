import { test } from 'node:test';
import assert from 'node:assert/strict';
import { glassGeometry, rememberGlassNavigation, consumeGlassNavigation } from '../src/lib/liquid-glass-core.ts';

test('optical geometry stays finite and rounded inside narrow controls', () => {
  for (const size of [[320, 64], [1, 1], [NaN, Infinity], [5000, 1000]]) {
    const g = glassGeometry(...size, 34, 'navigation');
    assert.ok(Object.values(g).filter(v => typeof v === 'number').every(Number.isFinite));
    assert.ok(g.radius <= Math.min(g.width, g.height) / 2);
    assert.ok(g.bezelWidth <= g.radius);
  }
});
test('navigation animation belongs only to the matching destination and is consumed once', () => {
  rememberGlassNavigation('home', 'earn', 100);
  assert.equal(consumeGlassNavigation('store', 150), undefined);
  assert.equal(consumeGlassNavigation('earn', 160), 'home');
  assert.equal(consumeGlassNavigation('earn', 170), undefined);
});
test('rapid navigation supersedes earlier transitions and stale/cold entries do not animate', () => {
  rememberGlassNavigation('home', 'earn', 100);
  rememberGlassNavigation('earn', 'store', 120);
  assert.equal(consumeGlassNavigation('earn', 130), undefined);
  assert.equal(consumeGlassNavigation('store', 140), 'earn');
  rememberGlassNavigation('store', 'me', 200);
  assert.equal(consumeGlassNavigation('me', 3000), undefined);
  rememberGlassNavigation('me', 'me', 4000);
  assert.equal(consumeGlassNavigation('me', 4001), undefined);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { patchLiquidGlassBundle } from './patch-liquid-glass.mjs';
import { glassGeometry, glassSpring, rememberGlassNavigation, consumeGlassNavigation, glassLogoHidden } from '../src/lib/liquid-glass-core.ts';

test('logo waits for clear top space instead of reappearing on scroll reversal', () => {
  let hidden = false;
  for (const [top, expected] of [[0,false], [16,true], [324,true], [281,true], [80,true], [17,true], [12,true], [8,false], [12,false], [16,true]]) {
    hidden = glassLogoHidden(top, hidden);
    assert.equal(hidden, expected, `scrollTop=${top}`);
  }
  assert.equal(glassLogoHidden(281, true), true);
  assert.equal(glassLogoHidden(12, true), true);
  assert.equal(glassLogoHidden(12, false), false);
  assert.equal(glassLogoHidden(8, true), false);
  assert.equal(glassLogoHidden(-12, true), false);
});

test('cooperative capture patch is installed, repeatable and rejects changed upstream or patch bytes', () => {
  for (const entry of ['webgl.esm.js','webgl.cjs']) {
    const code=readFileSync(new URL(`../node_modules/simple-liquid-glass/dist/${entry}`,import.meta.url),'utf8');
    assert.equal(patchLiquidGlassBundle(code,entry),code,'run npm postinstall before testing');
    assert.throws(()=>patchLiquidGlassBundle(code+'\n// unexpected upstream change',entry),/Unexpected/);
    assert.throws(()=>patchLiquidGlassBundle(code.replace('nxCloneYieldAt=0','nxCloneYieldAt=1'),entry),/Unexpected/);
  }
});

test('liquid spring travels, overshoots and settles at 60/120 Hz; reversal preserves current velocity', () => {
  for (const hz of [60,120]) {
    let position=0,velocity=0,max=0;
    for(let frame=0;frame<hz;frame++) {
      ({position,velocity}=glassSpring(position,velocity,100,1/hz)); max=Math.max(max,position);
    }
    assert.ok(max>102 && max<110,`bounded visible rebound ${max}`);
    assert.ok(Math.abs(position-100)<.01 && Math.abs(velocity)<.01);
    ({position,velocity}=glassSpring(50,300,0,1/hz));
    assert.ok(position>48 && position<55,`retarget does not teleport ${position}`);
    assert.ok(Number.isFinite(glassSpring(position,velocity,0,10).position));
  }
});

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

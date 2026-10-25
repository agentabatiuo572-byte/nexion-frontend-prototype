import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse } from '@vue/compiler-sfc';
import { computed, ref } from 'vue';
import ts from 'typescript';
import { chromium } from 'playwright';
import { escapeSvgText } from '../src/lib/svg-text.ts';

const source = readFileSync(new URL('../src/components/lucky-spin-sheet.vue', import.meta.url), 'utf8');
const { descriptor } = parse(source);
const ast = ts.createSourceFile('wheel.ts', descriptor.scriptSetup.content, ts.ScriptTarget.Latest, true);
const names = new Set(['R', 'CX', 'CY', 'polar', 'slices', 'wheelSvg', 'wheelDecorationSvg', 'wheelStyle']);
const selected = ast.statements.filter(node => ts.isFunctionDeclaration(node) ? names.has(node.name.text)
  : ts.isVariableStatement(node) && node.declarationList.declarations.some(item => names.has(item.name.getText(ast))));
const script = ts.transpileModule(selected.map(node => node.getText(ast)).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

test('native view innerHTML keeps SVG geometry, escaped labels and a fixed hub around a centered rotor', async t => {
  const maliciousLabel = '</text><script>globalThis.wheelXss = true</script><text> & "reward"';
  const prizes = ref(Array.from({ length: 8 }, (_, i) => ({
    id: String(i), rewardName: i === 0 ? maliciousLabel : `Reward ${i}`, isReal: i === 7, tint: '#44ccaa',
  })));
  const spin = { wheelAngle: 90, phase: 'spinning' };
  const deps = { computed, prizes, realActive: ref(false), lsShort: prize => prize.rewardName, escapeSvgText, spin };
  const wheel = new Function(...Object.keys(deps), `${script}\nreturn {wheelSvg:wheelSvg.value,wheelDecorationSvg,wheelStyle:wheelStyle.value};`)(...Object.values(deps));
  assert.match(wheel.wheelStyle.transition, /^transform 3\.6s /);
  // Use the component's actual layer markup and CSS. Native view nodes set
  // innerHTML on an HTML element, which must parse an entire SVG root.
  const template = descriptor.template.content.slice(
    descriptor.template.content.indexOf('      <!-- ───────── 转盘'),
    descriptor.template.content.indexOf('      <!-- ───────── CTA'),
  ).replace(/<view([^>]*?)\/>/g, '<div$1></div>').replace(/<view\b/g, '<div').replace(/<\/view>/g, '</div>');
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent(`<style>:root { --v5-bg:#111; --v5-surface-2:#222; --v5-surface-3:#333; --v5-ink:#fff; --v5-border-strong:#888; --v5-brand:#44ccaa; --font-v5:sans-serif; }${descriptor.styles.map(style => style.content).join('\n')}</style>${template}`);
  const result = await page.evaluate(({ wheel }) => {
    const rotor = document.querySelector('.lss-wheel-svg');
    const fixed = document.querySelector('.lss-wheel-fixed');
    rotor.innerHTML = wheel.wheelSvg;
    fixed.innerHTML = wheel.wheelDecorationSvg;
    const bounds = element => { const box = element.getBoundingClientRect(); return [box.x, box.y, box.width, box.height]; };
    const before = bounds(rotor);
    const hub = fixed.querySelector('circle:last-child');
    const hubBefore = bounds(hub);
    Object.assign(rotor.style, wheel.wheelStyle, { transition: 'none' });
    return {
      roots: [rotor.firstElementChild, fixed.firstElementChild].map(element => element.namespaceURI),
      paths: [...rotor.querySelectorAll('path')].map(path => ({ ns: path.namespaceURI, width: path.getBBox().width })),
      labels: [...rotor.querySelectorAll('text')].map(text => text.textContent),
      scripts: document.querySelectorAll('script').length,
      xss: globalThis.wheelXss === true,
      before, after: bounds(rotor), hubBefore, hubAfter: bounds(hub),
      dim: rotor.querySelector('svg > g:last-child').getAttribute('opacity'),
      origin: getComputedStyle(rotor).transformOrigin,
      fixedTransform: getComputedStyle(fixed).transform,
      pointerInRotor: rotor.contains(document.querySelector('.lss-pointer')),
      rotorBinding: rotor.getAttribute('v-html'), fixedBinding: fixed.getAttribute('v-html'),
    };
  }, { wheel });
  assert.deepEqual(result.roots, Array(2).fill('http://www.w3.org/2000/svg'));
  assert.equal(result.paths.length, 8);
  assert.ok(result.paths.every(path => path.ns === 'http://www.w3.org/2000/svg' && path.width > 0));
  assert.deepEqual(result.labels, prizes.value.map(prize => prize.rewardName));
  assert.equal(result.scripts, 0);
  assert.equal(result.xss, false);
  assert.equal(result.dim, '0.32');
  assert.deepEqual(result.before, result.after);
  assert.deepEqual(result.hubBefore, result.hubAfter);
  assert.equal(result.origin, '124px 124px');
  assert.equal(result.fixedTransform, 'none');
  assert.equal(result.pointerInRotor, false);
  assert.equal(result.rotorBinding, 'wheelSvg');
  assert.equal(result.fixedBinding, 'wheelDecorationSvg');
});

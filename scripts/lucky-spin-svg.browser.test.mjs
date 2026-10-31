import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parse } from '@vue/compiler-sfc';
import { computed, ref } from 'vue';
import ts from 'typescript';
import { chromium } from 'playwright';
import { escapeSvgText } from '../src/lib/svg-text.ts';
import { platformDisplayText } from '../src/lib/brand-copy.ts';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

// Bundle the real deadline formatter: it reaches @/ aliased modules Node cannot resolve.
const root = fileURLToPath(new URL('../', import.meta.url));
const dates = await build({ stdin: { contents: "export { displayDeadline } from './src/lib/promotion-display.ts';", resolveDir: root },
  bundle: true, write: false, platform: 'node', format: 'esm', alias: { '@': root + 'src' } });
const { displayDeadline } = await import('data:text/javascript;base64,' + Buffer.from(dates.outputFiles[0].text).toString('base64'));

const source = readFileSync(new URL('../src/components/lucky-spin-sheet.vue', import.meta.url), 'utf8');
const { descriptor } = parse(source);
const ast = ts.createSourceFile('wheel.ts', descriptor.scriptSetup.content, ts.ScriptTarget.Latest, true);
const names = new Set(['R', 'CX', 'CY', 'polar', 'ls', 'wheelUnits', 'wheelLabel', 'historyPrizeLabel', 'historyAwardTime', 'slices', 'wheelSvg', 'wheelDecorationSvg', 'wheelStyle']);
const selected = ast.statements.filter(node => ts.isFunctionDeclaration(node) ? names.has(node.name.text)
  : ts.isVariableStatement(node) && node.declarationList.declarations.some(item => names.has(item.name.getText(ast))));
const script = ts.transpileModule(selected.map(node => node.getText(ast)).join('\n'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

for (const [code, points, coupon] of [['zh', '积分', '券'], ['en', 'pts', 'coupon'], ['vi', 'điểm', 'phiếu']]) {
test(`native wheel ${code}: exact localized amounts fit their slices and the rotor stays centered`, async t => {
  const maliciousLabel = '</text><script>globalThis.wheelXss = true</script><text> & "reward"';
  const prizes = ref([['uvt', 5], ['points', 50], ['uvt', 30], ['uvt', 150.123456], ['usdt', 1], ['coupon', 50], ['usdt', 20], ['usdt', 500]].map(([kind, amount], i) => ({
    kind, amount,
    id: String(i), rewardName: i === 0 ? maliciousLabel : `Reward ${i}`, isReal: i === 7, tint: '#44ccaa',
  })));
  const spin = { wheelAngle: 90, phase: 'spinning' };
  const deps = { computed, prizes, realActive: ref(false), locale: { code }, escapeSvgText, spin,
    t: { value: { luckySpin: { prizes: {} } } }, platformDisplayText, displayDeadline };
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
    const layout = [...rotor.querySelectorAll('g')].flatMap(group => {
      const path = group.querySelector('path');
      return [...group.querySelectorAll('text')].map(text => {
        const box = text.getBBox();
        const corners = [[box.x, box.y], [box.x + box.width, box.y], [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]];
        return { text: text.textContent, box: [box.x, box.y, box.width, box.height],
          inSlice: corners.every(([x, y]) => path.isPointInFill(new DOMPoint(x, y))),
          outsideHub: corners.every(([x, y]) => Math.hypot(x - 100, y - 100) > 22),
          fontSize: Number.parseFloat(getComputedStyle(text).fontSize) };
      });
    });
    const overlaps = layout.flatMap((a, i) => layout.slice(i + 1).filter(b =>
      a.box[0] < b.box[0] + b.box[2] && a.box[0] + a.box[2] > b.box[0] &&
      a.box[1] < b.box[1] + b.box[3] && a.box[1] + a.box[3] > b.box[1]
    ).map(b => [a.text, b.text]));
    Object.assign(rotor.style, wheel.wheelStyle, { transition: 'none' });
    return {
      layout, overlaps,
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
  assert.deepEqual(result.labels, ['5', 'UVT', '50', points, '30', 'UVT', '150.123456', 'UVT', '$1', 'USDT', '$50', coupon, '$20', 'USDT', '$500', 'USDT']);
  assert.ok(result.layout.every(label => label.inSlice && label.outsideHub), JSON.stringify(result.layout));
  assert.ok(result.layout.every(label => label.fontSize >= 8 && label.fontSize <= 9));
  assert.deepEqual(result.overlaps, []);
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
}

test('history uses the matching prize name or its own receipt amount, never a changed tier amount', () => {
  const prizes = ref([{ id: 'uvt-30', kind: 'uvt', amount: 30, labelKey: 'remote:uvt-30', rewardName: '+30 UVT' }]);
  const deps = { computed, prizes, realActive: ref(true), locale: { code: 'zh' }, escapeSvgText, spin: {},
    t: { value: { luckySpin: { prizes: {} } } }, platformDisplayText, displayDeadline };
  const label = new Function(...Object.keys(deps), `${script}\nreturn historyPrizeLabel;`)(...Object.values(deps));
  const receipt = { tierId: 'uvt-30', rewardType: 'UVT', rewardAmount: 30, rewardName: 'uvt-30' };
  assert.equal(label(receipt), '+30 UVT');
  prizes.value[0].amount = 300;
  prizes.value[0].rewardName = '+300 UVT';
  assert.equal(label(receipt), '30 UVT');
  assert.equal(label({ ...receipt, rewardType: 'POINTS', rewardAmount: 50 }), '50 积分');
  assert.equal(label({ ...receipt, rewardType: 'COUPON', rewardAmount: 50.123456 }), '$50.123456 券');
  prizes.value = [];
  assert.equal(label(receipt), '30 UVT');
});

test('history converts explicit offsets to UTC in three languages and leaves old unzoned dates blank', () => {
  const locale = { code: 'zh' };
  const deps = { computed, prizes: ref([]), realActive: ref(true), locale, escapeSvgText, spin: {},
    t: { value: { luckySpin: { prizes: {} } } }, platformDisplayText, displayDeadline };
  const time = new Function(...Object.keys(deps), `${script}\nreturn historyAwardTime;`)(...Object.values(deps));
  for (const [code, day] of [['zh', '2026/12/31'], ['en', 'Dec 31, 2026'], ['vi', '31/12/2026']]) {
    locale.code = code;
    assert.equal(time('2027-01-01T00:05:00+08:00'), `${day} 16:05 · UTC`);
    assert.equal(time('2026-10-25 13:43:00'), '');
  }
  locale.code = 'zh';
  assert.equal(time('2026-10-25T13:43:00+08:00'), '2026/10/25 05:43 · UTC');
  assert.match(source, /time: historyAwardTime\(h\.awardedAt\)/);
});

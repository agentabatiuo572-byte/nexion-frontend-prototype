import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { parse, compileScript, compileStyle } from '@vue/compiler-sfc';
import * as Vue from 'vue';
import { renderToString } from '@vue/server-renderer';
import ts from 'typescript';
import { chromium } from 'playwright';
import { nativeSvgIcons } from './native-svg-icons.mjs';
const require = createRequire(import.meta.url);
const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const chat = parse(read('src/pages/support/chat.vue')).descriptor;
const glass = parse(read('src/components/liquid-glass.vue')).descriptor;
const native = parse(read('src/components/native-svg.vue')).descriptor;
const emittedCss = platform => process.env[platform === 'app' ? 'NX_ICON_COMPILED_CSS_APP' : 'NX_ICON_COMPILED_CSS_H5'];
const emitted = platform => emittedCss(platform) ? readFileSync(emittedCss(platform), 'utf8') : null;
const scopeId = (platform, className, fallback) => 'data-v-' + (emitted(platform)?.match(new RegExp('\\.' + className + '\\[data-v-([a-z0-9]+)\\]'))?.[1] ?? fallback);
const compilerOptions = { isCustomElement: tag => ['view', 'text'].includes(tag) };
const script = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function tsModule(file) {
  const exports = {};
  new Function('require', 'exports', script(read(file)))(id => id === 'vue' ? Vue : require(id), exports);
  return exports;
}
const markup = tsModule('src/lib/native-svg-markup.ts');
function component(descriptor, id) {
  // Frosted paint is defined by the real setup/template/CSS. renderjs has no role in this fixture.
  const input = { ...descriptor, script: null };
  const exports = {};
  const code = compileScript(input, { id, inlineTemplate: true, templateOptions: { compilerOptions } }).content;
  new Function('require', 'exports', 'glassView', script(code))(id => id === 'vue' ? Vue : markup, exports, { update() {} });
  if (descriptor.styles.length) exports.default.__scopeId = id;
  return exports.default;
}
function find(node, className) {
  if (node.type === 1 && node.props.some(p => p.type === 6 && p.name === 'class' && p.value?.content.split(/\s+/).includes(className))) return node;
  for (const child of node.children ?? []) { const match = find(child, className); if (match) return match; }
}
const back = find(chat.template.ast, 'cp-back').loc.source;
// The ticket control left the chat header with user tickets (a3e4605e); the back control remains.
const icon = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink)" stroke-width="2"><path d="m15 18-6-6 6-6" /></svg>';
const source = `<template><view class="fixture">
${back}
<view class="probe-control after-glass"><LiquidGlass rendering="frosted"/>${icon}</view>
<view class="probe-control after-text"><LiquidGlass rendering="frosted"/><text aria-hidden="true">·</text>${icon}</view>
<view class="probe-control before-glass">${icon}<LiquidGlass rendering="frosted"/></view>
<view class="probe-control no-glass">${icon}</view>
</view></template><script setup lang="ts">
const t={conversations:{back:'Back',restartSession:'Restart'}};const isAi=true,remoteApiEnabled=true;
function goBack(){} function onStartNewConversation(){} function onKeyboardActivate(_e:unknown,fn:()=>void){fn();}
</script><style scoped>/* Actual chat scoped rules are compiled below. */</style>`;
async function fragment(platform) {
  const previous = process.env.UNI_PLATFORM;
  process.env.UNI_PLATFORM = platform;
  const transformed = nativeSvgIcons().transform(source, 'native-glass-icon-fixture.vue')?.code ?? source;
  if (previous === undefined) delete process.env.UNI_PLATFORM; else process.env.UNI_PLATFORM = previous;
  const app = Vue.createSSRApp(component(parse(transformed).descriptor, scopeId(platform, 'cp-back', 'chat-icon')));
  app.config.globalProperties.glassView = { update() {} };
  app.component('LiquidGlass', component(glass, scopeId(platform, 'nx-liquid-glass', 'glass-icon')));
  app.component('NxNativeSvg', component(native, 'data-v-native-icon'));
  return renderToString(app);
}
const chatCss = chat.styles.map(s => compileStyle({ source: s.content, id: 'data-v-chat-icon', scoped: s.scoped }).code).join('\n');
// Uni APP scopes component styles even when the source block lacks `scoped`.
// A compiled-CSS receipt can additionally exercise the exact real build output.
const css = platform => read('src/styles/tokens.css') + '\n' + (emitted(platform) ?? (glass.styles.map(s => compileStyle({ source: s.content, id: 'data-v-glass-icon', scoped: true }).code).join('\n') + '\n' + chatCss)) + '\nview{display:block}text{display:inline}body{margin:0;background:var(--v5-bg);color:var(--v5-ink)}.fixture{display:flex;align-items:center;gap:16px;padding:16px;flex-wrap:wrap}.probe-control{position:relative;display:grid;place-items:center;width:44px;height:44px}.after-text>text{display:none}';
for (const platform of ['app', 'h5']) for (const theme of ['dark', 'light']) {
  test(`${platform}/${theme}: glass keeps converted chat and sibling icons in front without promoting unrelated icons`, async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 300 } });
      await page.route('**/*', route => route.abort());
      await page.setContent(`<html data-theme="${theme}"><style>${css(platform)}</style><body>${await fragment(platform)}</body></html>`);
      const facts = await page.evaluate(platform => Object.fromEntries(['cp-back', 'after-glass', 'after-text', 'before-glass', 'no-glass'].map(key => {
        const parent = document.querySelector('.' + key), parentRect = parent.getBoundingClientRect(), icon = parent.querySelector(platform === 'app' ? '.nx-native-svg' : 'svg'), style = getComputedStyle(icon), r = icon.getBoundingClientRect();
        return [key, { hitWidth: parentRect.width, hitHeight: parentRect.height, role: parent.getAttribute('role'), tabIndex: parent.getAttribute('tabindex'), label: parent.getAttribute('aria-label'), position: style.position, zIndex: style.zIndex, width: r.width, height: r.height, path: icon.querySelector('path')?.getAttribute('d') ?? icon.getAttribute('d'), scopeAttributes: icon.getAttributeNames().filter(name => name.startsWith('data-v-')), directSvg: parent.querySelector(':scope > svg') !== null }];
      })), platform);
      const pixels = {};
      for (const key of ['cp-back']) {
        const png = await page.locator('.' + key + (platform === 'app' ? ' > .nx-native-svg' : ' > svg')).screenshot();
        pixels[key] = await page.evaluate(async ({ data, theme }) => {
          const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode();
          const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
          const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
          const dataPixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          let foreground = 0; for (let i = 0; i < dataPixels.length; i += 4) {
            const luminance = (dataPixels[i] + dataPixels[i + 1] + dataPixels[i + 2]) / 3;
            if (theme === 'dark' ? luminance > 150 : luminance < 100) foreground++;
          } return foreground;
        }, { data: png.toString('base64'), theme });
      }
      if (process.env.NX_ICON_PROBE_OUTPUT) {
        const prefix = process.env.NX_ICON_PROBE_OUTPUT + '/' + platform + '-' + theme;
        writeFileSync(prefix + '.json', JSON.stringify({ platform, theme, facts, pixels }, null, 2));
        await page.screenshot({ path: prefix + '.png' });
      }
      for (const key of ['cp-back']) {
        assert.equal(facts[key].position, 'relative', key); assert.equal(facts[key].zIndex, '1', key);
        assert.equal(facts[key].hitWidth, 44); assert.equal(facts[key].hitHeight, 44); assert.equal(facts[key].role, 'button'); assert.equal(facts[key].tabIndex, '0'); assert.ok(facts[key].label);
        assert.equal(facts[key].width, 22); assert.equal(facts[key].height, 22); assert.ok(pixels[key] > 10, `${key}: visible foreground pixels=${pixels[key]}`);
      }
      if (platform === 'app') {
        assert.ok(!facts['cp-back'].scopeAttributes.includes(scopeId(platform, 'nx-liquid-glass', 'glass-icon')), 'sibling native root must not inherit LiquidGlass component scope');
        assert.equal(facts['cp-back'].directSvg, false); assert.equal(facts['cp-back'].path, 'm15 18-6-6 6-6');
        for (const key of ['after-glass', 'after-text']) { assert.equal(facts[key].position, 'relative', key); assert.equal(facts[key].zIndex, '1', key); }
        for (const key of ['before-glass', 'no-glass']) { assert.equal(facts[key].position, 'static', key); assert.equal(facts[key].zIndex, 'auto', key); }
      }
    } finally { await browser.close(); }
  });
}

// Check the final selector as well as pixels: a sibling cannot carry the glass
// component's scope attribute, including when Uni adds it to a plain style block.
test('Uni-scoped glass styles leave the later native-icon sibling selector global', () => {
  for (const platform of ['app', 'h5']) {
    const output = css(platform);
    assert.match(output, /\.nx-liquid-glass\s*~\s*\.nx-native-svg\s*\{[^}]*position:\s*relative/);
    assert.doesNotMatch(output, /\.nx-liquid-glass[^{}]*~[^{}]*\.nx-native-svg\[data-v-/);
    if (emitted(platform)) {
      assert.match(output, /\.nx-liquid-glass\[data-v-[a-z0-9]+\]/);
      assert.match(output, /\.cp-back\[data-v-[a-z0-9]+\]/);
    }
  }
});

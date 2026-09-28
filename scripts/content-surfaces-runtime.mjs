import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ensureServer } from './lib/dev-server-pool.mjs';

const root = resolve(import.meta.dirname, '..');
const out = resolve(root, '.codex-runtime/content-surfaces');
await mkdir(out, { recursive: true });
const server = await ensureServer({ root, reuseUrl: process.env.LIQUID_GLASS_BASE_URL, log: console.log });
const cases = [], errors = [];
let passed = false;
try {
  for (const [engine, driver] of Object.entries({ chromium, webkit })) {
    const browser = await driver.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      page.on('pageerror', error => errors.push(engine + ': ' + error.message));
      for (const prefix of ['tcs', 'vcs']) await page.addLocatorHandler(page.locator(`.${prefix}-root:visible`), async () => {
        await page.locator(`.${prefix}-dismiss:visible,.${prefix}-close:visible`).first().click();
      });
      for (const [route, minimum] of [['index/index', 6], ['store/store', 5], ['team/team', 7], ['me/me', 6]]) {
        await page.goto(`${server.baseUrl}/?nx_device_inner=1#/pages/${route}`, { waitUntil: 'domcontentloaded' });
        await page.locator('.nx-chassis:visible .nx-glass-card').first().waitFor();
        await page.locator('body').click({ trial: true });
        for (const locale of ['zh', 'en', 'vi']) for (const theme of ['dark', 'light']) for (const width of [320, 390]) {
          await page.setViewportSize({ width, height: 844 });
          await page.evaluate(async ({ locale, theme }) => {
            (await import('/src/store/locale.ts')).useLocaleStore().setLocale(locale);
            (await import('/src/store/theme.ts')).useTheme().setMode(theme);
          }, { locale, theme });
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const state = await page.locator('.nx-chassis:visible').evaluate(root => {
            const cards = [...root.querySelectorAll('.nx-glass-card:not(.nx-glass-hero),.nx-home-glass-panel')].filter(el => el.getClientRects().length);
            return {
              cards: cards.map(el => {
                const s = getComputedStyle(el);
                const bounds = el.getBoundingClientRect();
                // Ambient artwork intentionally bleeds beyond clipped cards; check readable content instead.
                const overflow = [...el.querySelectorAll('uni-text,[role="button"],[role="link"]')].some(child => {
                  const r = child.getBoundingClientRect();
                  return r.width && (r.right > bounds.right + 1 || r.left < bounds.left - 1);
                });
                return { text: el.textContent.trim().slice(0, 48), shadow: s.boxShadow, image: s.backgroundImage, filter: s.backdropFilter, overflow };
              }),
              inset: [...root.querySelectorAll('.nx-glass-inset')].map(el => getComputedStyle(el).backgroundColor),
              novaOptics: root.querySelectorAll('.nx-nova-btn .nx-liquid-glass').length,
              navOptics: root.querySelectorAll('.nx-tabbar-pill .nx-liquid-glass').length,
              hero: [...root.querySelectorAll('.nx-glass-hero')].map(el => getComputedStyle(el).boxShadow),
            };
          });
          const id = `${engine}-${route.replace('/', '-')}-${locale}-${theme}-${width}`;
          assert.ok(state.cards.length >= minimum, id + ' missing required content');
          assert.ok(state.cards.every(card => card.shadow === 'none' && card.image === 'none' && (!card.filter || card.filter === 'none') && !card.overflow), id + ': ' + JSON.stringify(state));
          assert.ok(state.inset.every(fill => fill === 'rgba(0, 0, 0, 0)'), id + ' framed inset');
          assert.equal(state.novaOptics, 0);
          assert.ok(state.navOptics > 0, id + ' navigation lost glass');
          if (route === 'me/me') assert.ok(state.hero.length === 1 && state.hero[0] !== 'none', id + ' wallet display lost glass');
          if (route === 'team/team') {
            const actions = await page.locator('.invite-card__action').evaluateAll(els => els.map(el => {
              const s = getComputedStyle(el), r = el.getBoundingClientRect();
              return { fill: s.backgroundColor, shadow: s.boxShadow, border: s.borderTopWidth, width: r.width, height: r.height };
            }));
            assert.equal(actions.length, 3);
            assert.ok(actions.every(s => s.fill === 'rgba(0, 0, 0, 0)' && s.shadow === 'none' && s.border === '0px' && s.width >= 44 && s.height >= 44), id + ' nested invitation tile');
            assert.equal(await page.locator('.team-ledger__split > uni-view').count(), 2);
            assert.equal(await page.locator('.team-ledger__settlement > uni-view').count(), 2);
            const overflow = await page.locator('.team-ledger').evaluate(el => [...el.querySelectorAll('*')].filter(child => {
              const r = child.getBoundingClientRect(), parent = el.getBoundingClientRect();
              return r.width && (r.right > parent.right + 1 || r.left < parent.left - 1);
            }).map(el => el.className));
            assert.deepEqual(overflow, [], id + ' ledger overflow');
          }
          cases.push({ id, ...state });
          if (locale === 'zh' && theme === 'dark' && width === 390) {
            await page.locator('body').click({ trial: true });
            await page.screenshot({ path: resolve(out, id + '.png') });
            if (route === 'team/team') for (const component of ['invite-card', 'team-ledger']) {
              await page.locator('.' + component).screenshot({ path: resolve(out, `${engine}-${component}.png`) });
            }
          }
        }
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.locator('.nx-chassis:visible .nx-glass-card').first().waitFor();
        assert.equal(await page.locator('.nx-glass-card:not(.nx-glass-hero)').first().evaluate(el => getComputedStyle(el).boxShadow), 'none', 'reload restored embossed content');
      }
      // Boundary fixtures exercise zero and large amounts without changing business stores.
      await page.goto(`${server.baseUrl}/?nx_device_inner=1#/pages/team/team`, { waitUntil: 'domcontentloaded' });
      await page.locator('.team-ledger').waitFor();
      for (const value of [0, 999999999.99]) {
        await page.evaluate(value => {
          let vm = document.querySelector('.team-ledger').__vueParentComponent;
          while (vm && !String(vm.type.__file).endsWith('team-ledger-card.vue')) vm = vm.parent;
          Object.assign(vm.props, { monthUSDT: value, monthNEX: value, directUSDT: value, extendedUSDT: value, unlockedUSDT: value, coolingUSDT: value });
        }, value);
        await page.setViewportSize({ width: 320, height: 844 });
        const ledger = page.locator('.team-ledger');
        await ledger.locator('.team-ledger__amount').filter({ hasText: '$' + value.toFixed(2) }).waitFor();
        const widths = await ledger.locator('.team-ledger__bar > uni-view').evaluateAll(els => els.map(el => el.style.width));
        assert.deepEqual(widths, value === 0 ? ['0%', '0%'] : ['50%', '50%']);
        assert.equal(await ledger.evaluate(el => el.scrollWidth > el.clientWidth + 1), false);
        cases.push({ id: engine + '-ledger-boundary-' + value, widths });
      }
    } finally { await browser.close(); }
  }
  assert.deepEqual(errors, []);
  passed = true;
} finally {
  server.stop();
  await writeFile(resolve(out, 'result.json'), JSON.stringify({ at: new Date().toISOString(), verdict: passed ? 'pass' : 'fail', cases, errors }, null, 2));
  console.log(`Content hierarchy: ${cases.length} cases; ${passed ? 'PASS' : 'FAIL'}; ${out}`);
}

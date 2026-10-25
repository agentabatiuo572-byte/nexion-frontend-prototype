// Isolated frontend rendering/interaction evidence; not TEST backend acceptance.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { chromium } from 'playwright';
import { installFormalProbeSession } from './lib/formal-probe-session.mjs';
import { directAppUrl } from './lib/direct-app-url.mjs';

const BASE = process.env.DESIGN_BASE || process.env.BASE_URL || 'http://127.0.0.1:5186';
const OUTPUT = process.env.DESIGN_OUTPUT || path.join(os.tmpdir(), 'uvel-design-review');
import { fixture } from './lib/design-review-fixture.mjs';

await mkdir(OUTPUT, { recursive: true });
const browser = await chromium.launch();
const records = [], errors = [];
const variants = process.env.DESIGN_QUICK ? [[390, 'zh', 'dark']] : [320, 390].flatMap(width => ['zh', 'en', 'vi'].flatMap(locale => ['dark', 'light'].map(theme => [width, locale, theme])));
try {
  for (const [width, locale, theme] of variants) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 1, colorScheme: theme, reducedMotion: width === 320 ? 'reduce' : 'no-preference', hasTouch: true });
    const page = await context.newPage(), state = { offers: true, messages: false, read: false };
    page.on('pageerror', e => errors.push({ width, locale, theme, error: e.message }));
    await installFormalProbeSession(page, { responseFor: (url,request) => fixture(url, locale, state,request) });
    await page.addInitScript(({ locale, theme }) => {
      localStorage.setItem('nexgrid-locale-v1', JSON.stringify({ type: 'object', data: { code: locale, userSet: true } }));
      localStorage.setItem('nexgrid-theme-v1', JSON.stringify({ type: 'object', data: { mode: theme } }));
    }, { locale, theme });
    await page.goto(directAppUrl(BASE, '/pages/index/index'), { waitUntil: 'networkidle' });
    await page.locator('.home-benefits .vb-card').waitFor();
    await page.locator('.nx-device-row').first().waitFor();
    assert.equal(await page.locator('.vb-card').count(), 1, 'Home has exactly one voucher entry');
    assert.ok(await page.locator('[data-home-section]:visible').count() <= 6);
    assert.equal(await page.locator('[role=dialog]').count(), 0, 'Home does not auto-open marketing');
    assert.ok((await page.locator('.daily-check-in-row .nx-button').innerText()).trim());
    const homeMetrics = await page.locator('.home-overview').evaluate(el => ({ height: el.getBoundingClientRect().height, width: el.getBoundingClientRect().width }));
    await page.locator('.home-benefits').scrollIntoViewIfNeeded();
    const prefix = `${width}-${locale}-${theme}`;
    const captureFull = async (name,height) => {
      await page.setViewportSize({width,height});
      await page.locator('.nx-content').evaluate(el=>{el.scrollTop=0});
      await page.evaluate(()=>document.fonts.ready);
      await page.screenshot({animations:'disabled',path:path.join(OUTPUT,`${prefix}-${name}-full.png`)});
      await page.setViewportSize({width,height:844});
    };
    await captureFull('home',1660);
    await page.screenshot({ animations: 'disabled', path: path.join(OUTPUT, `${prefix}-home.png`) });
    const voucherLayout = await page.locator('.home-benefits__grid').evaluate(el => { const a=el.children[0].getBoundingClientRect(), b=el.children[1].getBoundingClientRect(); return {height:a.height,secondHeight:b.height,gap:b.left-a.right,aligned:Math.abs(a.top-b.top)<1}; });
    assert.ok(voucherLayout.aligned && Math.abs(voucherLayout.gap-12)<1, 'Benefits use the reference two-column layout');
    assert.ok(Math.abs(voucherLayout.height-voucherLayout.secondHeight)<2 && Math.abs(voucherLayout.height-184)<2, 'Benefits have equal reference heights');
    await page.locator('.vb-card').screenshot({ animations:'disabled', path:path.join(OUTPUT,`${prefix}-voucher-card.png`) });
    await page.locator('.home-benefits .vb-card').click();
    await page.waitForSelector('[role="dialog"]');
    await page.screenshot({ animations: 'disabled', path: path.join(OUTPUT, `${prefix}-voucher.png`) });
    // Reload verifies that opening an offer does not silently claim it.
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('.home-benefits .nx-trial-hero').waitFor();
    const trialLayout = await page.locator('.home-benefits .nx-trial-hero').evaluate(el => { const card=el.getBoundingClientRect(), cta=el.querySelector('.trial-cta').getBoundingClientRect(); return {height:card.height,ctaInside:cta.left>=card.left&&cta.right<=card.right&&cta.bottom<=card.bottom}; });
    assert.ok(trialLayout.ctaInside && Math.abs(trialLayout.height-184)<2);
    await page.locator('.home-benefits .nx-trial-hero').screenshot({ animations:'disabled', path:path.join(OUTPUT,`${prefix}-trial-card.png`) });
    await page.locator('.home-benefits .nx-trial-hero').click();
    await page.waitForSelector('[role="dialog"]');
    await page.screenshot({ animations: 'disabled', path: path.join(OUTPUT, `${prefix}-trial.png`) });
    await page.goto(directAppUrl(BASE, '/pages/store/store'), { waitUntil: 'networkidle' });
    const card = page.locator('.product-card').first();
    await card.waitFor();
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ animations: 'disabled', path: path.join(OUTPUT, `${prefix}-store.png`) });
    await captureFull('store',1620);
    const bounds = await card.evaluate(el => {
      const card = el.getBoundingClientRect(), media = el.querySelector('.product-media').getBoundingClientRect();
      return { cardWidth: card.width, mediaWidth: media.width, borderWidth:parseFloat(getComputedStyle(el).borderLeftWidth)+parseFloat(getComputedStyle(el).borderRightWidth), roundedInner: getComputedStyle(el.querySelector('.product-media')).borderRadius, animation: getComputedStyle(el.querySelector('.product-art')).animationName, nested: el.querySelectorAll('.nx-glass-card,.nx-glass-inset').length };
    });
    assert.ok(Math.abs(bounds.cardWidth - bounds.mediaWidth - bounds.borderWidth) < 1, 'Product image region fills the card width');
    assert.equal(bounds.roundedInner, '0px');
    assert.equal(bounds.nested, 0);
    if (width === 320) assert.equal(bounds.animation, 'none');
    await card.locator('.product-media').click();
    await page.waitForURL(/pages\/store\/detail/);
    await page.goto(directAppUrl(BASE, '/pages/team/rank'), { waitUntil: 'networkidle' });
    const ranks = page.locator('.rank-row-heading');
    await ranks.first().waitFor();
    assert.equal(await ranks.count(), 9, 'Published V0–V8 ladder has no invented higher ranks');
    assert.equal(await page.locator('.rank-row-heading[aria-expanded="true"]').count(), 1);
    await page.locator('#rank-details-3').waitFor();
    await page.screenshot({ animations: 'disabled', path: path.join(OUTPUT, `${prefix}-rank.png`) });
    await captureFull('rank',2200);
    await ranks.nth(8).click();
    await page.locator('#rank-details-8').waitFor();
    assert.equal(await page.locator('#rank-details-3').count(), 0);
    await ranks.nth(8).click();
    assert.equal(await page.locator('#rank-details-8').count(), 0);
    await ranks.nth(8).focus();
    await page.keyboard.press('Enter');
    await page.locator('#rank-details-8').waitFor();
    await page.goto(directAppUrl(BASE, '/pages/learn/courses'), { waitUntil: 'networkidle' });
    await page.locator('.course-feature .nx-button').waitFor();
    await page.screenshot({ animations: 'disabled', path: path.join(OUTPUT, `${prefix}-courses.png`) });
    await captureFull('courses',1180);
    await page.locator('.course-feature .nx-button').click();
    await page.waitForURL(/review-course-2/);
    for (const id of [2, 1, 3]) {
      const complete = page.locator('.nx-button--primary');
      await complete.waitFor();
      await complete.click();
      await page.locator('[data-testid=learning-result-details]').waitFor();
      if (id === 2) await page.screenshot({animations:'disabled',path:path.join(OUTPUT,`${prefix}-learning-next.png`)});
      if (id !== 3) {
        const next = page.locator('[data-testid=learning-next-course]');
        await next.waitFor();
        await next.click();
        await page.waitForURL(new RegExp(`review-course-${id === 2 ? 1 : 3}`));
      }
    }
    assert.deepEqual(state.completed, [2, 1, 3]);
    await page.screenshot({ animations: 'disabled', path: path.join(OUTPUT, `${prefix}-learning-complete.png`) });
    await page.goto(directAppUrl(BASE, '/pages/learn/courses'), { waitUntil: 'networkidle' });
    await page.locator('.course-completed').waitFor();
    assert.equal(await page.locator('.course-feature').count(), 0);
    for (const [route, anchor] of [['earn/earn','.nx-content'], ['team/team','.team-rank'], ['me/me','.nx-content'], ['missions/missions','.missions-content']]) {
      await page.goto(directAppUrl(BASE, '/pages/' + route), { waitUntil: 'networkidle' });
      await page.locator(anchor).first().waitFor();
      await page.screenshot({ animations: 'disabled', path: path.join(OUTPUT, `${prefix}-${route.split('/')[0]}.png`) });
    }
    const panels = page.locator('.missions-content [role=tab]');
    assert.equal(await panels.count(), 4);
    for (let index=1;index<4;index++) { await panels.nth(index).click(); assert.equal(await panels.nth(index).getAttribute('aria-selected'), 'true'); assert.equal(await page.locator('.nx-chassis:visible').count(),1,'Embedded tasks must not create a second chassis'); }
    await page.goto(directAppUrl(BASE, '/pages/store/checkout?product=stellarbox-s1'), { waitUntil: 'networkidle' });
    await page.locator('.checkout-sticky .nx-button').waitFor();
    assert.equal(await page.locator('.checkout-product').count(),1);
    assert.equal(await page.locator('[role=dialog]').count(),0,'Checkout does not auto-open trade-in');
    await page.screenshot({ animations: 'disabled', path: path.join(OUTPUT, `${prefix}-checkout.png`) });
    await captureFull('checkout',1320);
    await page.getByTestId('checkout-quantity-increase').click();
    await page.waitForURL(/items=/);
    await page.locator('.checkout-item-quantity-value').filter({hasText:'2'}).waitFor();
    await page.locator('.promotion-summary.total').filter({hasText:'2,598.00'}).waitFor();
    await page.getByTestId('checkout-item-increase').click();
    await page.locator('.checkout-item-quantity-value').filter({hasText:'3'}).waitFor();
    await page.locator('.promotion-summary.total').filter({hasText:'3,897.00'}).waitFor();
    await page.getByTestId('checkout-item-decrease').press('Enter');
    await page.locator('.checkout-item-quantity-value').filter({hasText:'2'}).waitFor();
    await page.locator('.promotion-summary.total').filter({hasText:'2,598.00'}).waitFor();
    await page.screenshot({animations:'disabled',path:path.join(OUTPUT,`${prefix}-checkout-quantity.png`)});
    state.messages = true;
    await page.goto(directAppUrl(BASE, '/pages/me/notifications?section=notifications'), { waitUntil: 'networkidle' });
    await page.locator('.notification-row').first().waitFor();
    assert.equal(await page.locator('.notification-date').count(), 2);
    await page.screenshot({ animations: 'disabled', path: path.join(OUTPUT, `${prefix}-messages.png`) });
    await captureFull('messages',920);
    await page.locator('.notification-row').first().click();
    await page.locator('.notification-detail').waitFor();
    assert.equal(await page.locator('.notification-item').first().locator('.notification-preview').count(), 0, 'Expanded text appears once');
    await page.locator('.notification-row').nth(1).click();
    await page.waitForURL(/pages\/me\/wallet/);
    await page.goto(directAppUrl(BASE, '/pages/trust/trust'), { waitUntil: 'networkidle' });
    await page.locator('.trust-intro').waitFor();
    assert.ok(await page.locator('.trust-surface [role="link"]').count() >= 4);
    await page.screenshot({ animations: 'disabled', path: path.join(OUTPUT, `${prefix}-trust.png`) });
    state.offers = false;
    await page.goto(directAppUrl(BASE, '/pages/index/index'), { waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('.home-benefits').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.home-benefits').count(), 0, 'Consumed benefits leave no empty section');
    records.push({ width, locale, theme, bounds, homeMetrics, voucherLayout, trialLayout });
    console.log(`PASS ${prefix}`);
    await context.close();
  }
} finally {
  await writeFile(path.join(OUTPUT, 'report.json'), JSON.stringify({ frontendFixtureOnly: true, records, errors }, null, 2));
  await browser.close();
}
assert.equal(errors.length, 0, JSON.stringify(errors));
console.log(`PASS ${records.length} variants; screenshots: ${OUTPUT}`);

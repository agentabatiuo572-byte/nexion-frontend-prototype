// Run: node docs/specs/prototypes/check-vietnam-bank-withdrawal.mjs
// Checks the standalone design only; no API, persistent ledger, or real payout.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const artifact = new URL('./vietnam-bank-withdrawal.html', import.meta.url);
const output = new URL('../../../artifacts/bank-design/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [], requests = [], coverage = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
const click = action => page.locator(`[data-action="${action}"]`).click();
const ready = () => page.waitForFunction(() => document.querySelector('#screen').getAttribute('aria-busy') === 'false');
const submitForm = async id => { await page.locator(`#${id} button[type="submit"]`).click(); await ready(); };
const quote = async value => {
  await page.selectOption('#scenario', 'available'); await click('amount');
  await page.fill('#amount', value); await submitForm('amount-form');
  assert.equal(await page.locator('#consent').count(), 1);
};
const layout = async label => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  assert.equal(overflow, false, `horizontal overflow: ${label}`);
  assert.doesNotMatch(await page.locator('#screen').innerText(), /undefined|NaN/);
  assert.doesNotMatch(await page.locator('#screen').innerText(), /充值能力|待服务商|服务端配置|此场景|算术示例|本稿|nhà cung cấp|máy chủ|minh họa|Tình huống này/);
  coverage.push(label);
};
try {
  for (const lang of ['zh', 'vi']) {
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(artifact.href); await page.selectOption('#language', lang);
      const prefix = `${lang}/${width}`;
      await layout(`${prefix}/wallet`); await click('withdraw'); await layout(`${prefix}/method`);
      await click('crypto'); await layout(`${prefix}/crypto`); await click('method'); await click('bank');
      for (const scenario of ['unbound', 'credit', 'unknown', 'cooldown', 'maintenance', 'rejected', 'pending']) {
        await page.selectOption('#scenario', scenario); await layout(`${prefix}/${scenario}`);
        if (scenario === 'credit') assert.equal(await page.locator('#screen .notice').innerText(), lang === 'zh' ? '此银行卡不支持提现。' : 'Thẻ này không hỗ trợ rút tiền.');
        assert.equal(await page.locator('[data-action="amount"]:enabled').count(), 0);
        if (await page.locator('[data-action="check"]').count()) { await click('check'); await ready(); }
        assert.equal(await page.locator('[data-action="amount"]:enabled').count(), 0);
      }
      await page.selectOption('#scenario', 'unbound'); await click('bind');
      await page.fill('#account', '12'); await page.fill('#holder', 'A'); await submitForm('bind-form');
      assert.equal(await page.locator('#account').getAttribute('aria-invalid'), 'true');
      await page.fill('#account', '001234567890'); await page.fill('#holder', 'NGUYỄN VĂN A');
      await page.selectOption('#language', lang === 'zh' ? 'vi' : 'zh');
      assert.equal(await page.inputValue('#account'), '001234567890');
      assert.equal(await page.inputValue('#holder'), 'NGUYỄN VĂN A');
      await page.selectOption('#language', lang); await layout(`${prefix}/bind`);
      await page.locator('#bind-form button[type="submit"]').click();
      assert.equal(await page.locator('#screen').getAttribute('aria-busy'), 'true');
      await page.selectOption('#language', lang === 'zh' ? 'vi' : 'zh');
      assert.equal(await page.locator('html').getAttribute('lang'), lang === 'zh' ? 'vi' : 'zh-CN');
      await ready();
      await page.selectOption('#language', lang);
      assert.equal(await page.inputValue('#scenario'), 'pending');
      assert.equal(await page.locator('[data-action="amount"]:enabled').count(), 0);
      await page.selectOption('#scenario', 'available'); await click('amount');
      for (const value of ['19.999999', '100.000001', '20.0000001', '1e2', '-20', 'NaN', '20,5.1', '20,5,1']) {
        await page.fill('#amount', value); await submitForm('amount-form');
        assert.equal(await page.locator('#amount').getAttribute('aria-invalid'), 'true', value);
      }
      await quote('20.000001');
      assert.match(await page.locator('.money').innerText(), lang === 'zh' ? /490,000/ : /490\.000/);
      if (lang === 'vi') { await quote('20,5'); assert.match(await page.locator('.money').innerText(), /502\.250/); }
      await quote('100'); await layout(`${prefix}/confirm`);
      assert.match(await page.locator('.money').innerText(), lang === 'zh' ? /2,450,000/ : /2\.450\.000/);
      await click('submit'); assert.notEqual(await page.locator('#error').innerText(), '');
      await page.check('#consent'); await page.click('#expire');
      assert.equal(await page.isDisabled('#submit'), true); await layout(`${prefix}/expired`);
      await click('requote'); await submitForm('amount-form');
      assert.equal(await page.isChecked('#consent'), false);
      await page.check('#consent'); await click('submit'); await ready();
      for (const outcome of ['review', 'processing', 'uncertain', 'paid', 'refunded']) {
        await page.selectOption('#outcome', outcome); await layout(`${prefix}/${outcome}`);
        await click('query'); await ready(); assert.match(await page.locator('#screen').innerText(), /DESIGN-WD-001/);
        await click('wallet'); assert.equal(await page.locator('[data-action="withdraw"]').count(), 0);
        assert.match(await page.locator('.balance').innerText(), outcome === 'refunded' ? /100/ : /^0/);
        await click('view'); assert.match(await page.locator('#screen').innerText(), /DESIGN-WD-001/);
      }
      if (width === 390 || (width === 1280 && lang === 'zh')) {
        await page.selectOption('#outcome', 'uncertain');
        await page.screenshot({ path: fileURLToPath(new URL(`${lang}-${width}.png`, output)), fullPage: true });
      }
      await page.reload(); assert.equal(await page.locator('[data-action="withdraw"]').count(), 1);
    }
  }
  assert.deepEqual(errors, [], 'browser errors'); assert.deepEqual(requests, [], 'unexpected network request');
  const result = { status: 'PASS', htmlSha256: createHash('sha256').update(await readFile(artifact)).digest('hex'), checkedAt: new Date().toISOString(), scope: 'Standalone in-memory design, not APP/provider acceptance', coverage, errors, requests };
  await writeFile(new URL('result.json', output), JSON.stringify(result, null, 2));
  console.log(`BANK_DESIGN_CHECK_OK ${coverage.length} rendered states; zh/vi; 320/390/1280; no network or browser errors`);
} finally { await browser.close(); }

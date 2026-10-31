// Built-App presentation acceptance with loopback synthetic commerce and explicit external transport overlays.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { chromium } from 'playwright';
import { purchasePaymentUiFixture } from './lib/purchase-payment-ui-fixture.mjs';

const output = process.env.PURCHASE_PAYMENT_UI_OUTPUT || 'D:/workspace/artifacts/pay1718-20261031/app-ui';
const port = Number(process.env.PURCHASE_PAYMENT_UI_PORT || 5611), origin = `http://127.0.0.1:${port}`;
await mkdir(output, { recursive: true });
const seed = path.join(output, 'seed.json');
await writeFile(seed, JSON.stringify({ state: { trialState: 'ended', benefitState: 'finished', offers: false, promotions: false } }));
const entry = (await readFile('dist/build/h5/index.html', 'utf8')).match(/assets\/index-[^" ]+\.js/)[0];
const artifact = { entry, sha256: createHash('sha256').update(await readFile('dist/build/h5/' + entry)).digest('hex') };
const record = { source: 'built App + loopback synthetic commerce + explicit external API overlays; no real backend, PSP, chain transfer or SMS',
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), artifact, verdict: 'running', steps: [], fixtures: [] };
await writeFile(path.join(output, 'record.json'), JSON.stringify(record, null, 2));
const server = spawn(process.execPath, ['scripts/prototype-preview-server.mjs'], { cwd: process.cwd(),
  env: { ...process.env, DEMO_PORT: String(port), DEMO_CHECKOUT_FLOW: '1', DEMO_STATE_FILE: seed }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
const ready = new Promise((resolve, reject) => {
  server.stdout.on('data', chunk => { serverLog += chunk; if (serverLog.includes('UVEL simulation: http://127.0.0.1:' + port)) resolve(); });
  server.stderr.on('data', chunk => { serverLog += chunk; });
  server.once('error', reject); server.once('exit', code => reject(new Error(`Synthetic server exited ${code}: ${serverLog}`)));
});
const browser = await chromium.launch({ headless: true });
let activePage;
const contexts = [], errors = [];
const state = async () => (await fetch(origin + '/__checkout/state')).json();
const sheet = page => page.locator('.nx-sheet:has(.purchase-payment)');
async function screenshot(page, name) { await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true }); }
async function openSelection(page) {
  await page.getByRole('button', { name: '立即支付', exact: true }).click();
  await sheet(page).waitFor({ state: 'visible', timeout: 15000 });
  assert.equal(await sheet(page).locator('.purchase-payment__method').count(), 3);
  return sheet(page);
}
async function fresh(width, fixtureOptions) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  contexts.push(context);
  const fixture = purchasePaymentUiFixture(origin, fixtureOptions); await fixture.install(context);
  record.fixtures.push(fixture.evidence);
  const page = await context.newPage(); activePage = page;
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/?nx_device_inner=1#/pages/store/checkout?product=stellarbox-s1');
  await page.getByRole('button', { name: '立即支付', exact: true }).waitFor({ state: 'visible', timeout: 15000 });
  return { page, context, fixture };
}
async function bounded(page) {
  const overflow = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
  assert.ok(overflow.content <= overflow.width + 1, 'the rendered payment surface must fit the viewport');
}
try {
  await ready;
  // Wallet selection alone enters the existing PIN flow; closing it preserves the same order.
  const wallet = await fresh(390, { balance: 5000, pinMode: 'available' });
  let dialog = await openSelection(wallet.page);
  const original = (await state()).orders.at(-1).orderNo, orderCount = (await state()).orders.length;
  assert.equal(wallet.fixture.evidence.pinRequests.length, 0);
  await dialog.getByRole('button', { name: '确认支付', exact: true }).click();
  const mask = wallet.page.locator('.payment-pin-mask'); await mask.waitFor({ state: 'visible' });
  assert.ok(wallet.fixture.evidence.pinRequests.length > 0); assert.equal(wallet.fixture.evidence.creates.length, 0);
  await mask.getByRole('button', { name: '关闭', exact: true }).click();
  dialog = await openSelection(wallet.page); assert.equal((await state()).orders.length, orderCount);
  assert.equal((await state()).orders.at(-1).orderNo, original); await bounded(wallet.page);
  await screenshot(wallet.page, '01-wallet-three-methods-390');
  await dialog.getByRole('button', { name: '返回订单', exact: true }).click();
  record.steps.push({ id: 'wallet-only-pin-and-original-order', status: 'pass', viewport: 390, orderNo: original, evidence: '01-wallet-three-methods-390.png' });
  await wallet.context.close();

  // PIN infrastructure is unavailable and the wallet is empty; BSC still quotes and creates once.
  const bsc = await fresh(390, { balance: 0, pinMode: 'unavailable', dropCreate: true });
  dialog = await openSelection(bsc.page);
  await dialog.locator('.purchase-payment__method').filter({ hasText: 'USDT（BSC / BEP20）' }).click();
  await dialog.locator('.purchase-payment__fees').waitFor({ state: 'visible' });
  const quote = bsc.fixture.evidence.quotes.at(-1).quote;
  assert.equal(quote.businessAmountUsdt, '1299.000000'); assert.equal(quote.subtotalUsdt, '1299.00');
  assert.equal(quote.channelFeeUsdt, '16.74'); assert.equal(quote.networkConfirmFeeUsdt, '0.25'); assert.equal(quote.totalUsdt, '1315.99');
  assert.match(await dialog.innerText(), /1,315\.99/); assert.match(await dialog.innerText(), /BNB Gas.*不包含/);
  await dialog.getByText('外部钱包另外收取 BNB Gas，不包含在以上支付总额中。', { exact: true }).scrollIntoViewIfNeeded();
  await bounded(bsc.page); await screenshot(bsc.page, '02-bsc-fees-empty-wallet-pin503-390');
  await dialog.getByRole('button', { name: '确认支付', exact: true }).click();
  await dialog.getByRole('button', { name: '查询支付结果', exact: true }).waitFor({ state: 'visible' });
  assert.equal(bsc.fixture.evidence.creates.length, 1); assert.equal(bsc.fixture.evidence.pinRequests.length, 0);
  assert.match(await dialog.innerText(), /正在确认支付结果/);
  await screenshot(bsc.page, '03-bsc-create-outcome-unknown');
  await dialog.getByRole('button', { name: '查询支付结果', exact: true }).click();
  await dialog.locator('.purchase-payment__address').waitFor({ state: 'visible' });
  const intent = [...bsc.fixture.intents.values()][0];
  assert.equal(await dialog.locator('.purchase-payment__address').innerText(), intent.address);
  await dialog.locator('.purchase-payment__qr').scrollIntoViewIfNeeded();
  assert.match(await dialog.locator('.purchase-payment__qr').innerHTML(), /data:image/);
  await bounded(bsc.page); await screenshot(bsc.page, '04-bsc-dedicated-address-qr-390');
  const key = bsc.fixture.evidence.creates[0].key;
  await dialog.getByRole('button', { name: '返回订单', exact: true }).click();
  await bsc.page.locator('.purchase-payment-resume').getByRole('button', { name: '查看付款进度', exact: true }).click();
  dialog = sheet(bsc.page); await dialog.locator('.purchase-payment__address').waitFor({ state: 'visible' });
  assert.equal(bsc.fixture.evidence.creates.length, 1); assert.equal(bsc.fixture.evidence.creates[0].key, key);
  bsc.fixture.deliver(intent.intentNo);
  await dialog.getByRole('button', { name: '查询支付结果', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await bsc.page.waitForURL(url => url.hash.includes('/pages/store/order-detail') && url.hash.includes(intent.receipt.orderNo));
  await bsc.page.getByText('已在 新加坡 激活 · 收益以实际到账为准', { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
  assert.equal(bsc.fixture.evidence.walletPayments.length, 0); assert.equal(bsc.fixture.evidence.pinRequests.length, 0);
  assert.ok(bsc.fixture.evidence.paidOrderReadbacks.some(row => row.orderNo === intent.receipt.orderNo && row.canonicalStatus === 'activated'));
  assert.equal(bsc.fixture.evidence.creates.length, 1);
  await screenshot(bsc.page, '05-bsc-original-order-delivered');
  bsc.fixture.manualExtra(intent.intentNo);
  await bsc.page.goto(origin + '/?nx_device_inner=1#/pages/store/order-detail?id=' + encodeURIComponent(intent.receipt.orderNo));
  await bsc.page.locator('.purchase-payment-resume').getByRole('button', { name: '查看付款进度', exact: true }).waitFor({ state: 'visible' });
  await bsc.page.locator('.purchase-payment-resume').getByRole('button', { name: '查看付款进度', exact: true }).click();
  dialog = sheet(bsc.page); await dialog.getByRole('button', { name: '联系客服', exact: true }).waitFor({ state: 'visible' });
  assert.match(await dialog.innerText(), /付款与设备交付已确认/); assert.match(await dialog.innerText(), /人工核对/);
  assert.equal(await dialog.locator('.purchase-payment__method').count(), 0); assert.equal(bsc.fixture.evidence.creates.length, 1);
  await screenshot(bsc.page, '06-delivered-extra-arrival-manual-review');
  record.steps.push({ id: 'bsc-pin503-empty-wallet-fees-unknown-durable-query-delivery-extra-arrival', status: 'pass', viewport: 390,
    intentNo: intent.intentNo, commandKey: key, createWrites: bsc.fixture.evidence.creates.length, pinRequests: 0, walletPayments: 0,
    screenshots: ['02-bsc-fees-empty-wallet-pin503-390.png', '03-bsc-create-outcome-unknown.png', '04-bsc-dedicated-address-qr-390.png', '05-bsc-original-order-delivered.png', '06-delivered-extra-arrival-manual-review.png'] });
  await bsc.context.close();

  // A PIN lock does not block HDPAY or its original hosted identity on a narrow screen.
  const bank = await fresh(320, { balance: 0, pinMode: 'locked' });
  dialog = await openSelection(bank.page);
  await dialog.locator('.purchase-payment__method').filter({ hasText: '银行卡' }).click();
  await dialog.getByText('锁定汇率', { exact: true }).waitFor({ state: 'visible' });
  const bankQuote = bank.fixture.evidence.quotes.at(-1).quote;
  assert.equal(bankQuote.networkConfirmFeeUsdt, '0.00'); assert.equal(bankQuote.totalUsdt, '1315.74'); assert.equal(bankQuote.amountVnd, '32893500');
  assert.match(await dialog.innerText(), /32,893,500 VND/); assert.equal(bank.fixture.evidence.pinRequests.length, 0);
  await dialog.getByText('锁定汇率', { exact: true }).scrollIntoViewIfNeeded(); await bounded(bank.page);
  await screenshot(bank.page, '07-hdpay-vnd-pinlocked-empty-wallet-320');
  await dialog.getByRole('button', { name: '确认支付', exact: true }).click();
  await dialog.getByRole('button', { name: '继续前往 HDPAY 付款', exact: true }).waitFor({ state: 'visible' });
  const bankIntent = [...bank.fixture.intents.values()][0], bankOrder = bank.fixture.evidence.quotes[0].body.payload.orderNo;
  await dialog.getByRole('button', { name: '继续前往 HDPAY 付款', exact: true }).click();
  await bank.page.getByRole('heading', { name: 'HDPAY isolated hosted fixture', exact: true }).waitFor({ state: 'visible' });
  assert.equal(bank.fixture.evidence.hosted.length, 1);
  await bank.page.goto(origin + '/?nx_device_inner=1#/pages/store/order-detail?id=' + encodeURIComponent(bankOrder));
  await bank.page.locator('.purchase-payment-resume').getByRole('button', { name: '查看付款进度', exact: true }).click();
  dialog = sheet(bank.page); await dialog.getByRole('button', { name: '继续前往 HDPAY 付款', exact: true }).waitFor({ state: 'visible' });
  assert.equal(bank.fixture.evidence.creates.length, 1); assert.equal(bank.fixture.evidence.pinRequests.length, 0);
  await dialog.getByText('锁定汇率', { exact: true }).waitFor({ state: 'visible' });
  assert.match(await dialog.innerText(), /1 USDT = 25000\.000000 VND/);
  assert.match(await dialog.innerText(), /1299\.000000 USDT/);
  assert.match(await dialog.innerText(), /0\.000000 USDT/);
  assert.match(await dialog.innerText(), /32,893,500 VND/);
  assert.equal(bank.fixture.evidence.quotes.length, 1, 'recovery must not reprice the original snapshot');
  await dialog.getByText('原业务金额', { exact: true }).scrollIntoViewIfNeeded();
  await screenshot(bank.page, '11-hdpay-restored-raw6-320');
  await dialog.getByText('锁定汇率', { exact: true }).scrollIntoViewIfNeeded(); await bounded(bank.page);
  await screenshot(bank.page, '12-hdpay-restored-fx-vnd-320');
  assert.equal(bank.fixture.evidence.walletPayments.length, 0); assert.equal([...bank.fixture.intents.values()][0].intentNo, bankIntent.intentNo);
  const paymentPhasePinRequests = bank.fixture.evidence.pinRequests.length;
  // A real SPA page change must close the global payment overlay, retaining only its account-scoped recovery pointer.
  await bank.page.evaluate(() => { location.hash = '#/pages/me/me'; });
  await bank.page.locator('[data-me-action="sign-out"]').waitFor({ state: 'visible', timeout: 15000 });
  await sheet(bank.page).waitFor({ state: 'hidden', timeout: 15000 });
  await bank.page.locator('.purchase-payment-resume').getByRole('button', { name: '查看付款进度', exact: true }).click();
  await sheet(bank.page).waitFor({ state: 'visible' });
  // Session revocation can occur while another overlay owns focus; invoke the real sign-out control's click handler.
  await bank.page.locator('[data-me-action="sign-out"]').evaluate(node => node.click());
  await bank.page.locator('.nx-mask--confirm').getByRole('button', { name: '退出登录', exact: true }).click();
  await bank.page.waitForURL(url => url.hash.includes('/pages/login/login'), { timeout: 15000 });
  assert.equal(await bank.page.locator('.purchase-payment').count(), 0); assert.equal(await bank.page.locator('.purchase-payment-resume').count(), 0);
  record.steps.push({ id: 'hdpay-pinlock-empty-wallet-integer-vnd-hosted-original-and-page-account-boundaries', status: 'pass', viewport: 320,
    intentNo: bankIntent.intentNo, createWrites: 1, paymentPhasePinRequests, accountSettingsPinReads: bank.fixture.evidence.pinRequests.length - paymentPhasePinRequests,
    walletPayments: 0, recoveredSnapshotEvidence: ['11-hdpay-restored-raw6-320.png', '12-hdpay-restored-fx-vnd-320.png'], quoteReads: 1, hostedNetwork: 'fulfilled locally by Playwright before any PSP access', evidence: '07-hdpay-vnd-pinlocked-empty-wallet-320.png' });
  assert.deepEqual(errors, []);
  assert.equal(createHash('sha256').update(await readFile('dist/build/h5/' + entry)).digest('hex'), artifact.sha256, 'built artifact changed during acceptance');
  record.verdict = 'pass'; record.pageErrors = errors; record.realFinancialEffects = false;
  await writeFile(path.join(output, 'record.json'), JSON.stringify(record, null, 2));
  console.log('PASS built App three-way purchase UI, synthetic transports only; no real funds, PSP or SMS.');
} catch (error) {
  record.verdict = 'fail'; record.error = String(error); record.pageErrors = errors;
  await writeFile(path.join(output, 'record.json'), JSON.stringify(record, null, 2));
  await writeFile(path.join(output, 'failure.json'), JSON.stringify({ error: String(error), serverLog, body: activePage ? await activePage.locator('body').innerText() : '' }, null, 2));
  if (activePage) await screenshot(activePage, 'failure');
  throw error;
} finally {
  for (const context of contexts) await context.close();
  await browser.close(); server.kill();
}

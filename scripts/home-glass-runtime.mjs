import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureServer } from './lib/dev-server-pool.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, '.codex-runtime/home-glass');
const attempt = resolve(output, `run-${new Date().toISOString().replace(/[:.]/g, '-')}`);
await mkdir(attempt, { recursive: true });
const acceptanceIds = ['home-phone', 'home-banner', 'home-fleet', 'home-design', 'home-motion'];
const expectedCases = 64;
const cases = [], errors = [], evidence = [];
const started = Date.now();
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
async function snapshot() {
  const paths = [...new Set([...git(['ls-files', '-z']).split('\0'), ...git(['ls-files', '--others', '--exclude-standard', '-z']).split('\0')])].filter(Boolean).sort();
  const hash = createHash('sha256');
  for (const path of paths) { hash.update(path); hash.update(await readFile(resolve(root, path))); }
  return { head: git(['rev-parse', 'HEAD']), tree: git(['rev-parse', 'HEAD^{tree}']), hash: hash.digest('hex') };
}
const before = await snapshot();
let server, fatal;
const active = page => page.locator('.nx-chassis:visible').last();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function capture(page, name, selector) {
  const path = resolve(attempt, `${name}.png`);
  if (selector) await selector.screenshot({ path, timeout: 8000 });
  else await page.screenshot({ path, timeout: 8000 });
  evidence.push(path);
  return path;
}
async function check(page, id, covers, fn) {
  assert.ok(Date.now() - started < 275000, 'Home checks exceeded their bounded runtime; no cases silently skipped');
  const result = { id, covers, status: 'pass' };
  try { result.data = await fn(); }
  catch (error) {
    result.status = 'fail'; result.error = error.stack || String(error);
    try { result.screenshot = await capture(page, `failed-${id}`); } catch (shot) { result.screenshotError = String(shot); }
  }
  cases.push(result);
  await writeFile(resolve(attempt, `${id}.json`), JSON.stringify(result, null, 2));
  console.log(`${result.status.toUpperCase()} ${id}${result.error ? ': ' + result.error.split('\n')[0] : ''}`);
  return result;
}
async function idle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const finite = document.getAnimations().filter(a => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime));
    await Promise.all(finite.map(a => a.finished.catch(() => {})));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}
async function dismiss(page) {
  for (let n = 0; n < 4; n++) {
    const close = page.locator('.vcs-close:visible,.tcs-close:visible,.tcs-dismiss:visible').first();
    if (!await close.count()) break;
    await close.click(); await pause(80);
  }
  await page.waitForFunction(() => ![...document.querySelectorAll('.nx-toast')].some(e => e.getClientRects().length), undefined, { timeout: 8000 });
}
async function goto(page, route = 'index/index') {
  await page.goto(`${server.baseUrl}/?nx_device_inner=1#/pages/${route}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await active(page).waitFor(); await idle(page);
  if (route === 'index/index') {
    await page.waitForFunction(async () => (await import('/src/store/voucher.ts')).useVoucher().catalogReady);
    const pendingAutoPush = await page.evaluate(async () => {
      const v = (await import('/src/store/voucher.ts')).useVoucher(), s = (await import('/src/store/voucher-claim-sheet.ts')).useVoucherClaimSheet();
      return !s.lastClosedAt && v.claimableVouchers.some(v => v.popupEnabled);
    });
    if (pendingAutoPush) await page.locator('.vcs-close:visible').waitFor({ timeout: 8000 });
  }
  await dismiss(page);
}
async function settings(page, width, locale, theme) {
  await page.setViewportSize({ width, height: 844 });
  await page.evaluate(async ({ locale, theme }) => {
    (await import('/src/store/locale.ts')).useLocaleStore().setLocale(locale);
    (await import('/src/store/theme.ts')).useTheme().setMode(theme);
  }, { locale, theme });
  await idle(page);
}
async function fixture(page, count = 5, allFamilies = false) {
  return page.evaluate(async ({ count, allFamilies }) => {
    const app = (await import('/src/store/app.ts')).useApp();
    const cfg = (await import('/src/store/config.ts')).useConfig();
    const { createDevice, derivePromoUpgrade } = await import('/src/store/device-types.ts');
    const { deviceName } = await import('/src/lib/device-copy.ts');
    const t = (await import('/src/i18n/use-t.ts')).useT().value;
    window.__homeOriginal ??= JSON.parse(JSON.stringify({ devices: app.devices, paused: app.miningPaused, compute: cfg.config.featureFlags.computeShareEnabled }));
    const kinds = allFamilies ? ['stellarbox-pro', 'stellarbox-pro-v2', 'stellarrack-p1', 'stellarrack-p2', 'cloud-share', 'pc-gpu'] : ['phone', 'stellarbox-s1', 'stellarbox-pro-v2', 'stellarrack-p2', 'cloud-share', 'pc-gpu'];
    const income = [.012, 1.234, 1000.1, 0, 7.499, 12.345];
    cfg.config.featureFlags.computeShareEnabled = true; app.miningPaused = true;
    app.devices = kinds.slice(0, count).map((kind, i) => ({ ...createDevice(kind, `home-glass-${kind}-${i}`), activatedAt: Date.now() - 86400000, status: kind === 'phone' ? 'offline' : 'online', onlineHeartbeatAt: null, currentTask: null, todayEarnings: income[i], lastSettledAt: null }));
    // An owned but inactive item must not become an earning card.
    app.devices.push({ ...createDevice('stellarbox-s1', 'home-glass-inactive'), activatedAt: null });
    return { devices: app.visibleDevices.filter(d => d.activatedAt !== null).map(d => ({ id: d.id, kind: d.kind, name: deviceName(t, d), income: '+$' + d.todayEarnings.toFixed(d.todayEarnings < 1 ? 3 : 2), online: d.kind !== 'phone' })), targetKind: derivePromoUpgrade(app.visibleDevices).targetKind };
  }, { count, allFamilies });
}
async function restoreFixture(page) {
  await page.evaluate(async () => {
    if (!window.__homeOriginal) return;
    const app = (await import('/src/store/app.ts')).useApp(), cfg = (await import('/src/store/config.ts')).useConfig();
    const saved = window.__homeOriginal;
    app.devices = saved.devices; app.miningPaused = saved.paused; cfg.config.featureFlags.computeShareEnabled = saved.compute;
    delete window.__homeOriginal;
  });
}
async function atlas(page) {
  return page.locator('.nx-home-art').first().evaluate(async el => {
    const background = getComputedStyle(el).backgroundImage;
    if (!background.includes('/static/img/home-glass-20260928/atlas.png')) throw Error('Generated atlas is not the rendered artwork source');
    const img = new Image(); img.src = background.slice(5, -2); await img.decode();
    if (img.naturalWidth / img.naturalHeight !== 1.5) throw Error('Expected the generated 3 by 2 atlas');
    const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let transparent = 0, visible = 0, maxAlpha = 0, samples = 0;
    for (let i = 3; i < data.length; i += 64) { samples++; if (data[i] === 0) transparent++; if (data[i] > 0) visible++; maxAlpha = Math.max(maxAlpha, data[i]); }
    if (!transparent || !visible) throw Error('Atlas must contain actual transparent and visible pixels');
    return { width: img.naturalWidth, height: img.naturalHeight, transparent, visible, maxAlpha, samples, source: img.src };
  });
}
async function geometry(page) {
  return active(page).evaluate(root => {
    const box = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
    const problems = [];
    const contained = (child, parent, label) => { const a = box(child), b = box(parent); if (a.x < b.x - 1 || a.right > b.right + 1 || a.y < b.y - 1 || a.bottom > b.bottom + 1) problems.push(`${label}: outside container`); };
    const textFits = el => {
      if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) problems.push(`clipped text: ${el.textContent}`);
      const range = document.createRange(); range.selectNodeContents(el); const b = box(el);
      for (const r of range.getClientRects()) if (r.left < b.x - 1 || r.right > b.right + 1) problems.push(`text ink outside: ${el.textContent}`);
    };
    const notice = root.querySelector('.phone-policy-notice'), action = notice.querySelector('.phone-policy-action');
    const nr = box(notice), ar = box(action), ac = getComputedStyle(action);
    if (getComputedStyle(notice).textAlign !== 'center' || Math.abs((ar.x + ar.width / 2) - (nr.x + nr.width / 2)) > 1) problems.push('Phone notice/pill not centered');
    if (ar.height < 44 || parseFloat(ac.borderTopLeftRadius) < ar.height / 2) problems.push('Phone action not a >=44px pill');
    textFits(notice.querySelector('.phone-policy-copy')); contained(action, notice, 'phone pill');
    const grid = root.querySelector('.hf-grid'), columns = getComputedStyle(grid).gridTemplateColumns.split(' ');
    if (columns.length !== 2) problems.push(`Fleet not two columns: ${columns}`);
    if (grid.scrollWidth > grid.clientWidth + 1) problems.push(`Fleet grid horizontally overflows: ${grid.scrollWidth} > ${grid.clientWidth}`);
    const cards = [...grid.children].map(el => ({ el, rect: box(el) }));
    for (const { el, rect } of cards) {
      if (rect.width < 125 || rect.height < 160) problems.push('Fleet illustration card is still a small slot');
      contained(el, grid, 'fleet card');
      for (const label of el.querySelectorAll('.hf-device-name,.hf-device-income,.hf-device-status,.hf-add-title')) { textFits(label); contained(label, el, 'card label'); }
      for (const art of el.querySelectorAll('.nx-device-slot .nx-home-art,.hf-computer svg')) contained(art, el, 'device artwork');
      const name = el.querySelector('.hf-device-name'), income = el.querySelector('.hf-device-income'), status = el.querySelector('.hf-device-status');
      if (name && (box(name).bottom > box(income).y + 1 || box(status).bottom > box(name).y + 1)) problems.push('Device name, income or status overlap');
      if (el.querySelectorAll('[role="button"],[tabindex="0"]').length) problems.push('Nested interactive device action');
    }
    for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) { const a = cards[i].rect, b = cards[j].rect; if (Math.min(a.right, b.right) - Math.max(a.x, b.x) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 1) problems.push('Fleet cards overlap'); }
    for (const label of root.querySelectorAll('.vb-title,.vb-sub,.vb-cta,.hf-title,.hf-count')) textFits(label);
    const banner = root.querySelector('.vb-card');
    if (banner) { for (const label of banner.querySelectorAll('.vb-title,.vb-sub,.vb-cta')) contained(label, banner, 'voucher label'); }
    const content = root.querySelector('.nx-content');
    if (content.scrollWidth > content.clientWidth + 1 || document.documentElement.scrollWidth > innerWidth + 1) problems.push('Horizontal page overflow');
    return { problems, notice: nr, action: ar, columns, cards: cards.map(c => c.rect), fontStatus: document.fonts.status };
  });
}
async function inventory(page, expected) {
  await idle(page);
  const rows = active(page).locator('.nx-device-row');
  assert.equal(await rows.count(), expected.devices.length);
  assert.equal(await active(page).locator('.hf-add-device').count(), expected.devices.length < 6 ? 1 : 0);
  for (const d of expected.devices) {
    const row = active(page).locator(`.nx-device-row[data-device-id="${d.id}"]`);
    assert.equal(await row.getAttribute('data-online'), String(d.online));
    assert.equal(await row.locator('.nx-device-slot').getAttribute('data-online'), String(d.online));
    assert.equal((await row.locator('.hf-device-name').innerText()).trim(), d.name);
    assert.equal((await row.locator('.hf-device-income').innerText()).trim(), d.income);
    assert.equal(await row.getAttribute('role'), 'button'); assert.equal(await row.getAttribute('tabindex'), '0');
  }
  const data = await geometry(page); assert.deepEqual(data.problems, []); return data;
}
async function heartbeatBoundary(page) {
  const expected = await fixture(page, 1);
  const id = expected.devices[0].id;
  const initial = await page.evaluate(async id => {
    const app = (await import('/src/store/app.ts')).useApp();
    const { isDeviceOnline } = await import('/src/lib/hashpower.ts');
    app.devices = app.devices.map(d => d.id === id ? { ...d, status: 'online', onlineHeartbeatAt: Date.now() - 179000 } : d);
    // Flush the already queued Vue render job without yielding to a timer or waiting for page animations.
    await Promise.resolve();
    const d = app.devices.find(d => d.id === id), row = document.querySelector(`.nx-device-row[data-device-id="${id}"]`);
    return { at: Date.now(), heartbeat: d.onlineHeartbeatAt, status: d.status, miningPaused: app.miningPaused, canonical: isDeviceOnline(d, Date.now()), displayed: row?.getAttribute('data-online') };
  }, id);
  const read = () => page.evaluate(async id => {
    const app = (await import('/src/store/app.ts')).useApp(), { isDeviceOnline } = await import('/src/lib/hashpower.ts');
    const d = app.devices.find(d => d.id === id), row = document.querySelector(`.nx-device-row[data-device-id="${id}"]`);
    return { at: Date.now(), heartbeat: d.onlineHeartbeatAt, status: d.status, miningPaused: app.miningPaused, canonical: isDeviceOnline(d, Date.now()), displayed: row?.getAttribute('data-online') };
  }, id);
  await pause(1800); const expired = await read();
  await writeFile(resolve(attempt, `heartbeat-${page.context().browser().browserType().name()}.json`), JSON.stringify({ initial, expired }, null, 2));
  assert.equal(initial.canonical, true, 'Heartbeat fixture was already offline before the transition');
  assert.equal(initial.displayed, 'true', 'Phone card never displayed its initially fresh heartbeat');
  assert.equal(expired.canonical, false, 'Heartbeat expiry fixture did not reach offline');
  assert.equal(expired.displayed, 'false', 'Phone card retained online after the heartbeat expired');
  return { initial, expired, boundary: 'Normal app enforcement remains enabled; this does not isolate a stopped scheduler.' };
}
async function motion(page, engine) {
  await settings(page, 390, 'en', 'dark'); await dismiss(page);
  const notice = active(page).locator('.phone-policy-notice');
  await notice.scrollIntoViewIfNeeded(); await idle(page);
  const r = await notice.boundingBox(), x = r.x + 10, y = r.y + 10;
  await notice.evaluate(el => {
    const panel = el.querySelector('.nx-home-glass-panel'), text = el.querySelector('.phone-policy-copy');
    window.__homeMotion = { frames: [], stop: false };
    const start = performance.now();
    function frame() { const r = text.getBoundingClientRect(), p = panel.getBoundingClientRect(), h = el.getBoundingClientRect(); window.__homeMotion.frames.push({ t: performance.now() - start, scaleX: p.width / h.width, scaleY: p.height / h.height, x: r.x, y: r.y, width: r.width, height: r.height }); if (!window.__homeMotion.stop) requestAnimationFrame(frame); }
    requestAnimationFrame(frame);
  });
  await page.mouse.move(x, y); await page.mouse.down();
  await page.waitForFunction(() => window.__homeMotion.frames.some(f => f.scaleX < .985));
  await page.mouse.up();
  await notice.evaluate(async el => { await Promise.all(el.querySelector('.nx-home-glass-panel').getAnimations().map(a => a.finished.catch(() => {}))); });
  await idle(page);
  const frames = await page.evaluate(() => { window.__homeMotion.stop = true; return window.__homeMotion.frames; });
  assert.ok(frames.length > 6); assert.ok(Math.min(...frames.map(f => f.scaleX)) < .985, 'Actual press did not deform the background');
  assert.ok(Math.max(...frames.map(f => f.scaleX)) > 1.0001, 'Release did not rebound');
  assert.ok(Math.abs(frames.at(-1).scaleX - 1) < .001, 'Background did not settle');
  const origin = frames[0];
  assert.ok(frames.every(f => ['x', 'y', 'width', 'height'].every(k => Math.abs(f[k] - origin[k]) < .15)), 'Label moved with decorative deformation');
  await writeFile(resolve(attempt, `${engine}-background-frames.json`), JSON.stringify(frames, null, 2));
  await page.emulateMedia({ reducedMotion: 'reduce', contrast: 'more' }); await idle(page);
  await page.mouse.move(x, y); await page.mouse.down(); await pause(120);
  const reduced = await active(page).evaluate(root => ({
    panels: [...root.querySelectorAll('.nx-home-glass-panel')].map(e => getComputedStyle(e).transform),
    floats: [...root.querySelectorAll('.nx-home-art-float')].map(e => getComputedStyle(e).animationName),
    surfaceImages: [...root.querySelectorAll('.nx-home-glass-panel')].map(e => getComputedStyle(e).backgroundImage),
    moreContrast: matchMedia('(prefers-contrast: more)').matches,
  }));
  await page.mouse.up();
  assert.ok(reduced.panels.every(t => t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)'));
  assert.ok(reduced.floats.length && reduced.floats.every(t => t === 'none'));
  assert.ok(reduced.moreContrast && reduced.surfaceImages.length && reduced.surfaceImages.every(t => t === 'none'));
  await page.emulateMedia({ reducedMotion: 'no-preference', contrast: 'no-preference' });
  return { frames: frames.length, minScale: Math.min(...frames.map(f => f.scaleX)), maxScale: Math.max(...frames.map(f => f.scaleX)), reduced };
}
async function observeNavigation(page) {
  await page.evaluate(() => {
    window.__homeNavigation = [];
    if (window.__homeRestoreNavigation) return;
    const originals = new Map();
    for (const name of ['navigateTo', 'redirectTo', 'reLaunch', 'switchTab']) { const original = uni[name]; originals.set(name, original); uni[name] = function(...args) { window.__homeNavigation.push({ name, url: args[0]?.url }); return original.apply(this, args); }; }
    window.__homeRestoreNavigation = () => { for (const [name, original] of originals) uni[name] = original; delete window.__homeRestoreNavigation; };
  });
}
async function navigateOnce(page, locator, routePart, keyboard = false) {
  await dismiss(page); await locator.scrollIntoViewIfNeeded(); await idle(page); await observeNavigation(page);
  if (keyboard) { await locator.focus(); await page.keyboard.press(keyboard === true ? 'Enter' : keyboard); } else await locator.click();
  await page.waitForURL(url => url.hash.includes(routePart)); await idle(page); await pause(100);
  const calls = await page.evaluate(() => window.__homeNavigation);
  assert.equal(calls.length, 1, `Expected one navigation: ${JSON.stringify(calls)}`);
  return { url: page.url(), calls };
}
async function homeTab(page) {
  await active(page).locator('.nx-tabbar-pill [data-glass-value="home"]').click();
  await active(page).locator('.hf-section').waitFor(); await idle(page); await dismiss(page);
}
async function actionCases(browser, engine) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage(); page.setDefaultTimeout(7000); page.on('pageerror', e => errors.push(`${engine}/actions: ${e.stack || e.message}`));
  try {
    await goto(page); const expected = await fixture(page, 2);
    for (const [index, keyboard] of [[0, false], [1, 'Enter'], [1, 'Space']]) {
      await check(page, `${engine}-device-${keyboard || 'slot-pointer'}`, ['home-fleet'], async () => {
        const row = active(page).locator(`[data-device-id="${expected.devices[index].id}"]`);
        const result = await navigateOnce(page, keyboard ? row : row.locator('.nx-device-slot'), `pages/earn/device-detail?id=${encodeURIComponent(expected.devices[index].id)}`, keyboard);
        await page.locator('.nx-device-detail:visible').waitFor();
        await page.locator('.spv-back:visible').last().click(); await active(page).locator('.hf-section').waitFor();
        return result;
      });
    }
    await check(page, `${engine}-manage`, ['home-fleet'], async () => { const result = await navigateOnce(page, active(page).locator('.hf-manage'), 'pages/earn/earn', true); await homeTab(page); return result; });
    await check(page, `${engine}-add`, ['home-fleet'], async () => {
      const result = await navigateOnce(page, active(page).locator('.hf-add-device'), `pages/store/detail?id=${expected.targetKind}`);
      // Return through the actual product page back control.
      await active(page).locator('.nx-navheader .nx-nav-side').first().click(); await active(page).locator('.hf-section').waitFor(); return result;
    });
    await restoreFixture(page);
    for (const key of ['Enter', 'Space']) await check(page, `${engine}-phone-route-${key}`, ['home-phone'], async () => {
      const carrier = await page.evaluate(async () => (await import('/src/lib/carrier.ts')).getCarrier());
      assert.equal(carrier, 'app', 'This checkout must keep its APP product target, independently of the browser transport');
      const result = await navigateOnce(page, active(page).locator('.phone-policy-action'), 'pages/onboarding/connect?mode=recalibrate', key);
      await page.locator('.cn-root').waitFor();
      await page.locator('.cn-back').click(); await page.waitForURL(url => url.hash.includes('/pages/me/devices'));
      const cancelUrl = page.url();
      // Calibration cancellation intentionally returns to device management. Reset the next independent case.
      await goto(page); return { ...result, carrier, cancelUrl };
    });
    await restoreFixture(page);
    for (const tab of ['home', 'earn', 'store', 'me']) {
      await check(page, `${engine}-voucher-${tab}`, ['home-banner'], async () => {
        await dismiss(page); await active(page).locator(`.nx-tabbar-pill [data-glass-value="${tab}"]`).click(); await idle(page); await dismiss(page);
        const state = await page.evaluate(async tab => { const v = (await import('/src/store/voucher.ts')).useVoucher(), s = (await import('/src/store/voucher-claim-sheet.ts')).useVoucherClaimSheet(); return { eligible: v.hasClaimableForSurface(tab), shown: s.sessionShownCount }; }, tab);
        assert.ok(state.eligible, 'Fresh fixture must have a real eligible voucher for this surface');
        const card = active(page).locator('.vb-card'); await card.scrollIntoViewIfNeeded(); await card.click();
        await page.locator('.vcs-root:visible').waitFor();
        const count = await page.evaluate(async () => (await import('/src/store/voucher-claim-sheet.ts')).useVoucherClaimSheet().sessionShownCount);
        assert.equal(count, state.shown, 'Manual banner opening consumed an automatic push slot');
        await page.locator('.vcs-close:visible').click(); await page.locator('.vcs-root:visible').waitFor({ state: 'hidden' });
        return { ...state, url: page.url() };
      });
    }
    await check(page, `${engine}-voucher-absent`, ['home-banner'], async () => {
      await active(page).locator('.nx-tabbar-pill [data-glass-value="team"]').click(); await idle(page);
      assert.equal(await active(page).locator('.vb-wrap').count(), 0);
      await goto(page, 'me/wallet-bills'); assert.equal(await active(page).locator('.vb-wrap').count(), 0);
      return { team: 'absent', subpage: 'me/wallet-bills absent' };
    });
  } finally { await restoreFixture(page).catch(() => {}); await context.close(); }
}
async function claimCase(browser, engine) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage(); page.setDefaultTimeout(7000); page.on('pageerror', e => errors.push(`${engine}/claim: ${e.stack || e.message}`));
  try {
    await goto(page);
    await check(page, `${engine}-voucher-persist`, ['home-banner'], async () => {
      const initial = await page.evaluate(async () => (await import('/src/store/voucher.ts')).useVoucher().claimableVouchers.map(v => v.id));
      assert.ok(initial.length, 'Disposable account has no voucher to exercise real claim persistence');
      await active(page).locator('.vb-card').click(); await page.locator('.vcs-root:visible').waitFor();
      for (let i = 0; i < initial.length; i++) {
        await page.locator('.vcs-cta-claim:visible').first().click();
        await page.waitForFunction(async expected => (await import('/src/store/voucher.ts')).useVoucher().claimableVouchers.length === expected, initial.length - i - 1);
        await page.waitForFunction(() => ![...document.querySelectorAll('.nx-toast')].some(e => e.getClientRects().length), undefined, { timeout: 8000 });
      }
      const read = () => page.evaluate(async ids => { const s = (await import('/src/store/voucher.ts')).useVoucher(); return ids.map(id => ({ id, claimed: s.isClaimed(id), used: s.isUsed(id) })); }, initial);
      const claimed = await read(); assert.ok(claimed.every(x => x.claimed && !x.used));
      await page.locator('.vcs-close:visible').click(); await page.reload({ waitUntil: 'domcontentloaded' }); await active(page).waitFor(); await idle(page); await dismiss(page);
      const reloaded = await read(); assert.deepEqual(reloaded, claimed);
      assert.equal(await active(page).locator('.vb-wrap').count(), 0, 'All-claimed banner survived reload');
      return { claimed, reloaded, screenshot: await capture(page, `${engine}-claimed-reloaded`) };
    });
  } finally { await context.close(); }
}

try {
  server = await ensureServer({ root, reuseUrl: process.env.HOME_GLASS_BASE_URL || 'http://127.0.0.1:54282', log: console.log });
  for (const [engine, browserType] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await browserType.launch();
    try {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
      const page = await context.newPage(); page.setDefaultTimeout(7000); page.on('pageerror', e => errors.push(`${engine}/layout: ${e.stack || e.message}`));
      try {
        await goto(page);
        await check(page, `${engine}-atlas`, ['home-banner', 'home-design'], () => atlas(page));
        for (const width of [320, 390]) for (const locale of ['zh', 'en', 'vi']) for (const theme of ['dark', 'light']) {
          await check(page, `${engine}-${width}-${locale}-${theme}`, ['home-phone', 'home-banner', 'home-fleet', 'home-design'], async () => {
            await settings(page, width, locale, theme); const expected = await fixture(page, 5); await dismiss(page);
            const data = await inventory(page, expected);
            if (locale === 'zh') {
              data.screenshots = [];
              for (const selector of ['.vb-card', '.phone-policy-notice', '.hf-section']) {
                const loc = active(page).locator(selector); await loc.scrollIntoViewIfNeeded(); await idle(page); await dismiss(page);
                assert.equal(await page.locator('.vcs-root:visible,.tcs-root:visible').count(), 0, 'Automatic claim panel obscures the design comparison');
                data.screenshots.push(await capture(page, `${engine}-${width}-${theme}-${selector.slice(1)}`));
              }
            }
            return data;
          });
        }
        for (const count of [0, 1, 5, 6]) await check(page, `${engine}-fleet-${count}`, ['home-fleet'], async () => { const expected = await fixture(page, count, count === 6); return { count, expected, geometry: await inventory(page, expected) }; });
        await check(page, `${engine}-heartbeat-expiry`, ['home-fleet'], () => heartbeatBoundary(page));
        await fixture(page, 5);
        await check(page, `${engine}-motion`, ['home-motion', 'home-design'], () => motion(page, engine));
      } finally { await restoreFixture(page).catch(() => {}); await context.close(); }
      await actionCases(browser, engine); await claimCase(browser, engine);
    } finally { await browser.close(); }
  }
} catch (error) { fatal = error.stack || String(error); }
finally {
  const after = await snapshot();
  const treeMoved = before.hash !== after.hash || before.head !== after.head;
  const passed = !fatal && !treeMoved && !errors.length && cases.length === expectedCases && cases.every(c => c.status === 'pass');
  const report = { at: new Date().toISOString(), capability: 'runtime', mode: 'full', verdict: passed ? 'pass' : 'fail', treeMoved, innerSkipped: Math.max(0, expectedCases - cases.length), taskId: process.env.WORKFLOW_TASK_ID, stepId: process.env.WORKFLOW_STEP_ID, checkId: process.env.WORKFLOW_CHECK_ID, runId: process.env.WORKFLOW_RUN_ID, repo: process.env.WORKFLOW_REPO || root, snapshotHash: process.env.WORKFLOW_SNAPSHOT_HASH,
    steps: acceptanceIds.map(id => ({ id, status: passed ? 'pass' : 'fail', verdict: passed ? 'pass' : 'fail', evidence: [resolve(attempt, 'runtime.json'), ...cases.filter(c => c.covers.includes(id)).map(c => resolve(attempt, `${c.id}.json`)), ...evidence] })),
    source: { before, after }, server: server ? { baseUrl: server.baseUrl, reused: server.reused } : null, durationMs: Date.now() - started, cases, errors, fatal,
    boundaries: ['Browser CSS viewports and real browser input; not physical-device verification.', 'Device fixtures are isolated and restored; real voucher claims occur only in disposable browser contexts.', 'Screenshot files preserve comparisons; matching the generated reference also requires independent visual review.'],
  };
  await writeFile(resolve(attempt, 'runtime.json'), JSON.stringify(report, null, 2));
  await writeFile(resolve(output, 'runtime.json'), JSON.stringify(report, null, 2));
  server?.stop();
  console.log(`${report.verdict.toUpperCase()} home-glass: ${cases.filter(c => c.status === 'pass').length}/${cases.length}; ${report.durationMs}ms; ${resolve(output, 'runtime.json')}`);
  if (!passed) process.exitCode = 1;
}

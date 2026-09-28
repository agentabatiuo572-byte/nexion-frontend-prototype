import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureServer } from './lib/dev-server-pool.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, '.codex-runtime/earn-glass');
const attempt = resolve(output, `run-${new Date().toISOString().replace(/[:.]/g, '-')}`);
await mkdir(attempt, { recursive: true });
const acceptanceIds = ['earn-manage', 'earn-add', 'earn-trial', 'earn-history', 'earn-fleet', 'earn-design'];
const surfaces = { home: '.hf-add-device', earn: '.earn-add-device', me: '.wallet-add-device' };
const routes = { home: 'index/index', earn: 'earn/earn', me: 'me/me', store: 'store/store' };
const cases = [], errors = [], screenshots = [];
const expectedCases = 53, started = Date.now();
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
async function idle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(document.getAnimations().filter(a => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a => a.finished.catch(() => {})));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}
async function capture(page, name) {
  const path = resolve(attempt, `${name}.png`);
  await page.screenshot({ path, timeout: 8000 }); screenshots.push(path); return path;
}
async function check(page, id, covers, fn) {
  assert.ok(Date.now() - started < 275000, 'Runtime budget exhausted; missing cases remain failures');
  const result = { id, covers, status: 'pass' };
  try { result.data = await fn(); }
  catch (error) {
    result.status = 'fail'; result.error = error.stack || String(error);
    result.keyEvents = await page.evaluate(() => window.__earnQuickMenuTrace ?? null).catch(() => null);
    try { result.screenshot = await capture(page, `failed-${id}`); } catch (error) { result.screenshotError = String(error); }
  }
  cases.push(result); await writeFile(resolve(attempt, `${id}.json`), JSON.stringify(result, null, 2));
  console.log(`${result.status.toUpperCase()} ${id}${result.error ? ': ' + result.error.split('\n')[0] : ''}`);
}
async function dismiss(page) {
  for (let n = 0; n < 5; n++) {
    const close = page.locator('.vcs-close:visible,.tcs-close:visible,.tcs-dismiss:visible').first();
    if (!await close.count()) break;
    await close.click(); await pause(80);
  }
  await page.waitForFunction(() => ![...document.querySelectorAll('.nx-toast')].some(e => e.getClientRects().length), undefined, { timeout: 8000 });
}
async function goto(page, tab = 'home') {
  await page.goto(`${server.baseUrl}/?nx_device_inner=1#/pages/${routes[tab]}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await active(page).waitFor(); await idle(page);
  if (tab === 'home') {
    await page.evaluate(async () => { window.__earnVoucher = (await import('/src/store/voucher.ts')).useVoucher(); });
    await page.waitForFunction(() => window.__earnVoucher.catalogReady === true);
    const pending = await page.evaluate(async () => {
      const v = (await import('/src/store/voucher.ts')).useVoucher(), s = (await import('/src/store/voucher-claim-sheet.ts')).useVoucherClaimSheet();
      return !s.lastClosedAt && v.claimableVouchers.some(v => v.popupEnabled);
    });
    if (pending) await page.locator('.vcs-close:visible').waitFor({ timeout: 8000 });
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
async function fixture(page, options = {}) {
  return page.evaluate(async options => {
    const app = (await import('/src/store/app.ts')).useApp(), config = (await import('/src/store/config.ts')).useConfig();
    const trial = (await import('/src/store/free-trial.ts')).useFreeTrial(), trialConfig = (await import('/src/store/trial-config.ts')).useTrialConfig();
    const { createDevice } = await import('/src/store/device-types.ts');
    const { deviceName } = await import('/src/lib/device-copy.ts'), t = (await import('/src/i18n/use-t.ts')).getT();
    window.__earnOriginal ??= JSON.parse(JSON.stringify({ devices: app.devices, paused: app.miningPaused, compute: config.config.featureFlags.computeShareEnabled, trial: trial.snapshot(), trialConfig: trialConfig.config }));
    const { activeCount = 3, inactive = ['stellarbox-s1'], historyCount = 23, status = 'none', phase = true, online = false, days = 4, daily = 9.25 } = options;
    const kinds = ['stellarbox-s1', 'stellarbox-pro-v2', 'stellarrack-p2', 'phone', 'cloud-share', 'pc-gpu'];
    const now = Date.now();
    // Persisted task history is append-only per device. Each fixture is a new
    // device set, so normal session resume cannot merge an older fixture back.
    const generation = window.__earnFixtureGeneration = (window.__earnFixtureGeneration ?? 0) + 1;
    const records = Array.from({ length: historyCount }, (_, i) => ({ id: `earn-glass-task-${i}`, category: 'IG', type: 'Image Gen', model: `Model ${String(i).padStart(2, '0')}`, client: 'Runtime fixture', location: 'Singapore', totalSec: 60, startedAt: now - ((i * 7) % historyCount + 2) * 60000, completedAt: now - ((i * 7) % historyCount + 1) * 60000, reward: (i + 1) / 1000 }));
    app.miningPaused = true; config.config.featureFlags.computeShareEnabled = true;
    app.devices = kinds.slice(0, activeCount).map((kind, i) => ({ ...createDevice(kind, `earn-glass-${generation}-active-${i}`, { paidPriceUsdt: 0 }), activatedAt: now - 86400000, status: online && kind !== 'phone' ? 'online' : 'offline', baseRate: 0, baseRateNEX: 0, onlineHeartbeatAt: null, lastSettledAt: null, currentTask: null, recentTasks: records.filter((_, n) => n % Math.max(1, activeCount) === i), todayEarnings: [.01, 1234.56, 75.25, 0, 3.21, 4.32][i] }));
    app.devices.push(...inactive.map((kind, i) => ({ ...createDevice(kind, `earn-glass-${generation}-inactive-${i}`, { paidPriceUsdt: 0 }), activatedAt: null, status: 'offline', currentTask: null, recentTasks: activeCount === 0 && i === 0 ? records : [], lastSettledAt: null })));
    Object.assign(trial, { status, startedAt: status === 'none' ? null : now - 1000, expiresAt: status === 'active' ? now + 86400000 : status === 'none' ? null : now - 1000, graceEndsAt: status === 'grace' ? now + 86400000 : status === 'none' ? null : now + 172800000, finishedAt: ['ended', 'converted'].includes(status) ? now : null, shadowFrozenAtUSD: 0, shadowFrozenAtNEX: 0 });
    Object.assign(trialConfig.config, { phaseOpen: phase, trialDays: days, shadowDailyUSD: daily, autoPushEnabled: false });
    return { devices: app.visibleDevices.filter(d => d.activatedAt !== null).map(d => ({ id: d.id, name: deviceName(t, d), online: d.kind !== 'phone' && d.status === 'online', income: '$' + d.todayEarnings.toFixed(2) })), records: [...records].sort((a, b) => b.completedAt - a.completedAt).slice(0, 10).map(r => r.id), expectedTrial: status === 'none' && phase, days, total: Math.round(days * daily) };
  }, options);
}
async function restore(page) {
  await page.evaluate(async () => {
    const saved = window.__earnOriginal; if (!saved) return;
    const app = (await import('/src/store/app.ts')).useApp(), cfg = (await import('/src/store/config.ts')).useConfig();
    app.devices = saved.devices; app.miningPaused = saved.paused; cfg.config.featureFlags.computeShareEnabled = saved.compute;
    Object.assign((await import('/src/store/free-trial.ts')).useFreeTrial(), saved.trial);
    (await import('/src/store/trial-config.ts')).useTrialConfig().config = saved.trialConfig;
    delete window.__earnOriginal;
  });
}
async function tab(page, name) {
  const isDestination = url => url.hash === `#/pages/${routes[name]}` || (name === 'home' && ['#/', ''].includes(url.hash));
  if (isDestination(new URL(page.url()))) return;
  const control = active(page).locator(`.nx-tabbar-pill [data-glass-value="${name}"]`);
  if (!await control.count()) { await restore(page); await goto(page, name); return; }
  await dismiss(page); await control.click(); await page.waitForURL(isDestination); await idle(page); await dismiss(page);
  assert.equal(await active(page).locator(`.nx-tabbar-pill [data-glass-value="${name}"]`).getAttribute('aria-current'), 'page');
}
async function guard(page) {
  return page.evaluate(async () => {
    const app = (await import('/src/store/app.ts')).useApp(), orders = (await import('/src/store/orders.ts')).useOrders(), bills = (await import('/src/store/bills.ts')).useBills();
    // The normal account clock updates this timestamp even when no money changes.
    const { lastBucketedAt: _clock, ...buckets } = app.user.earningBuckets;
    return JSON.parse(JSON.stringify({ devices: app.devices.map(d => ({ id: d.id, activatedAt: d.activatedAt })).sort((a, b) => a.id.localeCompare(b.id)), usdt: app.user.usdtBalance, nex: app.user.nexBalance, buckets, orders: orders.orders, bills: bills.bills }));
  });
}
async function visitRewards(page) {
  const samples = [];
  await page.evaluate(async () => {
    window.__earnRewardStores = {
      app: (await import('/src/store/app.ts')).useApp(),
      session: (await import('/src/store/session.ts')).useSession(),
      quest: (await import('/src/store/quest.ts')).useQuest(),
      bills: (await import('/src/store/bills.ts')).useBills(),
    };
  });
  for (const [name, id] of [['earn', 'visit_earn'], ['store', 'visit_store']]) {
    await tab(page, name);
    // These existing first-visit rewards are legitimate side effects of navigation.
    // Finish them through the UI before comparing the later add-entry financial state.
    // waitForFunction tests a Promise object's truthiness before it resolves in this
    // Playwright runtime. Keep the predicate synchronous and return its exact evidence.
    const handle = await page.waitForFunction(id => {
      const { app, session, quest, bills } = window.__earnRewardStores;
      const receipts = bills.bills.filter(bill => bill.ref === `QST-${id}` && bill.status === 'posted')
        .map(({ id, ref, amount, symbol, status }) => ({ id, ref, amount, symbol, status }));
      if (!quest.isComplete(id) || !receipts.length || app.accountKey !== session.accountKey || session.status !== 'active') return false;
      return { accountKey: app.accountKey, sessionAccount: session.accountKey, complete: quest.isComplete(id), expectedNex: quest.QUEST_TASKS.find(task => task.id === id).nexReward, receipts };
    }, id);
    const sample = await handle.jsonValue(); await handle.dispose();
    assert.equal(sample.complete, true); assert.equal(sample.accountKey, sample.sessionAccount);
    assert.equal(sample.receipts.length, 1); assert.equal(sample.receipts[0].symbol, 'NEX');
    assert.equal(sample.receipts[0].amount, sample.expectedNex); samples.push(sample);
    await dismiss(page);
  }
  await tab(page, 'earn');
  const readback = await page.evaluate(() => {
    const { app, session, quest, bills } = window.__earnRewardStores;
    return { accountKey: app.accountKey, sessionAccount: session.accountKey, complete: ['visit_earn', 'visit_store'].every(id => quest.isComplete(id)), receipts: bills.bills.filter(bill => ['QST-visit_earn', 'QST-visit_store'].includes(bill.ref)).map(({ id, ref, amount, symbol, status }) => ({ id, ref, amount, symbol, status })).sort((a, b) => a.ref.localeCompare(b.ref)) };
  });
  const receipts = samples.flatMap(sample => sample.receipts).sort((a, b) => a.ref.localeCompare(b.ref));
  assert.equal(readback.complete, true); assert.equal(receipts.length, 2);
  assert.ok(samples.every(sample => sample.accountKey === readback.accountKey));
  assert.equal(readback.accountKey, readback.sessionAccount); assert.deepEqual(readback.receipts, receipts);
  return { receipts, accountKey: readback.accountKey, readback, preparation: 'Real first visits and posted receipts, without mutating quest or balance fixtures' };
}
async function observeNavigation(page) {
  await page.evaluate(() => {
    window.__earnNavigations = [];
    if (window.__earnNavigationInstalled) return;
    window.__earnNavigationInstalled = true;
    for (const name of ['navigateTo', 'redirectTo', 'reLaunch', 'switchTab']) {
      const original = uni[name]; uni[name] = function(...args) { window.__earnNavigations.push({ name, url: args[0]?.url }); return original.apply(this, args); };
    }
  });
}
async function activate(locator, page, key) {
  await locator.scrollIntoViewIfNeeded();
  if (key) { await locator.focus(); await page.keyboard.press(key); } else await locator.click();
}
async function oneNavigation(page, locator, destination, key) {
  await observeNavigation(page); await activate(locator, page, key);
  await page.waitForURL(url => url.hash === `#${destination}`); await idle(page); await pause(80);
  const calls = await page.evaluate(() => window.__earnNavigations);
  assert.equal(calls.length, 1, `Duplicate or fallback navigation: ${JSON.stringify(calls)}`);
  assert.equal(calls[0].url, destination); return calls;
}
async function openChoice(page, surface, key = 'Enter') {
  const control = active(page).locator(surfaces[surface]);
  await activate(control, page, key); await page.locator('.sas-root:visible').waitFor(); await idle(page);
  assert.equal(await page.locator('.sas-root:visible').count(), 1);
  assert.equal(await page.locator('.sas-device:visible').count(), 0, 'Navigation sheet still has direct activation rows');
  return control;
}
async function geometry(page, expected) {
  const data = await active(page).evaluate(root => {
    const problems = [];
    const rect = el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const inside = (child, parent, label) => { const a = rect(child), b = rect(parent); if (a.x < b.x - 1 || a.right > b.right + 1 || a.y < b.y - 1 || a.bottom > b.bottom + 1) problems.push(`${label} outside its container`); };
    const text = el => {
      if (el.querySelector('uni-text')) return;
      if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) problems.push(`Clipped text: ${el.textContent}`);
      const range = document.createRange(); range.selectNodeContents(el); const b = rect(el);
      for (const r of range.getClientRects()) if (r.left < b.x - 1 || r.right > b.right + 1) problems.push(`Text ink escapes: ${el.textContent}`);
    };
    const trial = root.querySelector('.nx-trial-hero');
    if (trial) for (const el of trial.querySelectorAll('uni-text')) { text(el); inside(el, trial, 'trial text'); }
    const fleet = root.querySelector('.earn-fleet-list');
    if (!fleet) throw Error('Compact fleet is absent');
    if (fleet.scrollWidth > fleet.clientWidth + 1) problems.push('Fleet has horizontal overflow');
    if (fleet.querySelector('.grid-cols-6')) problems.push('Duplicate top slot strip remains');
    const cards = [...fleet.querySelectorAll('.nx-device-card')].map(card => {
      const header = card.querySelector('.nx-device-card__header'), art = header.querySelector('.nx-device-slot');
      if (!art) problems.push('Compact device artwork absent');
      else { const r = rect(art); if (r.width < 44 || r.width > 56 || Math.abs(r.height - 56) > 1) problems.push(`Compact art bay is ${r.width}x${r.height}`); inside(art, header, 'compact art'); for (const image of art.querySelectorAll('.nx-home-art,svg')) inside(image, header, 'art pixels'); }
      for (const el of header.querySelectorAll('uni-text')) { text(el); inside(el, header, 'device text'); }
      const main = rect(header.querySelector('.nx-device-card__main')), numbers = rect(header.querySelector('.nx-device-card__numbers'));
      if (Math.min(main.right, numbers.right) - Math.max(main.x, numbers.x) > 1 && Math.min(main.bottom, numbers.bottom) - Math.max(main.y, numbers.y) > 1) problems.push('Device identity overlaps earnings');
      return { id: card.dataset.deviceId, online: card.dataset.online, header: rect(header), text: header.textContent };
    });
    const sheet = [...document.querySelectorAll('.sas-root')].find(e => e.getClientRects().length);
    if (sheet) {
      const panel = sheet.querySelector('.sas-panel');
      for (const el of panel.querySelectorAll('uni-text')) { text(el); inside(el, panel, 'choice text'); }
      for (const el of panel.querySelectorAll('[role="button"]')) { const b = rect(el); if (b.width < 44 || b.height < 44) problems.push('Choice touch target below44px'); inside(el, panel, 'choice action'); }
    }
    if (root.querySelector('.nx-content').scrollWidth > root.querySelector('.nx-content').clientWidth + 1 || document.documentElement.scrollWidth > innerWidth + 1) problems.push('Page horizontally overflows');
    return { problems, cards, trialText: trial?.textContent, fontStatus: document.fonts.status };
  });
  assert.deepEqual(data.problems, []);
  assert.deepEqual(data.cards.map(c => c.id), expected.devices.map(d => d.id));
  for (const device of expected.devices) {
    const card = data.cards.find(c => c.id === device.id);
    assert.equal(card.online, String(device.online)); assert.ok(card.text.includes(device.name)); assert.ok(card.text.includes(device.income));
  }
  assert.ok(data.trialText?.includes(`$${expected.total}`), 'Trial estimate does not follow live days/daily config');
  assert.ok(data.trialText.includes(String(expected.days)), 'Trial duration does not follow live config');
  return data;
}
async function choiceCase(page, surface) {
  await tab(page, surface); await fixture(page); await idle(page);
  const before = await guard(page), originalUrl = page.url(), trigger = await openChoice(page, surface);
  const focusInside = () => page.evaluate(() => !!document.activeElement?.closest('.sas-root'));
  assert.ok(await focusInside());
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); assert.ok(await focusInside(), 'Tab escaped inventory choices'); }
  await page.keyboard.press('Escape'); await page.locator('.sas-root:visible').waitFor({ state: 'hidden' });
  assert.ok(await trigger.evaluate(el => document.activeElement === el), 'Escape did not return focus to add control');
  assert.equal(page.url(), originalUrl); assert.deepEqual(await guard(page), before);
  await openChoice(page, surface, 'Space');
  await activate(page.locator('.sas-cancel:visible'), page, 'Enter');
  await page.locator('.sas-root:visible').waitFor({ state: 'hidden' }); assert.deepEqual(await guard(page), before);
  await openChoice(page, surface);
  await activate(page.locator('.sas-close:visible'), page, 'Space');
  await page.locator('.sas-root:visible').waitFor({ state: 'hidden' });
  assert.ok(await trigger.evaluate(el => document.activeElement === el)); assert.deepEqual(await guard(page), before);
  await openChoice(page, surface);
  // Inventory may change while this navigation-only panel is open. The warehouse remains authoritative.
  await page.evaluate(async () => { const app = (await import('/src/store/app.ts')).useApp(); app.devices = app.devices.filter(d => d.activatedAt !== null); });
  const changed = await guard(page);
  const inventoryCalls = await oneNavigation(page, page.locator('.sas-inventory-cta:visible'), '/pages/me/devices', 'Enter');
  assert.equal(await page.locator('.sas-root:visible').count(), 0); assert.deepEqual(await guard(page), changed);
  await page.locator('.spv-back:visible').last().click(); await idle(page); await tab(page, surface);
  await fixture(page); await idle(page); const purchaseBefore = await guard(page);
  await openChoice(page, surface);
  const storeCalls = await oneNavigation(page, page.locator('.sas-store-cta:visible'), '/pages/store/store', 'Space');
  assert.equal(await page.locator('.sas-root:visible').count(), 0); assert.deepEqual(await guard(page), purchaseBefore);
  return { inventoryCalls, storeCalls, cancel: true, closeSpace: true, escapeFocus: true, stateUnchanged: true, changingInventory: true };
}
async function emptyCase(page, surface) {
  await tab(page, surface); await fixture(page, { inactive: ['phone', 'pc-gpu', 'cloud-share'] }); await idle(page);
  const before = await guard(page);
  const calls = await oneNavigation(page, active(page).locator(surfaces[surface]), '/pages/store/store', 'Enter');
  assert.equal(await page.locator('.sas-root:visible').count(), 0); assert.deepEqual(await guard(page), before);
  return { calls, excludedKinds: ['phone', 'pc-gpu', 'cloud-share'], stateUnchanged: true };
}
async function trialStates(page) {
  await tab(page, 'earn'); const results = [];
  for (const status of ['none', 'active', 'grace', 'ended', 'converted']) {
    await fixture(page, { status }); await idle(page);
    const count = await active(page).locator('.nx-trial-hero').count(); assert.equal(count, status === 'none' ? 1 : 0);
    results.push({ status, visible: !!count });
  }
  await fixture(page, { phase: false }); await idle(page); assert.equal(await active(page).locator('.nx-trial-hero').count(), 0);
  await fixture(page); await idle(page); const before = await guard(page);
  await activate(active(page).locator('.nx-trial-hero'), page, 'Enter'); await page.locator('.tcs-root:visible').waitFor();
  await page.locator('.tcs-close:visible').click(); await page.locator('.tcs-root:visible').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(async () => (await import('/src/store/free-trial.ts')).useFreeTrial().status), 'none');
  assert.deepEqual(await guard(page), before); return { results, phaseClosed: 'hidden', existingClaimSheet: true, noClaimFromOpening: true };
}
async function fleetStates(page) {
  await tab(page, 'earn'); const results = [];
  for (const count of [0, 6]) {
    await fixture(page, { activeCount: count }); await idle(page);
    assert.equal(await active(page).locator('.earn-fleet-list .nx-device-card').count(), count);
    const before = await guard(page); await openChoice(page, 'earn');
    await page.locator('.sas-cancel:visible').click(); assert.deepEqual(await guard(page), before);
    results.push({ count, choiceAvailable: true, noActivation: true });
  }
  for (const status of ['active', 'grace']) { await fixture(page, { activeCount: 5, status }); await idle(page); assert.equal(await active(page).locator('.earn-trial-reservation').count(), 1); }
  await fixture(page, { activeCount: 6 }); await tab(page, 'home'); assert.equal(await active(page).locator('.hf-add-device').count(), 0);
  await tab(page, 'me'); assert.equal(await active(page).locator(surfaces.me).count(), 0);
  return { results, activeAndGraceReservation: true, fullHomeAndWalletHidden: true };
}
async function history(page) {
  await tab(page, 'earn'); const samples = [];
  for (const count of [23, 0, 3, 23]) {
    const expected = await fixture(page, { historyCount: count });
    // Force the real persistence/adoption path that exposed reused fixture IDs.
    await page.evaluate(async () => (await import('/src/store/app.ts')).useApp().resumeMining());
    await idle(page);
    const state = await page.evaluate(async () => {
      const app = (await import('/src/store/app.ts')).useApp();
      const { readAccountSnapshot } = await import('/src/store/account-cloud.ts');
      const ids = devices => devices.flatMap(d => d.recentTasks).sort((a, b) => b.completedAt - a.completedAt).map(task => task.id);
      return { canonical: ids(app.devices), visible: ids(app.visibleDevices), persisted: ids(readAccountSnapshot(app.accountKey)?.devices ?? []) };
    });
    assert.equal(state.canonical.length, count, 'Persistence changed the history fixture');
    assert.deepEqual(state.visible, state.canonical); assert.deepEqual(state.persisted, state.canonical);
    assert.deepEqual(state.canonical.slice(0, 10), expected.records);
    const ids = await active(page).locator('.earn-history-row').evaluateAll(rows => rows.map(row => row.dataset.taskId));
    assert.deepEqual(ids, expected.records); assert.equal(ids.length, Math.min(count, 10)); samples.push({ input: count, ids, state });
    if (!count) {
      const empty = await page.evaluate(async () => (await import('/src/i18n/use-t.ts')).getT().taskHistory.historyEmpty);
      assert.ok((await active(page).innerText()).includes(empty));
    }
  }
  const calls = await oneNavigation(page, active(page).locator('.earn-history-all'), '/pages/me/receipts', 'Enter');
  await page.locator('.spv-back:visible').last().click(); await idle(page); return { samples, calls };
}
async function accordion(page) {
  await tab(page, 'earn'); await fixture(page); await idle(page);
  const headers = active(page).locator('.nx-device-card__header');
  await headers.first().click(); assert.equal(await headers.first().getAttribute('aria-expanded'), 'true');
  await activate(headers.nth(1), page, 'Enter'); assert.equal(await headers.first().getAttribute('aria-expanded'), 'false');
  assert.equal(await headers.nth(1).getAttribute('aria-expanded'), 'true'); assert.equal(await active(page).locator('.nx-device-card__details').count(), 1);
  await activate(headers.nth(1), page, 'Space'); assert.equal(await active(page).locator('.nx-device-card__details').count(), 0);
  await headers.first().focus();
  assert.ok(await headers.first().evaluate(el => document.activeElement === el), 'Quick-menu header did not take focus');
  await headers.first().evaluate(el => {
    window.__earnQuickMenuTrace = [];
    for (const type of ['keydown', 'keyup', 'contextmenu']) el.addEventListener(type, event => {
      window.__earnQuickMenuTrace.push({ type, key: event.key, code: event.code, shiftKey: event.shiftKey, trusted: event.isTrusted, target: event.target.className });
    }, { capture: true });
  });
  await page.keyboard.press('Shift+F10'); await page.locator('.nx-device-quick-menu:visible').waitFor();
  await page.keyboard.press('Escape'); await page.locator('.nx-device-quick-menu:visible').waitFor({ state: 'hidden' });
  assert.ok(await headers.first().evaluate(el => document.activeElement === el));
  await headers.first().click({ button: 'right' }); await page.locator('.nx-device-quick-stats:visible').click();
  await page.locator('.nx-device-quick-menu:visible').waitFor({ state: 'hidden' });
  assert.ok(page.url().endsWith('#/pages/earn/earn'));
  return { singleExpanded: true, enterSpace: true, quickMenuKeyboardAndPointer: true, keyEvents: await page.evaluate(() => window.__earnQuickMenuTrace), statsAction: 'existing in-page behavior retained' };
}
async function nativeHold(page) {
  await tab(page, 'earn'); await fixture(page); await idle(page);
  const header = active(page).locator('.nx-device-card__header').first(); await header.scrollIntoViewIfNeeded();
  const r = await header.boundingBox(), client = await page.context().newCDPSession(page);
  try {
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x + r.width / 2, y: r.y + r.height / 2 }] });
    await page.locator('.nx-device-quick-menu:visible').waitFor();
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.equal(await header.getAttribute('aria-expanded'), 'false', 'Long hold also toggled the accordion');
    await page.keyboard.press('Escape'); await page.locator('.nx-device-quick-menu:visible').waitFor({ state: 'hidden' });
    return { trustedTouchHold: true, noSecondaryActivation: true };
  } finally { await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }).catch(() => {}); await client.detach(); }
}
async function motion(page, engine) {
  await tab(page, 'earn'); await fixture(page); await settings(page, 390, 'en', 'dark');
  const hero = active(page).locator('.nx-trial-hero'); await hero.scrollIntoViewIfNeeded(); await idle(page);
  const r = await hero.boundingBox();
  await hero.evaluate(el => {
    const panel = el.querySelector('.nx-home-glass-panel'), label = el.querySelector('.trial-meta'); window.__earnMotion = { frames: [], stop: false };
    const start = performance.now(); function frame() { const p = panel.getBoundingClientRect(), h = el.getBoundingClientRect(), t = label.getBoundingClientRect(); window.__earnMotion.frames.push({ t: performance.now() - start, scale: p.width / h.width, x: t.x, y: t.y, width: t.width, height: t.height }); if (!window.__earnMotion.stop) requestAnimationFrame(frame); } requestAnimationFrame(frame);
  });
  const press = { x: r.x + r.width / 2, y: r.y + 12 };
  assert.ok(await hero.evaluate((el, p) => el.contains(document.elementFromPoint(p.x, p.y)), press), 'Pressure point does not hit the visible hero');
  await page.mouse.move(press.x, press.y); await page.mouse.down();
  await page.waitForFunction(() => window.__earnMotion.frames.some(f => f.scale < .985));
  await page.mouse.move(r.x - 3, r.y + 6); await page.mouse.up(); await idle(page);
  const frames = await page.evaluate(() => { window.__earnMotion.stop = true; return window.__earnMotion.frames; });
  assert.ok(frames.length > 6); assert.ok(Math.min(...frames.map(f => f.scale)) < .985); assert.ok(Math.max(...frames.map(f => f.scale)) > 1.0001);
  assert.ok(Math.abs(frames.at(-1).scale - 1) < .001);
  assert.ok(frames.every(f => ['x', 'y', 'width', 'height'].every(k => Math.abs(f[k] - frames[0][k]) < .15)), 'Pressure moved readable content');
  assert.equal(await page.locator('.tcs-root:visible').count(), 0, 'Cancelled press opened the claim sheet');
  await writeFile(resolve(attempt, `${engine}-motion-frames.json`), JSON.stringify(frames, null, 2));
  await page.emulateMedia({ reducedMotion: 'reduce', contrast: 'more' }); await idle(page);
  await page.mouse.move(press.x, press.y); await page.mouse.down(); await pause(120);
  const reduced = await hero.evaluate(el => ({ panel: getComputedStyle(el.querySelector('.nx-home-glass-panel')).transform, float: getComputedStyle(el.querySelector('.nx-home-art-float')).animationName, text: getComputedStyle(el.querySelector('.trial-title')).color }));
  await page.mouse.move(r.x - 3, r.y + 6); await page.mouse.up();
  assert.ok(['none', 'matrix(1, 0, 0, 1, 0, 0)'].includes(reduced.panel)); assert.equal(reduced.float, 'none');
  await page.emulateMedia({ reducedMotion: 'no-preference', contrast: 'no-preference' });
  return { frames: frames.length, min: Math.min(...frames.map(f => f.scale)), max: Math.max(...frames.map(f => f.scale)), reduced };
}
async function atlas(page) {
  await tab(page, 'earn'); await fixture(page); await idle(page);
  return active(page).locator('.trial-art .nx-home-art').evaluate(async el => {
    const style = getComputedStyle(el), image = new Image();
    if (!style.backgroundImage.includes('/static/img/home-glass-20260928/s1.webp')) throw Error(`Trial does not use the generated S1 tile: ${style.backgroundImage}`);
    image.src = style.backgroundImage.slice(5, -2); await image.decode();
    if (image.naturalWidth !== 512 || image.naturalHeight !== 512) throw Error('Trial artwork tile dimensions changed');
    const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d'); context.drawImage(image, 0, 0); const bytes = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let clear = 0, visible = 0; for (let i = 3; i < bytes.length; i += 64) { if (bytes[i]) visible++; else clear++; }
    if (!clear || !visible) throw Error('Actual decoded atlas alpha is invalid');
    return { width: canvas.width, height: canvas.height, clear, visible, position: style.backgroundPosition };
  });
}

try {
  server = await ensureServer({ root, reuseUrl: process.env.EARN_GLASS_BASE_URL || process.env.HOME_GLASS_BASE_URL || 'http://127.0.0.1:54282', log: console.log });
  for (const [engine, type] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await type.launch(), context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const page = await context.newPage(); page.setDefaultTimeout(7000); page.on('pageerror', error => errors.push(`${engine}: ${error.stack || error.message}`));
    try {
      await goto(page);
      await check(page, `${engine}-visit-rewards`, ['earn-add'], () => visitRewards(page));
      await fixture(page); await tab(page, 'earn');
      await check(page, `${engine}-atlas`, ['earn-trial', 'earn-design'], () => atlas(page));
      for (const width of [320, 390]) for (const locale of ['zh', 'en', 'vi']) for (const theme of ['dark', 'light']) {
        await check(page, `${engine}-${width}-${locale}-${theme}`, ['earn-trial', 'earn-fleet', 'earn-add', 'earn-design'], async () => {
          await settings(page, width, locale, theme); const expected = await fixture(page, { online: true }); await idle(page);
          await openChoice(page, 'earn'); const result = await geometry(page, expected);
          if (locale === 'zh') result.choiceScreenshot = await capture(page, `${engine}-${width}-${theme}-choice`);
          await page.locator('.sas-cancel:visible').click(); await page.locator('.sas-root:visible').waitFor({ state: 'hidden' });
          if (locale === 'zh') for (const [label, selector] of [['trial', '.nx-trial-hero'], ['fleet', '.earn-fleet-list']]) {
            await active(page).locator(selector).scrollIntoViewIfNeeded(); await idle(page); await dismiss(page);
            result[`${label}Screenshot`] = await capture(page, `${engine}-${width}-${theme}-${label}`);
          }
          return result;
        });
      }
      await settings(page, 390, 'en', 'dark');
      await check(page, `${engine}-manage`, ['earn-manage'], async () => {
        await tab(page, 'home'); await fixture(page); await idle(page); const before = await guard(page);
        const calls = await oneNavigation(page, active(page).locator('.hf-manage'), '/pages/me/devices', 'Enter');
        assert.deepEqual(await guard(page), before); await page.locator('.spv-back:visible').last().click(); return { calls, stateUnchanged: true };
      });
      for (const surface of Object.keys(surfaces)) {
        await check(page, `${engine}-${surface}-choice`, ['earn-add'], () => choiceCase(page, surface));
        await check(page, `${engine}-${surface}-no-inventory`, ['earn-add'], () => emptyCase(page, surface));
      }
      await check(page, `${engine}-trial-states`, ['earn-trial'], () => trialStates(page));
      await check(page, `${engine}-fleet-states`, ['earn-fleet', 'earn-add'], () => fleetStates(page));
      await check(page, `${engine}-history`, ['earn-history'], () => history(page));
      await check(page, `${engine}-accordion`, ['earn-fleet'], () => accordion(page));
      if (engine === 'chromium') await check(page, `${engine}-native-hold`, ['earn-fleet'], () => nativeHold(page));
      await check(page, `${engine}-motion`, ['earn-design'], () => motion(page, engine));
    } finally { await restore(page).catch(() => {}); await context.close(); await browser.close(); }
  }
} catch (error) { fatal = error.stack || String(error); }
finally {
  const after = await snapshot(), treeMoved = before.hash !== after.hash || before.head !== after.head;
  const passed = !fatal && !treeMoved && !errors.length && cases.length === expectedCases && cases.every(c => c.status === 'pass');
  const report = { at: new Date().toISOString(), capability: 'runtime', mode: 'full', verdict: passed ? 'pass' : 'fail', treeMoved, innerSkipped: Math.max(0, expectedCases - cases.length),
    taskId: process.env.WORKFLOW_TASK_ID, stepId: process.env.WORKFLOW_STEP_ID, checkId: process.env.WORKFLOW_CHECK_ID, runId: process.env.WORKFLOW_RUN_ID, repo: process.env.WORKFLOW_REPO || root, snapshotHash: process.env.WORKFLOW_SNAPSHOT_HASH,
    steps: acceptanceIds.map(id => ({ id, status: passed ? 'pass' : 'fail', verdict: passed ? 'pass' : 'fail', evidence: [resolve(attempt, 'runtime.json'), ...cases.filter(c => c.covers.includes(id)).map(c => resolve(attempt, `${c.id}.json`)), ...screenshots] })),
    source: { before, after }, server: server ? { baseUrl: server.baseUrl, reused: server.reused } : null, durationMs: Date.now() - started, cases, errors, fatal,
    boundaries: ['Browser runtime and Chromium simulated native touch; not a physical App device.', 'Remote inventory refresh failures and concurrency are separately unit-tested; this browser server is source-identified fixed mock.', 'Device/trial/config fixtures live in a disposable context and are restored. No activation, purchase or trial claim command is issued.', 'Saved screenshots support independent visual comparison; no screenshot similarity metric is claimed.'],
  };
  await writeFile(resolve(attempt, 'runtime.json'), JSON.stringify(report, null, 2)); await writeFile(resolve(output, 'runtime.json'), JSON.stringify(report, null, 2));
  server?.stop(); console.log(`${report.verdict.toUpperCase()} earn-glass: ${cases.filter(c => c.status === 'pass').length}/${cases.length}; ${report.durationMs}ms; ${resolve(output, 'runtime.json')}`);
  if (!passed) process.exitCode = 1;
}

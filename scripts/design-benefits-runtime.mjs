// Isolated frontend rendering/interaction evidence; not TEST backend acceptance.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { chromium } from 'playwright';
import { installFormalProbeSession } from './lib/formal-probe-session.mjs';
import { directAppUrl } from './lib/direct-app-url.mjs';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5186';
const OUTPUT = process.env.DESIGN_OUTPUT || path.join(os.tmpdir(), 'uvel-design-review');
const now = Date.now(), iso = new Date(now).toISOString();
const authority = { sourceEnvironment: 'PRODUCTION', runId: '', serverCanonical: true };
const products = [
  { id: 'stellarbox-s1', name: 'UVEL Box S1', tier: 'Entry', imageUrl: '/static/img/home-glass-20260928/s1.webp', price: 1299, dailyEarn: 6.2, dailyEarnNEX: 3 },
  { id: 'stellarbox-pro', name: 'UVEL Box Pro', tier: 'Pro', imageUrl: '/static/img/home-glass-20260928/pro.webp', price: 4999, dailyEarn: 22.4, dailyEarnNEX: 12 },
].map(p => ({ ...p, imageUrl: new URL(p.imageUrl, BASE).href, tagline: '', badge: null, productType: 'DEVICE', inventoryMode: 'FINITE', gpu: null, vram: null, power: null, datacenter: null, warranty: null, hashRate: null, sold: 7, stock: 60, features: [], ai: null, status: 'active', available: true, releaseState: null, releasePhaseId: null, unlocksAtPhase: null, purchaseGate: null }));
const trial = { ...authority, authoritative: true, state: 'ELIGIBLE', canStart: true, serverNowEpochMs: now, version: 1, claimNo: null, startedAt: null, expiresAt: null, graceEndsAt: null, finishedAt: null, cooldownUntil: null, shadowUSD: 0, shadowNEX: 0, source: 'nx_trial_claim', provenance: { ...authority, source: 'nx_trial_claim' }, paymentRail: 'NEXION_USDT_WALLET', config: { trialDays: '3', graceDays: '7', discountRate: '0.15', discountCapUSD: '20', trialOffsetCapUSD: '50', trialProductId: 'stellarbox-s1', trialProductName: 'UVEL Box S1', trialPriceUSD: '1299', shadowDailyUSD: '38.52', shadowDailyNEX: '65', seatsLeftToday: '1', phaseOpen: true, autoPushEnabled: false, autoPushDelayMs: '1500', autoPushCooldownHours: '24', autoPushMaxPerSession: '1' } };
const voucher = { voucherId: 'V-DESIGN', voucherName: 'Device voucher', voucherType: 'fixed', amountUsd: 50, percentValue: 0, minPurchaseUsd: 0, maxDiscountUsd: 50, applicableSkus: '[]', audience: 'all', claimSurfaces: '["home","store"]', startAt: 0, endAt: 0, popupEnabled: false, popupDelayMs: 300, popupCooldownHours: 1, popupMaxPerSession: 1, popupCadenceEnabled: false, popupLastSeenAt: 0, popupSessionCount: 0, nextEligibleAt: 0, stackWithTrial: false, stackWithOthers: false, splittable: false, definitionStatus: 'active', definitionDeleted: 0, grantStatus: 'UNCLAIMED', claimable: true, audienceEligible: true, popupEligible: false };

function fixture(url, locale, state) {
  if (url.pathname === '/api/content/trust/sections/current') return { ...authority, source: 'nx_trust_section_version:published', sections: ['financials', 'leadership', 'nexNarrative', 'complianceBadges', 'auditsReserves', 'listings'].map(sectionKey => ({ sectionKey, version: 'v1', description: 'UI review fixture', structure: 'Published resources', fields: [] })) };
  if (/^\/api\/content\/trust\/sections\/[^/]+\/view$/.test(url.pathname)) return null;
  if (url.pathname === '/api/promotions') return { items: [], nextCursor: null, hasMore: false };
  if (url.pathname === '/api/config/v-ranks') return { ...authority, source: 'nx_v_rank_config', prizeName: 'Ranks', capabilities: { peer: false, genesis: false }, ranks: Array.from({ length: 9 }, (_, v) => ({ v, title: `Level ${v}`, cnTitle: `等级 ${v}`, directBonus: .1, unilevelDepth: v + 1, peerBonus: 0, leadershipVotes: v, cultivationBonus: 0, selfBuyUSD: v * 100, directRefs: v, teamVolumeUSD: v * 1000, rewards: [{ type: 'NEX', amount: v * 10 }], visible: true })) };
  if (url.pathname === '/api/team/rank') return { ...authority, source: 'nx_team_member + server VRankPerformanceRepository', rankCode: 'V2', progress: { selfBuyUSD: 250, directRefs: 2, teamVolumeUSD: 2300, vDownlineCounts: {} } };
  if (url.pathname === '/api/app/profile') return { nickname: 'Alex', avatarUrl: '', avatarRevision: '', language: locale };
  if (url.pathname === '/api/app/home/overview') return { ...authority, source: 'server:nx_compute_receipt,nx_compute_task,nx_user_device,nx_compute_datacenter,nx_product,nx_growth_promo_banner', generatedAt: iso, accountScope: 'authenticated-account', earnings: { todayVsYesterdayPct: 0, ...Object.fromEntries(['today', 'week', 'month', 'all'].map(p => [p, { usdt: 16.24, nex: 3, jobCount: 10 }])) }, earningsLedgerMode: 'SETTLED', earningsLedger: [], marketBoard: { workloads: [], deviceRankings: [] }, doTheMath: null, weeklyPromo: null, onboarding: { cumulativePaidUsdt: 0, activeDevices: 0 }, onGrid: { clients: [], activeDevices: 0, activeJobs: 0, perSecUsdt: 0 } };
  if (url.pathname === '/api/config/platform') return { featureFlags: { computeShareEnabled: false, homeNewcomerTasksEnabled: false, homeWeeklyPromoEnabled: false }, publicStats: { version: 1, ...authority, source: 'server:nx_config_item,nx_user', realUserCount: 0 }, updatedAt: iso };
  if (url.pathname === '/api/devices/earnings') return { ...authority, source: 'nx_user_device + nx_compute_receipt + nx_compute_e3_config', dailyUsdt: 0, dailyNex: 0, realizedTodayUsdt: 16.24, realizedTodayNex: 3, walletUsdt: 0, walletNex: 0, userJoinedAt: now, serverNow: now, timezone: 'UTC', slotCap: 1, devices: [], capacitySchedule: {} };
  if (url.pathname === '/api/trial/state' || url.pathname === '/api/trial/eligibility') return state.offers ? trial : { ...trial, state: 'REDEEMED', claimNo: 'TRIAL-REVIEW', claimedAtEpochMs: now - 5000, expiresAtEpochMs: now - 1000, canStart: false, eligibilityReason: 'converted' };
  if (url.pathname === '/api/vouchers') return { vouchers: state.offers ? [voucher] : [], source: 'nx_growth_voucher + nx_growth_voucher_grant', serverCanonical: true, provenance: { ...authority, source: 'nx_growth_voucher' } };
  if (url.pathname === '/api/store/catalog') return { ...authority, source: 'nx_product', revision: null, products };
  if (url.pathname === '/api/store/purchase-eligibility') return { ...authority, runId: null, productNo: url.searchParams.get('productNo'), eligible: true, decisionCode: 'ELIGIBLE', policies: ['E1', 'F4B'].map(policy => ({ policy, eligible: true, decisionCode: 'ELIGIBLE', mode: 'ALL', conditions: [] })), evaluatedAt: now, source: 'nx_product + nx_admin_device_sku + nx_user' };
  if (url.pathname === '/api/orders') return { ...authority, source: 'server', orders: [] };
  if (url.pathname === '/api/notifications') return { items: state.messages ? [
    { id: 901, kind: 'system', priority: 'normal', title: '设备维护提醒', body: '本次维护已完成。你可以继续查看设备运行状态。', ctaLabel: '', ctaHref: '', createdAt: now - 60000, readAt: state.read ? now : null },
    { id: 902, kind: 'order', priority: 'high', title: '订单状态已更新', body: '查看当前订单和账户记录。', ctaLabel: '查看记录', ctaHref: '/pages/me/wallet', createdAt: now - 86400000, readAt: now },
  ] : [], nextCursor: null, unread: state.messages && !state.read ? 1 : 0 };
  if (url.pathname === '/api/notifications/901/read') { state.read = true; return null; }
  if (url.pathname === '/api/notifications/902/actions') return { notificationId: 902, action: 'cta', route: '/pages/me/wallet', recorded: true };
  return undefined;
}

await mkdir(OUTPUT, { recursive: true });
const browser = await chromium.launch();
const records = [], errors = [];
const variants = process.env.DESIGN_QUICK ? [[390, 'zh', 'dark']] : [320, 390].flatMap(width => ['zh', 'en', 'vi'].flatMap(locale => ['dark', 'light'].map(theme => [width, locale, theme])));
try {
  for (const [width, locale, theme] of variants) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 1, colorScheme: theme, reducedMotion: width === 320 ? 'reduce' : 'no-preference', hasTouch: true });
    const page = await context.newPage(), state = { offers: true, messages: false, read: false };
    page.on('pageerror', e => errors.push({ width, locale, theme, error: e.message }));
    await installFormalProbeSession(page, { responseFor: url => fixture(url, locale, state) });
    await page.addInitScript(({ locale, theme }) => {
      localStorage.setItem('nexgrid-locale-v1', JSON.stringify({ type: 'object', data: { code: locale, userSet: true } }));
      localStorage.setItem('nexgrid-theme-v1', JSON.stringify({ type: 'object', data: { mode: theme } }));
    }, { locale, theme });
    await page.goto(directAppUrl(BASE, '/pages/index/index'), { waitUntil: 'networkidle' });
    await page.locator('.home-benefits .vb-card').waitFor();
    await page.locator('.home-benefits .nx-trial-hero').waitFor();
    assert.equal(await page.locator('.vb-card').count(), 1, 'Home has exactly one voucher entry');
    await page.locator('.home-benefits').scrollIntoViewIfNeeded();
    const prefix = `${width}-${locale}-${theme}`;
    await page.screenshot({ animations: 'disabled', path: path.join(OUTPUT, `${prefix}-home.png`) });
    await page.locator('.home-benefits .vb-card').click();
    await page.waitForSelector('[role="dialog"]');
    await page.screenshot({ animations: 'disabled', path: path.join(OUTPUT, `${prefix}-voucher.png`) });
    // Reload verifies that opening an offer does not silently claim it.
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('.home-benefits .nx-trial-hero').waitFor();
    await page.locator('.home-benefits .nx-trial-hero').click();
    await page.waitForSelector('[role="dialog"]');
    await page.screenshot({ animations: 'disabled', path: path.join(OUTPUT, `${prefix}-trial.png`) });
    await page.goto(directAppUrl(BASE, '/pages/store/store'), { waitUntil: 'networkidle' });
    const card = page.locator('.product-card').first();
    await card.waitFor();
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ animations: 'disabled', path: path.join(OUTPUT, `${prefix}-store.png`) });
    const bounds = await card.evaluate(el => {
      const card = el.getBoundingClientRect(), media = el.querySelector('.product-media').getBoundingClientRect();
      return { cardWidth: card.width, mediaWidth: media.width, roundedInner: getComputedStyle(el.querySelector('.product-media')).borderRadius, animation: getComputedStyle(el.querySelector('.product-art')).animationName, nested: el.querySelectorAll('.nx-glass-card,.nx-glass-inset').length };
    });
    assert.ok(Math.abs(bounds.cardWidth - bounds.mediaWidth) < 1, 'Product image region fills the card width');
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
    await ranks.nth(8).click();
    await page.locator('#rank-details-8').waitFor();
    assert.equal(await page.locator('#rank-details-3').count(), 0);
    await ranks.nth(8).click();
    assert.equal(await page.locator('#rank-details-8').count(), 0);
    await ranks.nth(8).focus();
    await page.keyboard.press('Enter');
    await page.locator('#rank-details-8').waitFor();
    state.messages = true;
    await page.goto(directAppUrl(BASE, '/pages/me/notifications?section=notifications'), { waitUntil: 'networkidle' });
    await page.locator('.notification-row').first().waitFor();
    assert.equal(await page.locator('.notification-date').count(), 2);
    await page.screenshot({ animations: 'disabled', path: path.join(OUTPUT, `${prefix}-messages.png`) });
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
    records.push({ width, locale, theme, bounds });
    console.log(`PASS ${prefix}`);
    await context.close();
  }
} finally {
  await writeFile(path.join(OUTPUT, 'report.json'), JSON.stringify({ frontendFixtureOnly: true, records, errors }, null, 2));
  await browser.close();
}
assert.equal(errors.length, 0, JSON.stringify(errors));
console.log(`PASS ${records.length} variants; screenshots: ${OUTPUT}`);

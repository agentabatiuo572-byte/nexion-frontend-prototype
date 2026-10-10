// Frontend-only runtime witness. Every business HTTP/WS request is isolated by
// formal-probe-session; fixture values are UI test data, never backend acceptance.
// Usage: BASE_URL=http://127.0.0.1:5174 UI_AUDIT_OUTPUT=<outside repo> node scripts/ui-consistency-runtime.mjs
import { chromium } from "playwright";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import { directAppUrl } from "./lib/direct-app-url.mjs";
import { installFormalProbeSession } from "./lib/formal-probe-session.mjs";
import { INTERNAL_COPY_PATTERNS } from "./lib/public-copy-patterns.mjs";

const BASE = process.env.UNI_BASE_URL || process.env.BASE_URL || "http://127.0.0.1:5174";
const OUTPUT = process.env.UI_AUDIT_OUTPUT || path.join(os.tmpdir(), "ui-consistency-runtime");
const COLLECT_ONLY = process.argv.includes("--collect-only");
const NO_MATRIX = process.argv.includes("--no-matrix");
const manifest = JSON.parse(await readFile(new URL("../src/pages.json", import.meta.url), "utf8"));
const requested = process.env.UI_AUDIT_ROUTES?.split(",").filter(Boolean);
const excluded = process.env.UI_AUDIT_EXCLUDE_ROUTES?.split(",").filter(Boolean) || [];
const routes = manifest.pages.map((entry) => entry.path).filter((route) => (!requested || requested.includes(route)) && !excluded.includes(route));
const critical = ["pages/index/index", "pages/earn/earn", "pages/team/team", "pages/me/me", "pages/me/wallet", "pages/team/rank", "pages/store/store", "pages/store/detail", "pages/earn/device-detail"];
// Auth restoration deliberately leaves public entry/login pages for Home.
// Visit these using the real anonymous rail so their own DOM is actually read.
const anonymousRoutes = new Set(["pages/entry-surfaces/index", "pages/entry-surfaces/signed", "pages/entry-surfaces/h5", "pages/entry-surfaces/white", "pages/onboarding/intro", "pages/onboarding/terms", "pages/register/register", "pages/login/login", "pages/session/kicked", "pages/me/risk-disclosure", "pages/ref/code", "pages/tx/hash"]);
const QUERY = { "pages/store/detail": "id=stellarbox-s1", "pages/store/checkout": "product=stellarbox-s1", "pages/store/order-detail": "id=probe-order", "pages/earn/device-detail": "id=701", "pages/learn/course": "id=probe-course", "pages/support/chat": "cid=UI-CV-1", "pages/ref/code": "code=UI-PROBE", "pages/tx/hash": "hash=0xprobe", "pages/me/wallet-withdraw-tracking": "id=probe-withdrawal" };
// H5 redirects native phone setup to download guidance; the bank-card adapter redirects to its entry.
const REDIRECT = { "pages/me/wallet-cards": "pages/me/wallet-cards-new", "pages/onboarding/estimator": "pages/register/success", "pages/onboarding/connect": "pages/register/success" };
const NOW = Date.now();
const ISO = new Date(NOW).toISOString();
const runId = randomUUID();
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
async function sourceSnapshot() {
  const files = [];
  async function walk(dir) { for (const entry of await readdir(path.join(repoRoot, dir), { withFileTypes: true })) { const name = path.join(dir, entry.name); if (entry.isDirectory()) await walk(name); else files.push(name); } }
  await walk("src");
  files.push("scripts/ui-consistency-runtime.mjs", "scripts/lib/direct-app-url.mjs", "scripts/lib/formal-probe-session.mjs", "scripts/lib/probe-conversation-realtime.mjs", "scripts/lib/public-copy-patterns.mjs");
  const hash = createHash("sha256");
  for (const file of files.sort()) { hash.update(file.replaceAll("\\", "/")); hash.update("\0"); hash.update(await readFile(path.join(repoRoot, file))); hash.update("\0"); }
  return { head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim(), snapshotHash: hash.digest("hex"), files: files.length, at: new Date().toISOString() };
}
const sourceStart = await sourceSnapshot();
const walletArcContract = (() => {
  const original = execFileSync("git", ["show", "38ce507e:src/components/me/wallet-card.vue"], { cwd: repoRoot, encoding: "utf8" });
  const rules = text => [...text.matchAll(/\.nx-wallet-arc\s*\{[^}]*\}/g)].map(match => match[0].replace(/\s+/g, " ").trim());
  return { source: "38ce507e:src/components/me/wallet-card.vue", rules: rules(original), animation: original.match(/@keyframes wallet-arc-breathe\s*\{[\s\S]*?\}\s*\}/)?.[0].replace(/\s+/g, " ").trim(), rulesFor: rules };
})();
const AUTHORITY = { sourceEnvironment: "PRODUCTION", runId: "", serverCanonical: true };
const taskClasses = ["IG", "VG", "LL", "FT", "EM", "SP"].map((taskClass, i) => ({ taskId: `ui-${taskClass}`, taskClass, taskName: taskClass, models: ["UI Fixture Model"], minReward: 0.1, maxReward: 0.2, minVRAM: [4, 16, 8, 24, 8, 4][i], enabled: true, avgSec: 60, dailyPotential: i + 1 }));
const device = (productCode, id) => ({ id, rowVersion: 1, instanceNo: `UI-PROBE-${id}`, name: `UI ${productCode}`, deviceType: productCode === "phone" ? "MOBILE" : "GPU", productCode, status: "ACTIVE", runtimeStatus: "ONLINE", pendingDeactivate: false, activatedAt: NOW - 3600000, deactivatedAt: null, purchasedAt: NOW - 86400000, dailyUsdt: 1.2, dailyNex: 4, todayEarningsUsdt: 0.12, todayEarningsNex: 0.4, gpuModel: "UI Fixture GPU", capabilityTops: 10, capabilityTier: 2, vramTotalGb: 8, basePowerW: 100, location: "UI fixture", capacityPct: 100, capacityAgeMonths: 0, capacityConfigKey: "pro-v2", capacitySubsidized: false, capacitySubsidyDays: 0, capacitySubsidyRemainingDays: 0, capacitySubsidyEndsAt: null, actualPaidUsdt: 100, cumulativeOutputUsdt: 1 });
const fleet = { ...AUTHORITY, source: "nx_user_device + nx_compute_receipt + nx_compute_e3_config", dailyUsdt: 4.8, dailyNex: 16, realizedTodayUsdt: 0.48, realizedTodayNex: 1.6, walletUsdt: 1234.56, walletNex: 789, userJoinedAt: NOW - 86400000, serverNow: NOW, timezone: "UTC", slotCap: 6, devices: [device("phone", 701), device("pc-gpu", 702), device("stellarbox-s1", 703), device("cloud-share", 704)], capacitySchedule: { stageEarlyEnd: "3", stageMidEnd: "8", capacityFloorPct: "22", capacitySubsidyDays: "30", capacityBand1DeltaPct: "-4", capacityBand2DeltaPct: "-6", capacityBand3DeltaPct: "-23.7", capacityApplyToPhone: "false", capacityApplyToCloudShare: "false", capacityApplyToPcGpu: "false", capacityApplyToS1: "true", capacityApplyToPro: "true", capacityApplyToProV2: "true", capacityApplyToRackP1: "true", capacityApplyToRackP2: "true" } };
const product = { id: "stellarbox-s1", name: "UI Fixture S1", tier: "Entry", tagline: "UI fixture managed device", badge: null, productType: "DEVICE", inventoryMode: "FINITE", gpu: "UI Fixture GPU", vram: "8GB", power: "100W", datacenter: "UI Fixture", warranty: "UI fixture", hashRate: null, dailyEarn: 1.2, dailyEarnNEX: 4, price: 1000, sold: 0, stock: 1, features: ["UI fixture"], ai: null, status: "active", available: true, releaseState: null, releasePhaseId: null, unlocksAtPhase: null, purchaseGate: null };
const overview = { ...AUTHORITY, generatedAt: ISO, accountScope: "authenticated-account", source: "server:nx_compute_receipt,nx_compute_task,nx_user_device,nx_compute_datacenter,nx_product,nx_growth_promo_banner", earnings: { todayVsYesterdayPct: 5.2, today: { usdt: 0.48, nex: 1.6, jobCount: 1 }, week: { usdt: 4, nex: 8, jobCount: 9 }, month: { usdt: 5, nex: 10, jobCount: 12 }, all: { usdt: 6, nex: 11, jobCount: 13 } }, earningsLedgerMode: "SETTLED", earningsLedger: [{ id: "ui-earning", client: "UI Fixture Client", model: "UI Fixture Model", rewardUsdt: 0.1, completedAt: ISO, synthetic: false }], marketBoard: { workloads: taskClasses.map((task) => ({ code: task.taskClass, name: "UI workload", unit: "unit", price: 0.1, deltaPct: 1, sparkline: [1, 2, 1.5], flagshipDeltaPct: null })), deviceRankings: [{ rank: 1, name: "UI Fixture S1", kind: "stellarbox-s1", bestFor: "images", dailyUsdt: 1.2 }] }, doTheMath: { basis: "OWNED_DEVICE_TO_NEXT_CATALOG_PRODUCT", base: { kind: "phone", name: "Your phone", dailyUsdt: 0.06 }, target: { productNo: "stellarbox-s1", kind: "stellarbox-s1", name: "UI Fixture S1", dailyUsdt: 1.2, priceUsdt: 1000 }, multiplier: 20, paybackDays: 833 }, weeklyPromo: null, onboarding: { cumulativePaidUsdt: 100, activeDevices: 4 }, onGrid: { clients: [{ id: "UI", name: "UI Fixture Client", model: "UI Fixture Model", city: "UI Fixture", gpus: 4 }], activeDevices: 4, activeJobs: 1, perSecUsdt: 0.001 } };
const platform = { featureFlags: { computeShareEnabled: true, homeNewcomerTasksEnabled: false, homeWeeklyPromoEnabled: false }, share: { baseUrl: "https://ui-probe.invalid/ref/", channels: [], appDownload: { officialUrl: "", iosUrl: "", androidUrl: "", apkUrl: "", version: "", releaseNotes: { zh: "", en: "" }, source: "unavailable" } }, publicStats: { version: 1, ...AUTHORITY, source: "server:nx_config_item,nx_user", realUserCount: 4 }, onlineBonus: { h5BaseFactor: 0.6, continuityFullHours: 24 }, computerCompute: { domain: "E6", flags: [{ key: "computeShareEnabled", enabled: true }], coefficients: [{ key: "h5BaseFactor", value: 0.6 }, { key: "continuityFullHours", value: 24 }], yieldEstimate: [{ key: "topsBaseline", value: 100 }, { key: "dailyUsdtPerBaseline", value: 0.24 }, { key: "nexPerUsdt", value: 10 }], gpuTiers: ["G1", "G2", "G3", "G4", "G5", "G6"].map((id, i) => ({ id, label: `UI ${id}`, tops: (i + 1) * 100, keywords: [{ slot: "keyword1", value: `UI ${id}` }] })), download: { url: "https://ui-probe.invalid/agent-fixture.zip", zhTitle: "测试下载入口", zhGuide: "前端验收数据，不下载或安装", enTitle: "UI fixture download", enGuide: "Frontend fixture; no installer download or native execution" }, sources: ["e6.compute_config"] }, updatedAt: ISO };

export function uiFixture(url, request, locale = "en") {
  if (url.pathname === "/api/app/support/conversations/UI-CV-1" || url.pathname === "/api/app/support/conversations/UI-CV-1/read") return { conversation: { conversationNo: "UI-CV-1", conversationType: "support", status: "CLOSED", version: 2, ownerAgentName: "UI Agent", unreadCount: 0, lastMessage: "UI fixture reply", lastMessageAt: ISO }, messages: [{ id: 1, senderType: "user", content: "UI fixture question", createdAt: ISO, receiptStatus: "read" }, { id: 2, senderType: "agent", content: "UI fixture reply", createdAt: ISO, receiptStatus: "read" }], historyTruncated: false, nextCursor: null };
  if (request.method() !== "GET") return undefined;
  if (url.pathname === "/api/app/support/conversations/cursor") return { total: 1, pageSize: 100, records: [{ id: 1, conversationNo: "UI-CV-1", conversationType: "support", status: "CLOSED", version: 2, ownerAgentName: "UI Agent", unreadCount: 0, lastMessage: "UI fixture reply", lastMessageAt: ISO }] };
  if (url.pathname === "/api/app/support/conversation-categories") return [{ type: "advisor", enabled: false }, { type: "support", enabled: true }, { type: "ai", enabled: false }];
  if (url.pathname === "/api/app/support/advisor") return { assignmentId: null, currentAdvisorId: null, currentAdvisorName: null, assignmentState: "UNBOUND", availability: "UNBOUND" };
  if (url.pathname === "/api/app/support/attachments/policy") return { available: false, allowedMimeTypes: [], maxBytes: null, maxPixels: null, ttlSeconds: null, unavailableReason: "UI fixture" };
  if (url.pathname === "/api/app/profile") return { nickname: "UI Fixture", avatarUrl: "", avatarRevision: "", language: locale };
  if (url.pathname === "/api/devices/earnings") return fleet;
  if (url.pathname === "/api/app/home/overview") return overview;
  if (url.pathname === "/api/store/catalog") return { ...AUTHORITY, source: "nx_product", revision: null, products: [product] };
  if (url.pathname === "/api/store/purchase-eligibility") return { productNo: url.searchParams.get("productNo"), eligible: true, decisionCode: "ELIGIBLE", policies: ["E1", "F4B"].map(policy => ({ policy, eligible: true, decisionCode: "ELIGIBLE", mode: "ALL", conditions: [] })), evaluatedAt: NOW, source: "nx_product + nx_admin_device_sku + nx_user", ...AUTHORITY, runId: null };
  if (url.pathname === "/api/product/phase") return { phase: "P1", source: "H1_GROWTH_RHYTHM", devOverrideAllowed: false };
  if (url.pathname === "/api/config/platform") return platform;
  if (url.pathname === "/api/config/referral-rewards") return { enabled: true, welcomeGift: { lockMode: "risk_bucket", usdtAmount: 0, nexAmount: 0 }, inviterReward: { nexAmount: 10 }, rhythmMonth: 1, newcomerMultiplier: 1, inviterMultiplier: 1, effectiveAt: ISO, sources: ["nx_user.sponsor_user_id"] };
  if (url.pathname === "/api/config/task-pricing") return { taskClasses, queueSaturation: 0.7, teaser: [], effectiveAt: ISO, sources: ["UI runtime fixture"] };
  if (url.pathname === "/api/config/phone-tiers") return { tiers: [1, 2, 3, 4, 5].map(tier => ({ tier, name: `UI Tier ${tier}`, baseRateUsdt: tier * 0.1, baseRateNex: tier, effectiveAt: ISO })), sources: ["UI runtime fixture"] };
  if (url.pathname === "/api/tasks/route") { const deviceVramGb = Number(url.searchParams.get("deviceVramGb")); const eligible = taskClasses.filter(task => task.minVRAM <= deviceVramGb); return { routable: eligible.length > 0, deviceVramGb, selectedTask: eligible[0] || null, eligibleTaskClasses: eligible.map(task => task.taskClass), queueSaturation: 0.7, effectiveAt: ISO, sources: ["UI runtime fixture"] }; }
  if (url.pathname === "/api/tasks/assignments") return { ...AUTHORITY, source: "server", serverNow: NOW, devices: [{ deviceId: 701, instanceNo: "UI-PROBE-701", deviceType: "MOBILE", lockUntil: null, currentTask: null, recentTasks: [{ ...AUTHORITY, source: "server", taskNo: "UI-TASK-1", deviceId: 701, taskId: "ui-IG", taskName: "Image Gen", taskClass: "IG", model: "UI Fixture Model", client: "UI Fixture Client", status: "COMPLETED", rewardUsdt: 0.25, requiredSeconds: 60, startedAt: new Date(NOW - 120000).toISOString(), completableAt: new Date(NOW - 60000).toISOString(), completedAt: ISO, receiptNo: "UI-RECEIPT-1", proofNonce: null, proofExpiresAt: null }] }] };
  if (url.pathname === "/api/earnings/release-status") return { buckets: { withdrawable: 1234.56, pending_review: 12.34, bonus_locked: 56.78 }, assets: {}, releaseMode: "manual_only", attestedOnlineSeconds: 0, requiredAttestationSeconds: 0, clusterRestricted: false, serverCanonical: true };
  if (url.pathname === "/api/app/wallet/bills/summary") return { source: "server", sourceEnvironment: "PRODUCTION", timeZone: "UTC", asOf: ISO, rewardsUsdt: 0.48, rewardsNex: 1.6, latestRewardAt: ISO, todayNexEarn: 1.6, pendingNex: 0, monthBillCount: 2, recentNexBills: [] };
  if (url.pathname === "/api/app/wallet/bills") return { source: "server", sourceEnvironment: "PRODUCTION", bills: [], page: 1, pageSize: 50, total: 0, nextPage: null, nextCursor: null };
  if (url.pathname === "/api/config/market/nex") return { asset: "NEX", currency: "USDT", currentPrice: 0.125, costBasis: 0.085, sparkline: [0.11, 0.12, 0.13, 0.12, 0.14, 0.13, 0.125], history: [], historyMaxDays: 365, ...AUTHORITY, source: "G3 weekly_curve + nx_price_index sampled history" };
  if (url.pathname === "/api/config/v-ranks") return { ...AUTHORITY, source: "nx_v_rank_config", prizeName: "UI Ranks", capabilities: { peer: false, genesis: false }, ranks: Array.from({ length: 13 }, (_, v) => ({ v, title: `V${v}`, cnTitle: `V${v}`, directBonus: 0.1, unilevelDepth: 1, peerBonus: 0, leadershipVotes: 0, cultivationBonus: 0, rewards: [], visible: true })) };
  if (url.pathname === "/api/team/rank") return { ...AUTHORITY, source: "nx_team_member + server VRankPerformanceRepository", rankCode: "V2", progress: { selfBuyUSD: 100, directRefs: 2, teamVolumeUSD: 300, vDownlineCounts: {} } };
  if (url.pathname === "/api/app/team/network") return { ...AUTHORITY, source: "server", totalMembers: 1, directMembers: 1, activeMembers: 1, monthVolumeUsdt: 12.5, lifetimeVolumeUsdt: null, members: [{ id: "42", name: "UI Member", avatarUrl: null, vRank: 1, layer: 1, leg: "A", joinedAt: ISO, monthVolumeUsdt: 12.5, lifetimeVolumeUsdt: null, status: "ACTIVE", region: "SG" }], nextCursor: null, generatedAt: ISO };
  if (url.pathname === "/api/app/referral-rewards") return { referralCode: "UI-PROBE", rewardEnabled: true, inviterRewardNex: 10, invitedCount: 2, pendingCount: 1, settledCount: 1, lifetimeInviterNex: 10, walletNexAvailable: 789, limit: 10, source: "ledger", sourceEnvironment: "PRODUCTION", runId: null, factSources: ["nx_referral_reward_settlement", "nx_wallet_ledger", "nx_earnings_release_entry", "nx_user_wallet"], refreshedAt: ISO, recentRewards: [{ settlementNo: "UI-SET-1", amountNex: 10, ledgerStatus: "SUCCESS", balanceAfter: 789, releaseBucket: "withdrawable", sourceEnvironment: "PRODUCTION", settledAt: ISO }] };
  if (url.pathname === "/api/orders") return { ...AUTHORITY, source: "server", runId: null, orders: [] };
  if (url.pathname === "/api/notifications") return { items: [], nextCursor: null, unread: 0 };
  return undefined;
}

await mkdir(OUTPUT, { recursive: true });
const records = [], failures = [];
for (const route of requested || []) if (!manifest.pages.some(entry => entry.path === route)) failures.push({ message: `Requested route is not in pages.json: ${route}` });
if (!routes.length) failures.push({ message: "No manifest route was selected; an empty run cannot pass acceptance" });
let assertionCount = 0, visitSequence = 0;
const check = (condition, message, record) => { assertionCount++; record.assertions = (record.assertions || 0) + 1; if (!condition) failures.push({ message, route: record.route, theme: record.theme, locale: record.locale, width: record.width, motion: record.motion }); };
const browser = await chromium.launch();
const screenshot = async (page, record, suffix) => { const name = `${record.width}-${record.locale}-${record.theme}-${record.motion}-${record.route.replaceAll("/", "-")}-${suffix}.png`; await page.screenshot({ path: path.join(OUTPUT, name) }); record.screenshots.push(name); };
async function scrollTo(page, route, top) { await page.evaluate(({ route, top }) => { const root = document.querySelector(`uni-page[data-page="${route}"]`), scroller = root?.querySelector(".nx-content") || document.scrollingElement; scroller.scrollTop = top; }, { route, top }); }
async function waitHeaderTitles(page, record, hidden) {
  await page.waitForFunction(({ route, hidden }) => { const root = document.querySelector(`uni-page[data-page="${route}"]`); const titles = [...(root?.querySelectorAll(".spv-titlewrap,.nx-nav-titlewrap") || [])]; return titles.length > 0 && titles.every(el => { const cs = getComputedStyle(el); return cs.opacity === (hidden ? "0" : "1") && cs.visibility === (hidden ? "hidden" : "visible"); }); }, { route: record.actualRoute, hidden }, { timeout: 3000 });
  check(true, hidden ? "Header titles hide on scroll" : "Header titles restore at top", record);
}

async function cachedHeaderReturn(page, record) {
  const departureTop = await page.evaluate(route => document.querySelector(`uni-page[data-page="${route}"] .nx-content`).scrollTop, record.route);
  await page.evaluate(() => new Promise((resolve, reject) => uni.navigateTo({ url: "/pages/me/wallet", success: resolve, fail: reject })));
  const target = page.locator('uni-page[data-page="pages/me/wallet"] .spv-back');
  await target.waitFor({ state: "visible" });
  await target.click();
  await page.waitForFunction(route => { const root = document.querySelector(`uni-page[data-page="${route}"]`); return location.hash.includes(route) && root?.getBoundingClientRect().height > 0; }, record.route);
  const state = await page.evaluate(route => { const root = document.querySelector(`uni-page[data-page="${route}"]`); const scroller = root.querySelector(".nx-content"); const title = root.querySelector(".spv-titlewrap,.nx-nav-titlewrap"); return { scrollTop: scroller.scrollTop, opacity: getComputedStyle(title).opacity, visibility: getComputedStyle(title).visibility }; }, record.route);
  await page.waitForFunction(route => { const root = document.querySelector(`uni-page[data-page="${route}"]`), top = root.querySelector(".nx-content").scrollTop, title = root.querySelector(".spv-titlewrap,.nx-nav-titlewrap"), style = getComputedStyle(title); return top >= 16 ? style.opacity === "0" && style.visibility === "hidden" : top <= 8 ? style.opacity === "1" && style.visibility === "visible" : true; }, record.route, { timeout: 3000 });
  record.checks.cachedReturn = { departureTop, ...state, scrollRetained: Math.abs(state.scrollTop - departureTop) <= 1, interpretation: Math.abs(state.scrollTop - departureTop) <= 1 ? "retained scroll position and title synchronized" : "existing navigation resets scroll; title synchronized to returned position, no scroll-retention claim", afterSettling: await page.evaluate(route => { const root = document.querySelector(`uni-page[data-page="${route}"]`), title = root.querySelector(".spv-titlewrap,.nx-nav-titlewrap"); return { scrollTop: root.querySelector(".nx-content").scrollTop, opacity: getComputedStyle(title).opacity, visibility: getComputedStyle(title).visibility }; }, record.route) };
  check(departureTop >= 16, "Cache exercise departed without a hidden-title scroll position", record);
  await screenshot(page, record, "cached-return");
}

async function shareInteractions(page, record) {
  const mode = record.width === 320 && record.locale === "en" ? "Enter" : record.width === 320 && record.locale === "zh" ? "Space" : "click";
  const activate = async selector => { const locator = page.locator(selector); if (mode === "click") { if (await locator.getAttribute("aria-disabled") === "true") { const box = await locator.boundingBox(); if (!box) throw new Error(`Disabled action lacks a real hit target: ${selector}`); await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); } else await locator.click(); } else { await locator.focus(); await locator.press(mode); } };
  await page.evaluate(() => { window.__uiClipboard = []; window.__uiClipboardFail = false; window.__uiOriginalClipboard = uni.setClipboardData; uni.setClipboardData = options => { window.__uiClipboard.push(options.data); if (window.__uiClipboardFail) options.fail?.({ errMsg: "UI fixture clipboard unavailable" }); else options.success?.({ errMsg: "setClipboardData:ok" }); }; });
  try {
    await activate(".nx-team-share-now");
    await page.locator(".ss-sheet").waitFor({ state: "visible" });
    await screenshot(page, record, "share-channel");
    await page.locator(".ss-head__x").click();
    await page.locator(".ss-root").waitFor({ state: "hidden" });
    await activate(".nx-team-share-poster");
    await page.locator(".ps-sheet").waitFor({ state: "visible" });
    await screenshot(page, record, "share-poster");
    await page.locator(".ps-head__x").click();
    await page.locator(".ps-root").waitFor({ state: "hidden" });
    const originalCode = await page.locator(".nx-team-copy-code").innerText();
    const originalLink = await page.locator(".nx-team-copy-link").innerText();
    const shareWritesBeforeCopy = record.requests.filter(request => request.path === "/api/share/event" && request.method !== "GET").length;
    await activate(".nx-team-copy-code");
    await page.waitForFunction(original => document.querySelector(".nx-team-copy-code").innerText !== original, originalCode);
    await activate(".nx-team-copy-link");
    await page.waitForFunction(original => document.querySelector(".nx-team-copy-link").innerText !== original, originalLink);
    const copied = await page.evaluate(() => window.__uiClipboard);
    check(copied.length === 2 && copied[0] === "UI-PROBE" && copied[1] === "https://ui-probe.invalid/ref/UI-PROBE", "Copy handlers did not copy the canonical code/link", record);
    check(record.requests.filter(request => request.path === "/api/share/event" && request.method !== "GET").length === shareWritesBeforeCopy, "Copy actions incorrectly report a social-share business event", record);
    await screenshot(page, record, "share-copy");
    record.checks.shareActions = { activation: mode, shareSheet: true, posterSheet: true, copied };
    // Reload resets the success labels, then deny only the clipboard adapter.
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector(".nx-team-copy-code")?.getAttribute("aria-disabled") === "false");
    await page.evaluate(() => { window.__uiClipboard = []; window.__uiClipboardFail = true; window.__uiOriginalClipboard = uni.setClipboardData; uni.setClipboardData = options => { window.__uiClipboard.push(options.data); options.fail?.({ errMsg: "UI fixture clipboard unavailable" }); }; });
    const failCodeLabel = await page.locator(".nx-team-copy-code").innerText(), failLinkLabel = await page.locator(".nx-team-copy-link").innerText();
    await activate(".nx-team-copy-code"); await activate(".nx-team-copy-link");
    await page.waitForFunction(() => window.__uiClipboard.length === 2);
    check(await page.locator(".nx-team-copy-code").innerText() === failCodeLabel && await page.locator(".nx-team-copy-link").innerText() === failLinkLabel, "Clipboard failure incorrectly shows copied success", record);
    record.checks.clipboardFailure = { labelsUnchanged: true, attempted: 2, toast: await page.locator(".nx-toast-host").innerText() };
    // A failed referral read produces the genuine disabled state; no direct
    // mutation of component/store state is used to manufacture that branch.
    const referralMatcher = url => url.pathname === "/api/app/referral-rewards";
    const denied = route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 503, message: "UI fixture unavailable", data: null }) });
    await page.route(referralMatcher, denied);
    try {
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.querySelectorAll(".invite-card__actions > [aria-disabled=true]").length === 4);
      await page.evaluate(() => { window.__uiClipboard = []; window.__uiOriginalClipboard = uni.setClipboardData; uni.setClipboardData = options => { window.__uiClipboard.push(options.data); options.success?.({}); }; });
      const writesBefore = record.requests.filter(request => request.method !== "GET").length;
      for (const selector of [".nx-team-share-now", ".nx-team-share-poster", ".nx-team-copy-code", ".nx-team-copy-link"]) await activate(selector);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const noExtraAction = await page.evaluate(() => !document.querySelector(".ss-root,.ps-root") && window.__uiClipboard.length === 0);
      check(noExtraAction, "Disabled share action opened a dialog or copied content", record);
      check(record.requests.filter(request => request.method !== "GET").length === writesBefore, "Disabled share actions emitted a business mutation", record);
      check(await page.locator(".invite-card__retry").isVisible() && await page.locator(".invite-card__amount").count() === 0, "Referral error omits retry or promises a reward", record);
      record.checks.shareDisabled = { activation: mode, allFourDisabled: true, dialogs: 0, clipboardCalls: 0 };
      await screenshot(page, record, "share-disabled");
    } finally { await page.unroute(referralMatcher, denied); }
  } finally { await page.evaluate(() => { if (window.__uiOriginalClipboard) uni.setClipboardData = window.__uiOriginalClipboard; }); }
}

async function rewardStates(page, record) {
  const matcher = url => url.pathname === "/api/app/referral-rewards";
  const enabled = uiFixture(new URL(`${BASE}/api/app/referral-rewards`), { method: () => "GET" });
  const ready = () => page.waitForFunction(() => document.querySelector(".nx-team-copy-code")?.getAttribute("aria-disabled") === "false" && document.querySelector(".invite-card__reward")?.getAttribute("aria-busy") === "false");
  check((await page.locator(".invite-card__reward-line").innerText()).replace(/\s+/g, " ").includes("10 NEX"), "Enabled referral reward amount/unit is absent from the actual card", record);
  record.checks.rewardEnabled = { rewardEnabled: true, inviterRewardNex: 10, text: await page.locator(".invite-card__reward").innerText() };
  const disabled = route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, message: "OK", data: { ...enabled, rewardEnabled: false, inviterRewardNex: 0 } }) });
  await page.route(matcher, disabled);
  try {
    await page.reload({ waitUntil: "domcontentloaded" }); await ready();
    const state = await page.locator(".invite-card__reward").innerText();
    check(await page.locator(".invite-card__amount").count() === 0 && state.trim().length > 0 && await page.locator(".invite-card__actions > [aria-disabled=false]").count() === 4, "Disabled reward gate promises a new reward or disables permitted sharing", record);
    record.checks.rewardGateDisabled = { rewardEnabled: false, inviterRewardNex: 0, historicalRewardRetained: true, text: state, shareActionsEnabled: 4 };
    await screenshot(page, record, "reward-disabled");
  } finally { await page.unroute(matcher, disabled); }
  // Hold the actual API response to witness loading; never overwrite a store.
  let release;
  const responseGate = new Promise(resolve => { release = resolve; });
  const pending = async route => { await responseGate; await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 0, message: "OK", data: enabled }) }); };
  await page.route(matcher, pending);
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector(".invite-card__reward")?.getAttribute("aria-busy") === "true" && document.querySelectorAll(".invite-card__actions > [aria-disabled=true]").length === 4);
    check(await page.locator(".invite-card__amount").count() === 0, "Loading referral response advertises an unavailable reward", record);
    record.checks.rewardLoading = { realRequestPending: true, ariaBusy: true, rewardAmountAbsent: true, text: await page.locator(".invite-card__reward").innerText() };
    await screenshot(page, record, "reward-loading");
    release(); await ready();
  } finally { release(); await page.unroute(matcher, pending); }
}

async function collectDOM(page) {
  return page.evaluate(() => {
    const route = location.hash.slice(2).split("?")[0];
    const root = [...document.querySelectorAll("uni-page")].find(el => el.dataset.page === route && el.getBoundingClientRect().height > 0) || [...document.querySelectorAll("uni-page")].at(-1) || document.body;
    const visible = el => { const cs = getComputedStyle(el), r = el.getBoundingClientRect(); return cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 && r.height > 0; };
    const read = el => { const cs = getComputedStyle(el), r = el.getBoundingClientRect(); return { class: el.className, text: el.innerText?.trim().slice(0, 100), role: el.getAttribute("role"), bg: cs.backgroundColor, image: cs.backgroundImage, nestedStaticCard: Boolean(el.parentElement?.closest(".nx-glass-card")), radius: cs.borderRadius, shadow: cs.boxShadow, backdrop: cs.backdropFilter, opacity: cs.opacity, visibility: cs.visibility, hidden: el.getAttribute("data-hidden"), borderBottom: cs.borderBottomWidth, width: r.width, height: r.height, x: r.x, y: r.y }; };
    const scroller = root.querySelector(".nx-content") || document.scrollingElement;
    const headers = [...root.querySelectorAll(".spv,.nx-navheader")].map(el => ({ ...read(el), title: el.querySelector(".spv-titlewrap,.nx-nav-titlewrap") ? read(el.querySelector(".spv-titlewrap,.nx-nav-titlewrap")) : null, controls: [...el.querySelectorAll(".spv-glass,.nx-nav-glass")].map(read) }));
    const surfaces = [...root.querySelectorAll(".nx-glass-card:not(.nx-wallet-summary):not(.nx-glass-hero),.nx-home-glass-panel,.nx-earn-market-board,.nx-earn-task-center,.nx-device-detail__surface")].filter(visible).map(read);
    const colorProbe = document.createElement("span"); colorProbe.style.cssText = "position:absolute;visibility:hidden;background:var(--v5-content-surface)"; root.append(colorProbe); const contentSurface = getComputedStyle(colorProbe).backgroundColor; colorProbe.remove();
    const listSurfaces = [...root.querySelectorAll(".earn-fleet-list > .nx-home-glass-panel,.nx-earn-market-board,.nx-earn-task-center,.nx-device-detail__surface")].map(read);
    const listRows = [...root.querySelectorAll(".nx-device-card,.earn-history-row,.nx-earn-market-board .py-2\\.5")].map(read);
    const all = [...root.querySelectorAll("*")].filter(visible);
    const overflow = all.filter(el => { const r = el.getBoundingClientRect(); if (!el.innerText?.trim() || r.width < 20 || r.height < 12 || (r.x >= -2 && r.right <= innerWidth + 2)) return false; let parent = el.parentElement; while (parent && parent !== root) { const cs = getComputedStyle(parent); if (!parent.classList.contains("nx-content") && ["auto", "scroll", "hidden", "clip"].includes(cs.overflowX)) return false; parent = parent.parentElement; } return !el.closest("svg,.nx-wallet-arc,.gen-anim"); }).map(read);
    return { actualRoute: root.getAttribute("data-page"), actualTheme: document.documentElement.dataset.theme, body: root.innerText, accessibilityCopy: [...root.querySelectorAll('[aria-label],[title],[placeholder],[alt]')].flatMap(el => ['aria-label', 'title', 'placeholder', 'alt'].map(name => el.getAttribute(name)).filter(Boolean)), scrollTop: scroller?.scrollTop, scrollHeight: scroller?.scrollHeight, clientHeight: scroller?.clientHeight, headers, surfaces, contentSurface, listSurfaces, listRows, overflow, devices: root.querySelectorAll(".nx-device-card").length, marketRows: root.querySelector(".nx-earn-market-board")?.innerText, historyRows: root.querySelectorAll(".earn-history-row").length, shareButtons: [...root.querySelectorAll(".invite-card__actions > [role=button]")].map(read), walletParticles: [...root.querySelectorAll("[data-wallet-particle]")].map(el => ({ ...read(el), animation: getComputedStyle(el).animationName, duration: getComputedStyle(el).animationDuration, pointerEvents: getComputedStyle(el).pointerEvents, transform: getComputedStyle(el).transform })), walletArc: [...root.querySelectorAll(".nx-wallet-arc")].map(el => { const cs = getComputedStyle(el); return { ...read(el), cssWidth: cs.width, cssHeight: cs.height, bottom: cs.bottom, right: cs.right, transform: cs.transform, animation: cs.animationName, duration: cs.animationDuration, pointerEvents: cs.pointerEvents }; }), walletGrid: root.querySelectorAll(".nx-wallet-grid").length, walletAurora: root.querySelectorAll(".nx-wallet-aurora").length };
  });
}

async function visit(page, route, variant) {
  const record = { runId, sourceSnapshotHash: sourceStart.snapshotHash, route, ...variant, screenshots: [], errors: [], requestFailures: [], requests: [], checks: {} };
  const onError = error => record.errors.push(error.message);
  const onConsole = message => { if (message.type() === "error" && message.location().url.startsWith(BASE)) record.errors.push(message.text()); };
  const onRequest = request => { const url = new URL(request.url()); if (/^\/(?:api|auth)\//.test(url.pathname)) record.requests.push({ path: url.pathname, method: request.method(), fixtureIsolated: true }); };
  const onRequestFailure = request => record.requestFailures.push({ path: new URL(request.url()).pathname, error: request.failure()?.errorText, navigationCancelled: request.failure()?.errorText === "net::ERR_ABORTED" });
  page.on("pageerror", onError); page.on("console", onConsole); page.on("request", onRequest); page.on("requestfailed", onRequestFailure);
  try {
    // Give each route a fresh document; explicit cachedHeaderReturn below is
    // the only intended cache exercise, so hidden old pages cannot fool probes.
    const targetUrl = new URL(directAppUrl(BASE, route + (QUERY[route] ? `?${QUERY[route]}` : "")));
    targetUrl.searchParams.set("ui_probe_visit", `${runId}-${++visitSequence}`);
    await page.goto(targetUrl.toString(), { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector("uni-page") && document.body.innerText.trim().length > 0, {}, { timeout: 30000 });
    await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
    if (route === "pages/onboarding/intro") await page.waitForFunction(() => {
      const cta = document.querySelector(".intro-cta");
      return cta && getComputedStyle(cta).opacity === "1";
    }, {}, { timeout: 5000 });
    Object.assign(record, await collectDOM(page));
    record.targetStatus = record.actualRoute === route ? "requested route rendered" : "redirect witnessed; original target surface remains unverified";
    if (process.env.UI_AUDIT_DEBUG_STATE === "1") record.debugState = await page.evaluate(async () => { const { useApp } = await import("/src/store/app.ts"); const { productCatalogState } = await import("/src/store/product-catalog.ts"); const { useBills } = await import("/src/store/bills.ts"); const { useMarket } = await import("/src/store/market.ts"); const app = useApp(), bills = useBills(), market = useMarket(); return { home: app.homeTruthStatus, homeError: app.homeTruthError, fleet: app.remoteFleetStatus, catalog: { ...productCatalogState }, bills: bills.summaryStatus, billsError: bills.summaryError, market: market.remoteReady, marketError: market.remoteError }; });
    await screenshot(page, record, "top");
    check(record.actualRoute === (REDIRECT[route] || route), `Unexpected route: ${record.actualRoute}`, record);
    check(record.actualTheme === variant.theme, `Theme was not persisted: ${record.actualTheme}`, record);
    check(record.errors.length === 0, `Browser errors: ${record.errors.join(" | ")}`, record);
    check(record.overflow.length === 0, "Unclipped text or controls overflow the viewport", record);
    const publicText = [record.body, ...record.accessibilityCopy].join("\n");
    check(!INTERNAL_COPY_PATTERNS.some(pattern => pattern.test(publicText)), "Internal implementation narration is visible", record);
    if (!COLLECT_ONLY) {
      for (const surface of record.surfaces) { const c = surface.bg.match(/[\d.]+/g)?.map(Number); if (c && c[3] !== 0) check(Math.max(...c.slice(0, 3)) - Math.min(...c.slice(0, 3)) <= 3, `Static card still has colored background: ${surface.class} ${surface.bg}`, record); if (route === "pages/team/team" && surface.class.split(/\s+/).includes("invite-card")) record.checks.inviteKeyDisplay = { ownerSelectedOriginalH5: true, background: surface.bg, image: surface.image, interpretation: "Original H5 invitation key display deliberately retains its decorative gradients; other static cards still use the flat-surface gate" }; else check(surface.image === "none", `Static card still paints a background image: ${surface.class}`, record); }
      for (const header of record.headers) {
        check(header.bg === "rgba(0, 0, 0, 0)" && header.image === "none" && header.backdrop === "none", `Header still paints a strip: ${header.class}`, record);
        for (const control of header.controls) check(parseFloat(control.radius) >= Math.min(control.width, control.height) / 2 - 1 && Math.abs(control.width - control.height) <= 1, `Header control is not circular: ${control.class}`, record);
      }
      const maxTop = Math.max(0, record.scrollHeight - record.clientHeight);
      if (record.headers.length && maxTop >= 40) {
        await scrollTo(page, record.actualRoute, 40);
        await waitHeaderTitles(page, record, true);
        record.checks.scrolledHeaders = (await collectDOM(page)).headers;
        await screenshot(page, record, "header-hidden");
        await scrollTo(page, record.actualRoute, 20);
        await waitHeaderTitles(page, record, true);
        record.checks.headerUpwardScroll = "still hidden at 20px while scrolling upward";
        if (route === "pages/team/rank" || route === "pages/store/detail") await cachedHeaderReturn(page, record);
        await scrollTo(page, record.actualRoute, 0);
        await waitHeaderTitles(page, record, false);
        record.checks.headerScroll = "hidden at 40px; visible after returning to 0px";
      } else if (record.headers.length) record.checks.headerScroll = "page has insufficient content to scroll; geometry covered";
      if (route === "pages/earn/earn") {
        check(record.devices === 4, `Populated fleet was not rendered: ${record.devices}`, record);
        check(record.surfaces.some(surface => surface.class.includes("nx-earn-market-board")) && record.marketRows?.includes("UI"), "Market board populated rows missing", record);
        check(record.historyRows === 1, "Task history populated row missing", record);
        check(record.listSurfaces.length === 3, "Fleet/market/task outer surfaces were not all present", record);
      }
      if (route === "pages/earn/device-detail") check(record.listSurfaces.length === 1 && record.devices === 1, "Valid deviceId did not render its device-detail surface and row", record);
      for (const surface of record.listSurfaces) check(surface.bg === record.contentSurface && surface.image === "none" && surface.backdrop === "none", `List surface does not paint the canonical flat card: ${surface.class}`, record);
      for (const row of record.listRows) check(row.bg === "rgba(0, 0, 0, 0)" && row.image === "none", `List row paints a second card background: ${row.class}`, record);
      if (route === "pages/store/detail") check(record.body.includes("UI Fixture S1"), "Product detail populated catalog missing", record);
      if (route === "pages/team/rank") check(record.body.includes("V12"), "Rank ladder did not render all 13 configured ranks", record);
      if (route === "pages/team/team") {
        check(record.shareButtons.length === 4, "Four share actions missing", record);
        // Owner selected the original H5 card: its primary brand CTA differs
        // from the three tools. Preserve that hierarchy and four usable targets.
        check(record.shareButtons.every(button => button.width >= 44 && button.height >= 44), "Original H5 share tools do not provide four 44px targets", record);
        const order = ["nx-team-share-poster", "nx-team-copy-code", "nx-team-copy-link", "nx-team-share-now"];
        check(record.shareButtons.every((button, index) => button.class.includes(order[index])), "Original H5 share tool order changed", record);
        const labels = await page.evaluate(() => [...document.querySelectorAll(".invite-card__actions > [role=button]")].map(button => { const rect = button.getBoundingClientRect(), label = button.querySelector("uni-text"), text = label?.getBoundingClientRect(); return { label: label?.innerText, width: rect.width, height: rect.height, font: label ? getComputedStyle(label).fontSize : null, fits: !label || Boolean(text && text.left >= rect.left - 1 && text.right <= rect.right + 1 && text.top >= rect.top - 1 && text.bottom <= rect.bottom + 1 && label.scrollWidth <= label.clientWidth + 1) }; }));
        check(labels.length === 4 && labels.every(label => label.fits), "One of the original H5 share labels overflows its button", record);
        record.checks.shareGeometry = labels;
        await rewardStates(page, record);
        await shareInteractions(page, record);
      }
      if (route === "pages/me/me") {
        check(record.walletParticles.length === 5 && record.walletGrid === 0 && record.walletAurora === 0 && record.walletArc.length === 1, "Wallet must retain its original corner arc, add five particles, and omit grid/aurora", record);
        const arc = record.walletArc[0];
        check(arc?.cssWidth === "360px" && arc.cssHeight === "300px" && arc.bottom === "-220px" && arc.right === "-190px" && arc.pointerEvents === "none" && arc.image.includes("radial-gradient") && arc.transform === "matrix(0.866025, -0.5, 0.5, 0.866025, 0, 0)", "Original corner arc geometry/decorative treatment changed", record);
        const currentWallet = await readFile(path.join(repoRoot, "src/components/me/wallet-card.vue"), "utf8");
        const originalArcPreserved = JSON.stringify(walletArcContract.rulesFor(currentWallet)) === JSON.stringify(walletArcContract.rules) && currentWallet.match(/@keyframes wallet-arc-breathe\s*\{[\s\S]*?\}\s*\}/)?.[0].replace(/\s+/g, " ").trim() === walletArcContract.animation;
        check(originalArcPreserved, "Corner arc CSS/keyframes differ from the requested 38ce507e original", record);
        record.checks.walletArcSourceContract = { source: walletArcContract.source, exactCssAndKeyframesPreserved: originalArcPreserved };
        check(record.walletParticles.every(particle => particle.pointerEvents === "none"), "Wallet particles capture interactions", record);
        if (variant.motion === "reduce") check(arc?.animation === "none" && record.walletParticles.every(particle => particle.animation === "none" && particle.transform === "none" && Number(particle.opacity) > 0), "Reduced motion arc/particles must remain visible and static", record);
        else {
          // Vue's scoped stylesheet compiler appends its eight-hex scope ID
          // to keyframe names; source rules/keyframes are checked exactly above.
          check(/^wallet-arc-breathe(?:-[0-9a-f]{8})?$/.test(arc?.animation || "") && arc.duration === "7s", "Original corner arc breathing animation changed", record);
          const previous = record.walletParticles[0]?.transform;
          await page.waitForFunction(previous => { const el = document.querySelector("[data-wallet-particle]"); return el && getComputedStyle(el).transform !== previous && Number(getComputedStyle(el).opacity) > 0; }, previous, { timeout: 5000 });
          const first = (await collectDOM(page)).walletParticles[0];
          const firstAt = await page.evaluate(() => performance.now());
          await screenshot(page, record, "wallet-motion-frame-1");
          await page.waitForFunction(({ transform, firstAt }) => { const el = document.querySelector("[data-wallet-particle]"); return performance.now() - firstAt >= 80 && el && getComputedStyle(el).transform !== transform && Number(getComputedStyle(el).opacity) > 0; }, { transform: first?.transform, firstAt }, { timeout: 5000 });
          const second = (await collectDOM(page)).walletParticles[0];
          record.checks.walletAnimation = { initial: previous, first: { at: firstAt, transform: first?.transform, opacity: first?.opacity }, second: { at: await page.evaluate(() => performance.now()), transform: second?.transform, opacity: second?.opacity } };
          await screenshot(page, record, "wallet-motion-frame-2");
        }
        const walletHit = await page.evaluate(() => { const heading = document.querySelector(".nx-wallet-heading"), r = heading.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest(".nx-wallet-heading") === heading; });
        check(walletHit, "Wallet decoration blocks its actual heading interaction", record);
      }
    }
    const maxTop = Math.max(0, record.scrollHeight - record.clientHeight);
    const step = Math.max(400, record.clientHeight * 0.75);
    const tops = []; for (let top = step; top < maxTop; top += step) tops.push(top); if (maxTop > 0) tops.push(maxTop);
    for (let i = 0; i < tops.length; i++) { await scrollTo(page, record.actualRoute, tops[i]); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); await screenshot(page, record, `scroll-${i}`); }
    record.dataCoverage = critical.includes(route) || route === "pages/earn/device-detail" ? "Local UI fixtures for fleet, earnings, market, tasks, wallet, catalog, rank and referral. Other unrelated responses may remain unavailable." : "Page shell and actual empty/unavailable/static state; populated business branch is not claimed.";
    if (record.actualRoute !== route) record.dataCoverage = "Redirect branch only. No assertion of the requested surface's cards, rows, or populated data.";
  } catch (error) { record.error = error.message; failures.push({ message: error.message, route, ...variant }); try { record.failureDOM = await collectDOM(page); await screenshot(page, record, "failure"); } catch {} }
  finally { check(record.errors.length === 0, `Browser errors after interactions: ${record.errors.join(" | ")}`, record); check(record.requestFailures.every(failure => failure.navigationCancelled), `Non-navigation request failures: ${JSON.stringify(record.requestFailures)}`, record); page.off("pageerror", onError); page.off("console", onConsole); page.off("request", onRequest); page.off("requestfailed", onRequestFailure); records.push(record); await writeFile(path.join(OUTPUT, "runtime.json"), JSON.stringify(records, null, 2)); }
  console.log(`${variant.width}/${variant.locale}/${variant.theme}/${variant.motion} ${route}: ${record.error || `rendered ${record.actualRoute}; ${record.screenshots.length} screenshots`}`);
}

async function variantRun(variant, routeSet, authenticated = true) {
  const context = await browser.newContext({ viewport: { width: variant.width, height: 844 }, deviceScaleFactor: 1, colorScheme: variant.theme, reducedMotion: variant.motion });
  const page = await context.newPage();
  await page.addInitScript(({ theme, locale }) => { localStorage.setItem("nexgrid-theme-v1", JSON.stringify({ type: "object", data: { mode: theme } })); localStorage.setItem("nexgrid-locale-v1", JSON.stringify({ type: "object", data: { code: locale, userSet: true } })); const cooldown = JSON.stringify({ type: "object", data: { lastClosedAt: 9999999999999 } }); localStorage.setItem("nexgrid-voucher-claim-sheet-v1", cooldown); localStorage.setItem("nexgrid-trial-claim-sheet-v1", cooldown); }, variant);
  if (!authenticated) await page.addInitScript(() => localStorage.setItem("nexgrid-auth-v1", JSON.stringify({ type: "object", data: { isAuthenticated: false, email: "", accountId: "default", onboardingComplete: false } })));
  await installFormalProbeSession(page, { authenticated, responseFor: (url, request) => uiFixture(url, request, variant.locale) });
  try { for (const route of routeSet) await visit(page, route, { ...variant, authentication: authenticated ? "authenticated UI fixture" : "anonymous UI fixture" }); } finally { await context.close(); }
}

try {
  for (const width of (process.env.UI_AUDIT_WIDTHS || "390").split(",").map(Number))
  for (const locale of (process.env.UI_AUDIT_LOCALES || "en").split(","))
  for (const theme of (process.env.UI_AUDIT_THEMES || "dark,light").split(",")) {
    const variant = { width, locale, theme, motion: "no-preference" };
    await variantRun(variant, routes.filter(route => !anonymousRoutes.has(route)));
    await variantRun(variant, routes.filter(route => anonymousRoutes.has(route)), false);
  }
  if (!NO_MATRIX) {
    const matrixRoutes = critical.filter(route => routes.includes(route));
    for (const theme of ["dark", "light"]) for (const locale of ["zh", "vi"]) await variantRun({ width: 390, locale, theme, motion: "no-preference" }, matrixRoutes);
    for (const theme of ["dark", "light"]) for (const locale of ["en", "zh", "vi"]) await variantRun({ width: 320, locale, theme, motion: "no-preference" }, matrixRoutes);
    for (const theme of ["dark", "light"]) await variantRun({ width: 390, locale: "vi", theme, motion: "reduce" }, matrixRoutes);
  }
} finally { await browser.close(); }
const sourceEnd = await sourceSnapshot();
if (sourceStart.snapshotHash !== sourceEnd.snapshotHash || sourceStart.head !== sourceEnd.head) failures.push({ message: "Application/probe source changed during the run; this evidence cannot freeze the final source", sourceStart, sourceEnd });
const summary = { runId, sourceStart, sourceEnd, assertionCount, baseUrl: BASE, frontendOnly: true, businessRequestsIsolated: true, collectOnly: COLLECT_ONLY, manifestRoutes: manifest.pages.length, requestedRoutes: routes.length, excludedRoutes: excluded, combinations: records.length, rendered: records.filter(record => record.actualRoute).length, screenshots: records.reduce((sum, record) => sum + record.screenshots.length, 0), routeCoverage: records.map(record => ({ route: record.route, actual: record.actualRoute, theme: record.theme, locale: record.locale, width: record.width, motion: record.motion, dataCoverage: record.dataCoverage, assertions: record.assertions, error: record.error })), failures, limitations: ["Native background residency, calibration, device binding, real heartbeat/task execution and backend read/write persistence are not accepted by an H5 fixture run.", "Routes without enough content to scroll are checked for header geometry; scroll behavior is exercised on both header implementations with longer pages.", "Unrelated populated business states are unverified when their actual rendered state is empty/unavailable."] };
await writeFile(path.join(OUTPUT, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ ...summary, routeCoverage: `${OUTPUT}/runtime.json`, failures: failures.length }));
if (failures.length) process.exitCode = 1;

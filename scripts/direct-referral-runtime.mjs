// UI witness only: every HTTP/WS business read is intercepted. This does not
// prove backend allocation, wallet postings, treasury debits, or refund recovery.
// node scripts/direct-referral-runtime.mjs --base http://127.0.0.1:5426 --output <directory> --content-fixture <backend/policies/commissions-how-2026.10.05.json>
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import ts from "typescript";
import { installFormalProbeSession } from "./lib/formal-probe-session.mjs";
import { directAppUrl } from "./lib/direct-app-url.mjs";
import { identify } from "./lib/dev-server-pool.mjs";
const arg = (name, fallback) => { const index = process.argv.indexOf(name); return index < 0 ? fallback : process.argv[index + 1]; };
const base = arg("--base", process.env.BASE_URL), output = arg("--output"), contentPath = arg("--content-fixture");
assert(base && output && contentPath, "--base, --output and --content-fixture are required");
const root = fileURLToPath(new URL("..", import.meta.url));
const identity = await identify(base, { root, environment: arg("--environment", "development") });
assert(identity.ok, identity.why);
const templateText = await readFile(contentPath, "utf8"), publication = JSON.parse(templateText);
const fontCss = (await readFile(path.join(root, "src/styles/fonts.css"), "utf8")).replaceAll("../static/fonts/", new URL("/src/static/fonts/", base).href);
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
const hash = value => createHash("sha256").update(value).digest("hex");
async function snapshot() {
  const files = [...new Set((git("diff", "--name-only", "-z", "HEAD") + git("ls-files", "--others", "--exclude-standard", "-z")).split("\0").filter(Boolean))].sort();
  const sourceFiles = Object.fromEntries(await Promise.all(files.filter(file => file !== "scripts/direct-referral-workflow-runtime.mjs").map(async file => [file, hash(await readFile(path.join(root, file)))])));
  return { head: git("rev-parse", "HEAD").trim(), diffHash: hash(git("diff", "--binary", "HEAD")), sourceFiles, sourceHash: hash(JSON.stringify(sourceFiles)) };
}
const before = await snapshot();
const dictionaries = {};
for (const locale of ["en", "zh", "vi"]) {
  const code = ts.transpileModule(await readFile(path.join(root, `src/i18n/messages/${locale}.ts`), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {}; new Function("exports", code)(exports); dictionaries[locale] = exports[locale];
}
const ISO = "2026-10-05T12:00:00.000Z", NOW = Date.parse(ISO);
const proof = { source: "server", serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "" };
const policy = { ...proof, configured: true, policyVersion: 3, effectiveAt: ISO, nexUsdtPrice: .01,
  purchase: { enabled: true, totalRatePct: 12.3456, usdtSharePct: 60, coolingDays: 7 },
  deviceEarning: { enabled: true, totalRatePct: 5, usdtSharePct: 70, coolingDays: 0 } };
const kinds = ["direct_purchase", "direct_device_earning", "unilevel", "binary", "peer", "cultivation", "leadership", "genesis"];
const statuses = ["unlocked", "cooling", "frozen", "reversed", "recovery_pending", "rejected"];
const events = Array.from({ length: 21 }, (_, i) => ({ id: `DR-${i}`, kind: i % 2 ? "direct_device_earning" : "direct_purchase",
  sourceUserName: `M*** ${i}`, sourceRef: `${i % 2 ? "RECEIPT" : "ORDER"}-${i}`, sourceDeviceId: i % 2 ? `DEVICE-${i}` : null,
  policyVersion: i % 6 === 5 ? 0 : 3, basisUsdt: i % 6 === 5 ? 0 : 100, nexUsdtPrice: i % 6 === 5 ? null : .01,
  amountUSDT: i % 6 === 5 ? 0 : i === 0 ? 123456789.123456 : 6.123456, amountNEX: i % 6 === 5 ? 0 : i === 0 ? 987654321.987654 : 400.123456,
  status: statuses[i % 6], ts: NOW, unlockAt: i === 0 ? NOW - 3600000 : NOW + 7 * 86400000, recoveryPendingUSDT: i === 4 ? 2 : 0, recoveryPendingNEX: i === 4 ? 20 : 0 }));
const emptySplit = () => ({ amountUSDT: 0, amountNEX: 0, count: 0 });
const split = { purchase: { amountUSDT: 65, amountNEX: 4000, count: 11 }, deviceEarning: { amountUSDT: 35, amountNEX: 2000, count: 10 } };
const ledger = kinds.map((kind, i) => ({ id: `LEDGER-${i}`, kind, sourceUserName: `Ledger ${i}`, amountUSDT: i === 5 ? 0 : 7,
  amountNEX: i === 5 ? 321 : 0, layer: 1, status: "unlocked", ts: NOW, unlockAt: NOW }));
const aggregate = { totalUSDT: 49, totalNEX: 321, directUSDT: 49, extendedUSDT: 0, contributorCount: 8,
  monthUSDT: 49, monthNEX: 321, todayUSDT: 49, unlockedUSDT: 49, unlockedNEX: 321, coolingUSDT: 0, eventCount: 8, nextUnlockAt: null,
  byKind: Object.fromEntries(ledger.map(e => [e.kind, { usdt: e.amountUSDT, nex: e.amountNEX, count: 1 }])) };
const guide = { ...proof, runId: null, coolingDays: 17, network: { depthGateLayer: 5, depthGateRank: 4, exitCapRate: .25 },
  binary: { threshold: 1000, matchRate: .1, dailyCap: 5000, settlePeriod: "daily", residualPolicy: "carryForward", paused: false },
  leadership: { rate: .05, minRank: 3, monthlyCap: 1000 }, capabilities: { peer: false, genesis: false } };
function fixture(url, locale, state) {
  const p = url.pathname;
  if (p === "/api/app/profile") return { nickname: "Direct fixture", avatarUrl: "", avatarRevision: "", language: locale };
  if (p === "/api/config/commission/direct-referral") return state.policy === "unconfigured" ? { ...policy, configured: false, policyVersion: 0, effectiveAt: null, purchase: { enabled: false, totalRatePct: 0, usdtSharePct: 50, coolingDays: 0 }, deviceEarning: { enabled: false, totalRatePct: 0, usdtSharePct: 50, coolingDays: 0 } }
    : state.policy === "no-price" ? { ...policy, nexUsdtPrice: null } : state.policy === "disabled" ? { ...policy, purchase: { ...policy.purchase, enabled: false }, deviceEarning: { ...policy.deviceEarning, enabled: false } } : policy;
  if (p === "/api/app/team/insights/direct-referral") {
    const page = Number(url.searchParams.get("page")), pageSize = Number(url.searchParams.get("pageSize"));
    state.reads.push({ page, snapshotAt: url.searchParams.get("snapshotAt"), period: url.searchParams.get("period") });
    return { ...proof, page, pageSize, period: url.searchParams.get("period"), totalRows: state.empty ? 0 : 21,
      events: state.empty ? [] : events.slice((page - 1) * pageSize, page * pageSize), split: state.empty ? { purchase: emptySplit(), deviceEarning: emptySplit() } : split, generatedAt: ISO, snapshotAt: ISO };
  }
  if (p === "/api/config/commission/guide") return guide;
  if (p === "/api/config/commission/rates") return { ...proof, runId: null,
    unilevel: [10, 5, 3, 2, 1, .5, .5].map((usdtPct, i) => ({ level: `L${i + 1}`, usdtPct, nexReward: 0 })),
    unilevelPaused: Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`L${i + 1}`, false])),
    partnerTiersJson: JSON.stringify({ standard: 0, verified: 5000, premium: 50000, diamond: 500000 }), influenceClampMin: 1, influenceClampMax: 5, coolingDays: 17, promoMultiplier: 1 };
  if (p === "/api/app/team/insights/commissions") return { ...proof, events: ledger, aggregate, page: 1, pageSize: 20, totalRows: 8, generatedAt: ISO, snapshotAt: ISO };
  if (p === "/api/config/v-ranks") return { ...proof, source: "nx_v_rank_config", prizeName: "Fixture ranks", capabilities: guide.capabilities,
    ranks: Array.from({ length: 13 }, (_, v) => ({ v, title: `V${v}`, cnTitle: `V${v}`, directBonus: .1, unilevelDepth: 1, peerBonus: 0, leadershipVotes: v >= 3 ? 1 : 0, cultivationBonus: v >= 1 ? 321 : 0, rewards: [], visible: true })) };
  if (p === "/api/team/rank") return { ...proof, source: "nx_team_member + server VRankPerformanceRepository", rankCode: "V3", progress: { selfBuyUSD: 1000, directRefs: 2, teamVolumeUSD: 3000, vDownlineCounts: {} } };
  if (p === "/api/app/team/network") return { ...proof, totalMembers: 1, directMembers: 1, activeMembers: 1, monthVolumeUsdt: 100, lifetimeVolumeUsdt: null, members: [{ id: "42", name: "M***", avatarUrl: null, vRank: 1, layer: 1, leg: "A", joinedAt: ISO, monthVolumeUsdt: 100, lifetimeVolumeUsdt: null, status: "ACTIVE", region: "SG" }], nextCursor: null, generatedAt: ISO };
  if (p === "/api/team/binary") return { ...proof, runId: null, asOfDate: "2026-10-05", trackA: 2000, trackB: 3000, trackAMembers: 1, trackBMembers: 1, autoPlacedMembers: 0,
    matchRate: .1, threshold: 1000, dailyCap: 5000, periodCap: 5000, estimatedAmountUsdt: 200, settlePeriod: "daily", residualPolicy: "carryForward", spilloverEnabled: true, gvReset: "monthly", paused: false, blockedReason: "", recentMatches: [] };
  if (p === "/api/app/team/insights/leadership-pool") return { ...proof, currentWeekPoolUSDT: 1000, myRank: 3, myVotes: 1, totalVotes: 10, mySharePct: .1, projectedPayoutUSDT: 100, distribution: [{ vRank: 3, people: 10, votes: 1 }], history: [{ weekId: "2026-W40", payoutUSDT: 90 }], nextPayoutAt: "2026-10-12T00:00:00Z", unlockRank: 3, injectRate: .05, topN: 10 };
  if (p.startsWith("/api/content/how-it-works/")) {
    const contentKey = p.split("/").at(-1), entry = contentKey === "team-unilevel-how" ? publication.unilevelEntry : publication.entry;
    const blocks = state.cms === "old" ? [{ id: "hero", kind: "text", title: "Old publication", body: "Seven layers L1 10%" }] : entry.locales[locale].blocks;
    return { ...proof, contentKey, version: entry.version, versionSource: "ENTRY", locale, status: "PUBLISHED", blocks };
  }
}
await mkdir(output, { recursive: true });
const report = { capability: "runtime", frontendOnly: true, boundary: "Isolated fixtures: no real settlements or wallet writes", base, identity, root, ...before,
  contentFixture: path.resolve(contentPath), contentHash: createHash("sha256").update(templateText).digest("hex"), checks: [], screenshots: [], errors: [] };
const browser = await chromium.launch();
let current, trace;
async function visit(page, route) { await page.goto(directAppUrl(base, `pages/team/${route}`)); await page.locator(`uni-page[data-page="pages/team/${route}"]`).waitFor(); trace.push({ action: "navigate", route, url: page.url() }); }
async function contains(page, value) { await page.getByText(value, { exact: false }).first().waitFor({ timeout: 12000 }); trace.push({ assertion: "DOM contains", value }); }
async function capture(page, name) {
  const fonts = await page.evaluate(async () => {
    const requests = [400, 500, 600, 700].map(weight => `${weight} 15px "General Sans"`).concat(['400 15px "Manrope"', '400 15px "JetBrains Mono"']);
    const loaded = await Promise.all(requests.map(async font => {
      const faces = await document.fonts.load(font);
      return { font, loaded: faces.length > 0 && faces.every(face => face.status === "loaded") };
    }));
    await document.fonts.ready;
    return loaded;
  });
  assert(fonts.every(font => font.loaded), `Bundled fonts failed to load: ${name}`);
  trace.push({ assertion: "six bundled brand fonts loaded", fonts });
  const overflow = await page.evaluate(() => [...document.querySelectorAll("uni-page .nx-content")].filter(el => el.getBoundingClientRect().height > 0).some(el => el.scrollWidth > el.clientWidth + 1));
  assert.equal(overflow, false, `Horizontal overflow: ${name}`);
  const filename = `${name}.png`; await page.screenshot({ path: path.join(output, filename), fullPage: true }); report.screenshots.push(filename); trace.push({ assertion: "no horizontal overflow", screenshot: filename });
}
async function scenario(name, run) {
  current = name; trace = []; const evidence = [`${name}.json`];
  try { await run(); report.checks.push({ name, passed: true, evidence }); }
  catch (e) { report.checks.push({ name, passed: false, error: e.message, evidence }); console.error(name, e.message); }
  await writeFile(path.join(output, evidence[0]), JSON.stringify({ name, frontendOnly: true, trace }, null, 2));
}
async function session(locale = "en", theme = "dark", width = 390) {
  const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: "reduce" }); const page = await context.newPage();
  const state = { reads: [], policy: "normal", cms: "new", empty: false, fail: "", hold: null };
  page.on("pageerror", e => report.errors.push({ scenario: current, message: e.message }));
  page.on("console", message => { if (message.type() === "error") report.errors.push({ scenario: current, message: message.text(), location: message.location() }); });
  page.on("requestfailed", request => trace.push({ failedRequest: request.url(), error: request.failure()?.errorText }));
  await page.addInitScript(({ locale, theme }) => {
    localStorage.setItem("nexgrid-theme-v1", JSON.stringify({ type: "object", data: { mode: theme } }));
    localStorage.setItem("nexgrid-locale-v1", JSON.stringify({ type: "object", data: { code: locale, userSet: true } }));
    for (const key of ["nexgrid-voucher-claim-sheet-v1", "nexgrid-trial-claim-sheet-v1"]) localStorage.setItem(key, JSON.stringify({ type: "object", data: { lastClosedAt: 9999999999999 } }));
  }, { locale, theme });
  await installFormalProbeSession(page, { responseFor: url => fixture(url, locale, state) });
  await page.route(/^https:\/\/(?:api\.fontshare\.com\/v2\/css|fonts\.googleapis\.com\/css2)(?:\?|$)/, route => route.fulfill({ status: 200, contentType: "text/css", body: fontCss }));
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    trace.push({ request: url.pathname + url.search, method: route.request().method(), injectedFailure: Boolean(state.fail && url.pathname.includes(state.fail)) });
    if (state.fail && url.pathname.includes(state.fail)) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 503, message: "Fixture unavailable", data: null }) });
    if (state.hold && url.pathname.endsWith("insights/direct-referral")) await state.hold;
    return route.fallback();
  });
  return { context, page, state };
}
try {
  for (const locale of ["en", "zh", "vi"]) for (const theme of ["dark", "light"]) for (const width of [320, 390]) await scenario(`matrix-${locale}-${theme}-${width}`, async () => {
    const { context, page } = await session(locale, theme, width); try {
      await visit(page, "unilevel"); const copy = dictionaries[locale];
      await contains(page, copy.directReferral.platformPays); await contains(page, "ORDER-0");
      const body = await page.locator("body").innerText(); assert(body.includes(copy.directReferral.purchase) && body.includes(copy.directReferral.deviceEarning));
      assert(body.includes("USDT") && body.includes("NEX")); assert(!/\bL[1-7]\b/.test(body));
      assert(body.includes(locale === "vi" ? "12,3456%" : "12.3456%"));
      assert.equal(await page.locator(".nx-direct-event").count(), 20);
      for (const row of await page.locator(".nx-direct-event").allTextContents()) assert(row.includes("USDT") && row.includes("NEX"));
      const rejected = page.locator(".nx-direct-event").filter({ hasText: "RECEIPT-5" });
      assert.match(await rejected.innerText(), /0 USDT[\s\S]*0 NEX/);
      await contains(page, copy.directReferral.recoveryPending);
      await capture(page, `direct-${locale}-${theme}-${width}`);
    } finally { await context.close(); }
  });
  await scenario("pagination-filter-period-retry", async () => {
    const { context, page, state } = await session(); try {
      await visit(page, "unilevel"); await contains(page, "ORDER-0");
      state.fail = "insights/direct-referral"; await page.locator(".nx-unilevel-load-more").click(); await contains(page, dictionaries.en.network.retry);
      state.fail = ""; await page.locator(".nx-unilevel-load-more").click(); await contains(page, "ORDER-20");
      assert.equal(await page.locator(".nx-direct-event").count(), 21); assert.equal(state.reads.at(-1).snapshotAt, ISO);
      await page.getByRole("tab", { name: dictionaries.en.directReferral.deviceEarning, exact: true }).click();
      assert.equal(await page.locator(".nx-direct-event").count(), 10);
      assert(!(await page.locator(".nx-direct-event").allTextContents()).some(text => text.includes("ORDER-")));
      await page.getByRole("tab", { name: dictionaries.en.unilevel.periods.week, exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll(".nx-direct-event").length === 10);
      assert.equal(state.reads.at(-1).page, 1); assert.equal(state.reads.at(-1).snapshotAt, null); assert.equal(state.reads.at(-1).period, "week");
      await capture(page, "pagination-filter-period");
      await page.reload(); await contains(page, "ORDER-0"); assert.equal(await page.locator(".nx-direct-event").count(), 20);
      assert.equal(state.reads.at(-1).page, 1); assert.equal(state.reads.at(-1).snapshotAt, null);
      trace.push({ assertion: "reload refetches the server first page", reads: state.reads });
    } finally { await context.close(); }
  });
  await scenario("rules-and-record-failures-remain-independent", async () => {
    const { context, page, state } = await session(); try {
      state.fail = "config/commission/direct-referral"; await visit(page, "unilevel"); await contains(page, dictionaries.en.directReferral.policyError); await contains(page, "ORDER-0");
      state.fail = ""; await page.getByRole("button", { name: dictionaries.en.network.retry, exact: true }).click(); await contains(page, dictionaries.en.directReferral.platformPays);
      state.fail = "insights/direct-referral"; await page.reload(); await contains(page, dictionaries.en.network.projectionErrorTitle);
      assert.equal(await page.locator(".nx-direct-event").count(), 0); state.fail = "";
      await page.getByRole("button", { name: dictionaries.en.network.retry, exact: true }).click(); await contains(page, "ORDER-0");
      for (const mode of ["unconfigured", "disabled", "no-price"]) { state.policy = mode; await page.reload(); await contains(page, "ORDER-0"); await contains(page, mode === "unconfigured" ? dictionaries.en.directReferral.unconfigured : mode === "disabled" ? dictionaries.en.directReferral.disabled : dictionaries.en.directReferral.priceUnavailable); await capture(page, mode); }
      state.empty = true; await page.reload(); await contains(page, dictionaries.en.directReferral.empty); await contains(page, dictionaries.en.directReferral.invite); await capture(page, "empty");
    } finally { await context.close(); }
  });
  await scenario("loading-and-account-invalidation-reject-late-reply", async () => {
    const { context, page, state } = await session(); let release;
    try {
      state.hold = new Promise(resolve => { release = resolve; }); await visit(page, "unilevel"); await contains(page, dictionaries.en.network.projectionLoadingTitle);
      assert.equal(await page.locator(".nx-direct-event").count(), 0);
      await page.evaluate(() => document.querySelector("#app").__vue_app__.config.globalProperties.$pinia._s.get("app").bindAccount("default"));
      state.hold = null; release(); await page.waitForLoadState("networkidle"); assert.equal(await page.locator(".nx-direct-event").count(), 0);
      await capture(page, "old-account-reply-discarded");
    } finally { release?.(); await context.close(); }
  });
  await scenario("keyboard-activation-rules-retry-invite-pagination", async () => {
    const { context, page, state } = await session();
    const activate = async (locator, key) => { await locator.focus(); await locator.press(key); trace.push({ action: "keyboard activation", key }); };
    try {
      for (const key of ["Enter", "Space"]) {
        state.empty = false; state.fail = ""; await visit(page, "unilevel"); await contains(page, "ORDER-0");
        await activate(page.getByRole("button", { name: dictionaries.en.unilevel.howItWorksEntry, exact: true }), key);
        await page.locator('uni-page[data-page="pages/team/unilevel-how"]').waitFor();
        await contains(page, publication.unilevelEntry.locales.en.blocks[0].title);
        state.fail = "config/commission/direct-referral"; await visit(page, "unilevel"); await contains(page, dictionaries.en.directReferral.policyError);
        state.fail = ""; await activate(page.getByRole("button", { name: dictionaries.en.network.retry, exact: true }), key);
        await contains(page, dictionaries.en.directReferral.platformPays);
        await activate(page.locator(".nx-unilevel-load-more"), key); await contains(page, "ORDER-20");
        assert.equal(await page.locator(".nx-direct-event").count(), 21);
        state.fail = "insights/direct-referral"; await page.reload(); await contains(page, dictionaries.en.network.projectionErrorTitle);
        state.fail = ""; await activate(page.getByRole("button", { name: dictionaries.en.network.retry, exact: true }), key); await contains(page, "ORDER-0");
        state.empty = true; await page.reload(); await contains(page, dictionaries.en.directReferral.empty);
        await activate(page.getByRole("button", { name: dictionaries.en.directReferral.invite, exact: true }), key);
        await page.locator('uni-page[data-page="pages/team/team"]').waitFor();
      }
      await capture(page, "keyboard-controls-return-to-team");
    } finally { await context.close(); }
  });
  for (const locale of ["en", "zh", "vi"]) for (const width of [320, 390]) await scenario(`published-guides-${locale}-${width}`, async () => {
    const { context, page, state } = await session(locale, "dark", width); const copy = dictionaries[locale];
    const unavailable = { en: "Explanation or rules unavailable", zh: "说明或规则暂不可用", vi: "Chưa có hướng dẫn hoặc quy tắc" };
    const retry = { en: "Reload", zh: "重新加载", vi: "Tải lại" }; try {
      for (const route of ["unilevel-how", "commissions-how"]) {
        const title = (route === "unilevel-how" ? publication.unilevelEntry : publication.entry).locales[locale].blocks[0].title;
        state.cms = "new"; await visit(page, route); await contains(page, title);
        await contains(page, "USDT"); const body = await page.locator("body").innerText(); assert(!/\{directPurchaseRules\}|\bL[1-7]\b/.test(body)); await capture(page, `${route}-${locale}-${width}-new`);
        state.cms = "old"; await page.reload(); await contains(page, route === "unilevel-how" ? copy.howPublished.unavailableTitle : unavailable[locale]);
        assert(!(await page.locator("body").innerText()).includes("Seven layers")); await capture(page, `${route}-${locale}-${width}-old-rejected`);
        state.cms = "new"; state.fail = "content/how-it-works"; await page.reload(); await contains(page, route === "unilevel-how" ? copy.howPublished.unavailableTitle : unavailable[locale]);
        state.fail = ""; await page.getByRole("button", { name: route === "unilevel-how" ? copy.ui.retry : retry[locale], exact: true }).first().click();
        await contains(page, title);
      }
    } finally { await context.close(); }
  });
  for (const locale of ["en", "zh", "vi"]) await scenario(`existing-categories-and-team-entries-${locale}`, async () => {
    const { context, page } = await session(locale, "dark", 320); try {
      await visit(page, "commissions"); await contains(page, "Ledger 5");
      for (const kind of kinds) await contains(page, dictionaries[locale].commissions.kind[kind]);
      await contains(page, "321"); await contains(page, "49"); await capture(page, `eight-ledger-categories-${locale}`);
      for (const [selector, route, value] of [[".nx-team-royalty-network-link", "unilevel", "ORDER-0"], [".nx-team-binary-link", "binary", "200"], [".nx-team-rank-link", "rank", "V12"], [".nx-team-leadership-pool-link", "leadership-pool", "100"]]) {
        await visit(page, "team"); await page.locator(selector).click(); await page.locator(`uni-page[data-page="pages/team/${route}"]`).waitFor();
        await contains(page, value); assert.equal(await page.locator('.nx-empty[data-kind="recoverable-error"]').count(), 0); await capture(page, `${route}-entry-${locale}`);
      }
    } finally { await context.close(); }
  });
} finally {
  await browser.close(); report.finalSnapshot = await snapshot(); report.unchanged = JSON.stringify(before) === JSON.stringify(report.finalSnapshot);
  report.steps = report.checks.map(check => ({ id: check.name, passed: check.passed, evidence: check.evidence }));
  report.passed = report.checks.length === 25 && report.checks.every(check => check.passed) && report.errors.length === 0 && report.unchanged;
  report.finishedAt = new Date().toISOString(); await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, screenshots: report.screenshots.length, errors: report.errors.length, report: path.join(output, "report.json") }));
  if (!report.passed) process.exitCode = 1;
}

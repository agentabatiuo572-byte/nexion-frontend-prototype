import { chromium } from "playwright";
import { collectAppConsoleErrors } from "./lib/console-origin-filter.mjs";
import { directAppUrl } from "./lib/direct-app-url.mjs";
import { scopeRoutes, concurrencyFromEnv } from "./lib/probe-routes.mjs";
import {
  assertDirectPageCoverage,
  assertUniAppRuntimeIdentity,
  collectUniAppRuntimeIdentity,
} from "./lib/probe-coverage.mjs";

const baseUrl = process.env.BASE_URL || "http://localhost:5173";
// The legacy verification lane shares one Vite server with hundreds of
// preceding checks. On Windows a cold route transform can exceed Playwright's
// 30s default even though the isolated runtime gate is healthy. Keep this
// probe fail-closed, but give the document response the same 60s budget as the
// surrounding legacy runtime checks.
const navigationTimeoutMs = 60_000;
const routes = [
  "/#/pages/entry-surfaces/index",
  "/#/pages/entry-surfaces/signed",
  "/#/pages/entry-surfaces/h5",
  "/#/pages/entry-surfaces/white?entry=white-app",
];
const requiredSelectors = new Map([
  ["/#/pages/entry-surfaces/index", '[data-entry-surface="index"]'],
  ["/#/pages/entry-surfaces/signed", '[data-entry-surface="signed"]'],
  ["/#/pages/entry-surfaces/h5", '[data-entry-surface="h5"]'],
  ["/#/pages/entry-surfaces/white", '[data-entry-surface="white"]'],
]);
const forbiddenText = [
  "Lifetime earnings",
  "Earnings milestone",
  "$10,000+",
  "+3,000 NEX",
  "Milestone",
];
// 业务存储表:未登录入口面(unsigned/h5/white)一律不得写入(反泄漏护栏)。
// 🔴 P2-8:账户资产表(bills/orders/staking/commission)改成按账号分行后,护栏键必须跟着
// 换成 *-accounts-v1;盯旧死键会让本护栏静默失明(真泄漏不再报红)。单一来源,清理与
// 快照共用,防止清单重复漂移(旧版三处硬编码清单正因此朽坏)。
const businessStorageKeys = [
  "nexgrid-milestones-accounts-v1",
  "nexgrid-bills-accounts-v1",
  "nexgrid-orders-accounts-v1",
  "nexgrid-v3-staking-accounts-v1",
  "nexgrid-commission-accounts-v1",
  "nexgrid-account-cloud-v1",
  "nexgrid-account-sessions-v1",
  "nexgrid-device-id-v1",
];

function assertNoBusinessStorage(snapshot, route) {
  const milestone = snapshot["nexgrid-milestones-accounts-v1"] || "";
  const bills = snapshot["nexgrid-bills-accounts-v1"] || "";
  if (/earn-\d+/.test(milestone)) {
    throw new Error(`${route} wrote milestone fired state: ${milestone}`);
  }
  if (/MILESTONE-|Earnings milestone/.test(bills)) {
    throw new Error(`${route} wrote milestone bill state`);
  }
  const written = businessStorageKeys.filter((key) => snapshot[key]);
  if (written.length) {
    throw new Error(`${route} wrote business storage keys: ${written.join(", ")}`);
  }
}

async function checkRoute(browser, route) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
    const pageErrors = [];
    const consoleErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    page.on("console", collectAppConsoleErrors(consoleErrors, baseUrl));
    await page.addInitScript((keys) => {
      for (const key of keys) localStorage.removeItem(key);
    }, businessStorageKeys);
    await page.goto(directAppUrl(baseUrl, route), {
      waitUntil: "domcontentloaded",
      timeout: navigationTimeoutMs,
    });
    await page.locator("body").waitFor({ state: "visible", timeout: 10000 });
    await page.waitForTimeout(4700);
    const text = await page.locator("body").innerText({ timeout: 5000 });
    const requiredSelector = requiredSelectors.get(route.split("?", 1)[0]);
    if (!requiredSelector) throw new Error(`${route} has no semantic identity selector`);
    const witness = await page.evaluate(() => ({
      actualRoute: (location.hash || "").replace(/^#/, ""),
      appChildren: document.querySelector("#app")?.childElementCount ?? 0,
      iframeCount: document.querySelectorAll("iframe").length,
      bodyElements: document.querySelectorAll("body *").length,
      bodyTextLength: (document.body?.innerText || "").trim().length,
    }));
    witness.pageErrors = pageErrors;
    witness.consoleErrors = consoleErrors;
    assertDirectPageCoverage(route.slice(route.indexOf("#") + 1), witness, route);
    assertUniAppRuntimeIdentity(await collectUniAppRuntimeIdentity(page), route);
    if (await page.locator(requiredSelector).count() !== 1) {
      throw new Error(`${route} semantic identity missing: ${requiredSelector}`);
    }
    const leaked = forbiddenText.filter((token) => text.includes(token));
    if (leaked.length) throw new Error(`${route} leaked business overlay text: ${leaked.join(", ")}`);
    const storage = await page.evaluate((keys) => {
      const out = {};
      for (const key of keys) out[key] = localStorage.getItem(key) || "";
      return out;
    }, businessStorageKeys);
    assertNoBusinessStorage(storage, route);
    await page.close();
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  // 路由级范围(包 ax):PROBE_ROUTES 有值 → 只扫「射程 ∩ 受影响路由」;未设 = 全量。
  const SCOPE = scopeRoutes(routes, "SPEC-6 entry-surface", (r) => r.replace(/^\/#/, ""));
  // 包 ax:每条路由仍是「独立 page(独立 context / storage)+ 4.7s 稳定等待」的原口径,只是 N 条并行(PROBE_CONCURRENCY,默认 3)。
  const queue = [...SCOPE.routes];
  const lanes = Math.max(1, Math.min(concurrencyFromEnv(), queue.length || 1));
  let firstErr = null;
  await Promise.all(Array.from({ length: lanes }, async () => {
    while (queue.length && !firstErr) {
      const route = queue.shift();
      try { await checkRoute(browser, route); } catch (e) { firstErr = firstErr || e; }
    }
  }));
  await browser.close();
  if (firstErr) throw firstErr;
  console.log(`SPEC-6 entry surfaces runtime PASS${SCOPE.scoped ? `(scoped ${SCOPE.routes.length}/${routes.length} 路由)` : ""}`);
}

main().catch(async (err) => {
  console.error(err?.stack || err?.message || String(err));
  process.exit(1);
});

#!/usr/bin/env node
/** auth-guard-verify.mjs — runtime proof the demo-friendly auth guard behaves. */
import { chromium } from "playwright";
import { collectAppConsoleErrors } from "./lib/console-origin-filter.mjs";
import { assertAuthGuardRoutes } from "./lib/probe-coverage.mjs";
const BASE = process.env.UNI_BASE_URL || process.env.BASE_URL || "http://localhost:5173";
const browser = await chromium.launch();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// uni H5 wraps stored objects as {type:"object",data:...}
const unauth = JSON.stringify({ type: "object", data: { isAuthenticated: false, email: "", onboardingComplete: false } });

async function routeAfter(seedUnauth, target) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
  const page = await ctx.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.stack || String(error)));
  page.on("console", collectAppConsoleErrors(consoleErrors, BASE));
  await page.goto(`${BASE}/?nx_device=off#/pages/index/index`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.evaluate((u) => {
    localStorage.clear();
    if (u) localStorage.setItem("nexgrid-auth-v1", u);
  }, seedUnauth ? unauth : null);
  await page.goto(`${BASE}/?nx_device=off#${target}`, { waitUntil: "networkidle", timeout: 30000 });
  await wait(1800); // onShow guard + one 1s tick
  const witness = await page.evaluate(() => ({
    actualRoute: (location.hash || "").replace(/^#/, ""),
    appChildren: document.querySelector("#app")?.childElementCount ?? 0,
    iframeCount: document.querySelectorAll("iframe").length,
    bodyElements: document.querySelectorAll("body *").length,
    bodyTextLength: (document.body?.innerText || "").trim().length,
    toastText: (document.querySelector(".nx-toast__title")?.textContent || "").trim(),
    retiredNoticeText: (document.querySelector("[data-qa='retired-flow-notice']")?.textContent || "").trim(),
  }));
  await ctx.close();
  return { ...witness, pageErrors, consoleErrors };
}

async function sameDocumentRoute(target, seedUnauth = false, initialRoute = "") {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
  const page = await ctx.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.stack || String(error)));
  page.on("console", collectAppConsoleErrors(consoleErrors, BASE));
  await page.goto(`${BASE}/?nx_device=off#/pages/index/index`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.evaluate(({ shouldSeed, storedUnauth }) => {
    localStorage.clear();
    if (shouldSeed) localStorage.setItem("nexgrid-auth-v1", storedUnauth);
  }, { shouldSeed: seedUnauth, storedUnauth: unauth });
  const startRoute = initialRoute || (seedUnauth ? "/pages/onboarding/intro" : "/pages/me/me");
  await page.goto(`${BASE}/?nx_device=off#${startRoute}`, { waitUntil: "networkidle", timeout: 30000 });
  await wait(1200);
  await page.evaluate((hash) => { window.location.hash = hash; }, target);
  await wait(2200); // one guard tick sees the live hash even when the page stack is stale
  const witness = await page.evaluate(() => ({
    actualRoute: (location.hash || "").replace(/^#/, ""),
    appChildren: document.querySelector("#app")?.childElementCount ?? 0,
    iframeCount: document.querySelectorAll("iframe").length,
    bodyElements: document.querySelectorAll("body *").length,
    bodyTextLength: (document.body?.innerText || "").trim().length,
    toastText: (document.querySelector(".nx-toast__title")?.textContent || "").trim(),
    retiredNoticeText: (document.querySelector("[data-qa='retired-flow-notice']")?.textContent || "").trim(),
  }));
  await ctx.close();
  return { ...witness, pageErrors, consoleErrors };
}

try {
  const r1 = await routeAfter(false, "/pages/earn/earn");       // default authed → stays
  const r2 = await routeAfter(true, "/pages/earn/earn");        // signed out → redirected to intro
  const r3 = await routeAfter(true, "/pages/onboarding/intro"); // unauth on funnel → no loop
  const r4 = await routeAfter(true, "/pages/onboarding/../earn/earn"); // traversal normalizes to protected route
  const r5 = await routeAfter(false, "/pages/entry-surfaces/../earn/earn"); // authenticated traversal canonicalizes
  const r6 = await routeAfter(false, "/pages/me/kyc"); // retired deep link explains and lands safely
  const r7 = await sameDocumentRoute("/pages/entry-surfaces/../earn/earn"); // address changes while page stack stays stale
  const r8 = await sameDocumentRoute("/pages/me/kyc"); // retired link reached without a document reload
  const r9 = await sameDocumentRoute("/pages/entry-surfaces/../earn/earn", true); // signed-out same-document traversal
  const r10 = await sameDocumentRoute("/pages/me/kyc", true); // signed-out retired path remains behind the guard
  const r11 = await sameDocumentRoute("/pages/entry-surfaces/../earn/earn", false, "/pages/entry-surfaces/index");
  const r12 = await sameDocumentRoute("/pages/entry-surfaces/../earn/earn", false, "/pages/entry-surfaces/index");
  const r13 = await sameDocumentRoute("/pages/entry-surfaces/../earn/earn", false, "/pages/entry-surfaces/index");
  const encodedDot = `%${"25".repeat(16)}2e`;
  const r14 = await routeAfter(false, `/pages/entry-surfaces/${encodedDot}${encodedDot}/earn/earn`);
  const r15 = await routeAfter(false, "/../../pages/earn/earn");
  const result = {
    defaultAuthed_staysOnEarn: r1,
    signedOut_redirectedFromEarn: r2,
    unauthOnOnboarding_noLoop: r3,
    traversalUnderWhitelist_redirected: r4,
    defaultAuthed_traversalCanonicalized: r5,
    retiredVerification_redirectedToSecurity: r6,
    sameDocumentTraversalCanonicalized: r7,
    sameDocumentRetiredVerificationMigrated: r8,
    signedOutSameDocumentTraversalRedirected: r9,
    signedOutSameDocumentRetiredRedirected: r10,
    staticReviewSameDocumentTraversal1: r11,
    staticReviewSameDocumentTraversal2: r12,
    staticReviewSameDocumentTraversal3: r13,
    excessiveEncodingFailsClosed: r14,
    aboveRootTraversalFailsClosed: r15,
  };
  console.log(JSON.stringify(result, null, 2));
  assertAuthGuardRoutes(result);
  console.log("AUTH-GUARD-VERIFY: PASS (15/15 assertions, including repeated same-document repair and malformed-route fallback)");
} finally {
  await browser.close();
}

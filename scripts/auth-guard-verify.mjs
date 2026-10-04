#!/usr/bin/env node
/** auth-guard-verify.mjs — runtime proof the demo-friendly auth guard behaves. */
import { chromium } from "playwright";
import { collectAppConsoleErrors } from "./lib/console-origin-filter.mjs";
import { assertAuthGuardRoutes } from "./lib/probe-coverage.mjs";
import { waitForUniAppPage } from "./lib/probe-readiness.mjs";
import { installProbeConversationRealtime, probeConversationReadFixture } from "./lib/probe-conversation-realtime.mjs";
const BASE = process.env.UNI_BASE_URL || process.env.BASE_URL || "http://localhost:5173";
const browser = await chromium.launch();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// uni H5 wraps stored objects as {type:"object",data:...}
const unauth = JSON.stringify({ type: "object", data: { isAuthenticated: false, email: "", onboardingComplete: false } });
const authed = JSON.stringify({ type: "object", data: {
  isAuthenticated: true,
  email: "",
  accountId: "user:900001",
  onboardingComplete: true,
} });

async function installServerSessionBoundary(page, authenticated) {
  // The initial route and its auth fixture must arrive in the same document.
  // Writing storage after a temporary home navigation races UniApp bootstrap
  // and turns the requested starting route into a stale same-document hash.
  await page.addInitScript((stored) => {
    localStorage.clear();
    localStorage.setItem("nexgrid-auth-v1", stored);
  }, authenticated ? authed : unauth);
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (!/^\/(?:api|auth)\//.test(url.pathname)) return route.continue();
    if (url.pathname === "/auth/users/refresh") {
      return route.fulfill({
        // Keep the unauthenticated control free of browser-level console noise;
        // the API envelope still carries the canonical 401 and the client
        // fails the restore boundary exactly as it would for an HTTP 401.
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(authenticated
          ? {
              code: 0,
              message: "OK",
              data: {
                accessToken: "auth-guard-access-token",
                refreshToken: null,
                tokenType: "Bearer",
                user: {
                  userId: 900001,
                  countryCode: "+86",
                  phone: "13800000000",
                  nickname: "Guard Witness",
                  onboardingComplete: true,
                },
              },
            }
          : { code: 401, message: "AUTH_REQUIRED", data: null }),
      });
    }
    if (url.pathname === "/api/app/profile" && authenticated && route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ code: 0, message: "OK", data: {
          nickname: "Guard Witness", avatarUrl: "", avatarRevision: "", language: "en",
        } }),
      });
    }
    if (url.pathname === "/api/legal/terms/current") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          code: 0,
          message: "OK",
          data: {
            source: "server",
            sourceEnvironment: "PRODUCTION",
            runId: "",
            requestedLocale: url.searchParams.get("locale") || "en",
            resolvedLocale: "en",
            requestedJurisdiction: "GLOBAL",
            resolvedJurisdiction: "GLOBAL",
            provenance: "auth-guard-fixture",
            version: "v1",
            effectiveAt: "2026-08-01T00:00:00Z",
            title: "Terms",
            summary: "Terms accepted for the authenticated guard control.",
            sections: [{ key: "guard", title: "Guard", body: "Runtime witness", sortOrder: 10 }],
            acknowledged: true,
            acknowledgedAt: "2026-08-01T00:00:00Z",
          },
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ code: 0, message: "OK", data: authenticated ? probeConversationReadFixture(url, route.request()) ?? {} : {} }),
    });
  });
  await installProbeConversationRealtime(page, { authenticated });
}

async function routeAfter(authenticated, target) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
  const page = await ctx.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.stack || String(error)));
  page.on("console", collectAppConsoleErrors(consoleErrors, BASE));
  await installServerSessionBoundary(page, authenticated);
  // The initial route is the document entry point. Do not boot home first and
  // race its startup navigation against the route whose guard outcome we read.
  // Subresources can hold the load event after the document is ready. The
  // guard assertion below needs rendered UniApp text, not every asset loaded.
  await page.goto(`${BASE}/?nx_device=off#${target}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  // A cold dev-server transform can finish after DOMContentLoaded. Start the
  // guard tick only once the direct UniApp document has rendered readable text.
  await page.waitForFunction(
    () => (document.body?.innerText || "").trim().length > 0,
    undefined,
    { timeout: 30_000 },
  );
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

async function sameDocumentRoute(target, authenticated = true, initialRoute = "") {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
  const page = await ctx.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.stack || String(error)));
  page.on("console", collectAppConsoleErrors(consoleErrors, BASE));
  await installServerSessionBoundary(page, authenticated);
  const startRoute = initialRoute || (authenticated ? "/pages/me/me" : "/pages/onboarding/intro");
  // A successful server-session restore intentionally takes a cold static
  // review route home. Start that fixture on a protected route, prove the
  // server identity rendered, then enter the static route as the first real
  // same-document transition under test.
  const staticStart = authenticated && !!initialRoute && startRoute.startsWith("/pages/entry-surfaces/");
  const initialDocumentRoute = staticStart ? "/pages/me/me" : startRoute;
  await page.goto(`${BASE}/?nx_device=off#${initialDocumentRoute}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await waitForUniAppPage(page, initialDocumentRoute.replace(/^\//, ""), { timeout: 30_000 });
  if (staticStart) {
    // `Guard Witness` exists only in the mocked /auth/users/refresh response;
    // this proves the server restoration completed, unlike the raw persisted
    // auth snapshot which exists before bootstrap starts.
    await page.waitForFunction(
      () => (document.body?.innerText || "").includes("Guard Witness"),
      undefined,
      { timeout: 10_000 },
    );
    await page.evaluate((hash) => { window.location.hash = hash; }, startRoute);
    await waitForUniAppPage(page, startRoute.replace(/^\//, ""));
  }
  await page.evaluate((hash) => { window.location.hash = hash; }, target);
  // A busy dev server can delay the one-second repair tick. Observe the
  // final guard destination instead of stopping at an intermediate retired-
  // route migration or assuming 2.2s is enough.
  const expectedRoute = !authenticated
    ? "/pages/onboarding/intro"
    : target === "/pages/me/kyc"
      ? "/pages/me/security?from=retired-flow"
      : "/pages/earn/earn";
  await page.waitForFunction(
    (expected) => (location.hash || "").replace(/^#/, "") === expected,
    expectedRoute,
    { timeout: 10_000 },
  );
  // A changed address bar is insufficient: UniApp can retain the old stack
  // for a frame, so require the final route to be mounted before sampling.
  await waitForUniAppPage(page, expectedRoute.replace(/^\//, ""));
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
  const r1 = await routeAfter(true, "/pages/earn/earn");       // server session restored → stays
  const r2 = await routeAfter(false, "/pages/earn/earn");      // signed out → redirected to intro
  const r3 = await routeAfter(false, "/pages/onboarding/intro"); // unauth on funnel → no loop
  const r4 = await routeAfter(false, "/pages/onboarding/../earn/earn"); // traversal normalizes to protected route
  const r5 = await routeAfter(true, "/pages/entry-surfaces/../earn/earn"); // authenticated traversal canonicalizes
  const r6 = await routeAfter(true, "/pages/me/kyc"); // retired deep link explains and lands safely
  const r7 = await sameDocumentRoute("/pages/entry-surfaces/../earn/earn"); // address changes while page stack stays stale
  const r8 = await sameDocumentRoute("/pages/me/kyc"); // retired link reached without a document reload
  const r9 = await sameDocumentRoute("/pages/entry-surfaces/../earn/earn", false); // signed-out same-document traversal
  const r10 = await sameDocumentRoute("/pages/me/kyc", false); // signed-out retired path remains behind the guard
  const r11 = await sameDocumentRoute("/pages/entry-surfaces/../earn/earn", true, "/pages/entry-surfaces/index");
  const r12 = await sameDocumentRoute("/pages/entry-surfaces/../earn/earn", true, "/pages/entry-surfaces/index");
  const r13 = await sameDocumentRoute("/pages/entry-surfaces/../earn/earn", true, "/pages/entry-surfaces/index");
  const encodedDot = `%${"25".repeat(16)}2e`;
  const r14 = await routeAfter(true, `/pages/entry-surfaces/${encodedDot}${encodedDot}/earn/earn`);
  const r15 = await routeAfter(true, "/../../pages/earn/earn");
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

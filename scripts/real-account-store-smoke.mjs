#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.BASE_URL || "http://127.0.0.1:5173";
const phone = process.env.NEXGRID_TEST_PHONE;
const password = process.env.NEXGRID_TEST_PASSWORD;
const evidenceDir = process.env.NEXGRID_EVIDENCE_DIR;

assert.ok(phone, "NEXGRID_TEST_PHONE is required");
assert.ok(password, "NEXGRID_TEST_PASSWORD is required");

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const pageErrors = [];
const failedResponseReads = [];
const authFailures = [];
const stateTrace = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("response", (response) => {
  if (response.status() >= 500) {
    failedResponseReads.push(response.json().then((body) => ({
      status: response.status(),
      path: new URL(response.url()).pathname,
      message: typeof body?.message === "string" ? body.message : "",
    })).catch(() => ({
      status: response.status(), path: new URL(response.url()).pathname, message: "",
    })));
  }
  if (response.status() === 401 || response.status() === 403) {
    const entry = {
      status: response.status(),
      method: response.request().method(),
      path: new URL(response.url()).pathname,
      message: "",
    };
    authFailures.push(entry);
    void response.json().then((body) => {
      entry.message = typeof body?.message === "string" ? body.message : "";
    }).catch(() => {});
  }
});

try {
  // Playwright flattens UniApp navigation-cancellation rejection objects to the
  // literal "Object". Capture the original rejection shape so only that exact,
  // known navigation race is classified as environment noise; every other
  // uncaught error remains a hard failure.
  await page.addInitScript(() => {
    window.__storeSmokeUncaught = [];
    const record = (source, reason) => {
      const entry = { source, name: "", message: "", errMsg: "" };
      if (reason instanceof Error) {
        entry.name = String(reason.name || "");
        entry.message = String(reason.message || "");
      } else if (reason && typeof reason === "object") {
        entry.errMsg = String(reason.errMsg || "");
        try { entry.message = entry.errMsg || JSON.stringify(reason); }
        catch { entry.message = "<unserializable>"; }
      } else {
        entry.message = String(reason);
      }
      window.__storeSmokeUncaught.push(entry);
    };
    window.addEventListener("unhandledrejection", (event) => record("rejection", event.reason));
    window.addEventListener("error", (event) => record("error", event.error ?? event.message));
  });
  await page.goto(`${baseUrl}/?nx_device=off#/pages/login/login`, { waitUntil: "domcontentloaded" });
  async function captureRuntimeState(label) {
    // Never import the source runtime from the test page. After Vite HMR adds a
    // cache-busting query to the app graph, a bare dynamic import can create a
    // second in-memory session vault and turn a healthy UI session into a false
    // AUTH_SESSION_REQUIRED failure. The real UI requests below are the session
    // authority proof; this trace is deliberately limited to visible state.
    const state = {
      visibleTabs: await page.locator(".nx-tab:visible").count(),
      visibleProducts: await page.getByText(/StellarBox Pro|NexionBox Pro v2/, { exact: true }).count(),
    };
    stateTrace.push({ label, url: new URL(page.url()).hash, ...state });
  }
  async function login() {
    await page.locator('input[type="number"]').first().fill(phone);
    await page.locator('input[type="password"]').fill(password);
    const responsePromise = page.waitForResponse((response) =>
      response.url().includes("/auth/users/login") && response.request().method() === "POST");
    await page.locator(".lg-cta").click();
    const response = await responsePromise;
    assert.equal(response.status(), 200, "password login must return HTTP 200");
    assert.equal((await response.json())?.code, 0, "password login must return a successful API envelope");
    await page.locator(".nx-tab").first().waitFor({ state: "visible" });
    await captureRuntimeState("login-complete");
  }

  async function openStoreFromVisibleTab() {
    const catalogResponsePromise = page.waitForResponse((response) =>
      response.url().includes("/api/store/catalog") && response.request().method() === "GET");
    const eligibilityResponsePromise = page.waitForResponse((response) =>
      response.url().includes("/api/store/purchase-eligibility") && response.request().method() === "GET");
    await page.locator(".nx-tab").filter({ hasText: /Store|商城|Cửa hàng/i }).click();
    const catalogResponse = await catalogResponsePromise;
    assert.equal(catalogResponse.status(), 200, "store catalog must return HTTP 200");
    const catalogPayload = await catalogResponse.json();
    assert.equal(catalogPayload?.code, 0, "store catalog must return a successful API envelope");
    assert.equal(catalogPayload?.data?.sourceEnvironment, "SANDBOX");
    assert.equal(catalogPayload?.data?.source, "mock");
    const eligibilityResponse = await eligibilityResponsePromise;
    const productNo = new URL(eligibilityResponse.url()).searchParams.get("productNo");
    assert.equal(typeof productNo, "string", "eligibility request must carry a server product identifier");
    assert.ok(catalogPayload?.data?.products?.some((product) => product?.id === productNo),
      "eligibility must evaluate a product from the same server catalog");
    assert.equal(eligibilityResponse.status(), 200, "purchase eligibility must return HTTP 200");
    const eligibilityPayload = await eligibilityResponse.json();
    assert.equal(eligibilityPayload?.code, 0, "purchase eligibility must return a successful API envelope");
    const eligibility = eligibilityPayload.data;
    assert.equal(eligibility.productNo, productNo);
    assert.equal(eligibility.sourceEnvironment, "SANDBOX");
    assert.equal(eligibility.runId, catalogPayload.data.runId);
    assert.equal(eligibility.serverCanonical, true);
    await page.getByText("StellarBox Pro", { exact: true }).waitFor({ state: "visible" });
    await page.getByText("NexionBox Pro v2", { exact: true }).waitFor({ state: "visible" });
    await captureRuntimeState("store-products-visible");
    // Startup guards and tab navigation are asynchronous. Prove the Store
    // remains the settled destination instead of accepting a transient render
    // that is immediately replaced by a late login redirect.
    await page.waitForTimeout(2_000);
    assert.match(page.url(), /#\/pages\/store\/store(?:\?|$)/, "Store must remain the settled visible route");
    await page.getByText("StellarBox Pro", { exact: true }).waitFor({ state: "visible" });
    await page.getByText("NexionBox Pro v2", { exact: true }).waitFor({ state: "visible" });
    assert.equal(await page.locator('[data-testid="store-catalog-error"]').count(), 0);
    assert.equal(await page.locator('[data-testid="store-catalog-empty"]').count(), 0);
  }

  await login();
  await openStoreFromVisibleTab();

  // Remote browser sessions are intentionally memory-only. A full refresh must
  // return to login with a recoverable path, then the same visible flow must work again.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('input[type="number"]').first().waitFor({ state: "visible" });
  await login();
  await openStoreFromVisibleTab();

  const uncaught = await page.evaluate(() => window.__storeSmokeUncaught || []);
  const navCancelled = (entry) => /:fail /.test(entry.errMsg) && /cancelled/i.test(entry.errMsg);
  const navigationNoise = uncaught.filter(navCancelled);
  const realUncaught = uncaught.filter((entry) => !navCancelled(entry));
  const realPageErrors = pageErrors.filter((message) => message !== "Object");
  const flattenedNavigationErrors = pageErrors.filter((message) => message === "Object");
  const failedResponses = await Promise.all(failedResponseReads);
  const expectedSandboxHolds = new Map([
    ["/api/devices/earnings", "CANONICAL_DEVICE_SANDBOX_UNAVAILABLE"],
    ["/api/tasks/assignments", "TASK_ASSIGNMENT_RUNTIME_UNSUPPORTED"],
    ["/api/config/staking/pools", "STAKING_PROFILE_INVALID"],
    ["/api/stakes", "STAKING_PROFILE_INVALID"],
    ["/api/vouchers", "GROWTH_SANDBOX_SCOPE_UNAVAILABLE"],
    ["/api/events", "GROWTH_SANDBOX_SCOPE_UNAVAILABLE"],
    ["/api/app/team/network", "TEAM_NETWORK_SANDBOX_FACTS_UNAVAILABLE"],
    ["/api/config/repurchase", "REPURCHASE_PROFILE_INVALID"],
    ["/api/repurchase/orders", "REPURCHASE_PROFILE_INVALID"],
    ["/api/app/network/rank", "NETWORK_RANK_RUNTIME_UNSUPPORTED"],
    ["/api/storefront/activity", "STOREFRONT_ACTIVITY_UNAVAILABLE"],
  ]);
  const intentionalHoldResponses = failedResponses.filter((entry) =>
    entry.status === 503 && expectedSandboxHolds.get(entry.path) === entry.message);
  const unexpectedFailedResponses = failedResponses.filter((entry) =>
    !(entry.status === 503 && expectedSandboxHolds.get(entry.path) === entry.message));
  assert.ok(
    flattenedNavigationErrors.length <= navigationNoise.length,
    `unclassified flattened page errors: ${flattenedNavigationErrors.length}; navigation cancellations: ${navigationNoise.length}`,
  );
  assert.deepEqual(realUncaught, [], `uncaught errors: ${JSON.stringify(realUncaught)}`);
  assert.deepEqual(realPageErrors, [], `page errors: ${realPageErrors.join(" | ")}`);
  assert.deepEqual(unexpectedFailedResponses, [], `unexpected 5xx responses: ${JSON.stringify(unexpectedFailedResponses)}`);
  if (evidenceDir) {
    await mkdir(evidenceDir, { recursive: true });
    await page.screenshot({ path: path.join(evidenceDir, "store-after-refresh.png"), fullPage: true });
    await writeFile(path.join(evidenceDir, "real-account-store-smoke-result.json"), `${JSON.stringify({
      result: "PASS",
      executedAt: new Date().toISOString(),
      baseUrl,
      flow: ["visible login", "visible Store tab", "catalog readback", "purchase eligibility", "refresh", "relogin", "Store readback"],
      catalog: {
        source: "mock",
        sourceEnvironment: "SANDBOX",
        availableProduct: "StellarBox Pro",
        phaseGatedProduct: "NexionBox Pro v2",
      },
      classifiedNavigationCancellations: navigationNoise.length,
      intentionalHoldResponses,
      pageErrors: realPageErrors,
      failedResponses: unexpectedFailedResponses,
    }, null, 2)}\n`, "utf8");
  }
  console.log(`REAL-ACCOUNT-STORE-SMOKE PASS — login · catalog · server eligibility · available SKU · phase-gated SKU · refresh · ${intentionalHoldResponses.length} explicit sandbox HOLD responses · ${navigationNoise.length} classified navigation cancellations`);
} catch (error) {
  if (evidenceDir) {
    await mkdir(evidenceDir, { recursive: true });
    await page.screenshot({ path: path.join(evidenceDir, "store-smoke-failure.png"), fullPage: true }).catch(() => {});
  }
  console.error(JSON.stringify({
    result: "FAIL",
    url: page.url(),
    catalogErrorVisible: await page.locator('[data-testid="store-catalog-error"]').isVisible().catch(() => false),
    catalogEmptyVisible: await page.locator('[data-testid="store-catalog-empty"]').isVisible().catch(() => false),
    catalogLoadingVisible: await page.locator('[data-testid="store-catalog-loading"]').isVisible().catch(() => false),
    authFailures,
    stateTrace,
  }));
  throw error;
} finally {
  await context.close();
  await browser.close();
}

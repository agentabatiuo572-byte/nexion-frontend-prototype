import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { ensureServer } from "./lib/dev-server-pool.mjs";
import { fileURLToPath } from "node:url";

// Transport fixture: exercises real pages/popups; does not claim provider authorization.
const root = fileURLToPath(new URL("../", import.meta.url));
const server = await ensureServer({ root, environment: "development", log: console.log });
const origin = new URL(server.baseUrl).origin;
const browser = await chromium.launch({ headless: true });
const envelope = data => JSON.stringify({ code: 0, message: "OK", data });
const flowId = `OIDC-${"a".repeat(32)}`;
const flowKey = "k".repeat(43);
const receipt = "r".repeat(43);
const authOrigin = "https://oauth.example.test";
let provider = "GOOGLE", intent = "LOGIN", completion = "unlinked", completeCalls = 0, linkCalls = 0;
let issued = false;
let completionHeaders, recoveryCalls = 0;
let statusCalls = 0, refreshCalls = 0;
let expireLinkRequest = false;
const linked = [];
const session = { accessToken: "oauth-page-fixture", refreshToken: null, tokenType: "Bearer",
  user: { userId: 90210, countryCode: "+84", phone: "912345678", nickname: "OAuth page fixture", onboardingComplete: false } };
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const transport = async route => {
  const request = route.request();
  const url = new URL(request.url());
  const ok = data => route.fulfill({ contentType: "application/json", body: envelope(data) });
  const fail = (code, message) => route.fulfill({ status: code, contentType: "application/json", body: JSON.stringify({ code, message, data: null }) });
  if (url.origin === authOrigin) {
    return route.fulfill({ contentType: "text/html", body: `<p>OAuth browser fixture</p><button id="approve">Approve</button><script>
      document.getElementById("approve").onclick = () => window.opener.postMessage(${JSON.stringify({ type: "uvel-oauth", flowId, receipt })}, ${JSON.stringify(origin)});
      </script>` });
  }
  if (url.origin !== origin) return route.continue();
  const path = url.pathname;
  if (path.endsWith("/oauth/provider/available")) return ok(["GOOGLE", "APPLE", "TELEGRAM"]);
  if (path.endsWith("/oauth/provider/linked")) return ok(linked);
  if (path.endsWith("/oauth/provider/start")) {
    ({ provider, intent } = request.postDataJSON());
    completionHeaders = undefined;
    return ok({ flowId, flowKey, expiresInSec: 600, authorizationUrl: `${authOrigin}/auth/users/oauth/provider/authorize/${"s".repeat(43)}` });
  }
  if (path.endsWith("/oauth/provider/status")) {
    statusCalls++;
    const body = request.postDataJSON();
    assert.equal(body.flowKey, flowKey);
    if (!body.receipt) {
      // A late pre-receipt poll must not undo confirmation.
      await new Promise(resolve => setTimeout(resolve, 900));
      return ok({ status: "PENDING", provider, displayName: null });
    }
    assert.equal(body.receipt, receipt);
    return ok({ status: "VERIFIED", provider, displayName: "Provider identity" });
  }
  if (path.endsWith("/oauth/provider/complete")) {
    const body = request.postDataJSON();
    assert.equal(body.receipt, receipt);
    const headers = request.headers();
    const frozen = Object.fromEntries(Object.entries(headers).filter(([name]) => name.startsWith("x-nexgrid-")));
    assert.match(headers["x-nexgrid-login-attempt-id"], /^[A-Za-z0-9_-]{16,80}$/);
    assert.match(headers["x-nexgrid-login-recovery-key"], /^[A-Za-z0-9_-]{43,128}$/);
    assert.equal(headers["x-nexgrid-execution-supported"], "false");
    assert.equal(headers["x-nexion-refresh-mode"], "cookie");
    assert.equal(headers["x-nexgrid-client-surface"], undefined);
    if (completionHeaders) assert.deepEqual(frozen, completionHeaders);
    completionHeaders = frozen;
    completeCalls++;
    if (completion === "unlinked") return fail(409, "OAUTH_ACCOUNT_LINK_REQUIRED");
    if (completion === "mfa" && !body.code) return route.fulfill({ status: 428, contentType: "application/json",
      body: JSON.stringify({ code: 428, message: "USER_TWO_FACTOR_VERIFICATION_REQUIRED",
        data: { accessToken: null, refreshToken: null, tokenType: "Challenge", user: session.user,
          challengeNo: `OTP-${"b".repeat(32)}`, deliveryHint: "***" } }) });
    if (completion === "mfa" && body.code !== "123456") return fail(422, "USER_TWO_FACTOR_CHALLENGE_INVALID");
    if (completion === "lost") return route.abort("connectionreset");
    issued = true;
    return ok(session);
  }
  if (/\/auth\/users\/login\/attempts\/[^/]+\/recover$/.test(path)) {
    assert.equal(path.split("/").at(-2), completionHeaders["x-nexgrid-login-attempt-id"]);
    const body = request.postDataJSON();
    assert.equal(body.recoveryProof, completionHeaders["x-nexgrid-login-recovery-key"]);
    assert.equal(body.authReference, `${provider}:${flowId}`);
    assert.equal(body.executionSupported, false);
    recoveryCalls++; issued = true;
    return ok(session);
  }
  if (path.endsWith("/oauth/provider/link")) {
    const body = request.postDataJSON();
    assert.equal(intent, "LINK");
    assert.equal(body.receipt, receipt);
    assert.equal(body.password, "fixture-password");
    assert.equal(request.headers().authorization, "Bearer oauth-page-fixture");
    if (expireLinkRequest) {
      expireLinkRequest = false;
      return fail(401, "TOKEN_EXPIRED");
    }
    linked.push(provider); linkCalls++;
    return ok(null);
  }
  if (path === "/auth/users/login") return ok(session);
  if (path === "/auth/users/refresh") {
    refreshCalls++;
    return issued ? ok(session) : fail(401, "USER_REFRESH_TOKEN_REQUIRED");
  }
  if (path === "/api/app/profile") return ok({ nickname: "OAuth page fixture", avatarUrl: "", avatarRevision: "", profileChangeIntervalDays: 7, nicknameChangeAvailableAt: null, avatarChangeAvailableAt: null, language: "en" });
  if (path === "/api/app/security") {
    return ok({ twoFactorEnabled: false, passwordChangedAt: null, sessions: [], nextCursor: null });
  }
  if (path === "/api/app/security/account-deletion") return ok({ status: "NONE" });
  if (path === "/api/legal/terms/current") return ok({
    source: "server", sourceEnvironment: "PRODUCTION", runId: "", requestedLocale: url.searchParams.get("locale") || "en",
    resolvedLocale: "en", requestedJurisdiction: "GLOBAL", resolvedJurisdiction: "GLOBAL", provenance: "oauth-page-fixture",
    version: "v1", effectiveAt: "2026-10-01T00:00:00Z", title: "Terms", summary: "Terms",
    sections: [{ key: "main", title: "Terms", body: "Terms", sortOrder: 0 }], acknowledged: true, acknowledgedAt: "2026-10-01T00:00:00Z",
  });
  if (path.startsWith("/api/") || path.startsWith("/auth/")) return fail(404, "FIXTURE_NOT_STUBBED");
  return route.continue();
};
await context.route("**/*", transport);
const page = await context.newPage();
const errors = [];
page.on("pageerror", e => errors.push(e.message));
const box = () => page.locator(".third-party-auth");
async function visibility(state) {
  await page.evaluate(state => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: state });
    Object.defineProperty(document, "hidden", { configurable: true, value: state === "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);
}
async function authorize(name, browserSwitch = false) {
  const [popup] = await Promise.all([
    page.waitForEvent("popup"), box().getByRole("button", { name, exact: true }).click(),
  ]);
  await popup.locator("#approve").waitFor({ state: "visible" });
  await page.evaluate(payload => window.postMessage(payload, "*"), { type: "uvel-oauth", flowId, receipt });
  assert.equal(await box().locator(".oauth-identity").count(), 0, "a message from the page itself cannot authorize the provider flow");
  if (browserSwitch) {
    await page.evaluate(() => {
      window.__oauthHideCount = 0;
      getCurrentPages().at(-1).$vm.$.onHide.push(() => { window.__oauthHideCount++; });
    });
    await visibility("hidden");
    assert.equal(await page.evaluate(() => window.__oauthHideCount), 1, "UniApp dispatched the page onHide hook");
    assert(await box().locator(".oauth-panel").isVisible(), "browser switch must preserve the pending flow");
  }
  await popup.locator("#approve").click();
  if (browserSwitch) {
    expireLinkRequest = true;
    await visibility("visible");
  }
  await box().locator(".oauth-identity").waitFor({ state: "visible" });
  const confirmedCalls = statusCalls;
  await page.waitForTimeout(3200);
  assert.equal(statusCalls, confirmedCalls, "verified flow must not restart polling after a late pending response");
  assert(await box().locator(".oauth-identity").isVisible(), "late pending response must preserve identity confirmation");
}
try {
  await page.goto(`${server.baseUrl}/?nx_device=off#/pages/login/login`);
  await box().waitFor({ state: "visible" });
  for (const name of ["Google", "Apple", "Telegram"]) {
    await authorize(name);
    await page.locator(".lg-phone__in input, input.lg-phone__in").fill("13800138000");
    assert(await page.locator(".lg-cta").getAttribute("aria-disabled") === "true"
      || await page.locator(".lg-cta").getAttribute("disabled") !== null, "phone login stays disabled while OAuth is active");
    await box().locator(".oauth-button").first().click();
    await box().locator('[role="status"]').waitFor({ state: "visible" });
    assert(page.url().includes("/pages/login/login"), "unlinked identity must not create a session");
    await box().locator(".oauth-secondary").click();
  }
  completion = "mfa";
  await authorize("Google");
  await box().locator(".oauth-button").first().click();
  await box().locator(".oauth-input input, input.oauth-input").fill("000000");
  await box().locator(".oauth-button").first().click();
  await box().locator('[role="status"]').waitFor({ state: "visible" });
  await box().locator(".oauth-input input, input.oauth-input").fill("123456");
  await box().locator(".oauth-button").first().click();
  await page.waitForURL(url => url.hash === "#/" || url.hash.includes("/pages/index/index"));
  assert(!page.url().includes("register"), "existing identity goes directly home");
  await page.evaluate(() => { window.uni.navigateTo({ url: "/pages/me/security" }); });
  await box().waitFor({ state: "visible" });
  const beforeBrowserSwitch = refreshCalls;
  await authorize("Apple", true);
  assert(await box().locator(".oauth-identity").isVisible());
  await box().locator(".oauth-input input, input.oauth-input").fill("fixture-password");
  await box().locator(".oauth-button").first().click();
  await box().locator(".oauth-panel").waitFor({ state: "detached" });
  assert(refreshCalls > beforeBrowserSwitch, "binding after browser return exercised same-account session refresh");
  assert.equal(linkCalls, 1);
  assert.equal(completeCalls, 6);
  const linkedApple = box().locator('[data-provider="Apple"]');
  assert(await linkedApple.locator("svg").isVisible());
  assert(await linkedApple.locator(".auth-provider__status").isVisible());
  assert.equal(await linkedApple.getAttribute("aria-disabled"), "true");
  await linkedApple.click({ force: true });
  await linkedApple.press("Enter");
  await linkedApple.press("Space");
  assert.equal(await box().locator(".oauth-panel").count(), 0);
  assert.equal(linkCalls, 1);
  assert.deepEqual(errors, []);
  await mkdir(new URL("../.verify-cache/oauth/", import.meta.url), { recursive: true });
  await page.screenshot({ path: fileURLToPath(new URL("../.verify-cache/oauth/security.png", import.meta.url)), fullPage: true });
  issued = false;
  const registration = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await registration.route("**/*", transport);
  const registerPage = await registration.newPage();
  await registerPage.goto(`${server.baseUrl}/?nx_device=off#/pages/register/register`);
  const [registerPopup] = await Promise.all([
    registerPage.waitForEvent("popup"),
    registerPage.locator(".third-party-auth").getByRole("button", { name: "Telegram", exact: true }).click(),
  ]);
  await registerPopup.locator("#approve").click();
  await registerPage.locator(".oauth-identity").waitFor({ state: "visible" });
  await registerPage.locator(".oauth-secondary").click();
  assert.equal(await registerPage.locator(".oauth-panel").count(), 0);
  await registerPage.screenshot({ path: fileURLToPath(new URL("../.verify-cache/oauth/register.png", import.meta.url)), fullPage: true });
  completion = "lost";
  const [lostPopup] = await Promise.all([
    registerPage.waitForEvent("popup"),
    registerPage.locator(".third-party-auth").getByRole("button", { name: "Telegram", exact: true }).click(),
  ]);
  await lostPopup.locator("#approve").click();
  await registerPage.locator(".oauth-identity").waitFor({ state: "visible" });
  await registerPage.locator(".oauth-button").first().click();
  await registerPage.locator(".oauth-panel").waitFor({ state: "detached" });
  await registerPage.evaluate(() => window.uni.reLaunch({ url: "/pages/login/login" }));
  await registerPage.waitForURL(url => url.hash.includes("/pages/login/login"));
  await registerPage.reload();
  await registerPage.locator(".lg-recovery-notice[role=status]").waitFor({ state: "visible" });
  assert.equal(await registerPage.locator('.third-party-auth [data-provider="Telegram"]').getAttribute("aria-disabled"), "true");
  await registerPage.locator(".lg-recovery-notice[role=status] [role=button]").first().click();
  await registerPage.waitForURL(url => url.hash === "#/" || url.hash.includes("/pages/index/index"));
  assert.equal(recoveryCalls, 1); assert.equal(completeCalls, 7, "recovery must not issue another provider completion");
  await registration.close();
  console.log("PASS OAuth pages: providers, unlinked rejection, MFA wrong-code retry, durable response recovery, popup receipt, pending race and account binding (transport fixture)");
} catch (error) {
  console.error("Page state:", page.url(), (await page.locator("body").innerText()).slice(-3000), errors);
  throw error;
} finally {
  await context.close();
  await browser.close();
  await server.stop();
}

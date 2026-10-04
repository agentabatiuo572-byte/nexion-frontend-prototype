import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.APP_H5_BASE_URL || "http://127.0.0.1:5173";
const baseOrigin = new URL(baseUrl).origin;
const envelope = (data) => JSON.stringify({ code: 0, message: "OK", data });
const challengeNo = `LOGIN-${"a".repeat(32)}`;
const serverState = { calibrationReads: 0, deferCalls: 0 };
const isHomeUrl = (url) => url.hash === "#/" || url.hash.includes("/pages/index/index");

function session(countryCode, phone) {
  return {
    accessToken: "e2e-access-login",
    refreshToken: null,
    tokenType: "Bearer",
    user: {
      userId: 90210,
      countryCode,
      phone,
      nickname: "Login separation E2E",
      onboardingComplete: false,
    },
  };
}

const acknowledgedTerms = {
  source: "server",
  sourceEnvironment: "PRODUCTION",
  runId: "",
  resolvedLocale: "zh-CN",
  requestedJurisdiction: "GLOBAL",
  resolvedJurisdiction: "GLOBAL",
  provenance: "login-registration-separation-e2e",
  version: "v1",
  effectiveAt: "2026-09-02T00:00:00Z",
  title: "Terms",
  summary: "Accepted terms",
  sections: [{ key: "main", title: "Terms", body: "Accepted", sortOrder: 0 }],
  acknowledged: true,
  acknowledgedAt: "2026-09-02T00:00:00Z",
};

async function installServerFixture(context) {
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== baseOrigin) return route.continue();

    if (url.pathname === "/auth/users/login/otp/send") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: envelope({ challengeNo, resendAfterSec: 60, deliveryHint: "***" }),
      });
    }
    if (url.pathname === "/auth/users/login/otp/verify") {
      const body = request.postDataJSON();
      assert.equal(body.challengeNo, challengeNo);
      assert.equal(body.code, "123456");
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope(session(body.countryCode, body.phone)) });
    }
    if (url.pathname === "/auth/users/login") {
      const body = request.postDataJSON();
      assert.equal(body.password, "e2e-password");
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope(session(body.countryCode, body.phone)) });
    }
    if (url.pathname === "/auth/users/refresh") {
      return route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ code: 401, message: "USER_REFRESH_TOKEN_REQUIRED", data: null }),
      });
    }
    if (url.pathname === "/api/onboarding/calibrate/result") {
      serverState.calibrationReads += 1;
      return route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ code: 404, message: "ONBOARDING_CALIBRATION_NOT_FOUND", data: null }),
      });
    }
    if (url.pathname === "/api/onboarding/calibrate/defer") {
      serverState.deferCalls += 1;
      return route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ code: 409, message: "LOGIN_MUST_NOT_DEFER_ONBOARDING", data: null }),
      });
    }
    if (url.pathname === "/api/legal/terms/current") {
      return route.fulfill({ status: 200, contentType: "application/json", body: envelope({ ...acknowledgedTerms, requestedLocale: url.searchParams.get("locale") || "en" }) });
    }
    if (url.pathname.startsWith("/api/") && request.headers().authorization === "Bearer e2e-access-login") {
      // Home bootstraps several unrelated projections. Keep this focused
      // fixture authenticated without inventing schemas for those modules.
      return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ code: 404, message: "E2E_NOT_STUBBED", data: null }) });
    }
    return route.continue();
  });
}

async function openLogin(browser, returnTo = "") {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await installServerFixture(context);
  const page = await context.newPage();
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
  const returnQuery = returnTo ? `?return=${encodeURIComponent(returnTo)}` : "";
  await page.goto(`${baseUrl}/?nx_device=off&login-separation-e2e=${Date.now()}#/pages/login/login${returnQuery}`);
  try {
    await page.locator(".lg-phone__in input, input.lg-phone__in").waitFor({ state: "visible", timeout: 15_000 });
  } catch (cause) {
    const body = (await page.locator("body").innerText().catch(() => "")).slice(0, 1_000);
    throw new Error(`login did not render at ${page.url()}; body=${body}; errors=${browserErrors.join(" | ")}`, { cause });
  }
  const countryCode = (await page.locator(".lg-phone__cc-t").innerText()).trim();
  const phone = countryCode === "+84" ? "912345678" : "13800138000";
  assert(["+84", "+86"].includes(countryCode), `unexpected login dial code ${countryCode}`);
  return { context, page, countryCode, phone };
}

async function otpLogin(browser, expectedRoute) {
  const login = await openLogin(browser);
  const phoneInput = login.page.locator(".lg-phone__in input, input.lg-phone__in");
  await phoneInput.fill(login.phone);
  await login.page.locator(".lg-switch").click();
  await login.page.locator(".lg-cta").click();
  const otp = login.page.locator(".lg-otp__in input");
  await otp.first().waitFor({ state: "visible", timeout: 10_000 });
  for (let index = 0; index < 6; index += 1) await otp.nth(index).fill(String(index + 1));
  await login.page.waitForURL(
    (url) => expectedRoute === "/pages/index/index" ? isHomeUrl(url) : url.hash.includes(expectedRoute),
    { timeout: 15_000 },
  );
  return login;
}

const browser = await chromium.launch({ headless: true });
try {
  const first = await otpLogin(browser, "/pages/index/index");
  assert(!first.page.url().includes("/pages/onboarding/estimator"), "OTP login must not enter registration onboarding");
  assert(!first.page.url().includes("/pages/register/success"), "OTP login must not enter registration success");
  await first.context.close();

  const otpRelogin = await otpLogin(browser, "/pages/index/index");
  assert(!otpRelogin.page.url().includes("/pages/onboarding/estimator"), "repeated OTP login must still go directly Home");
  await otpRelogin.context.close();

  const passwordRelogin = await openLogin(browser);
  await passwordRelogin.page.locator(".lg-phone__in input, input.lg-phone__in").fill(passwordRelogin.phone);
  await passwordRelogin.page.locator(".lg-field--flex input, input.lg-field--flex").first().fill("e2e-password");
  await passwordRelogin.page.locator(".lg-cta").click();
  await passwordRelogin.page.waitForURL(isHomeUrl, { timeout: 15_000 });
  assert(!passwordRelogin.page.url().includes("/pages/onboarding/estimator"), "password login must go directly Home");
  await passwordRelogin.context.close();

  const blockedReturn = await openLogin(browser, "/pages/register/success");
  await blockedReturn.page.locator(".lg-phone__in input, input.lg-phone__in").fill(blockedReturn.phone);
  await blockedReturn.page.locator(".lg-field--flex input, input.lg-field--flex").first().fill("e2e-password");
  await blockedReturn.page.locator(".lg-cta").click();
  await blockedReturn.page.waitForURL(isHomeUrl, { timeout: 15_000 });
  assert(!blockedReturn.page.url().includes("/pages/register/"), "returnTo must not re-enter registration after login");
  await blockedReturn.context.close();

  assert.equal(serverState.deferCalls, 0, "login must not write registration onboarding state");
  assert.equal(serverState.calibrationReads, 0, "login must not read registration onboarding state");
  console.log("login-registration-separation-h5:PASS otp=home repeated-otp=home password=home blocked-return=home onboarding-writes=0");
} finally {
  await browser.close();
}

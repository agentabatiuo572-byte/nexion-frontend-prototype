import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.APP_H5_BASE_URL || "http://127.0.0.1:5173";
const browser = await chromium.launch({ headless: true });
const pageOptions = { viewport: { width: 390, height: 844 } };

async function validPhoneFor(page) {
  const countryCode = (await page.locator(".lg-phone__cc-t, .rg-phone__cc-t").innerText()).trim();
  const phoneNumber = countryCode === "+84" ? "912345678"
    : countryCode === "+86" ? "13800138000"
      : null;
  assert(phoneNumber, `unexpected selectable country code in keyboard auth regression: ${countryCode}`);
  return {
    countryCode,
    phoneNumber,
  };
}

const envelope = (data) => JSON.stringify({ code: 0, message: "OK", data });
const evidenceDir = process.env.AUTH_OTP_EVIDENCE_DIR;
if (evidenceDir) await mkdir(evidenceDir, { recursive: true });

async function verifyOtpOrder(page, { name, prefix, endpoint, status, invalidMessage }) {
  let receiveRoute;
  let releaseRoute;
  let attempts = 0;
  await page.route(`**${endpoint}`, async (route) => {
    attempts += 1;
    assert(receiveRoute, `${name}: unexpected duplicate verification request`);
    const released = new Promise((resolve) => { releaseRoute = resolve; });
    receiveRoute(route);
    receiveRoute = null;
    await released;
  });
  const inputs = page.locator(`.${prefix}-otp__in input, input.${prefix}-otp__in`);
  const passwords = page.locator(`.${prefix}-field--flex input, input.${prefix}-field--flex`);
  const waitForVerification = () => new Promise((resolve) => { receiveRoute = resolve; });
  async function enterCode(code) {
    for (let index = 0; index < 6; index += 1) await inputs.nth(index).fill("");
    // The filled class comes from the page's code state, after UniApp's input
    // throttle, whereas the native input value changes before that event.
    await page.waitForFunction((selector) => document.querySelectorAll(selector).length === 0, `.${prefix}-otp__in--filled`);
    for (let index = 0; index < 6; index += 1) {
      await inputs.nth(index).fill(code[index]);
      await page.waitForFunction(({ selector, filled, index }) => document.querySelectorAll(selector)[index]?.classList.contains(filled), {
        selector: `.${prefix}-otp__in`, filled: `${prefix}-otp__in--filled`, index,
      });
    }
  }
  async function respond(route, httpStatus, body) {
    await route.fulfill({ status: httpStatus, contentType: "application/json", body });
    releaseRoute();
    releaseRoute = null;
  }
  async function assertStillOtp(message) {
    assert.equal(await inputs.count(), 6, `${name}: ${message}`);
    assert.equal(await passwords.count(), 0, `${name}: password inputs must not appear before current-code success`);
  }
  async function screenshot(suffix) {
    if (evidenceDir) await page.screenshot({ path: path.join(evidenceDir, `${name}-${suffix}.png`), fullPage: true });
  }

  const rejectedRequest = waitForVerification();
  await enterCode("000000");
  const rejectedRoute = await rejectedRequest;
  assert.equal(rejectedRoute.request().postDataJSON().code, "000000");
  await assertStillOtp("must wait on the OTP step while verification is pending");
  await respond(rejectedRoute, 422, JSON.stringify({ code: 422, message: invalidMessage, data: null }));
  await page.locator(`.${prefix}-error`).waitFor({ state: "visible" });
  assert.match(await page.locator(`.${prefix}-error`).innerText(), /验证码|code|mã/i, `${name}: server OTP rejection must show the OTP error`);
  await assertStillOtp("an invalid six-digit code must stay on the OTP step");
  await screenshot("invalid-otp");

  const staleRequest = waitForVerification();
  await enterCode("123456");
  const staleRoute = await staleRequest;
  await inputs.first().fill("9");
  await page.waitForTimeout(150);
  assert.equal(staleRoute.request().postDataJSON().code, "123456");
  await respond(staleRoute, 200, envelope({ status }));
  await page.waitForFunction((selector) => document.querySelector(selector)?.getAttribute("aria-disabled") === "false", `.${prefix}-cta`);
  await assertStillOtp("a success for edited digits must not advance");
  assert.equal(await inputs.first().inputValue(), "9");

  const verifiedRequest = waitForVerification();
  await enterCode("123456");
  const verifiedRoute = await verifiedRequest;
  await assertStillOtp("a valid-looking code must still await the server");
  await respond(verifiedRoute, 200, envelope({ status }));
  await passwords.first().waitFor({ state: "visible" });
  assert.equal(await inputs.count(), 0, `${name}: verified current digits must open password setup`);
  assert.equal(attempts, 3, `${name}: edits during verification must not duplicate requests`);
  await screenshot("verified-password");
  console.log(`${name}: pending, invalid, changed-code stale success, and verified password step passed`);
}

try {
  const page = await browser.newPage(pageOptions);
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("response", async (response) => {
    if (response.status() >= 400) {
      browserErrors.push(`${response.status()} ${response.url()} ${(await response.text().catch(() => "")).slice(0, 300)}`);
    }
  });
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  let attempts = 0;
  await page.route("**/auth/users/login", async (route) => {
    attempts += 1;
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ code: 401, message: "USER_INVALID_CREDENTIALS", data: null }),
    });
  });

  await page.goto(`${baseUrl}/?nx_device=off#/pages/login/login`);
  const phone = page.locator(".lg-phone__in input, input.lg-phone__in");
  try {
    await phone.waitFor({ state: "visible", timeout: 10_000 });
  } catch (error) {
    const body = (await page.locator("body").innerText().catch(() => "")).slice(0, 500);
    const html = (await page.locator("body").innerHTML().catch(() => "")).slice(0, 1000);
    throw new Error(`App login did not render at ${page.url()}: ${body}; html: ${html}; browser errors: ${browserErrors.join(" | ")}`, { cause: error });
  }
  const { countryCode, phoneNumber } = await validPhoneFor(page);
  await phone.fill(phoneNumber);
  const password = page.locator(".lg-field--flex input, input.lg-field--flex").first();
  await phone.press("Enter");
  assert.equal(await password.evaluate((input) => input === document.activeElement), true, "phone Enter must focus the password field");
  await password.fill("invalid-test-password");
  assert.equal(await page.locator(".lg-cta").getAttribute("aria-disabled"), "false", `test phone must be valid for ${countryCode}`);

  const request = page.waitForRequest((candidate) =>
    candidate.method() === "POST" && candidate.url().includes("/auth/users/login"),
  );
  await password.press("Enter");
  await request;
  await page.waitForTimeout(150);

  assert.equal(attempts, 1, "App login Enter must produce exactly one login request");

  await page.unroute("**/auth/users/login");
  for (const httpStatus of [200, 401]) {
    let receiveLogin;
    let releaseLogin;
    const loginStarted = new Promise((resolve) => { receiveLogin = resolve; });
    await page.route("**/auth/users/login", async (route) => {
      attempts += 1;
      const released = new Promise((resolve) => { releaseLogin = resolve; });
      receiveLogin(route);
      await released;
    });
    const before = attempts;
    await password.fill("OriginalPassword123!");
    // UniApp throttles its input event by 100 ms; let the page receive the edit.
    await page.waitForTimeout(150);
    await password.press("Enter");
    const pendingLogin = await loginStarted;
    await password.fill("EditedPassword123!");
    await page.waitForTimeout(150);
    await password.press("Enter");
    assert.equal(pendingLogin.request().postDataJSON().password, "OriginalPassword123!");
    assert.equal(attempts, before + 1, "password edits and Enter during login must not duplicate requests");
    await pendingLogin.fulfill({
      status: httpStatus, contentType: "application/json",
      body: httpStatus === 200 ? envelope({
        accessToken: null, refreshToken: null, tokenType: "challenge",
        challengeNo: `OTP-${"d".repeat(32)}`, deliveryHint: "***",
        user: { userId: 999999, countryCode, phone: phoneNumber, nickname: "Fixture", onboardingComplete: true },
      }) : JSON.stringify({ code: 401, message: "USER_INVALID_CREDENTIALS", data: null }),
    });
    releaseLogin();
    await page.waitForFunction(() => document.querySelector(".lg-cta")?.getAttribute("aria-disabled") === "false", undefined, { timeout: 10_000 }).catch(async (cause) => {
      throw new Error(`password ${httpStatus} response did not release login at ${page.url()}: ${(await page.locator("body").innerText()).slice(0, 800)}; errors: ${browserErrors.join(" | ")}`, { cause });
    });
    assert.equal(await password.inputValue(), "EditedPassword123!", "old password response must leave edited input available for retry");
    assert.equal(await page.locator(".lg-error").count(), 0, "old response must not attach an error to the edited password");
    assert.match(page.url(), /pages\/login\/login$/, "old password response must not sign in");
    await page.unroute("**/auth/users/login");
  }
  console.log("password login: edited input releases busy state after old 2FA challenge and rejection");

  const otpPage = await browser.newPage(pageOptions);
  let loginOtpAttempts = 0;
  await otpPage.route("**/auth/users/login/otp/send", async (route) => {
    loginOtpAttempts += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: envelope({ challengeNo: `LOGIN-${"a".repeat(32)}`, resendAfterSec: 60, deliveryHint: "***" }),
    });
  });
  await otpPage.goto(`${baseUrl}/?nx_device=off#/pages/login/login`);
  const otpPhone = otpPage.locator(".lg-phone__in input, input.lg-phone__in");
  await otpPhone.waitFor({ state: "visible", timeout: 10_000 });
  await otpPhone.fill((await validPhoneFor(otpPage)).phoneNumber);
  await otpPage.locator(".lg-switch").click();
  const loginOtpRequest = otpPage.waitForRequest((candidate) =>
    candidate.method() === "POST" && candidate.url().includes("/auth/users/login/otp/send"),
  );
  await otpPhone.press("Enter");
  await loginOtpRequest;
  await otpPage.locator(".lg-otp__in").first().waitFor({ state: "visible" });
  assert.equal(loginOtpAttempts, 1, "OTP login phone Enter must produce exactly one send-code request");

  const registerPage = await browser.newPage(pageOptions);
  let registrationOtpAttempts = 0;
  await registerPage.route("**/auth/users/register/otp/send", async (route) => {
    registrationOtpAttempts += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: envelope({ challengeNo: `REG-${"b".repeat(32)}`, resendAfterSec: 60, deliveryHint: "***" }),
    });
  });
  await registerPage.goto(`${baseUrl}/?nx_device=off#/pages/register/register`);
  const registerPhone = registerPage.locator(".rg-phone__in input, input.rg-phone__in");
  await registerPhone.waitFor({ state: "visible", timeout: 10_000 });
  await registerPhone.fill((await validPhoneFor(registerPage)).phoneNumber);
  const registrationOtpRequest = registerPage.waitForRequest((candidate) =>
    candidate.method() === "POST" && candidate.url().includes("/auth/users/register/otp/send"),
  );
  await registerPhone.press("Enter");
  await registrationOtpRequest;
  await registerPage.locator(".rg-otp__in").first().waitFor({ state: "visible" });
  assert.equal(registrationOtpAttempts, 1, "registration phone Enter must produce exactly one send-code request");
  await verifyOtpOrder(registerPage, {
    name: "register", prefix: "rg", endpoint: "/auth/users/register/otp/verify",
    status: "REGISTRATION_OTP_VERIFIED", invalidMessage: "USER_REGISTRATION_OTP_INVALID",
  });

  const resetPage = await browser.newPage(pageOptions);
  let resetSendAttempts = 0;
  await resetPage.route("**/auth/users/password-reset/otp/send", async (route) => {
    resetSendAttempts += 1;
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: envelope({ challengeNo: `RESET-${"c".repeat(32)}`, resendAfterSec: 60, deliveryHint: "***" }),
    });
  });
  await resetPage.goto(`${baseUrl}/?nx_device=off#/pages/login/login`);
  const resetPhone = resetPage.locator(".lg-phone__in input, input.lg-phone__in");
  await resetPhone.waitFor({ state: "visible", timeout: 10_000 });
  await resetPhone.fill((await validPhoneFor(resetPage)).phoneNumber);
  await resetPage.locator(".lg-forgot").click();
  await resetPhone.press("Enter");
  await resetPage.locator(".lg-otp__in").first().waitFor({ state: "visible" });
  assert.equal(resetSendAttempts, 1, "password reset phone Enter must send exactly one challenge");
  await verifyOtpOrder(resetPage, {
    name: "reset", prefix: "lg", endpoint: "/auth/users/password-reset/otp/verify",
    status: "PASSWORD_RESET_OTP_VERIFIED", invalidMessage: "USER_PASSWORD_RESET_CHALLENGE_INVALID",
  });
} finally {
  await browser.close();
}

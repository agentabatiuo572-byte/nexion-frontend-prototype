import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.APP_H5_BASE_URL || "http://127.0.0.1:5173";
const browser = await chromium.launch({ headless: true });

async function validPhoneFor(page) {
  const countryCode = (await page.locator(".lg-phone__cc-t, .rg-phone__cc-t").innerText()).trim();
  return {
    countryCode,
    phoneNumber: countryCode === "+84" ? "912345678"
      : countryCode === "+81" ? "9012345678"
        : "4155550123",
  };
}

const envelope = (data) => JSON.stringify({ code: 0, message: "OK", data });

try {
  const page = await browser.newPage();
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
      body: JSON.stringify({ code: 401, message: "USER_INVALID_CREDENTIALS" }),
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

  const otpPage = await browser.newPage();
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

  const registerPage = await browser.newPage();
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
} finally {
  await browser.close();
}

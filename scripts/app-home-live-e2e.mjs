#!/usr/bin/env node
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureServer, identify } from "./lib/dev-server-pool.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const managedServer = process.env.UNI_BASE_URL
  ? null
  : await ensureServer({ root, reuseUrl: process.env.FIXED_MOCK_REUSE_URL || null });
const base = process.env.UNI_BASE_URL ?? managedServer.baseUrl;
const screenshot = process.env.APP_HOME_SCREENSHOT ?? "D:/workspace/bug-pic/app-home-fixed-mock.png";
const resultPath = process.env.APP_HOME_E2E_RESULT ?? "D:/workspace/bug-pic/app-home-fixed-mock.json";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const backendRequests = [];
const consoleErrors = [];
const pageErrors = [];

page.on("request", (request) => {
  const url = new URL(request.url());
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) {
    backendRequests.push(request.url());
  }
});
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => pageErrors.push(error.message));

try {
  const runtimeIdentity = await identify(base, { root });
  await page.goto(`${base}/?nx_device_inner=1#/pages/login/login`, {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  const loginShell = page.locator(".lg-wrap");
  const phoneInput = page.getByTestId("mock-preview-phone").locator("input");
  const passwordInput = page.getByTestId("mock-preview-password").locator("input");
  const previewAccountReady = await loginShell.getAttribute("data-preview-account-status") === "ready";
  const previewPhonePrefilled = await phoneInput.inputValue() === "901234567";
  await passwordInput.press("Enter");
  await page.waitForURL(/#\/$|#\/pages\/index\/index|pages\/onboarding\/connect/, { timeout: 15_000 });
  // This suite checks account features after declining optional phone setup.
  if (page.url().includes("/onboarding/connect")) {
    await page.locator(".cn-back").click();
    await page.evaluate(() => uni.reLaunch({ url: "/pages/index/index" }));
    await page.waitForURL(/#\/$|#\/pages\/index\/index/);
  }
  await page.waitForTimeout(1_000);

  for (let attempt = 0; attempt < 12; attempt += 1) {
    for (const selector of [".tcs-dismiss", ".vcs-dismiss", ".tcs-close", ".vcs-close"]) {
      const dismiss = page.locator(selector);
      if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
    }
    await page.waitForTimeout(150);
  }

  const body = await page.locator("body").innerText();
  const signedInWithoutRegistration = /今日收益|Today's earnings|Thu nhập hôm nay/.test(body)
    && !/立即注册|Sign up now|Đăng ký ngay/.test(body);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1_000);
  const bodyAfterReload = await page.locator("body").innerText();
  const checks = {
    fixedMockRuntime: runtimeIdentity.ok,
    previewAccountReady,
    previewPhonePrefilled,
    signedInWithoutRegistration,
    sessionSurvivesReload: /今日收益|Today's earnings|Thu nhập hôm nay/.test(bodyAfterReload)
      && !/立即注册|Sign up now|Đăng ký ngay/.test(bodyAfterReload),
    homeVisible: await page.locator('.nx-header [aria-label="UVEL"]').isVisible(),
    brandLoaded: await page.locator('.nx-header .uvel-brand img:visible').evaluateAll(images =>
      images.length === 1 && images.every(image => image.complete && image.naturalWidth === 712 && image.naturalHeight === 246)),
    localMockOnly: backendRequests.length === 0,
    deletedModeHidden: !/Acceptance Sandbox|Sandbox authentication|remote mode/i.test(bodyAfterReload),
  };
  await page.screenshot({ path: screenshot, fullPage: true });
  const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  const result = {
    executedAt: new Date().toISOString(),
    url: page.url(),
    checks,
    backendRequests,
    consoleErrors,
    pageErrors,
    screenshot,
  };
  await mkdir(dirname(resultPath), { recursive: true });
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(result, null, 2));
  if (failures.length || consoleErrors.length || pageErrors.length) {
    throw new Error(`APP_HOME_FIXED_MOCK_E2E_FAILED:${[...failures, ...consoleErrors, ...pageErrors].join("|")}`);
  }
} finally {
  await browser.close();
  managedServer?.stop();
}

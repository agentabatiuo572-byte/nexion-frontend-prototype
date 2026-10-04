import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.UNI_BASE_URL || process.env.BASE_URL || "http://127.0.0.1:5173";
const browser = await chromium.launch();
const rejectMissingCookie = (route) => route.fulfill({
  status: 401, contentType: "application/json",
  body: JSON.stringify({ code: 401, message: "AUTH_REQUIRED", data: null }),
});

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
  await context.route("**/auth/users/refresh", rejectMissingCookie);
  await context.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("nexgrid-auth-v1", JSON.stringify({
      type: "object",
      data: {
        isAuthenticated: true,
        email: "",
        accountId: "user:reload-witness",
        onboardingComplete: true,
      },
    }));
    localStorage.setItem("nexgrid-locale-v1", JSON.stringify({
      type: "object",
      data: { code: "zh", userSet: true },
    }));
  });
  const page = await context.newPage();
  let loginNavigationCount = 0;
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame() && frame.url().includes("/pages/login/login?notice=server-session-reload")) {
      loginNavigationCount += 1;
    }
  });
  await page.goto(`${base}/?nx_device=off#/pages/earn/earn`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(() => location.hash.includes("/pages/login/login?notice=server-session-reload"), undefined, { timeout: 8_000 });
  const witness = await page.locator("[data-qa='server-session-reload-notice']");
  await witness.waitFor({ state: "visible", timeout: 8_000 });
  const text = (await witness.innerText()).trim();
  assert.match(text, /页面刷新后会安全恢复服务端会话；只有会话已失效时才需要重新登录/);
  const phoneInput = page.locator(".lg-phone__in input");
  await phoneInput.fill("13800138000");
  // Two full guard ticks must not re-launch the already visible login page and
  // erase a user's in-progress credential input.
  await page.waitForTimeout(2_400);
  assert.equal(loginNavigationCount, 1, "recovery must navigate to login exactly once");
  assert.equal(await phoneInput.inputValue(), "13800138000", "login input must survive later guard ticks");
  const currentHash = await page.evaluate(() => location.hash || "");
  assert.equal(currentHash.includes("/pages/onboarding/"), false);
  console.log(`SERVER-SESSION-RELOAD-RUNTIME: PASS (navigation=${loginNavigationCount}; ${text})`);
  await context.close();

  const freshContext = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
  await freshContext.route("**/auth/users/refresh", rejectMissingCookie);
  await freshContext.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("nexgrid-locale-v1", JSON.stringify({
      type: "object",
      data: { code: "zh", userSet: true },
    }));
  });
  const freshPage = await freshContext.newPage();
  await freshPage.goto(`${base}/?nx_device=off#/pages/earn/earn`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await freshPage.waitForFunction(() => location.hash.includes("/pages/onboarding/intro"), undefined, { timeout: 8_000 });
  assert.equal(await freshPage.locator("[data-qa='server-session-reload-notice']").count(), 0,
    "a first-time user must not receive the returning-session notice");
  console.log("SERVER-SESSION-RELOAD-FRESH-RUNTIME: PASS (onboarding)");
  await freshContext.close();

  // A transient cookie-restore failure is not a server authentication verdict.
  // Use a new isolated carrier with no token; only the refresh response is
  // controlled, and no authenticated business command is submitted.
  const retryContext = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
  await retryContext.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("nexgrid-auth-v1", JSON.stringify({ type: "object", data: {
      isAuthenticated: true, email: "", accountId: "user:reload-witness", onboardingComplete: true,
    } }));
    localStorage.setItem("nexgrid-locale-v1", JSON.stringify({ type: "object", data: { code: "zh", userSet: true } }));
  });
  let retryRequests = 0;
  const requestTimes = [];
  await retryContext.route("**/auth/users/refresh", async (route) => {
    retryRequests += 1;
    requestTimes.push(Date.now());
    const status = retryRequests === 1 ? 503 : 401;
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify({
      code: status, message: status === 503 ? "TEMPORARILY_UNAVAILABLE" : "AUTH_REQUIRED", data: null,
    }) });
  });
  const retryPage = await retryContext.newPage();
  await retryPage.goto(`${base}/?nx_device=off#/pages/earn/earn`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await retryPage.getByText("暂时无法恢复登录，正在自动重试。", { exact: true }).waitFor({ state: "visible", timeout: 8_000 });
  await retryPage.waitForTimeout(2_400);
  assert.equal(retryRequests, 1, "foreground ticks must respect the retry backoff");
  assert.match(await retryPage.evaluate(() => location.hash), /pages\/earn\/earn/,
    "a 503 must not navigate to login or onboarding");
  await retryPage.locator("[data-qa='server-session-reload-notice']").waitFor({ state: "visible", timeout: 20_000 });
  assert.equal(retryRequests, 2, "automatic retry must resume without a user reload");
  assert.ok(requestTimes[1] - requestTimes[0] >= 15_000, "retry must wait at least 15 seconds");
  console.log("SERVER-SESSION-RELOAD-TRANSIENT-RUNTIME: PASS (503 preserved route; delayed 401 required login)");
  await retryContext.close();
} finally {
  await browser.close();
}

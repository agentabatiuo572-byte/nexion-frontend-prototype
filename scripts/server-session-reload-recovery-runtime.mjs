import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.UNI_BASE_URL || process.env.BASE_URL || "http://127.0.0.1:5173";
const browser = await chromium.launch();

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });
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
  assert.match(text, /数据在服务端安全保存，重新登录即可恢复/);
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
} finally {
  await browser.close();
}

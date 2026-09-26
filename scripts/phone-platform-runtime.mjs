import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { ensureServer, identify } from "./lib/dev-server-pool.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = /PRODUCT_TARGET[^=]*=\s*"(app|h5)"/.exec(await readFile(resolve(root, "src/lib/product-target.ts"), "utf8"))?.[1];
assert.ok(target);
const artifacts = resolve(tmpdir(), `phone-platform-${target}-${Date.now()}`);
const cases = [];
let server, browser;
try {
  await mkdir(artifacts, { recursive: true });
  server = await ensureServer({ root });
  assert.ok((await identify(server.baseUrl, { root })).ok);
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  const go = async path => {
    await page.evaluate(path => uni.reLaunch({ url: path }), path);
    await page.waitForURL(url => url.hash.includes(path.split("?")[0]));
  };
  await page.goto(`${server.baseUrl}/?nx_device_inner=1#/pages/login/login`);
  await page.locator('.lg-wrap[data-preview-account-status="ready"]').waitFor();
  await page.getByTestId("mock-preview-password").locator("input").press("Enter");
  await page.waitForURL(target === "app" ? /onboarding\/connect/ : /#\/$|pages\/index\/index/);
  if (target === "app") {
    await page.locator('.cn-go--glow[aria-disabled="false"]').press("Enter");
    await page.locator(".cn-go--on").waitFor({ timeout: 25000 });
    await page.locator(".cn-go--on").click();
    await page.waitForURL(/#\/$|pages\/index\/index/);
    const before = await page.evaluate(async () => (await import("/src/store/app.ts")).useApp().phoneBinding);
    assert.ok(before?.installationId);
    await page.reload();
    await page.locator(".home-earnings-cluster").waitFor();
    const after = await page.evaluate(async () => (await import("/src/store/app.ts")).useApp().phoneBinding);
    assert.equal(after?.installationId, before.installationId);
    cases.push("first activation persisted after reload");
    await page.evaluate(async () => {
      const { useApp } = await import("/src/store/app.ts");
      const { useSession } = await import("/src/store/session.ts");
      const app = useApp();
      uni.setStorageSync("nexgrid-device-id-v1", { deviceId: "runtime-second-phone", deviceName: "Second phone" });
      useSession().claim(app.accountKey, "signed-app");
      if (!app.acceptPhoneSignIn()) throw new Error("sign-in persistence failed");
    });
    for (const locale of ["zh", "en", "vi"]) for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width: theme === "light" ? 320 : 390, height: 844 });
      await page.evaluate(async ({ locale, theme }) => {
        (await import("/src/store/locale.ts")).useLocaleStore().setLocale(locale);
        (await import("/src/store/theme.ts")).useTheme().setMode(theme);
      }, { locale, theme });
      await go("/pages/onboarding/connect?mode=recalibrate");
      await page.locator('[role="alert"]').waitFor();
      assert.ok((await page.locator('[role="alert"]').innerText()).trim());
      await page.locator('.cn-go--glow[aria-disabled="false"]').click();
      await page.locator('.cn-go--glow[aria-disabled="false"]').waitFor();
      assert.equal(await page.locator(".cn-test").count(), 0);
      await page.screenshot({ path: resolve(artifacts, `${locale}-${theme}-blocked.png`) });
      await page.locator(".cn-back").click();
      await page.waitForURL(/pages\/me\/devices/);
      cases.push(`${locale}/${theme}: denied replacement, retry and exit`);
    }
    await page.evaluate(async () => {
      (await import("/src/store/config.ts")).useConfig().config.phoneBinding = { allowReplacement: true, minReplacementIntervalDays: 0 };
      (await import("/src/store/auth.ts")).useAuth().requireOnboarding();
    });
    await go("/pages/onboarding/connect?mode=recalibrate");
    await page.locator('.cn-go--glow[aria-disabled="false"]').click();
    await page.locator(".cn-go--on").waitFor({ timeout: 25000 }).catch(async error => {
      console.error(await page.evaluate(async () => ({ url: location.href, text: document.body.innerText,
        policy: (await import("/src/store/config.ts")).useConfig().config.phoneBinding,
        failed: (await import("/src/store/config.ts")).useConfig().syncFailed,
        loading: (await import("/src/store/config.ts")).useConfig().loading,
        error: (await import("/src/store/app.ts")).useApp().phoneActivationError() })));
      throw error;
    });
    await page.locator('[role="note"]').waitFor();
    await page.screenshot({ path: resolve(artifacts, "replacement-confirm.png") });
    await page.locator(".cn-go--on").click();
    await page.waitForURL(/#\/$|pages\/index\/index/);
    const replaced = await page.evaluate(async () => {
      const app = (await import("/src/store/app.ts")).useApp();
      return { binding: app.phoneBinding, onboarding: (await import("/src/store/auth.ts")).useAuth().onboardingComplete,
        old: app.devices.filter(d => d.kind === "phone" && d.id !== app.phoneBinding?.deviceId) };
    });
    assert.equal(replaced.binding?.installationId, "runtime-second-phone");
    assert.equal(replaced.onboarding, true);
    assert.ok(replaced.old.every(d => d.activatedAt === null && !d.currentTask));
    await page.reload();
    await page.locator(".home-earnings-cluster").waitFor();
    assert.equal(await page.evaluate(async () => (await import("/src/store/app.ts")).useApp().phoneBinding?.installationId), "runtime-second-phone");
    cases.push("explicit replacement and first onboarding completion persisted");
  } else {
    await page.locator(".phone-policy-notice").waitFor();
    for (const route of ["/pages/onboarding/connect", "/pages/onboarding/estimator"]) {
      await page.evaluate(route => uni.reLaunch({ url: route }), route);
      await page.waitForURL(/pages\/register\/success/);
      assert.equal(await page.locator(".cn-go, .est-go").count(), 0);
      await page.locator(".rs-continue").click();
      await page.waitForURL(/#\/$|pages\/index\/index/);
      cases.push(`web deep link blocked: ${route}`);
    }
    const blocked = await page.evaluate(async () => {
      const app = (await import("/src/store/app.ts")).useApp();
      const cap = (await import("/src/lib/device-capability.ts")).fallbackCapability();
      const error = app.applyPhoneCalibration(cap);
      app.tick(1000);
      return { error, binding: app.phoneBinding, phones: app.devices.filter(d => d.kind === "phone") };
    });
    assert.equal(blocked.error, "web-only");
    assert.equal(blocked.binding, null);
    assert.ok(blocked.phones.every(d => !d.currentTask && !d.onlineHeartbeatAt));
    for (const locale of ["zh", "en", "vi"]) for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width: theme === "light" ? 320 : 390, height: 844 });
      await page.evaluate(async ({ locale, theme }) => {
        (await import("/src/store/locale.ts")).useLocaleStore().setLocale(locale);
        (await import("/src/store/theme.ts")).useTheme().setMode(theme);
      }, { locale, theme });
      await page.locator(".phone-policy-notice").waitFor();
      await page.screenshot({ path: resolve(artifacts, `${locale}-${theme}-web.png`) });
      cases.push(`${locale}/${theme}: web capability notice`);
    }
    const registrationContext = await browser.newContext({ viewport: { width: 320, height: 568 } });
    const registrationPage = await registrationContext.newPage();
    registrationPage.on("pageerror", error => errors.push(error.message));
    const digits = `6505${String(Date.now()).slice(-6)}`;
    await registrationPage.goto(`${server.baseUrl}/?nx_device_inner=1#/pages/register/register?ref=NEXGRID-AB12`);
    if ((await registrationPage.locator(".rg-phone__cc-t").innerText()).trim() !== "+1") {
      await registrationPage.locator(".rg-phone__cc").click();
      await registrationPage.locator(".cc-row", { hasText: "+1" }).first().click();
    }
    await registrationPage.locator(".rg-phone__in input").fill(digits);
    await registrationPage.locator(".rg-cta").click().catch(async error => {
      console.error(await registrationPage.locator("body").innerText());
      throw error;
    });
    await registrationPage.locator(".cs-piece").waitFor();
    const geometry = await registrationPage.evaluate(phone => ({
      ratio: window.__nexgridAuthDev.inspect(phone).captcha.targetRatio,
      width: document.querySelector("#cs-track").getBoundingClientRect().width,
    }), `+1${digits}`);
    const handle = await registrationPage.locator(".cs-handle").boundingBox();
    await registrationPage.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await registrationPage.mouse.down();
    await registrationPage.mouse.move(handle.x + handle.width / 2 + geometry.ratio * (geometry.width - 48), handle.y + handle.height / 2, { steps: 12 });
    await registrationPage.mouse.up();
    await registrationPage.locator(".rg-step2").waitFor();
    for (let i = 0; i < 6; i++) await registrationPage.locator(".rg-otp__in input").nth(i).fill("1");
    await registrationPage.locator(".rg-step3").waitFor();
    await registrationPage.locator(".rg-step3 input").nth(0).fill("StrongPass123!");
    await registrationPage.locator(".rg-step3 input").nth(1).fill("StrongPass123!");
    await registrationPage.locator(".rg-cta").click();
    await registrationPage.waitForURL(/pages\/register\/success/);
    await registrationPage.locator(".rs-h5-download").waitFor();
    const readRegistration = () => registrationPage.evaluate(async () => {
      const app = (await import("/src/store/app.ts")).useApp();
      const auth = (await import("/src/store/auth.ts")).useAuth();
      const bills = (uni.getStorageSync("nexgrid-bills-accounts-v1") || {})[app.accountKey]?.bills || [];
      return { account: auth.accountId, binding: app.phoneBinding,
        phones: app.devices.filter(d => d.kind === "phone"),
        gifts: bills.filter(b => b.type === "bonus" && b.ref?.startsWith("GIFT-")).map(b => b.id).sort() };
    });
    const registered = await readRegistration();
    assert.equal(registered.binding, null);
    assert.ok(registered.phones.every(d => d.activatedAt === null && !d.currentTask));
    assert.equal(registered.gifts.length, 2);
    await registrationPage.screenshot({ path: resolve(artifacts, "new-registration-download.png") });
    await registrationPage.locator(".rs-h5-download uni-button").click();
    await registrationPage.locator('.rs-h5-download uni-button:not([disabled])').waitFor();
    for (const locale of ["zh", "en", "vi"]) for (const theme of ["light", "dark"]) {
      await registrationPage.evaluate(async ({ locale, theme }) => {
        (await import("/src/store/locale.ts")).useLocaleStore().setLocale(locale);
        (await import("/src/store/theme.ts")).useTheme().setMode(theme);
      }, { locale, theme });
      await registrationPage.locator(".rs-retry").scrollIntoViewIfNeeded();
      await registrationPage.evaluate(() => {
        const root = document.querySelector(".rs-root");
        root.scrollTop = root.scrollHeight;
      });
      const layout = await registrationPage.evaluate(() => ({
        main: document.querySelector(".rs-main").getBoundingClientRect().bottom,
        download: document.querySelector(".rs-h5-download").getBoundingClientRect().top,
        retry: document.querySelector(".rs-retry").getBoundingClientRect().bottom,
        footer: document.querySelector(".rs-footer").getBoundingClientRect().top,
      }));
      assert.ok(layout.main <= layout.download + 1, JSON.stringify(layout));
      assert.ok(layout.retry <= layout.footer + 1, JSON.stringify(layout));
      await registrationPage.screenshot({ path: resolve(artifacts, `${locale}-${theme}-download-retry.png`) });
    }
    await registrationPage.reload();
    await registrationPage.locator(".rs-h5-download").waitFor();
    assert.deepEqual(await readRegistration(), registered);
    cases.push("new web registration opens download, retains ordinary gift once, and creates no active phone");
    await registrationContext.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(resolve(artifacts, "result.json"), JSON.stringify({ target, cases, errors, passed: true, executedAt: new Date().toISOString() }, null, 2));
  console.log(`PASS ${target}: ${cases.length} browser cases; ${artifacts}`);
} finally { await browser?.close(); server?.stop(); }

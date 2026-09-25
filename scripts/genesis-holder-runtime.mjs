#!/usr/bin/env node
// Isolated fixed-mock browser acceptance: real purchase action, no owner browser data.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { ensureServer, identify } from "./lib/dev-server-pool.mjs";
import { isThirdPartyResourceError } from "./lib/console-origin-filter.mjs";
import { treeFingerprint } from "./lib/verify-scope.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reportArg = process.argv.indexOf("--report");
const reportPath = reportArg >= 0 ? resolve(process.argv[reportArg + 1]) : resolve(tmpdir(), "nexion-genesis-" + Date.now(), "result.json");
const artifacts = dirname(reportPath);
const startedAt = new Date().toISOString();
const startTree = treeFingerprint();
const results = [];
const titles = { zh: "恭喜，购买成功", en: "Congratulations, purchase complete", vi: "Chúc mừng, mua thành công" };
let server, browser;
const state = page => page.evaluate(async () => {
  const g = (await import("/src/store/genesis.ts")).useGenesis();
  const app = (await import("/src/store/app.ts")).useApp();
  const bills = (await import("/src/store/bills.ts")).useBills();
  return { owned: g.myOwned, price: g.unitPriceUSDT, balance: app.user.usdtBalance,
    purchases: bills.bills.filter(b => b.ref?.startsWith("GENESIS-PRIM-") && !b.ref.endsWith("-REV")).length };
});
async function go(page, base, route) {
  await page.goto(base + "/?nx_device_inner=1#" + route, { waitUntil: "domcontentloaded" });
}
async function login(page, base) {
  await go(page, base, "/pages/login/login");
  await page.locator('.lg-wrap[data-preview-account-status="ready"]').waitFor();
  await page.getByTestId("mock-preview-password").locator("input").press("Enter");
  await page.waitForURL(/#\/$|#\/pages\/index\/index/);
}
async function themeAndLocale(page, theme, locale) {
  await page.evaluate(async ({ theme, locale }) => {
    (await import("/src/store/theme.ts")).useTheme().setMode(theme);
    (await import("/src/store/locale.ts")).useLocaleStore().setLocale(locale);
  }, { theme, locale });
}
async function layout(page, selector, theme) {
  const shape = await page.locator(selector).evaluate(root => {
    const controls = [...root.querySelectorAll('[role="button"]')].filter(e => e.getClientRects().length);
    const label = [...root.querySelectorAll("uni-text")].filter(e => e.getClientRects().length);
    return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      overflow: [...root.querySelectorAll("*")].filter(e => e.getClientRects().length && e.getBoundingClientRect().width > 0
        && (e.getBoundingClientRect().right > innerWidth + 1 || e.getBoundingClientRect().left < -1)).map(e => e.className).slice(0, 10),
      targets: controls.map(e => ({ width: e.getBoundingClientRect().width, height: e.getBoundingClientRect().height, label: e.getAttribute("aria-label") || e.textContent })),
      fonts: label.map(e => parseFloat(getComputedStyle(e).fontSize)),
      primary: getComputedStyle(root.querySelector(".gh-boost, .genesis-purchase-success__cta")).backgroundColor };
  });
  assert.ok(shape.scrollWidth <= shape.width + 1, "document horizontal overflow");
  assert.deepEqual(shape.overflow, [], "offscreen UI elements");
  // Chromium can report 43.999996 for a 44px target under the page transition.
  assert.ok(shape.targets.every(t => t.width >= 43.99 && t.height >= 43.99), "44px tap targets: " + JSON.stringify(shape.targets));
  assert.ok(shape.fonts.every(n => n >= 12), "readable text size");
  assert.equal(shape.primary, theme === "dark" ? "rgb(158, 220, 29)" : "rgb(14, 72, 230)");
  return shape;
}
async function runCase(base, locale, theme) {
  const name = locale + "-" + theme;
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [], network = [], evidence = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", msg => {
    if (msg.type() === "error" && !isThirdPartyResourceError(msg.text(), msg.location().url, base)) errors.push(msg.text());
  });
  page.on("request", req => { if (/^\/(api|auth)\//.test(new URL(req.url()).pathname)) network.push(req.url()); });
  try {
    await login(page, base);
    await themeAndLocale(page, theme, locale);
    await go(page, base, "/pages/genesis/holder");
    await page.locator(".gh-empty").waitFor();
    assert.equal(await page.locator(".gh-chassis--owned, .genesis-holder-badge").count(), 0, "non-holder cannot get identity");
    await page.locator(".gh-empty").press("Enter");
    await page.locator(".nx-genesis-dock").waitFor();
    const before = await state(page);
    assert.equal(before.owned, 0);
    assert.ok(before.balance >= before.price, "preview fixture can buy one node");
    // Delay the real purchase in this disposable context, exposing the in-flight double-click window.
    await page.evaluate(async () => {
      const genesis = (await import("/src/store/genesis.ts")).useGenesis();
      const purchase = genesis.purchase;
      genesis.purchase = async (...args) => { await new Promise(r => setTimeout(r, 300)); return purchase(...args); };
    });
    await page.locator(".nx-genesis-dock").click();
    const submit = page.locator('.nx-sheet-panel [role="button"]');
    await submit.waitFor();
    await submit.dblclick();
    assert.equal(await page.locator(".genesis-purchase-success").count(), 0, "pending operation cannot show success");
    await page.keyboard.press("Escape");
    assert.equal(await page.locator(".nx-sheet-panel").count(), 1, "pending sheet cannot reopen a second purchase");
    const success = page.locator(".genesis-purchase-success");
    await success.waitFor();
    assert.equal(await success.getAttribute("aria-label"), titles[locale]);
    assert.equal(await page.locator(".nx-sheet-panel").count(), 0);
    const after = await state(page);
    assert.equal(after.owned, 1);
    assert.equal(after.purchases, before.purchases + 1);
    assert.ok(Math.abs((before.balance - after.balance) - before.price) < 0.1, "exactly one debit");
    for (const width of [320, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await layout(page, ".genesis-purchase-success", theme);
    }
    assert.ok(await success.evaluate(e => e.contains(document.activeElement)), "focus enters success dialog");
    await page.locator(".genesis-purchase-success__cta").focus();
    await page.keyboard.press("Tab");
    assert.ok(await page.locator(".genesis-purchase-success__close").evaluate(e => e === document.activeElement), "focus is trapped");
    await page.screenshot({ path: resolve(artifacts, name + "-success.png") });
    await page.locator(".genesis-purchase-success__cta").press("Enter");
    await page.waitForURL(/#\/pages\/genesis\/holder/);
    await page.locator(".gh-chassis--owned").waitFor();
    assert.equal(await page.locator(".genesis-purchase-success").count(), 0);
    assert.equal(await page.locator(".gh-hero .genesis-holder-badge").count(), 1);
    assert.equal(await page.locator(".gh-holding").count(), 1);
    assert.equal(await page.locator(".gh-perk").count(), 6);
    const bg = await page.locator(".gh-chassis").evaluate(e => getComputedStyle(e).backgroundImage);
    assert.ok(bg.includes("obsidian-" + theme + ".webp"), "correct actual background image");
    const bgResponse = await page.request.get(base + "/static/img/genesis/obsidian-" + theme + ".webp");
    assert.equal(bgResponse.status(), 200);
    assert.ok((await bgResponse.body()).length > 10_000, "texture asset has real pixels");
    for (const width of [320, 430]) {
      await page.setViewportSize({ width, height: 844 });
      evidence.push({ width, layout: await layout(page, ".gh-page", theme) });
      await page.screenshot({ path: resolve(artifacts, name + "-holder-" + width + ".png") });
    }
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator(".gh-holding").waitFor();
    assert.equal((await state(page)).owned, 1, "purchase persists after reload");
    assert.equal((await state(page)).purchases, after.purchases, "reload creates no duplicate receipt");
    assert.equal(await page.locator(".gh-emissions").count(), 0, "pre-listing never shows released funds");
    await page.evaluate(async () => (await import("/src/store/genesis.ts")).useGenesis().setNexListed(true, Date.now()));
    await page.locator(".gh-emissions").waitFor();
    assert.equal(await page.locator(".gh-hero .genesis-holder-badge").count(), 1, "post-listing retains identity");
    assert.equal(await page.locator(".gh-progress").count(), 0);
    assert.equal(await page.locator(".gh-feed").count(), 1);
    await layout(page, ".gh-page", theme);
    await page.screenshot({ path: resolve(artifacts, name + "-post-listing.png") });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator(".gh-emissions").waitFor();

    // Arabic currently falls back to English. Stress RTL layout in this isolated
    // fixture; the app itself does not yet apply a document direction globally.
    await themeAndLocale(page, theme, "ar");
    await page.evaluate(() => { document.documentElement.dir = "rtl"; });
    assert.equal(await page.locator("html").getAttribute("dir"), "rtl");
    await page.setViewportSize({ width: 320, height: 844 });
    await layout(page, ".gh-page", theme);
    await page.screenshot({ path: resolve(artifacts, name + "-rtl.png") });
    await page.evaluate(() => { document.documentElement.removeAttribute("dir"); });
    await themeAndLocale(page, theme, locale);

    // Each dismissal follows a new settled purchase in this disposable account.
    await go(page, base, "/pages/genesis/genesis");
    await page.locator(".nx-genesis-dock").waitFor();
    await page.evaluate(async () => {
      const app = (await import("/src/store/app.ts")).useApp();
      const genesis = (await import("/src/store/genesis.ts")).useGenesis();
      if (!app.creditBalance(genesis.unitPriceUSDT * 3)) throw new Error("fixture funding failed");
    });
    for (const dismissal of ["close", "escape", "backdrop"]) {
      const beforeDismiss = await state(page);
      await page.locator('.nx-genesis-dock [role="button"]').focus();
      await page.locator('.nx-genesis-dock [role="button"]').press("Enter");
      await submit.click();
      await success.waitFor();
      if (dismissal === "close") await page.locator(".genesis-purchase-success__close").press("Space");
      else if (dismissal === "escape") await page.keyboard.press("Escape");
      else await success.click({ position: { x: 8, y: 422 } });
      await success.waitFor({ state: "hidden", timeout: 3000 }).catch(e => { throw new Error(dismissal + " did not close dialog", { cause: e }); });
      assert.ok(await page.locator('.nx-genesis-dock [role="button"]').evaluate(e => e === document.activeElement), "focus returns to purchase trigger");
      const dismissed = await state(page);
      assert.equal(dismissed.owned, beforeDismiss.owned + 1);
      assert.equal(dismissed.purchases, beforeDismiss.purchases + 1);
    }

    // Failure: actual insufficient-funds branch must preserve holdings and never open success.
    await go(page, base, "/pages/genesis/genesis");
    await page.locator(".nx-genesis-dock").waitFor();
    await page.evaluate(async () => { const app = (await import("/src/store/app.ts")).useApp(); app.debitBalance(app.user.usdtBalance); });
    const failedBefore = await state(page);
    await page.locator(".nx-genesis-dock").click();
    await submit.click();
    await page.waitForFunction(() => document.querySelector('.nx-sheet-panel [role="button"]')?.getAttribute("aria-disabled") === "false");
    assert.equal(await success.count(), 0);
    assert.equal((await state(page)).owned, failedBefore.owned);
    assert.equal((await state(page)).purchases, failedBefore.purchases);
    await page.keyboard.press("Escape");
    await page.locator(".nx-sheet-panel").waitFor({ state: "hidden" });

    // Closed and capped states cannot enter a purchase.
    await page.evaluate(async () => {
      const cfg = (await import("/src/store/genesis-config.ts")).useGenesisConfig();
      cfg.config.marketOpenState = "closed";
    });
    await page.locator(".nx-genesis-dock").click();
    assert.equal(await submit.count(), 0);
    assert.equal(await success.count(), 0);
    await page.evaluate(async () => {
      const cfg = (await import("/src/store/genesis-config.ts")).useGenesisConfig();
      cfg.config.marketOpenState = "open";
      (await import("/src/store/genesis.ts")).useGenesis().myOwned = 5;
    });
    await page.locator(".nx-genesis-dock").click();
    assert.equal(await submit.count(), 0);
    assert.equal(await success.count(), 0);
    assert.deepEqual(errors, []);
    assert.deepEqual(network, []);
    results.push({ name, passed: true, evidence, before, after, background: bg });
    console.log("PASS " + name);
  } catch (e) {
    await page.screenshot({ path: resolve(artifacts, name + "-failed.png") }).catch(() => {});
    results.push({ name, passed: false, error: e.stack, errors });
    console.error("FAIL " + name + ": " + e.stack);
  } finally { await context.close(); }
}

try {
  await mkdir(artifacts, { recursive: true });
  server = await ensureServer({ root, reuseUrl: process.env.UNI_BASE_URL || process.env.FIXED_MOCK_REUSE_URL || null });
  const base = server.baseUrl;
  assert.ok((await identify(base, { root })).ok);
  browser = await chromium.launch({ headless: true });
  for (const locale of ["zh", "en", "vi"]) {
    await Promise.all(["dark", "light"].map(theme => runCase(base, locale, theme)));
  }
  const endTree = treeFingerprint();
  const passed = results.length === 6 && results.every(r => r.passed);
  const ids = ["holder-themes", "holder-states", "purchase-success", "purchase-guards", "dialog-access", "responsive-locales"];
  const report = { startedAt, executedAt: new Date().toISOString(), capability: "runtime", mode: "full",
    verdict: passed ? "pass" : "fail", treeMoved: startTree?.fingerprint !== endTree?.fingerprint,
    taskId: process.env.WORKFLOW_TASK_ID, stepId: process.env.WORKFLOW_STEP_ID,
    checkId: process.env.WORKFLOW_CHECK_ID, runId: process.env.WORKFLOW_RUN_ID,
    repo: process.env.WORKFLOW_REPO || root, snapshotHash: process.env.WORKFLOW_SNAPSHOT_HASH,
    innerSkipped: 0, steps: ids.map(id => ({ id, status: passed ? "pass" : "fail", verdict: passed ? "pass" : "fail",
      evidence: results.map(r => r.name + ": " + (r.passed ? "purchase, persisted receipt, states, keyboard and responsive geometry verified" : r.error)) })),
    setup: "Isolated Chromium contexts; local fixed-mock purchase only, no real transactions", results };
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
  assert.ok(passed, "GENESIS_HOLDER_RUNTIME_FAILED");
  assert.equal(report.treeMoved, false, "source tree changed during acceptance");
  console.log("Genesis: 6/6, evidence " + reportPath);
} finally { await browser?.close(); server?.stop(); }

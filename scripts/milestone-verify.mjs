#!/usr/bin/env node
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureServer } from "./lib/dev-server-pool.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const server = await ensureServer({ root, reuseUrl: process.env.UNI_BASE_URL, log: console.log });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
const out = resolve(root, ".codex-runtime/milestones");
await mkdir(out, { recursive: true });
const report = { checks: [], errors };

async function state() {
  return page.evaluate(async () => {
    const app = (await import("/src/store/app.ts")).useApp();
    const m = (await import("/src/store/milestones.ts")).useMilestones();
    const bills = (await import("/src/store/bills.ts")).useBills().bills;
    return {
      total: app.earnings.total, today: app.earnings.today, nex: app.user.nexBalance,
      active: m.active?.id ?? null, pending: m.pendingCelebrations.map(row => row.id),
      fired: [...m.firedIds], bills: bills.filter(row => row.ref?.startsWith("MILESTONE-")),
    };
  });
}
async function clearOtherSheets() {
  for (const selector of [".tcs-dismiss", ".vcs-dismiss", ".tcs-close", ".vcs-close"]) {
    const close = page.locator(selector);
    if (await close.isVisible().catch(() => false)) await close.click();
  }
}
async function navigate(route) {
  await page.evaluate(route => uni.reLaunch({ url: route }), route);
  await page.waitForURL(url => url.hash === `#${route}`);
  await page.locator(".nx-chassis").waitFor();
  await clearOtherSheets();
}

try {
  await page.goto(`${server.baseUrl}/?nx_device_inner=1#/pages/login/login`, { waitUntil: "domcontentloaded" });
  await page.locator('.lg-wrap[data-preview-account-status="ready"]').waitFor();
  await page.getByTestId("mock-preview-password").locator("input").press("Enter");
  await page.waitForURL(/#\/$|#\/pages\/index\/index|pages\/onboarding\/connect/);
  if (page.url().includes("/onboarding/connect")) await page.locator(".cn-back").click();
  await navigate("/pages/store/store");
  await page.waitForTimeout(12_500); // Three real polling cycles, no selector stub.
  const startup = await state();
  report.checks.push({ name: "historical startup silent", state: startup });
  assert.equal(startup.active, null);
  assert.deepEqual(startup.pending, []);
  assert.deepEqual(startup.fired, []);
  assert.deepEqual(startup.bills, []);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".nx-tabbar-pill").waitFor();
  await page.waitForTimeout(4_500);
  assert.deepEqual((await state()).bills, []);
  report.checks.push({ name: "historical reload silent" });

  // Isolated fixture: real poll, receipts and overlay remain active.
  await page.evaluate(async () => {
    const app = (await import("/src/store/app.ts")).useApp();
    const m = (await import("/src/store/milestones.ts")).useMilestones();
    const cloud = await import("/src/store/account-cloud.ts");
    const snapshot = cloud.readAccountSnapshot(app.accountKey);
    snapshot.earnings = { ...snapshot.earnings, total: 99, today: 20 };
    snapshot.devices = [];
    if (!cloud.writeAccountSnapshot(snapshot)) throw new Error("fixture write failed");
    app.bindAccount(app.accountKey);
    m.reset();
    m.initialize(app.earnings.total);
  });
  await page.waitForTimeout(4_500);
  const below = await state();
  assert.equal(below.total, 99);
  assert.equal(below.today, 20);
  assert.deepEqual(below.fired, []);
  assert.deepEqual(below.bills, []);
  report.checks.push({ name: "below threshold; today not double counted", state: below });
  await page.evaluate(async () => {
    const app = (await import("/src/store/app.ts")).useApp();
    app.earnings = { ...app.earnings, total: 100 };
    if (!app.persistAccountSnapshot()) throw new Error("fixture accrual failed");
  });
  await page.locator(".ms-overlay").waitFor({ timeout: 8_000 });
  const crossed = await state();
  assert.equal(crossed.active, "earn-100");
  assert.deepEqual(crossed.fired, ["earn-100"]);
  assert.equal(crossed.bills.length, 1);
  assert.equal(crossed.bills[0].amount, 100);
  assert.equal(crossed.nex - below.nex, 100);
  await page.screenshot({ path: resolve(out, "real-crossing.png") });
  report.checks.push({ name: "actual crossing rewards and celebrates once", state: crossed });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".nx-tabbar-pill").waitFor();
  await page.waitForTimeout(8_500);
  const reloaded = await state();
  assert.equal(reloaded.active, null);
  assert.deepEqual(reloaded.pending, []);
  assert.equal(reloaded.bills.length, 1);
  assert.equal(reloaded.nex, crossed.nex);
  report.checks.push({ name: "crossing reload does not repeat", state: reloaded });

  // Receipt succeeds but the separate milestone marker fails to persist.
  await page.evaluate(async () => {
    const app = (await import("/src/store/app.ts")).useApp();
    app.earnings = { ...app.earnings, total: 500 };
    if (!app.persistAccountSnapshot()) throw new Error("fixture accrual failed");
    const save = uni.setStorageSync.bind(uni);
    uni.setStorageSync = (key, value) => {
      if (key === "nexgrid-milestones-accounts-v1") throw new Error("injected marker write failure");
      return save(key, value);
    };
  });
  await page.waitForTimeout(8_500);
  const failedMarker = await state();
  assert.deepEqual(failedMarker.fired, ["earn-100"]);
  assert.equal(failedMarker.active, null);
  assert.equal(failedMarker.bills.length, 2);
  assert.equal(failedMarker.nex - reloaded.nex, 250);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".ms-overlay").waitFor({ timeout: 12_000 });
  const recovered = await state();
  assert.equal(recovered.active, "earn-500");
  assert.deepEqual(recovered.fired, ["earn-100", "earn-500"]);
  assert.equal(recovered.bills.length, 2);
  assert.equal(recovered.nex, failedMarker.nex);
  report.checks.push({ name: "marker failure retries and reloads without duplicate reward", state: recovered });
  assert.deepEqual(errors, []);
  console.log("PASS milestone startup / crossing / receipt / refresh regression");
} finally {
  await writeFile(resolve(out, "result.json"), JSON.stringify(report, null, 2));
  await browser.close();
  server.stop();
}

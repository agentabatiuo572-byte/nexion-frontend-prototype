#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { ensureServer, identify } from "./lib/dev-server-pool.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = resolve(process.env.CALIBRATION_ARTIFACT_DIR || `${tmpdir()}/nexion-calibration-${Date.now()}`);
const results = [];
let server, browser;
const labels = { en: "Device assessment", zh: "设备能力评估", vi: "Đánh giá thiết bị" };
const removedDetails = ".cn-test__metric, .cn-summary, .cn-row, .cn-score__tier, .cn-score__yield";

async function checkIntro(page, locale) {
  await page.locator(".cn-point").first().waitFor();
  assert.equal(await page.locator(".cn-point").count(), 1, "intro must contain only device assessment");
  assert.ok((await page.locator(".cn-point").innerText()).trim());
  assert.equal(await page.locator(`.cn-test, .cn-score, ${removedDetails}`).count(), 0);
  assert.ok((await page.locator(".cn-title").innerText()).trim());
  assert.equal(await page.evaluate(() => uni.getStorageSync("nexgrid-locale-v1").code), locale);
  const geometry = await page.locator(".cn-root").evaluate(el => ({ width: el.clientWidth, scrollWidth: el.scrollWidth }));
  assert.ok(geometry.scrollWidth <= geometry.width + 1, "calibration has horizontal overflow");
}

async function persistedState(page) {
  return page.evaluate(() => {
    const auth = uni.getStorageSync("nexgrid-auth-v1");
    const key = (auth.email || auth.accountId).toLowerCase();
    const registry = uni.getStorageSync("nexgrid-auth-accounts-v1");
    const account = Object.values(registry.byPhone).find(row => row.accountId === key);
    const phone = uni.getStorageSync("nexgrid-account-cloud-v1")[key]?.devices.find(row => row.kind === "phone");
    return {
      authenticated: auth.isAuthenticated,
      onboardingComplete: auth.onboardingComplete,
      accountComplete: account?.onboardingComplete,
      calibratedDeviceMatches: uni.getStorageSync("nexgrid-calibrated-device-v1")[key] === uni.getStorageSync("nexgrid-device-id-v1").deviceId,
      phone: phone && Object.fromEntries(["capabilityScore", "capabilityTops", "capabilityTier", "baseRate", "baseRateNEX", "miningSince"].map(name => [name, phone[name]])),
    };
  });
}

async function runCase(base, { locale, mode, width, height }) {
  const name = `${locale}-${mode}-${width}x${height}`;
  const result = { name, consoleErrors: [], pageErrors: [], backendRequests: [], screenshots: [] };
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.on("console", message => { if (message.type() === "error") result.consoleErrors.push(message.text()); });
  page.on("pageerror", error => result.pageErrors.push(error.message));
  page.on("request", request => {
    const url = new URL(request.url());
    if (/^\/(api|auth)\//.test(url.pathname)) result.backendRequests.push(url.pathname);
  });
  const screenshot = async phase => {
    const path = resolve(artifacts, `${name}-${phase}.png`);
    await page.screenshot({ path, fullPage: true });
    result.screenshots.push(path);
  };
  try {
    await page.goto(`${base}/?nx_device_inner=1#/pages/login/login`, { waitUntil: "domcontentloaded" });
    await page.locator('.lg-wrap[data-preview-account-status="ready"]').waitFor();
    assert.equal(await page.getByTestId("mock-preview-phone").locator("input").inputValue(), "901234567");
    await page.getByTestId("mock-preview-password").locator("input").press("Enter");
    await page.waitForURL(/#\/$|#\/pages\/index\/index/);
    await page.evaluate(async locale => (await import("/src/store/locale.ts")).useLocaleStore().setLocale(locale), locale);
    const connect = `${base}/?nx_device_inner=1#/pages/onboarding/connect${mode === "recalibrate" ? "?mode=recalibrate" : ""}`;
    await page.goto(connect, { waitUntil: "domcontentloaded" });
    await checkIntro(page, locale);
    await page.locator(".cn-back").press("Enter");
    await page.waitForURL(mode === "first" ? /#\/pages\/onboarding\/estimator/ : /#\/pages\/me\/devices/);
    result.backExit = true;
    await page.goto(connect, { waitUntil: "domcontentloaded" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await checkIntro(page, locale);
    result.intro = await page.locator(".cn-point").innerText();
    // Seed only this fresh context, after reload: preview boot restores its account.
    // This tests first-time calibration state, not the registration journey.
    result.expected = await page.evaluate(async mode => {
      const { useAuth } = await import("/src/store/auth.ts");
      const { useApp } = await import("/src/store/app.ts");
      const { measureDeviceCapability } = await import("/src/lib/device-capability.ts");
      const { getDeviceId } = await import("/src/lib/device-id.ts");
      const auth = useAuth();
      const app = useApp();
      if (mode === "first") {
        if (!auth.requireOnboarding()) throw new Error("cannot prepare incomplete onboarding");
        const registry = uni.getStorageSync("nexgrid-auth-accounts-v1");
        const account = Object.values(registry.byPhone).find(row => row.accountId === auth.accountId);
        if (!account) throw new Error("preview account missing");
        account.onboardingComplete = false;
        uni.setStorageSync("nexgrid-auth-accounts-v1", registry);
      } else {
        app.interruptAllTasks("logged-out");
      }
      uni.setStorageSync("nexgrid-calibrated-device-v1", {});
      const cap = measureDeviceCapability(getDeviceId());
      return { score: cap.score, tops: cap.tops, tier: cap.tier, usdt: cap.baseRateUsdt, nex: cap.baseRateNex };
    }, mode);
    result.before = await persistedState(page);
    assert.equal(result.before.calibratedDeviceMatches, false, "calibration must not already be marked complete");
    assert.equal(result.before.onboardingComplete, mode !== "first");
    assert.equal(result.before.accountComplete, mode !== "first");
    if (locale === "en" && width === 320) {
      await page.locator(".cn-go--glow").click();
      await page.waitForFunction(() => parseFloat(document.querySelector(".cn-test__fill")?.style.width || "0") >= 10);
      await page.locator(".cn-back").click();
      await page.waitForURL(mode === "first" ? /#\/pages\/onboarding\/estimator/ : /#\/pages\/me\/devices/);
      assert.equal((await persistedState(page)).calibratedDeviceMatches, false, "leaving calibration must not activate");
      await page.evaluate(mode => uni.navigateTo({ url: `/pages/onboarding/connect${mode === "recalibrate" ? "?mode=recalibrate" : ""}` }), mode);
      await checkIntro(page, locale);
      result.calibratingExit = true;
    }
    await screenshot("intro");
    const started = Date.now();
    await page.evaluate(({ started, label }) => {
      window.__calibrationSamples = [];
      window.__calibrationTimer = setInterval(() => {
        const fill = document.querySelector(".cn-test__fill");
        if (fill) window.__calibrationSamples.push({
          ms: Date.now() - started,
          progress: parseFloat(fill.style.width),
          onlyProgress: document.querySelector(".cn-test")?.innerText.trim() === label && !document.querySelector(".cn-test__metric, .cn-score, .cn-summary"),
        });
      }, 200);
    }, { started, label: labels[locale] });
    await page.locator(".cn-go--glow").press("Enter");
    await page.locator(".cn-test").first().waitFor();
    assert.equal(await page.locator(".cn-test").count(), 1, "only device assessment may appear");
    assert.equal((await page.locator(".cn-test").innerText()).trim(), labels[locale], "calibration card must have no numeric metrics");
    await page.waitForFunction(() => parseFloat(document.querySelector(".cn-test__fill")?.style.width || "0") >= 45);
    assert.equal(await page.locator(`.cn-score, ${removedDetails}`).count(), 0, "calibration must show progress without scores or throughput");
    await screenshot("calibrating");
    await page.locator(".cn-score").waitFor();
    result.calibrationMs = Date.now() - started;
    result.progressSamples = await page.evaluate(() => {
      clearInterval(window.__calibrationTimer);
      return window.__calibrationSamples;
    });
    assert.ok(result.progressSamples.length >= 20, "whole calibration must be sampled");
    let previous = 0;
    for (const sample of result.progressSamples) {
      assert.ok(sample.progress >= previous && sample.progress <= 100, "progress must be finite, nonnegative and monotonic");
      assert.ok(sample.onlyProgress, "calibration must not expose scores or throughput at any sampled point");
      if (sample.ms < 11_800) assert.ok(sample.progress < 100, "assessment cannot finish early and leave a stalled countdown");
      previous = sample.progress;
    }
    assert.ok(result.calibrationMs >= 11_900, "12-second calibration ended early");
    await page.waitForFunction(score => Number(document.querySelector(".cn-score__v")?.textContent) === score, result.expected.score);
    assert.equal(await page.locator(removedDetails).count(), 0, "result must not contain throughput, tier or yield details");
    assert.equal(await page.locator(".cn-score__d").innerText(), "/100");
    assert.deepEqual((await page.locator(".cn-score").innerText()).match(/\d+(?:\.\d+)?/g), [String(result.expected.score), "100"], "score must be the only numeric result");
    assert.doesNotMatch(await page.locator(".cn-phase").innerText(), /\b(?:TOPS|TFLOPS|Tier|yield)\b|万亿|运算\/秒|每秒|\$\s*\d|\/d\b/iu);
    assert.equal(await page.locator(".cn-policy__line").count(), 3, "task acceptance policies must remain");
    await page.locator(".cn-go--on").scrollIntoViewIfNeeded();
    await screenshot("result");
    await page.locator(".cn-go--on").click();
    await page.waitForURL(/#\/$|#\/pages\/index\/index/);
    result.afterActivation = await persistedState(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator('.nx-header [aria-label="UVEL"]').waitFor();
    result.afterReload = await persistedState(page);
    for (const state of [result.afterActivation, result.afterReload]) {
      assert.ok(state.authenticated && state.onboardingComplete && state.accountComplete && state.calibratedDeviceMatches, "activation flags must persist");
      assert.deepEqual(state.phone, { capabilityScore: result.expected.score, capabilityTops: result.expected.tops, capabilityTier: result.expected.tier, baseRate: result.expected.usdt, baseRateNEX: result.expected.nex, miningSince: state.phone.miningSince });
      assert.ok(state.phone.miningSince >= started, "activation must write a fresh phone calibration");
    }
    assert.deepEqual(result.afterReload, result.afterActivation, "calibration must survive reload");
    assert.deepEqual(result.consoleErrors, []);
    assert.deepEqual(result.pageErrors, []);
    assert.deepEqual(result.backendRequests, [], "fixed mock must not contact a backend");
    result.passed = true;
  } catch (error) {
    result.passed = false;
    result.error = error.stack;
    await screenshot("failed").catch(() => {});
  } finally {
    results.push(result);
    console.log(`${result.passed ? "PASS" : "FAIL"} ${name}${result.error ? `: ${result.error}` : ` (${result.calibrationMs}ms)`}`);
    await context.close();
  }
}

try {
  await mkdir(artifacts, { recursive: true });
  if (!process.env.UNI_BASE_URL) server = await ensureServer({ root, reuseUrl: process.env.FIXED_MOCK_REUSE_URL || null });
  const base = process.env.UNI_BASE_URL || server.baseUrl;
  const identity = await identify(base, { root });
  assert.ok(identity.ok, identity.why);
  browser = await chromium.launch({ headless: true });
  const cases = Object.keys(labels).flatMap(locale => ["first", "recalibrate"].flatMap(mode => [{ width: 320, height: 568 }, { width: 430, height: 940 }].map(viewport => ({ locale, mode, ...viewport }))));
  for (let i = 0; i < cases.length; i += 3) await Promise.all(cases.slice(i, i + 3).map(row => runCase(base, row)));
  const previewLocales = [];
  const context = await browser.newContext({ viewport: { width: 320, height: 568 } });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${base}/?nx_device_inner=1#/pages/onboarding/connect`, { waitUntil: "domcontentloaded" });
    await page.locator(".cn-point").first().waitFor();
    for (const locale of ["ja", "ko", "ru", "es", "pt", "ar", "de", "fr"]) {
      await page.evaluate(async locale => (await import("/src/store/locale.ts")).useLocaleStore().setLocale(locale), locale);
      await page.reload({ waitUntil: "domcontentloaded" });
      await checkIntro(page, locale);
      assert.equal(await page.locator(".cn-point").innerText(), results.find(row => row.name === "en-first-320x568").intro, "preview locales must use the English assessment fallback");
      previewLocales.push(locale);
    }
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
  const report = { executedAt: new Date().toISOString(), base, identity, setup: "isolated fixed-mock preview login; first-time calibration state seeded, not a registration test", results, previewLocales };
  const resultPath = resolve(artifacts, "result.json");
  await writeFile(resultPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Calibration: ${results.filter(row => row.passed).length}/${cases.length}; preview locales: ${previewLocales.length}/8; evidence: ${resultPath}`);
  assert.ok(results.every(row => row.passed), "ONBOARDING_CALIBRATION_RUNTIME_FAILED");
} finally {
  await browser?.close();
  server?.stop();
}

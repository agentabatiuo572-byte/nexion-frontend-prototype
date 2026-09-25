#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { ensureServer, identify } from "./lib/dev-server-pool.mjs";
import { isThirdPartyResourceError } from "./lib/console-origin-filter.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifacts = resolve(process.env.CALIBRATION_ARTIFACT_DIR || `${tmpdir()}/nexion-calibration-${Date.now()}`);
const results = [];
let server, browser;
const labels = { en: "Device assessment", zh: "设备能力评估", vi: "Đánh giá thiết bị" };
const resultTitles = { en: "Check complete", zh: "校验完成", vi: "Kiểm tra hoàn tất" };
const policyLabels = { en: "Before you start", zh: "运行须知", vi: "Lưu ý khi chạy" };
const removedDetails = ".cn-test__metric, .cn-summary, .cn-row, .cn-score__tier, .cn-score__yield";

async function checkCtaPlacement(page, contentSelector) {
  // Measure before any locator action can scroll an otherwise hidden button into view.
  const geometry = await page.locator(".cn-root").evaluate((root, selector) => {
    const button = root.querySelector(".cn-cta .cn-go").getBoundingClientRect();
    const content = root.querySelector(selector).getBoundingClientRect();
    return { button: button.toJSON(), contentGap: button.top - content.bottom,
      bottomGap: innerHeight - button.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight,
      scrollTop: root.scrollTop, pageScrollY: scrollY, width: root.clientWidth, scrollWidth: root.scrollWidth };
  }, contentSelector);
  assert.equal(geometry.scrollTop, 0, "CTA must be available without scrolling its page");
  assert.equal(geometry.pageScrollY, 0);
  assert.ok(geometry.button.top >= 0 && geometry.button.bottom <= geometry.viewportHeight && geometry.button.left >= 0 && geometry.button.right <= geometry.viewportWidth, "CTA must be fully visible initially");
  assert.ok(geometry.button.height >= 44 && geometry.bottomGap >= 96, "CTA must sit meaningfully above the screen bottom");
  assert.ok(geometry.contentGap >= 22 && geometry.contentGap <= 26, `CTA must follow content by 24px, got ${geometry.contentGap}`);
  assert.ok(geometry.scrollWidth <= geometry.width + 1, "page must not overflow horizontally");
  return geometry;
}

async function checkScoreMotion(page, reduced = false) {
  // Sample rendered SVG geometry, not the unchanged SMIL base d attribute.
  const samples = await page.locator(".cn-score").evaluate(async element => {
    const read = () => ({
      ms: performance.now(),
      smil: element.querySelectorAll(".cn-score__hex animate").length,
      paths: [...element.querySelectorAll(".cn-score__hex > path")].map(path => {
        const length = path.getTotalLength();
        return { d: path.getAttribute("d"), points: [0.13, 0.37, 0.71].flatMap(fraction => {
          const point = path.getPointAtLength(length * fraction);
          return [point.x, point.y];
        }) };
      }),
      css: [".cn-score__ring--pulse", ".cn-score__aurora"].map(selector => {
        const node = element.querySelector(selector);
        const style = getComputedStyle(node);
        return { opacity: style.opacity, transform: style.transform, name: style.animationName,
          animations: node.getAnimations().map(animation => ({ state: animation.playState, time: animation.currentTime })) };
      }),
    });
    const samples = [read()];
    // Three observations avoid accidentally comparing equal points around a pulse peak.
    await new Promise(resolve => {
      const sample = () => {
        if (performance.now() - samples.at(-1).ms >= 400) samples.push(read());
        if (samples.length === 3) resolve(); else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    return samples;
  });
  assert.ok(samples.every(sample => sample.paths.length === 4 && sample.smil === (reduced ? 0 : 4)), "four hex layers must respect motion preference");
  for (let index = 0; index < 4; index++) {
    const initial = samples[0].paths[index];
    assert.ok(samples.every(sample => sample.paths[index].d === initial.d), "SMIL should animate rendered geometry without rewriting base d");
    const changed = samples.slice(1).some(sample => sample.paths[index].points.some((value, point) => Math.abs(value - initial.points[point]) > 0.01));
    assert.equal(changed, !reduced, reduced ? "reduced-motion hex must stay still" : "hex path must actually morph");
  }
  for (let index = 0; index < 2; index++) {
    const states = samples.map(sample => sample.css[index]);
    if (reduced) {
      assert.ok(states.every(state => state.name === "none" && state.animations.length === 0), "reduced-motion must stop pulse and aurora CSS animations");
      assert.ok(states.every(state => state.opacity === states[0].opacity && state.transform === states[0].transform));
    } else {
      assert.ok(states.every(state => state.animations.some(animation => animation.state === "running")), "pulse and aurora must be running");
      assert.ok(states.at(-1).animations[0].time > states[0].animations[0].time, "CSS animation time must advance");
      assert.ok(states.slice(1).some(state => state.opacity !== states[0].opacity || state.transform !== states[0].transform), "CSS animation must change rendered style");
    }
  }
  return samples;
}

async function checkIntro(page, locale) {
  await page.locator(".cn-point").first().waitFor();
  assert.equal(await page.locator(".cn-point").count(), 1, "intro must contain only device assessment");
  assert.ok((await page.locator(".cn-point").innerText()).trim());
  assert.equal(await page.locator(`.cn-test, .cn-score, ${removedDetails}`).count(), 0);
  assert.ok((await page.locator(".cn-title").innerText()).trim());
  assert.equal(await page.evaluate(() => uni.getStorageSync("nexgrid-locale-v1").code), locale);
  assert.equal(await page.locator(".cn-policy").count(), 0, "rules icon is result-only");
  return checkCtaPlacement(page, ".cn-why");
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
  const result = { name, consoleErrors: [], externalResourceErrors: [], pageErrors: [], requestFailures: [], backendRequests: [], screenshots: [] };
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.on("console", message => {
    if (message.type() !== "error") return;
    const error = { text: message.text(), location: message.location() };
    (isThirdPartyResourceError(error.text, error.location.url, base) ? result.externalResourceErrors : result.consoleErrors).push(error);
  });
  page.on("requestfailed", request => result.requestFailures.push({ url: request.url(), error: request.failure()?.errorText }));
  page.on("pageerror", error => result.pageErrors.push(error.message));
  page.on("request", request => {
    const url = new URL(request.url());
    if (/^\/(api|auth)\//.test(url.pathname)) result.backendRequests.push(url.pathname);
  });
  const screenshot = async phase => {
    const path = resolve(artifacts, `${name}-${phase}.png`);
    await page.screenshot({ path, fullPage: true, timeout: 60_000 });
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
    result.introGeometry = await checkIntro(page, locale);
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
      window.__scoreSamples = [];
      window.__calibrationTimer = setInterval(() => {
        const fill = document.querySelector(".cn-test__fill");
        if (fill) window.__calibrationSamples.push({
          ms: Date.now() - started,
          progress: parseFloat(fill.style.width),
          onlyProgress: document.querySelector(".cn-test")?.innerText.trim() === label && !document.querySelector(".cn-test__metric, .cn-score, .cn-summary"),
        });
        const score = document.querySelector(".cn-score__v");
        if (score) window.__scoreSamples.push(Number(score.textContent));
      }, 200);
    }, { started, label: labels[locale] });
    await page.locator(".cn-go--glow").press("Enter");
    await page.locator(".cn-test").first().waitFor();
    assert.equal(await page.locator(".cn-test").count(), 1, "only device assessment may appear");
    assert.equal(await page.locator(".cn-policy").count(), 0, "rules icon must stay hidden during calibration");
    assert.equal((await page.locator(".cn-test").innerText()).trim(), labels[locale], "calibration card must have no numeric metrics");
    await page.waitForFunction(() => parseFloat(document.querySelector(".cn-test__fill")?.style.width || "0") >= 45);
    assert.equal(await page.locator(`.cn-score, ${removedDetails}`).count(), 0, "calibration must show progress without scores or throughput");
    await screenshot("calibrating");
    await page.locator(".cn-score").waitFor();
    result.calibrationMs = Date.now() - started;
    result.progressSamples = await page.evaluate(() => window.__calibrationSamples);
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
    assert.equal(await page.locator(".cn-title").innerText(), resultTitles[locale]);
    result.motion = await checkScoreMotion(page);
    result.scoreSamples = await page.evaluate(() => {
      clearInterval(window.__calibrationTimer);
      return window.__scoreSamples;
    });
    assert.ok(result.scoreSamples.some(score => score > 0 && score < result.expected.score), "normal motion must visibly count up");
    assert.ok(result.scoreSamples.every((score, index, values) => score >= 0 && score <= result.expected.score && (!index || score >= values[index - 1])), "score count-up must be nonnegative, monotonic and bounded");
    assert.equal(result.scoreSamples.at(-1), result.expected.score, "score must stabilize at the original capability score");
    assert.equal(await page.locator(removedDetails).count(), 0, "result must not contain throughput, tier or yield details");
    assert.equal(await page.locator(".cn-score__d").innerText(), "/100");
    assert.deepEqual((await page.locator(".cn-score").innerText()).match(/\d+(?:\.\d+)?/g), [String(result.expected.score), "100"], "score must be the only numeric result");
    assert.doesNotMatch(await page.locator(".cn-phase").innerText(), /\b(?:TOPS|TFLOPS|Tier|yield)\b|万亿|运算\/秒|每秒|\$\s*\d|\/d\b/iu);
    result.resultGeometry = await checkCtaPlacement(page, ".cn-score");
    const policy = page.locator(".cn-policy__cap");
    const bubble = page.locator(".cn-policy__list");
    const expectClosed = async () => {
      await bubble.waitFor({ state: "detached" });
      assert.equal(await policy.getAttribute("aria-expanded"), "false");
    };
    assert.equal(await policy.getAttribute("role"), "button");
    assert.equal(await policy.getAttribute("tabindex"), "0");
    assert.equal(await policy.getAttribute("aria-expanded"), "false");
    assert.equal(await policy.getAttribute("aria-label"), policyLabels[locale]);
    assert.equal(await policy.getAttribute("aria-controls"), "cn-policy-details");
    assert.equal((await policy.innerText()).trim(), "", "trigger must be an icon without visible title text");
    assert.equal(await policy.locator("svg").count(), 1);
    assert.equal(await bubble.count(), 0, "rules must start collapsed");
    result.policyIcon = await policy.boundingBox();
    assert.ok(result.policyIcon.width >= 44 && result.policyIcon.width <= 46 && result.policyIcon.height >= 44 && result.policyIcon.height <= 46, "info icon needs a 44px tap target");
    assert.ok(Math.abs(width - result.policyIcon.x - result.policyIcon.width - 20) <= 1, "info icon must sit 20px from the right edge");
    assert.ok(Math.abs(height - result.policyIcon.y - result.policyIcon.height - 38) <= 1, "info icon must sit above the 38px bottom safe reserve");
    await policy.click();
    await bubble.waitFor();
    assert.equal(await policy.getAttribute("aria-expanded"), "true");
    assert.equal(await bubble.getAttribute("id"), "cn-policy-details");
    assert.equal(await bubble.getAttribute("role"), "tooltip");
    assert.ok((await bubble.innerText()).includes(policyLabels[locale]), "bubble must include its localized title");
    assert.equal(await page.locator('.cn-policy [role="dialog"], .cn-policy [aria-modal="true"]').count(), 0, "rules must not become a modal");
    assert.equal(await page.locator(".cn-policy__line").count(), 3);
    result.policyLines = await page.locator(".cn-policy__t").allTextContents();
    assert.match(result.policyLines[0], /20\s*%/);
    assert.doesNotMatch(result.policyLines.join(" "), /Charging is required|充电是硬性门槛|Bắt buộc phải sạc/i);
    assert.doesNotMatch(result.policyLines.join(" "), /reassign|重新分配|phân công lại|调度器/i);
    result.policyBubble = await bubble.boundingBox();
    assert.ok(result.policyBubble.x >= 0 && result.policyBubble.y >= 0 && result.policyBubble.x + result.policyBubble.width <= width && result.policyBubble.y + result.policyBubble.height <= result.policyIcon.y, "bubble must fit the viewport above its trigger");
    const openCta = await page.locator(".cn-go--on").boundingBox();
    for (const key of ["x", "y", "width", "height"]) assert.ok(Math.abs(openCta[key] - result.resultGeometry.button[key]) <= 1, "opening rules must not move the CTA");
    await page.locator(".cn-policy__t").first().click();
    assert.equal(await policy.getAttribute("aria-expanded"), "true", "clicking bubble text must keep it open");
    await screenshot("rules-expanded");
    await policy.click();
    await expectClosed();
    await policy.press("Enter");
    await bubble.waitFor();
    await page.keyboard.press("Escape");
    await expectClosed();
    assert.ok(await policy.evaluate(element => element === document.activeElement), "Escape must retain trigger focus");
    await policy.press("Space");
    await bubble.waitFor();
    await page.keyboard.press("Shift+Tab");
    await expectClosed();
    assert.ok(await page.evaluate(() => !document.querySelector(".cn-policy").contains(document.activeElement)), "focus must be free to leave the policy");
    await policy.press("Enter");
    await bubble.waitFor();
    await page.keyboard.press("Tab");
    await expectClosed();
    assert.ok(await page.evaluate(() => !document.querySelector(".cn-policy").contains(document.activeElement)), "Tab must not trap focus in the policy");
    await policy.click();
    await bubble.waitFor();
    await page.locator(".cn-title").click();
    await expectClosed();
    assert.match(page.url(), /#\/pages\/onboarding\/connect(?:\?|$)/, "policy interaction must not navigate or activate");
    assert.equal((await persistedState(page)).calibratedDeviceMatches, false, "policy interaction must not apply calibration");
    await checkCtaPlacement(page, ".cn-score");
    await page.locator(".cn-go--on").click({ trial: true });
    await screenshot("result");
    if (locale === "en" && width === 320) {
      await policy.click();
      await bubble.waitFor();
      await page.keyboard.press("Escape");
      await expectClosed();
    }
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
    if (locale === "en" && width === 320) {
      await page.goto(connect, { waitUntil: "domcontentloaded" });
      await checkIntro(page, locale);
      if (mode === "first") {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.evaluate(() => {
          window.__reducedInitialScore = null;
          const observer = new MutationObserver(() => {
            const score = document.querySelector(".cn-score__v");
            if (score) { window.__reducedInitialScore = Number(score.textContent); observer.disconnect(); }
          });
          observer.observe(document.body, { childList: true, subtree: true, characterData: true });
        });
      }
      await page.locator(".cn-go--glow").click();
      await page.locator(".cn-score").waitFor();
      assert.equal(await page.locator(".cn-policy__cap").getAttribute("aria-expanded"), "false");
      assert.equal(await page.locator(".cn-policy__list").count(), 0, "reentry must reset the rules to collapsed");
      result.rulesCollapsedOnReentry = true;
      if (mode === "first") {
        assert.equal(await page.evaluate(() => window.__reducedInitialScore), result.expected.score, "reduced-motion result must start at its final score");
        result.reducedMotion = await checkScoreMotion(page, true);
        await page.emulateMedia({ reducedMotion: "no-preference" });
        await page.waitForFunction(() => document.querySelectorAll(".cn-score__hex animate").length === 4);
        result.motionResumed = await checkScoreMotion(page);
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.waitForFunction(() => document.querySelectorAll(".cn-score__hex animate").length === 0);
        result.motionStopped = await checkScoreMotion(page, true);
        assert.equal(Number(await page.locator(".cn-score__v").innerText()), result.expected.score);
        await screenshot("reduced-motion");
      }
    }
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

async function runBatteryRules(base) {
  const result = { name: "phone-battery-rules", states: [], consoleErrors: [], externalResourceErrors: [], pageErrors: [], requestFailures: [], backendRequests: [] };
  const context = await browser.newContext({ viewport: { width: 430, height: 940 } });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.on("console", message => {
    if (message.type() !== "error") return;
    const error = { text: message.text(), location: message.location() };
    (isThirdPartyResourceError(error.text, error.location.url, base) ? result.externalResourceErrors : result.consoleErrors).push(error);
  });
  page.on("requestfailed", request => result.requestFailures.push({ url: request.url(), error: request.failure()?.errorText }));
  page.on("pageerror", error => result.pageErrors.push(error.message));
  page.on("request", request => { if (/^\/(api|auth)\//.test(new URL(request.url()).pathname)) result.backendRequests.push(new URL(request.url()).pathname); });
  const setRuntime = patch => page.evaluate(async patch => {
    const app = (await import("/src/store/app.ts")).useApp();
    app.setPhoneRuntime(app.devices.find(row => row.kind === "phone").id, patch);
    app.tick(1000);
  }, patch);
  const read = () => page.evaluate(async () => {
    const app = (await import("/src/store/app.ts")).useApp();
    const phone = app.devices.find(row => row.kind === "phone");
    const auth = uni.getStorageSync("nexgrid-auth-v1");
    const saved = uni.getStorageSync("nexgrid-account-cloud-v1")[(auth.email || auth.accountId).toLowerCase()].devices.find(row => row.id === phone.id);
    const fields = ["batteryLevel", "isCharging", "isWifiConnected", "pausedReason"];
    return {
      runtime: Object.fromEntries(fields.map(key => [key, phone[key]])),
      stored: Object.fromEntries(fields.map(key => [key, saved[key]])),
      taskId: phone.currentTask?.id ?? null,
      startedAt: phone.currentTask?.startedAt ?? null,
      interruptedAt: phone.interruptedAt,
      completed: phone.recentTasks.length,
      hashrate: app.myTotalHashrateAt(Date.now()),
      lastSettledAt: phone.lastSettledAt,
    };
  });
  try {
    await page.goto(`${base}/?nx_device_inner=1#/pages/login/login`, { waitUntil: "domcontentloaded" });
    await page.locator('.lg-wrap[data-preview-account-status="ready"]').waitFor();
    await page.getByTestId("mock-preview-password").locator("input").press("Enter");
    await page.waitForURL(/#\/$|#\/pages\/index\/index/);
    const fixture = await page.evaluate(async () => {
      const app = (await import("/src/store/app.ts")).useApp();
      const { getT } = await import("/src/i18n/use-t.ts");
      (await import("/src/store/locale.ts")).useLocaleStore().setLocale("en");
      // Isolate the existing phone with public store actions; no fabricated task engine.
      for (const device of [...app.devices]) if (!app.deactivateDevice(device.id)) throw new Error("fixture deactivation failed");
      const id = app.devices.find(row => row.kind === "phone")?.id;
      if (!id || !app.activateDevice(id)) throw new Error("fixture phone activation failed");
      app.resumeMining();
      app.setPhoneRuntime(id, { batteryLevel: 19, isCharging: false, isWifiConnected: true });
      const t = getT();
      return { id, lowBattery: t.earn.phonePausedLowBattery, hashLabel: t.earn.hashLabel, rankLabel: t.home.networkYourRank, unranked: t.home.networkRankUnranked, updating: t.home.networkStatUpdating, retry: t.home.networkStatRetry };
    });
    assert.ok(fixture.lowBattery, "low-battery translation missing");
    for (const batteryLevel of [19, 20]) for (const isCharging of [false, true]) {
      const name = `battery-${batteryLevel}-charging-${isCharging}`;
      await setRuntime({ batteryLevel, isCharging, isWifiConnected: true });
      const beforeReload = await read();
      assert.equal(beforeReload.runtime.pausedReason, batteryLevel < 20 ? "low-battery" : null);
      assert.deepEqual(beforeReload.stored, beforeReload.runtime, "runtime patch must persist");
      assert.equal(beforeReload.hashrate > 0, batteryLevel >= 20, "home aggregate must follow battery gate");
      if (batteryLevel < 20) assert.equal(beforeReload.taskId, null, "low battery must not acquire a task");
      else assert.ok(beforeReload.taskId, "20% phone must acquire a task without charging");
      await page.goto(`${base}/?nx_device_inner=1#/pages/earn/device-detail?id=${encodeURIComponent(fixture.id)}`, { waitUntil: "domcontentloaded" });
      const card = page.locator(".nx-device-card");
      await card.waitFor();
      const afterReload = await read();
      const state = { name, beforeReload, afterReload };
      result.states.push(state);
      assert.deepEqual(afterReload.runtime, beforeReload.runtime, "battery/charging/network and pause reason must survive reload");
      assert.deepEqual(afterReload.stored, afterReload.runtime);
      if (batteryLevel < 20) {
        await card.getByText(fixture.lowBattery, { exact: true }).waitFor();
        assert.equal(await card.getByText(fixture.hashLabel, { exact: true }).count(), 0);
      } else {
        await card.getByText(fixture.hashLabel, { exact: true }).waitFor();
        assert.equal(await card.getByText(fixture.lowBattery, { exact: true }).count(), 0);
      }
      assert.match(await card.locator(".nx-device-charger-toggle").innerText(), new RegExp(`${batteryLevel}%`));
      assert.equal(await card.locator(".nx-device-charger-toggle").getAttribute("aria-checked"), String(isCharging));
      await card.screenshot({ path: resolve(artifacts, `${name}-card.png`), timeout: 60_000 });
      await page.goto(`${base}/?nx_device_inner=1#/pages/index/index`, { waitUntil: "domcontentloaded" });
      for (let attempt = 0; attempt < 3; attempt++) {
        const dismiss = page.locator(".tcs-dismiss:visible, .vcs-dismiss:visible, .tcs-close:visible, .vcs-close:visible").first();
        if (!await dismiss.waitFor({ state: "visible", timeout: 1500 }).then(() => true, () => false)) break;
        await dismiss.click();
      }
      const rank = page.locator(".grid.items-center").filter({ has: page.getByText(fixture.rankLabel, { exact: true }) });
      state.rankInputs = await page.evaluate(async () => {
        const cfg = (await import("/src/store/config.ts")).useConfig();
        const app = (await import("/src/store/app.ts")).useApp();
        const { publicStatsHealth } = await import("/src/lib/platform-stats.ts");
        const { computeRank } = await import("/src/lib/network-rank.ts");
        const ps = cfg.config.publicStats;
        const health = publicStatsHealth(ps);
        return { syncFailed: cfg.syncFailed, health, kind: cfg.syncFailed || !health.membersOk || !health.rankOk ? "unavailable" : computeRank({ myTotalHashrate: app.myTotalHashrateAt(Date.now()), table: ps.hashratePercentileTable, realPopulation: ps.realUserCount, virtualPopulation: ps.virtualUserCount }).kind };
      });
      // Fixed mock has no authoritative ranking population. Assert its real fallback,
      // while the store assertions above still enforce zero/positive phone hashpower.
      await rank.filter({ hasText: state.rankInputs.kind === "unavailable" ? fixture.updating : batteryLevel < 20 ? fixture.unranked : /#\d/ }).waitFor();
      state.rankText = await rank.innerText();
      if (state.rankInputs.kind === "unavailable") {
        assert.ok(state.rankText.includes(fixture.retry));
        assert.doesNotMatch(state.rankText, /#\d/);
      }
      await rank.screenshot({ path: resolve(artifacts, `${name}-home-rank.png`), timeout: 60_000 });
    }
    const running = await read();
    await setRuntime({ batteryLevel: 19, isCharging: false });
    const interrupted = await read();
    assert.equal(interrupted.taskId, running.taskId, "brief low-battery interruption must keep the task");
    assert.ok(interrupted.interruptedAt);
    await setRuntime({ batteryLevel: 20 });
    const resumed = await read();
    assert.equal(resumed.taskId, running.taskId);
    assert.equal(resumed.interruptedAt, null);
    assert.ok(resumed.startedAt >= running.startedAt && resumed.hashrate > 0);
    await setRuntime({ isWifiConnected: false });
    const disconnected = await read();
    assert.equal(disconnected.runtime.pausedReason, "no-network");
    assert.equal(disconnected.hashrate, 0);
    assert.equal(disconnected.taskId, running.taskId);
    await setRuntime({ isWifiConnected: true });
    assert.equal((await read()).taskId, running.taskId, "brief network outage must keep the task");
    result.recovery = { running, interrupted, resumed, disconnected };
    result.settlement = [];
    for (const batteryLevel of [19, 20]) {
      await setRuntime({ batteryLevel, isCharging: false });
      const delta = await page.evaluate(async () => {
        const app = (await import("/src/store/app.ts")).useApp();
        const phone = app.devices.find(row => row.kind === "phone");
        const before = [phone.todayEarnings, phone.todayEarningsNEX];
        // Backdate only this isolated fixture's settlement anchor; use real settlement.
        app.$patch({ devices: app.devices.map(row => row.id === phone.id ? { ...row, lastSettledAt: Date.now() - 3_600_000 } : row) });
        app.settle();
        const after = app.devices.find(row => row.id === phone.id);
        return [after.todayEarnings - before[0], after.todayEarningsNEX - before[1]];
      });
      if (batteryLevel < 20) assert.deepEqual(delta, [0, 0], "paused phone must not accrue either currency");
      else assert.ok(delta.every(value => value > 0), "20% unplugged phone must accrue both currencies");
      result.settlement.push({ batteryLevel, delta });
    }
    await setRuntime({ batteryLevel: 19 });
    await page.evaluate(async () => {
      const app = (await import("/src/store/app.ts")).useApp();
      const { INTERRUPT_GRACE_MS } = await import("/src/store/interrupt.ts");
      app.$patch({ devices: app.devices.map(row => row.kind === "phone" ? { ...row, interruptedAt: Date.now() - INTERRUPT_GRACE_MS - 1 } : row) });
      app.tick(1000);
    });
    const expired = await read();
    assert.equal(expired.taskId, null, "expired interruption must cancel the task");
    assert.equal(expired.completed, running.completed, "cancelled task must not count as completed");
    await setRuntime({ batteryLevel: 20 });
    const reassigned = await read();
    assert.ok(reassigned.taskId && reassigned.taskId !== running.taskId, "recovery after timeout must get a new task");
    result.timeout = { expired, reassigned };
    assert.deepEqual(result.consoleErrors, []);
    assert.deepEqual(result.pageErrors, []);
    assert.deepEqual(result.backendRequests, []);
    result.passed = true;
  } catch (error) {
    result.passed = false;
    result.error = error.stack;
    await page.screenshot({ path: resolve(artifacts, "battery-rules-failed.png"), fullPage: true, timeout: 60_000 }).catch(() => {});
  } finally { await context.close(); }
  console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}${result.error ? `: ${result.error}` : ""}`);
  return result;
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
  const previewExternalResourceErrors = [];
  const context = await browser.newContext({ viewport: { width: 320, height: 568 } });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("console", message => {
      if (message.type() !== "error") return;
      const error = { text: message.text(), location: message.location() };
      (isThirdPartyResourceError(error.text, error.location.url, base) ? previewExternalResourceErrors : errors).push(error);
    });
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
  const batteryRules = await runBatteryRules(base);
  const report = { executedAt: new Date().toISOString(), base, identity, setup: "isolated fixed-mock preview login; first-time calibration state seeded, not a registration test", results, previewLocales, previewExternalResourceErrors, batteryRules };
  const resultPath = resolve(artifacts, "result.json");
  await writeFile(resultPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Calibration: ${results.filter(row => row.passed).length}/${cases.length}; preview locales: ${previewLocales.length}/8; evidence: ${resultPath}`);
  assert.ok(results.every(row => row.passed) && batteryRules.passed, "ONBOARDING_CALIBRATION_RUNTIME_FAILED");
} finally {
  await browser?.close();
  server?.stop();
}

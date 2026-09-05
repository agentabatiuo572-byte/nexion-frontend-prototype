#!/usr/bin/env node
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || process.env.UNI_BASE_URL || "http://localhost:5173";
const AUTHED = {
  isAuthenticated: true,
  email: "",
  accountId: "default",
  onboardingComplete: true,
};
const OUT = { isAuthenticated: false, email: "", accountId: "default", onboardingComplete: false };

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function installIntervalProbe(context) {
  await context.addInitScript(() => {
    const nativeSetInterval = window.setInterval.bind(window);
    const nativeClearInterval = window.clearInterval.bind(window);
    const active = new Map();
    window.setInterval = (handler, timeout, ...args) => {
      const id = nativeSetInterval(handler, timeout, ...args);
      active.set(id, Number(timeout));
      return id;
    };
    window.clearInterval = (id) => {
      active.delete(id);
      return nativeClearInterval(id);
    };
    window.__nxBusinessLoopIntervals = () => [...active.values()];
  });
}

async function open(context, landing, auth, forbiddenConfigRequests = []) {
  const page = await context.newPage();
  page.on("request", (request) => {
    try {
      const path = new URL(request.url()).pathname;
      if (path === "/api/config/platform") forbiddenConfigRequests.push(request.url());
    } catch {}
  });
  await page.goto(`${BASE}/?nx_device=off#/__business_loop_seed`, { waitUntil: "domcontentloaded" });
  await page.evaluate((snapshot) => {
    localStorage.clear();
    localStorage.setItem("nexgrid-auth-v1", JSON.stringify({ type: "object", data: snapshot }));
  }, auth);
  await page.goto(`${BASE}/?nx_device=off&cb=${Date.now()}#/${landing}`, { waitUntil: "load" });
  await wait(3000);
  return page;
}

async function nav(page, target) {
  const ok = await page.evaluate((route) => {
    if (typeof uni === "undefined" || !uni.reLaunch) return false;
    uni.reLaunch({ url: `/${route}`, fail: () => {} });
    return true;
  }, target);
  if (!ok) throw new Error(`navigation primitive unavailable for ${target}`);
}

async function snapshot(page) {
  return page.evaluate(() => {
    const values = typeof window.__nxBusinessLoopIntervals === "function"
      ? window.__nxBusinessLoopIntervals()
      : [];
    const counts = {};
    for (const delay of values) counts[String(delay)] = (counts[String(delay)] || 0) + 1;
    let route = "";
    try {
      const pages = getCurrentPages();
      route = pages.length ? pages[pages.length - 1].route || "" : "";
    } catch {}
    if (!route) route = (location.hash || "").replace(/^#\/?/, "").split("?")[0];
    const loops = typeof window.__nxBusinessLoopStatus === "function"
      ? window.__nxBusinessLoopStatus()
      : null;
    const timeoutRuns = typeof window.__nxBusinessLoopTimeoutRuns === "function"
      ? window.__nxBusinessLoopTimeoutRuns()
      : null;
    return { route, counts, loops, timeoutRuns };
  });
}

async function seedDelayedDeposit(page) {
  return page.evaluate(() => {
    const dev = window.__nxDev;
    if (!dev || typeof dev.simulateIncomingTransfer !== "function") return null;
    const hash = `0x${Date.now().toString(16).padStart(64, "0")}`;
    const record = dev.simulateIncomingTransfer("usdt-trc20", 20, hash);
    return record?.depositId || null;
  });
}

async function depositStatus(page, depositId) {
  return page.evaluate((id) => {
    const dev = window.__nxDev;
    return dev && typeof dev.depositStatus === "function" ? dev.depositStatus(id) : null;
  }, depositId);
}

const businessCadences = ["4000", "5000", "6000"];
const count = (sample, delay) => Number(sample.counts[delay] || 0);
const failures = [];
const loopIds = ["earnings", "arrival", "trial", "order", "milestone"];

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await installIntervalProbe(context);
  const forbiddenConfigRequests = [];
  const page = await open(context, "pages/index/index", AUTHED, forbiddenConfigRequests);
  const before = await snapshot(page);
  const timeoutProbeArmed = await page.evaluate(() => {
    if (typeof window.__nxScheduleBusinessLoopTimeout !== "function") return false;
    window.__nxScheduleBusinessLoopTimeout(4000);
    return true;
  });
  await wait(50);
  const armed = await snapshot(page);
  const delayedDepositId = await seedDelayedDeposit(page);
  const depositBeforeStop = delayedDepositId ? await depositStatus(page, delayedDepositId) : null;

  await nav(page, "pages/entry-surfaces/index");
  await wait(4500);
  const stopped = await snapshot(page);
  const depositWhileStopped = delayedDepositId ? await depositStatus(page, delayedDepositId) : null;

  await nav(page, "pages/index/index");
  await wait(30000);
  const recovered = await snapshot(page);
  const depositAfterRecovery = delayedDepositId ? await depositStatus(page, delayedDepositId) : null;

  if (!before.loops || !stopped.loops || !recovered.loops) {
    failures.push("coverage: per-loop DEV probe unavailable");
  } else {
    for (const id of loopIds) {
      if (before.loops[id] !== true) failures.push(`coverage: baseline ${id} loop is not running`);
      if (stopped.loops[id] !== false) failures.push(`static review left ${id} loop running`);
      if (recovered.loops[id] !== true) failures.push(`business route did not recover ${id} loop`);
    }
    if (before.loops.configSyncFailed !== false || recovered.loops.configSyncFailed !== false) {
      failures.push("local-mock platform config did not become settlement-ready");
    }
    if (Number(recovered.loops.latestSettledAt || 0) <= Number(before.loops.latestSettledAt || 0)) {
      failures.push("business recovery did not advance the raw device settlement anchor");
    }
    if (Number(recovered.loops.deviceEarningsToday || 0) <= Number(before.loops.deviceEarningsToday || 0)) {
      failures.push("business recovery did not advance raw device earnings");
    }
    if (Number(recovered.loops.earningsToday || 0) <= Number(before.loops.earningsToday || 0)) {
      failures.push("business recovery did not advance raw aggregate earnings");
    }
    if (Number(recovered.loops.earningsToday || 0).toFixed(2) === Number(before.loops.earningsToday || 0).toFixed(2)) {
      failures.push("low-speed default account did not visibly advance aggregate earnings within 30 seconds");
    }
  }
  if (forbiddenConfigRequests.length > 0) {
    failures.push(`local-mock requested the remote platform config endpoint (${forbiddenConfigRequests.length})`);
  }
  if (!timeoutProbeArmed || !armed.loops || armed.timeoutRuns === null) {
    failures.push("coverage: registered business-timeout probe unavailable");
  } else {
    if (Number(armed.loops.pendingTimeouts || 0) < 1) {
      failures.push("coverage: registered delayed business callback was not armed");
    }
    if (Number(stopped.loops?.pendingTimeouts || 0) !== 0) {
      failures.push("static review left a registered delayed business callback pending");
    }
    if (stopped.timeoutRuns !== armed.timeoutRuns) {
      failures.push("registered delayed business callback executed after static-review stop");
    }
    if (Number(recovered.loops?.pendingTimeouts || 0) !== 0) {
      failures.push("business recovery resurrected a cancelled delayed callback");
    }
  }
  if (!delayedDepositId || depositBeforeStop !== "detected") {
    failures.push("coverage: delayed deposit confirmation engine was not armed");
  } else {
    if (depositWhileStopped !== "detected") {
      failures.push(`static review allowed delayed deposit state write (${depositWhileStopped})`);
    }
    if (depositAfterRecovery === "detected" || depositAfterRecovery === null) {
      failures.push("business recovery did not re-arm delayed deposit confirmation");
    }
  }

  for (const delay of businessCadences) {
    if (count(before, delay) < 1) failures.push(`coverage: baseline has no ${delay}ms business cadence`);
    if (count(stopped, delay) >= count(before, delay)) failures.push(`static review did not stop ${delay}ms cadence`);
    if (count(recovered, delay) < count(before, delay)) failures.push(`business route did not recover ${delay}ms cadence`);
  }
  if (count(before, "1000") < 2) failures.push("coverage: baseline cannot distinguish the 1000ms guard and earnings tick");
  if (count(stopped, "1000") < 1) failures.push("guard cadence died together with business loops");
  if (count(stopped, "1000") >= count(before, "1000")) failures.push("static review did not stop the 1000ms earnings tick");
  if (count(recovered, "1000") < count(before, "1000")) failures.push("business route did not recover the 1000ms earnings tick");
  if (before.route !== "pages/index/index" || stopped.route !== "pages/entry-surfaces/index" || recovered.route !== "pages/index/index") {
    failures.push(`coverage: unexpected route sequence ${before.route} -> ${stopped.route} -> ${recovered.route}`);
  }
  await context.close();

  const outContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await installIntervalProbe(outContext);
  const outPage = await open(outContext, "pages/entry-surfaces/index", OUT);
  await nav(outPage, "pages/index/index");
  await wait(3500);
  const denied = await snapshot(outPage);
  if (denied.route === "pages/index/index") failures.push("logged-out control remained on a protected business route");
  for (const delay of businessCadences) {
    if (count(denied, delay) > 0) failures.push(`logged-out control started ${delay}ms business cadence`);
  }
  if (!denied.loops) failures.push("coverage: logged-out per-loop DEV probe unavailable");
  else {
    for (const id of loopIds) {
      if (denied.loops[id] !== false) failures.push(`logged-out control started ${id} loop`);
    }
  }
  await outContext.close();
} finally {
  await browser.close();
}

for (const failure of failures) console.log(`  FAIL ${failure}`);
console.log(failures.length === 0
  ? "业务循环存活性行为门 2/2 场景通过（低速默认账号原始/可见收益推进 + 未登录 fail-closed）"
  : `业务循环存活性行为门 FAIL (${failures.length})`);
process.exit(failures.length === 0 ? 0 : 1);

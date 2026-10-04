#!/usr/bin/env node
import { chromium } from "playwright";
import { installFormalProbeSession } from "./lib/formal-probe-session.mjs";

const BASE = process.env.BASE_URL || process.env.UNI_BASE_URL || "http://localhost:5173";
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

async function open(context, landing, authenticated) {
  const page = await context.newPage();
  await installFormalProbeSession(page, { authenticated });
  await page.goto(`${BASE}/?nx_device=off&cb=${Date.now()}#/${landing}`, {
    waitUntil: "load",
  });
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

const count = (sample, delay) => Number(sample.counts[delay] || 0);
const financeSnapshot = (sample) => ({
  earningsToday: Number(sample.loops?.earningsToday || 0),
  deviceEarningsToday: Number(sample.loops?.deviceEarningsToday || 0),
  latestSettledAt: Number(sample.loops?.latestSettledAt || 0),
});
const sameFinanceSnapshot = (left, right) =>
  left.earningsToday === right.earningsToday
  && left.deviceEarningsToday === right.deviceEarningsToday
  && left.latestSettledAt === right.latestSettledAt;

const failures = [];
const loopIds = ["earnings", "arrival", "trial", "order", "milestone"];
const browser = await chromium.launch();

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await installIntervalProbe(context);
  const page = await open(context, "pages/index/index", true);
  const before = await snapshot(page);
  const beforeFinance = financeSnapshot(before);

  const timeoutProbeArmed = await page.evaluate(() => {
    if (typeof window.__nxScheduleBusinessLoopTimeout !== "function") return false;
    window.__nxScheduleBusinessLoopTimeout(4000);
    return true;
  });
  await wait(50);
  const armed = await snapshot(page);

  await nav(page, "pages/entry-surfaces/index");
  await wait(4500);
  const stopped = await snapshot(page);

  await nav(page, "pages/index/index");
  await wait(7000);
  const recovered = await snapshot(page);
  const recoveredFinance = financeSnapshot(recovered);

  if (!before.loops || !stopped.loops || !recovered.loops) {
    failures.push("coverage: per-loop DEV probe unavailable");
  } else {
    for (const id of loopIds) {
      if (before.loops[id] !== true) failures.push(`coverage: baseline ${id} loop is not running`);
      if (stopped.loops[id] !== false) failures.push(`static review left ${id} loop running`);
      if (recovered.loops[id] !== true) failures.push(`business route did not recover ${id} loop`);
    }
    if (!sameFinanceSnapshot(beforeFinance, recoveredFinance)) {
      failures.push("formal App mutated authoritative earnings or settlement data in the browser");
    }
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

  if (count(before, "1000") < 2) failures.push("coverage: baseline cannot distinguish auth guard and business tick");
  if (count(stopped, "1000") < 1) failures.push("guard cadence died together with business loops");
  if (count(stopped, "1000") >= count(before, "1000")) failures.push("static review did not stop the business tick");
  if (count(recovered, "1000") < count(before, "1000")) failures.push("business route did not recover the business tick");
  if (before.route !== "pages/index/index" || stopped.route !== "pages/entry-surfaces/index" || recovered.route !== "pages/index/index") {
    failures.push(`coverage: unexpected route sequence ${before.route} -> ${stopped.route} -> ${recovered.route}`);
  }
  await context.close();

  const outContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await installIntervalProbe(outContext);
  const outPage = await open(outContext, "pages/entry-surfaces/index", false);
  await nav(outPage, "pages/index/index");
  await wait(3500);
  const denied = await snapshot(outPage);
  if (denied.route === "pages/index/index") failures.push("logged-out control remained on a protected business route");
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
  ? "业务循环存活性行为门 2/2 场景通过（Java 权威数据不被浏览器改写 + 未登录 fail-closed）"
  : `业务循环存活性行为门 FAIL (${failures.length})`);
process.exit(failures.length === 0 ? 0 : 1);

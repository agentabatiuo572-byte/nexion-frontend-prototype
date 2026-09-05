#!/usr/bin/env node
/**
 * behavior-verify.mjs — runtime proof for the 5 newly-wired auto-trigger behaviors.
 * Polls run LIVE (setInterval not frozen here), so any bug in pollOrders/
 * pollMilestones/checkQuestRoute throws to console → console-0 under live polls
 * is real proof the new App.vue code executes. Also captures quest toast on
 * home→earn nav, and tries to surface a milestone celebration overlay.
 */
import { chromium } from "playwright";
import { collectAppConsoleErrors } from "./lib/console-origin-filter.mjs";
const BASE = process.env.UNI_BASE_URL || process.env.BASE_URL || "http://localhost:5173";
const VP = { width: 390, height: 844 };
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VP, colorScheme: "dark" });
const page = await ctx.newPage();
const errs = [];
page.on("console", collectAppConsoleErrors(errs, BASE));
page.on("pageerror", (e) => errs.push("PAGEERROR: " + String(e)));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const report = {};

// ---- 1) Home: let order(6s)/milestone(4s)/quest polls run live for 8s ----
await page.goto(`${BASE}/?nx_device=off#/pages/index/index`, { waitUntil: "networkidle", timeout: 30000 });
// celebration overlay present? (milestone fired if seeded earnings already crossed a tier)
// 🔴 两条踩坑,都会让这里恒报 null(看起来像「里程碑没触发」):
//    ① 类名:必须认组件真实类名 .ms-overlay(components/milestone-celebration.vue:10)。
//       旧写法按 className 正则模糊匹配,扫不到,还会在 SVG 元素上把
//       SVGAnimatedString 当字符串测。
//    ② 时机:弹层是**队列**播放的,实测 t=2~7s 在、t=8~9s 是两条之间的空档、
//       t=10s 下一条又起 —— 原来固定等 8.2s 再单次采样,正好撞进空档。
//       改成边跑边采样:这 8.5s 内出现过就算数(主断言仍是 live polls 期间 console=0)。
let overlay = null;
for (let i = 0; i < 17; i++) {
  await wait(500); // 合计 8.5s > one order tick (6s) + two milestone ticks (4s)
  overlay ??= await page.evaluate(() => {
    const el = document.querySelector(".ms-overlay");
    return el ? (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80) : null;
  });
}
report.homeLivePolls8s_consoleErrors = [...errs];
report.milestoneOverlaySeen = overlay;

// ---- 2) Quest: nav home→earn should fire visit_earn → toast ----
errs.length = 0;
await page.goto(`${BASE}/?nx_device=off#/pages/earn/earn`, { waitUntil: "networkidle", timeout: 30000 });
await wait(1800); // quest watcher polls route @1s; toast renders in global-ui
const toastAfterEarn = await page.evaluate(() => {
  const t = [...document.querySelectorAll("[class*='toast'],[class*='nx-toast']")].map((e) => (e.textContent || "").trim()).filter(Boolean);
  return t;
});
report.earnNav_consoleErrors = [...errs];
report.toastAfterEarnNav = toastAfterEarn;

// ---- 3) genesis page: order poll runs live without errors (console proof) ----
errs.length = 0;
await page.goto(`${BASE}/?nx_device=off#/pages/genesis/genesis`, { waitUntil: "networkidle", timeout: 30000 });
await wait(6500); // one ORDER_TICK while the genesis page is mounted
report.genesisLive_consoleErrors = [...errs];

// ---- 4) store tab: order auto-advance loop runs ----
errs.length = 0;
await page.goto(`${BASE}/?nx_device=off#/pages/store/store`, { waitUntil: "networkidle", timeout: 30000 });
await wait(6500);
report.storeLive_consoleErrors = [...errs];

console.log(JSON.stringify(report, null, 2));
await browser.close();

#!/usr/bin/env node
/**
 * chrome-baseline.mjs —— 5 一级页视觉回归守卫（对齐长线任务 Pass 0）。
 *
 * 主人已单独优化首页/赚取/商城/团队/我的 5 个一级页，严禁回退。它们与所有子页
 * 共享 app-chassis.vue 外壳——任何共享层改动（chassis / tokens.css / 共享组件 /
 * stella→nova 重命名）都可能波及这 5 页。本脚本在改动前后对这 5 页逐像素比对 +
 * 特征指纹断言，机器化证明「零回退」。
 *
 * 用法（dev server 必须在 5173 跑）：
 *   node scripts/chrome-baseline.mjs capture baseline   # 改动前存基线
 *   node scripts/chrome-baseline.mjs capture current     # 改动后再截
 *   node scripts/chrome-baseline.mjs diff baseline current  # 逐像素比对，FAIL 非零退出
 *
 * 确定性手段：固定视口 414×896 / dark / reduced-motion；addInitScript 冻结
 * setInterval（停掉 home ticker + NOVA 轮询，否则数字会变造成假 diff）；
 * 注入 animation/transition:none 让 CSS 动画落到终态；等 fonts.ready + 结算。
 * 依赖：playwright（截图）+ pixelmatch + pngjs（比对），均已装。
 *
 * 已知底噪：home 全页有一个 rAF 驱动的动画（animation:none 只停 CSS 动画停不了
 * 它），即使秒级 back-to-back 也有 ~661px(0.0445%) 帧时差。chrome 区(header/pill)
 * 无动画 → 严格 0px。FAIL 阈值 0.1% > 该底噪，故守卫对 home 全页用阈值、对 chrome
 * 区严格 0；真回归(布局/色/位移)都 >>0.1% 会被抓。冻结 rAF 风险高(破一次性测量)
 * 收益低，故不冻。
 */
import { chromium } from "playwright";
import { collectAppConsoleErrors } from "./lib/console-origin-filter.mjs";
import { assertCaptureCoverage, assertComparablePngCoverage } from "./lib/probe-coverage.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, ".baseline");
const BASE = process.env.BASE_URL || "http://localhost:5173";

// ?nx_device=off — without it localhost wraps the app in the device-shell
// iframe and the outer page has no .nx-header/.nx-tabbar-pill to capture
// (P-058 class of bug; broke every capture after the shell shipped).
const PAGES = [
  ["home", "/?nx_device=off#/pages/index/index"],
  ["earn", "/?nx_device=off#/pages/earn/earn"],
  ["store", "/?nx_device=off#/pages/store/store"],
  ["team", "/?nx_device=off#/pages/team/team"],
  ["me", "/?nx_device=off#/pages/me/me"],
];
const EXPECTED_ROUTES = Object.fromEntries(PAGES.map(([name, route]) => [name, route.slice(route.indexOf("#") + 1)]));

async function capture(label) {
  const dir = path.join(OUT, label);
  fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 414, height: 896 },
    deviceScaleFactor: 2,
    colorScheme: "dark",
    reducedMotion: "reduce",
  });
  // Determinism: freeze recurring timers (home ticker / NOVA polls) AND pin time.
  // Several pages render Date.now()-derived values (earn missed-income / device
  // lifecycle / task-center elapsed) — without pinning, captures minutes apart
  // drift → false pixel diffs. Pin Date.now() + argless new Date() to a constant;
  // parsing constructors (new Date(ms)) still work.
  await ctx.addInitScript(() => {
    window.setInterval = () => 0;
    // Suppress the Home trial-sheet auto-push in the static baseline by pre-seeding
    // its cooldown (lastClosedAt = now) — the store's tryAutoPush then no-ops. This
    // is surgical (only the trial overlay), unlike killing all long setTimeouts which
    // also broke other pages' delayed content. The auto-push itself is verified by
    // trial-check. uni H5 wraps storage as {type:"object",data:...}; a far-future
    // lastClosedAt keeps tryAutoPush in-cooldown regardless of mockServerNow's base.
    try { localStorage.setItem("nexgrid-trial-claim-sheet-v1", JSON.stringify({ type: "object", data: { lastClosedAt: 9999999999999 } })); } catch (e) { void e; }
    // Same for the voucher claim sheet auto-push (Home, 1300ms): pre-seed its
    // cooldown so the popup overlay stays closed in the static baseline. The
    // voucher BANNER still renders (it keys off claimable vouchers, not the
    // popup) — that banner is the intended new state on home/store/me/earn.
    try { localStorage.setItem("nexgrid-voucher-claim-sheet-v1", JSON.stringify({ type: "object", data: { lastClosedAt: 9999999999999 } })); } catch (e) { void e; }
    const FIXED = 1781700000000;
    const RealDate = Date;
    class FakeDate extends RealDate {
      constructor(...args) { if (args.length === 0) super(FIXED); else super(...args); }
      static now() { return FIXED; }
    }
    window.Date = FakeDate;
    // seed Math.random (mulberry32) so random-driven decor (aurora blobs /
    // particle positions) renders identically across captures
    let s = 0x12345678;
    Math.random = () => {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  });
  const report = {};
  for (const [name, route] of PAGES) {
    const page = await ctx.newPage();
    const errors = [];
    page.on("console", collectAppConsoleErrors(errors, BASE));
    page.on("pageerror", (e) => errors.push(String(e)));
    try {
      await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 30000 });
      await page.evaluate(() => (document.fonts ? document.fonts.ready : null)).catch(() => {});
      await page.waitForTimeout(1200);
      await page.addStyleTag({ content: "*{animation:none!important;transition:none!important;caret-color:transparent!important}" });
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(dir, `${name}.png`) });
      for (const sel of [".nx-header", ".nx-tabbar-pill"]) {
        const loc = page.locator(sel).first();
        if (await loc.count()) { try { await loc.screenshot({ path: path.join(dir, `${name}__${sel.replace(/\W/g, "")}.png`) }); } catch {} }
      }
      report[name] = await page.evaluate(() => {
        const q = (s) => document.querySelector(s);
        const cs = (el) => (el ? getComputedStyle(el) : null);
        const header = q(".nx-header");
        return {
          actualRoute: (location.hash || "").replace(/^#/, ""),
          appChildren: q("#app")?.childElementCount ?? 0,
          iframeCount: document.querySelectorAll("iframe").length,
          bodyElements: document.querySelectorAll("body *").length,
          bodyTextLength: (document.body?.innerText || "").trim().length,
          headerCount: document.querySelectorAll(".nx-header").length,
          pillCount: document.querySelectorAll(".nx-tabbar-pill").length,
          tabCount: document.querySelectorAll(".nx-tab").length,
          headerH: header ? Math.round(header.getBoundingClientRect().height) : null,
          headerBackdrop: cs(header)?.backdropFilter || null,
          fontFamily: cs(document.body)?.fontFamily || null,
        };
      });
      report[name].consoleErrors = errors;
    } catch (e) {
      report[name] = { error: String(e), consoleErrors: errors };
    }
    await page.close();
  }
  fs.writeFileSync(path.join(dir, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();
  console.log("captured", label, "→", dir);
  console.log(JSON.stringify(report, null, 2));
  const pngFiles = fs.readdirSync(dir).filter((file) => file.endsWith(".png") && !file.startsWith("DIFF__"));
  assertCaptureCoverage(PAGES.map(([name]) => name), report, pngFiles, EXPECTED_ROUTES);
}

function readPng(p) { return PNG.sync.read(fs.readFileSync(p)); }

function diff(a, b) {
  const dirA = path.join(OUT, a), dirB = path.join(OUT, b);
  if (!fs.existsSync(dirA) || !fs.existsSync(dirB)) { console.error("missing capture dir", dirA, dirB); process.exit(2); }
  const baselinePngs = fs.readdirSync(dirA).filter((file) => file.endsWith(".png") && !file.startsWith("DIFF__"));
  const currentPngs = fs.readdirSync(dirB).filter((file) => file.endsWith(".png") && !file.startsWith("DIFF__"));
  assertComparablePngCoverage(PAGES.map(([name]) => `${name}.png`), baselinePngs, currentPngs);
  let totalBad = 0;
  const results = [];
  for (const f of baselinePngs) {
    const pa = path.join(dirA, f), pb = path.join(dirB, f);
    if (!fs.existsSync(pb)) { results.push(`FAIL ${f}: MISSING in ${b}`); totalBad++; continue; }
    const ia = readPng(pa), ib = readPng(pb);
    if (ia.width !== ib.width || ia.height !== ib.height) { results.push(`FAIL ${f}: SIZE ${ia.width}x${ia.height} vs ${ib.width}x${ib.height}`); totalBad++; continue; }
    const out = new PNG({ width: ia.width, height: ia.height });
    const n = pixelmatch(ia.data, ib.data, out.data, ia.width, ia.height, { threshold: 0.1 });
    const pct = (n / (ia.width * ia.height)) * 100;
    if (n > 0) fs.writeFileSync(path.join(dirB, `DIFF__${f}`), PNG.sync.write(out));
    const flag = pct > 0.1 ? "FAIL" : n > 0 ? "warn" : "ok";
    if (flag === "FAIL") totalBad++;
    results.push(`${flag} ${f}: ${n}px (${pct.toFixed(4)}%)`);
  }
  console.log(results.join("\n"));
  console.log(totalBad === 0 ? "BASELINE-DIFF: PASS" : `BASELINE-DIFF: FAIL (${totalBad})`);
  process.exit(totalBad === 0 ? 0 : 1);
}

const [cmd, a, b] = process.argv.slice(2);
if (cmd === "capture") await capture(a || "baseline");
else if (cmd === "diff") diff(a || "baseline", b || "current");
else { console.log("usage: node scripts/chrome-baseline.mjs capture <label> | diff <a> <b>"); process.exit(2); }

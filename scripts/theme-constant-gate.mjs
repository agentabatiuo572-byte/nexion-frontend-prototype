#!/usr/bin/env node
/**
 * 双主题恒定着色 · 运行时正交门(C1 批次 2026-07-23)
 *
 * 为什么必须是运行时门(静态哨兵治不了这个类):
 *   本批同一个坑连踩三次 —— ①按颜色值全等比 token,漏掉变 alpha 副本
 *   ②按值 grep 遮罩,20 个只捞到 9 个 ③按值 grep 网格线,4 个只捞到 2 个。
 *   根因一致:**我在用「值」找「扮演某角色的东西」**,而角色不由值定义。
 *   静态哨兵只能钉「我已经想到的写法」,想不到的写法(别的值、别的语法、
 *   拼接出来的字符串)天然在射程外 —— 这就是独立验收点名的 N5 假阴性类。
 *
 * 本门换一个**正交维度**:不问"源码怎么写的",只问"渲染出来跟不跟主题"。
 *   渲染两遍(dark / light),取每个可见元素的 color / background / border,
 *   凡是**两个主题下完全相同**的有色值,就是嫌疑 —— 不管它在源码里长什么样。
 *
 * 合法的恒定色不少(设计上就该恒定),所以两道减噪:
 *   ① 值等于某个「两主题同值 token」(如 --v5-on-brand-2 双主题都是 #0A0A0A)→ 放行,
 *      这类恒定是 token 体系自己规定的。
 *   ② 存量走棘轮基线 docs/THEME-CONSTANT-BASELINE.json,门只拦**新增**指纹。
 *
 * 指纹 = route|prop|value(不含 DOM 路径,元素挪位置不会假红)。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { scopeRoutes, mapRoutes } from "./lib/probe-routes.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const BASELINE = path.join(ROOT, "docs/THEME-CONSTANT-BASELINE.json");
const TOKENS_CSS = path.join(ROOT, "src/styles/tokens.css");
const BASE = process.env.BASE_URL || "http://localhost:5173";
const ROUTES = [
  "/pages/index/index",
  "/pages/earn/earn",
  "/pages/store/store",
  "/pages/team/team",
  "/pages/me/me",
];
// 路由级范围(包 ax):PROBE_ROUTES 有值 → 只扫「射程 ∩ 受影响路由」;未设 = 全量。scoped 下「消失」只对扫过的路由比,--update-baseline 拒绝。
const SCOPE = scopeRoutes(ROUTES, "双主题恒定着色");
const SCAN = SCOPE.routes;
const SCANNED = new Set(SCAN);

/* ── 颜色工具 ── */
export function parseColor(s) {
  if (!s) return null;
  let m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.%]+))?\s*\)$/.exec(s.trim());
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return [Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3]), a];
  }
  m = /^#([0-9a-fA-F]{6})$/.exec(s.trim());
  if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16), 1];
  // color(srgb r g b / a) —— color-mix 的 computed 形态
  m = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)$/.exec(s.trim());
  if (m) return [Math.round(+m[1] * 255), Math.round(+m[2] * 255), Math.round(+m[3] * 255), m[4] === undefined ? 1 : +m[4]];
  return null;
}
export const isTrueGrey = (c) => c[0] === c[1] && c[1] === c[2];
export const isInvisible = (c) => c[3] === 0;

/** tokens.css 里「两主题同值」的 token 值集合 —— 这类恒定是设计规定的,放行 */
export function themeConstantTokenValues(css) {
  const raw = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const defs = { light: new Map(), dark: new Map() };
  const grab = (re, theme) => {
    let b;
    while ((b = re.exec(raw))) {
      const dre = /(--[\w-]+)\s*:\s*([^;]+);/g;
      let d;
      while ((d = dre.exec(b[1]))) {
        const c = parseColor(d[2].trim()) ?? parseColor(d[2].trim().replace(/^#([0-9a-f]{3})$/i, (_, h) => "#" + h[0] + h[0] + h[1] + h[1] + h[2] + h[2]));
        if (c) defs[theme].set(d[1], c.join(","));
      }
    }
  };
  grab(/:root\s*\{([\s\S]*?)\n\}/g, "light");
  grab(/html\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/g, "dark");
  const out = new Set();
  for (const [t, v] of defs.light) {
    const d = defs.dark.get(t);
    if (d === undefined || d === v) out.add(v); // 只在 :root 定义(暗主题继承)或两边同值 → 设计上恒定
  }
  return out;
}

/** 渐变/纹理判定:两主题下 backgroundImage 整串相同 → 里面每个色都没跟主题。
 *  取串内第一个「有色 + 非真灰 + 非恒定 token 值」的颜色作代表。
 *  (本批两次漏修的网格线正是画在 backgroundImage 里的,单比 color/bg-color 抓不到。) */
export function judgeImage(darkVal, lightVal, constTokenValues) {
  if (!darkVal || darkVal === "none" || darkVal !== lightVal) return null;
  const re = /rgba?\([^)]*\)|color\(srgb[^)]*\)|#[0-9a-fA-F]{6}\b/g;
  for (const raw of darkVal.match(re) || []) {
    const c = parseColor(raw);
    if (!c || isInvisible(c) || isTrueGrey(c)) continue;
    if (constTokenValues.has(c.join(","))) continue;
    return c.join(",");
  }
  return null;
}

/** 核心判定:两主题同值 + 有色 + 不是设计规定的恒定 token 值 → 嫌疑 */
export function judge(darkVal, lightVal, constTokenValues) {
  const d = parseColor(darkVal), l = parseColor(lightVal);
  if (!d || !l) return null;
  if (isInvisible(d) || isInvisible(l)) return null;
  if (d.join(",") !== l.join(",")) return null;      // 跟主题变了 → OK
  if (isTrueGrey(d)) return null;                     // 真灰 = 通用光影
  if (constTokenValues.has(d.join(","))) return null; // token 体系规定的恒定色
  return d.join(",");
}

const PROBE = () => {
  const out = [];
  document.querySelectorAll("uni-view,view,uni-text,text,svg,circle,rect,path,line").forEach((el, i) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    const cs = getComputedStyle(el);
    out.push({
      // 🔴 稳定身份键,不用 DOM 下标配对:首页任务卡是自动轮播的,两个主题快照之间
      // DOM 会变 → 下标错位会把**不同元素**当同一个比,产出假阳性(2026-07-23 实测撞到)。
      // 只在该键在两侧都**唯一**时才比对,否则跳过(宁可漏报也不误报 —— 会误报的门必被绕过)。
      key: `${el.tagName}|${el.className || ""}|${(el.textContent || "").trim().slice(0, 24)}|${Math.round(r.width)}x${Math.round(r.height)}`,
      i,
      color: cs.color,
      backgroundColor: cs.backgroundColor,
      borderTopColor: cs.borderTopWidth === "0px" ? null : cs.borderTopColor,
      fill: el.getAttribute && el.namespaceURI?.includes("svg") ? cs.fill : null,
      backgroundImage: cs.backgroundImage === "none" ? null : cs.backgroundImage,
      txt: (el.textContent || "").trim().slice(0, 24),
    });
  });
  return out;
};

async function sweep() {
  const { chromium } = require("playwright");
  const constVals = themeConstantTokenValues(fs.readFileSync(TOKENS_CSS, "utf8"));
  const browser = await chromium.launch();
  const found = new Map(); // fingerprint -> {route, prop, value, count, sample}
  // 包 ax:本门只走路由级范围化,**不并行**(concurrency 1 = 与原来逐路由串行完全同构):本门靠「同一元素两主题快照按稳定键配对」判定,
  //   对页面加载时序敏感(首页 tech-money-card 的 aurora 用了遗留 token --accent-purple、双主题恒定且带 transform 动画,配对成功与否看动画相位,
  //   串行下就间歇命中 1/4;并行改变时序后命中率升到 2/3 → 门变红)。这条是**既有**问题,已上报待裁决;5 条路由并行只省 ~5s,不值得赌。
  const snaps = await mapRoutes(browser, SCAN, async (page, route) => {
    await page.goto(`${BASE}/?nx_device=off#${route}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(700);
    const snap = {};
    for (const theme of ["dark", "light"]) {
      await page.evaluate(
        (m) => document.querySelector("#app").__vue_app__.config.globalProperties.$pinia._s.get("theme").setMode(m),
        theme,
      );
      await page.waitForTimeout(320);
      snap[theme] = await page.evaluate(PROBE);
    }
    return { route, snap };
  }, { concurrency: 1, context: { viewport: { width: 390, height: 844 }, locale: "en-US" } });
  for (const r of snaps) {
    if (!r || r.error) throw new Error(`theme-constant: 路由扫描失败 ${r?.route ?? "?"}:${r?.error ?? "unknown"}`);
    const { route, snap } = r;
    // 按稳定身份键配对,且只取两侧都唯一的键(轮播/动画导致的 DOM 漂移一律跳过)
    const count = (arr) => arr.reduce((m, x) => m.set(x.key, (m.get(x.key) || 0) + 1), new Map());
    const cd = count(snap.dark), cl = count(snap.light);
    const byKey = new Map(snap.light.map((x) => [x.key, x]));
    let skipped = 0;
    for (const d of snap.dark) {
      if (cd.get(d.key) !== 1 || cl.get(d.key) !== 1) { skipped++; continue; }
      const l = byKey.get(d.key);
      if (!l) { skipped++; continue; }
      for (const prop of ["color", "backgroundColor", "borderTopColor", "fill", "backgroundImage"]) {
        const v = prop === "backgroundImage" ? judgeImage(d[prop], l[prop], constVals) : judge(d[prop], l[prop], constVals);
        if (!v) continue;
        const fp = `${route}|${prop}|${v}`;
        if (!found.has(fp)) found.set(fp, { route, prop, value: v, count: 0, sample: d.txt });
        found.get(fp).count++;
      }
    }
  }
  await browser.close();
  return [...found.values()].sort((a, b) => (a.route + a.prop + a.value).localeCompare(b.route + b.prop + b.value));
}

/* ── selftest:纯函数双向红测(不需要浏览器,门本身可信才跑扫描) ── */
function selftest() {
  const P = [];
  const p = (n, e, a) => P.push({ n, ok: JSON.stringify(e) === JSON.stringify(a), e, a });
  const constVals = themeConstantTokenValues(fs.readFileSync(TOKENS_CSS, "utf8"));

  // 解析器已知答案
  p("parse rgb", [1, 2, 3, 1], parseColor("rgb(1, 2, 3)"));
  p("parse rgba", [14, 142, 74, 0.3], parseColor("rgba(14,142,74,0.3)"));
  p("parse color(srgb) [color-mix 的 computed 形态]", [255, 0, 0, 0.5], parseColor("color(srgb 1 0 0 / 0.5)"));
  p("parse #hex", [198, 131, 22, 1], parseColor("#C68316"));

  // 🔴 阳性:两主题同值的有色 → 必须抓(这正是我三次漏修的共同形状)
  p("阳性 恒定深蓝网格", "15,21,42,0.035", judge("rgba(15,21,42,0.035)", "rgba(15,21,42,0.035)", constVals));
  p("阳性 恒定白网格", null, judge("rgba(255,255,255,0.03)", "rgba(255,255,255,0.03)", constVals)); // 真灰→放行,由 §真灰规则覆盖
  // 任取一个不属于任何 token 的有色恒定值(#D4AF5A 已于 2026-07-23 C1 落为
  // --v5-genesis-gold-on-dark 单主题 token → 现在会被正确放行,不能再当阳性靶子)
  p("阳性 恒定有色(非 token)", "200,100,50,1", judge("rgb(200, 100, 50)", "rgb(200, 100, 50)", constVals));
  p("阳性 恒定跌色", "194,102,88,1", judge("#C26658", "#C26658", constVals));

  // 阴性:跟主题变了 / 全透明 / 真灰
  p("阴性 跟主题变", null, judge("rgb(158,220,29)", "rgb(14,142,74)", constVals));
  p("阴性 全透明", null, judge("rgba(0,0,0,0)", "rgba(0,0,0,0)", constVals));
  p("阴性 真灰恒定", null, judge("rgba(0,0,0,0.55)", "rgba(0,0,0,0.55)", constVals));
  p("阴性 无法解析", null, judge("none", "none", constVals));

  // token 体系规定的恒定色必须放行(否则满屏假阳性)
  p("阴性 --v5-on-brand-2 双主题同值 #0A0A0A", null, judge("rgb(10, 10, 10)", "rgb(10, 10, 10)", constVals));
  p("恒定 token 值集非空", true, constVals.size > 0);

  // 🔴 backgroundImage(渐变/纹理)—— 本批两次漏修的网格线就画在这里
  const gridConst = "linear-gradient(to right, rgba(15, 21, 42, 0.035) 1px, rgba(0, 0, 0, 0) 1px)";
  p("阳性 恒定网格纹(整串双主题相同)", "15,21,42,0.035", judgeImage(gridConst, gridConst, constVals));
  p("阴性 网格纹跟主题(两串不同)", null, judgeImage(gridConst, gridConst.replace("15, 21, 42", "245, 247, 250"), constVals));
  p("阴性 纯真灰网格纹", null, judgeImage(
    "linear-gradient(to right, rgba(255, 255, 255, 0.03) 1px, rgba(0, 0, 0, 0) 1px)",
    "linear-gradient(to right, rgba(255, 255, 255, 0.03) 1px, rgba(0, 0, 0, 0) 1px)", constVals));
  p("阴性 none", null, judgeImage("none", "none", constVals));

  const bad = P.filter((x) => !x.ok);
  console.log("=== theme-constant gate selftest ===");
  for (const x of P) console.log(`${x.ok ? "PASS" : "FAIL"}  ${x.n}${x.ok ? "" : ` expect=${JSON.stringify(x.e)} actual=${JSON.stringify(x.a)}`}`);
  console.log(`\n${P.length - bad.length}/${P.length} pass`);
  process.exit(bad.length ? 1 : 0);
}

if (process.argv.includes("--selftest")) selftest();

const hits = await sweep();
const key = (h) => `${h.route}|${h.prop}|${h.value}`;
if (process.argv.includes("--update-baseline")) {
  if (SCOPE.scoped) { console.error("双主题恒定着色:PROBE_ROUTES 范围模式下不许 --update-baseline(只扫了一部分路由)。不设 PROBE_ROUTES 全量跑再重建。"); process.exit(2); }
  fs.writeFileSync(
    BASELINE,
    JSON.stringify(
      {
        _doc: "双主题恒定着色棘轮基线。门只拦新增指纹;存量随各批次消化,基线只许缩不许涨。每条 note 写为什么现在允许。",
        _updated: new Date().toISOString().slice(0, 10),
        entries: hits.map((h) => ({ ...h, note: "存量,待后续批次判定" })),
      },
      null,
      1,
    ),
  );
  console.log(`baseline 已更新:${hits.length} 条指纹`);
  process.exit(0);
}

const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, "utf8")).entries ?? [] : [];
const known = new Set(baseline.map(key));
const added = hits.filter((h) => !known.has(key(h)));
const gone = baseline.filter((b) => SCANNED.has(b.route) && !hits.some((h) => key(h) === key(b))); // scoped:只对扫过的路由比「消失」

// 🔴 二次确认再 fail(2026-07-23 C3 加):首页任务卡/事件卡有轮播,亮暗两次渲染
//    偶尔配对到不同的卡 → 报一条查无实据的「新增」。已两次踩到:上一轮连跑 3 次
//    全绿、本轮 12 次定点采样也抓不到那个色值。稳定复现的真违例两次都在,
//    偶发错位第二次就消失 —— 一次重扫就能把这类噪声挡在门外,代价只有疑似命中时多扫一遍。
let confirmed = added;
if (added.length) {
  console.error(`疑似新增 ${added.length} 条,重扫一次确认(轮播错位会在这一步消失)…`);
  const second = await sweep();
  const secondKeys = new Set(second.map(key));
  const flaky = added.filter((h) => !secondKeys.has(key(h)));
  confirmed = added.filter((h) => secondKeys.has(key(h)));
  for (const h of flaky) console.error(`  [偶发·已忽略] ${h.route}  ${h.prop} = rgb(${h.value})  « ${h.sample}`);
}

if (confirmed.length) {
  console.error(`双主题恒定着色:新增 ${confirmed.length} 条(基线 ${baseline.length},消失 ${gone.length})\n`);
  for (const h of confirmed) console.error(`  ${h.route}  ${h.prop} = rgb(${h.value})  ×${h.count}  « ${h.sample}`);
  console.error(`\n这些元素在亮/暗两个主题下颜色完全一样 = 没跟主题。改走 var(--token) / color-mix(var(--token) N%)。`);
  console.error(`确属设计上就该恒定 → node scripts/theme-constant-gate.mjs --update-baseline 收编并写 note 理由。`);
  process.exit(1);
}
console.log(`双主题恒定着色:无新增(基线 ${baseline.length} 条,本次消失 ${gone.length} 条${SCOPE.scoped ? ` · scoped ${SCAN.length}/${ROUTES.length} 路由` : ""})`);

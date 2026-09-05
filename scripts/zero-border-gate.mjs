#!/usr/bin/env node
/**
 * 零-border 铁律 · 运行时门(C2 批次 2026-07-23)
 *
 * 规范依据 `UI/规范/03-空间圆角边框分层规范.md` §3/§4:
 *   「**任何带背景色填充的卡片 / 板块一律零 border**——靠 surface 微差色分层,不描边。
 *     border **只属于透明容器**(分组 hairline、empty-state 虚线)。」
 *   §4:玻璃质感保留在 TabBar / Header / 浮层(--v5-glass-* / --v5-chrome-*),
 *       是全站 chrome 身份,**不在「卡片零 border」约束内**。
 *   §4 尾:内嵌元素(chip / pill / icon 容器)用 soft bg tint,**禁加 border**。
 *
 * 为什么是运行时门(C1 批次的教训,同一根因在那批发作三次):
 *   静态 grep 只能钉「我已经想到的写法」—— border 可以写成 `border:`、`border-top:`、
 *   `borderColor` 驼峰、UnoCSS class、CSS 类、或从别处继承;bg 可以是 color、gradient、
 *   或 token。用写法去找「扮演某角色的东西」必漏。
 *   本门只问渲染结果:**这个元素既有可见填充、又有可见描边** → 就是违例,不管源码怎么写。
 *
 * 分级:full(≥3 边,是「盒子描边」)进硬门;partial(1-2 边,多为行分隔线)只列不拦。
 * 🔴 描边不只写在 border:C2 独立验收抓出 `box-shadow: 0 0 0 Npx <color>` 的「环」与
 *   `outline` 同样是描边的另一种写法(线上真有一处 live-feed-card),已一并纳入判据。
 * 🔴 路由射程 = pages.json 全量(首版只取 10 条 = 11% 覆盖,被验收判为主要缺口)。
 * 豁免走 docs/ZERO-BORDER-ALLOWLIST.json(reason 必填);存量走棘轮基线,只拦新增。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { scopeRoutes, mapRoutes, settleNetwork } from "./lib/probe-routes.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const BASELINE = path.join(ROOT, "docs/ZERO-BORDER-BASELINE.json");
const ALLOWLIST = path.join(ROOT, "docs/ZERO-BORDER-ALLOWLIST.json");
const BASE = process.env.BASE_URL || "http://localhost:5173";

const ROUTES = (() => {
  // 射程 = pages.json 全量(C2 验收:首版 10 条 = 11% 覆盖,漏掉 65 处违例)
  const pj = JSON.parse(fs.readFileSync(path.join(ROOT, "src/pages.json"), "utf8"));
  const out = (pj.pages ?? []).map((p) => "/" + p.path);
  for (const g of pj.subPackages ?? []) for (const p of g.pages ?? []) out.push("/" + g.root + "/" + p.path);
  return out;
})();
// 路由级范围(包 ax):PROBE_ROUTES 有值 → 只扫「射程 ∩ 受影响路由」;未设 = 全量,行为与从前完全一样。
//   scoped 下:棘轮「消失」只对扫过的路由比(没扫的路由不算修好);--update-baseline 一律拒绝(会把没扫的路由从基线里删掉)。
const SCOPE = scopeRoutes(ROUTES, "零-border");
const SCAN = SCOPE.routes;
const SCANNED = new Set(SCAN);

/* ── 判定纯函数(可离线红测) ── */
export function parseColor(s) {
  if (!s) return null;
  let m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.%]+))?\s*\)$/.exec(String(s).trim());
  if (m) {
    const a = m[4] === undefined ? 1 : String(m[4]).endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return [+m[1], +m[2], +m[3], a];
  }
  m = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)$/.exec(String(s).trim());
  if (m) return [+m[1] * 255, +m[2] * 255, +m[3] * 255, m[4] === undefined ? 1 : +m[4]];
  return null;
}

/** 该元素**自身**是否有可见填充(不含祖先) */
export function hasFill(cs) {
  const c = parseColor(cs.backgroundColor);
  if (c && c[3] >= 0.03) return true;
  const bi = cs.backgroundImage;
  if (bi && bi !== "none" && /gradient|url\(/.test(bi)) return true;
  return false;
}

/** box-shadow 的「0 0 0 Npx <color>」环 = 描边的另一种写法(spread ring) */
export function shadowRing(boxShadow) {
  if (!boxShadow || boxShadow === "none") return false;
  // 不靠单条大正则(易被转义坑):按层拆开,取每层的 px 数列,判
  // 「offset-x=0 且 offset-y=0 且 blur=0 且 spread>0」= 四面等宽的环 = 描边的另一种写法。
  // 先把 rgb()/rgba()/color() 里的逗号屏蔽掉,再按逗号拆层(比一条带前瞻的大正则稳)
  const masked = String(boxShadow).replace(/\b(?:rgba?|color|hsla?)\([^)]*\)/g, "C");
  for (const layer of masked.split(",")) {
    const nums = (layer.match(/-?[\d.]+px/g) || []).map((x) => parseFloat(x));
    if (nums.length < 4) continue;
    const [ox, oy, blur, spread] = nums;
    if (ox === 0 && oy === 0 && blur === 0 && spread > 0) return true;
  }
  return false;
}
/** outline 也是描边 */
export function hasOutline(cs) {
  const w = parseFloat(cs.outlineWidth || "0");
  const st = cs.outlineStyle;
  if (!(w >= 0.5) || !st || st === "none") return false;
  const c = parseColor(cs.outlineColor);
  return !c || c[3] >= 0.05;
}

/** 可见描边的边数 */
export function borderSides(cs) {
  const sides = ["Top", "Right", "Bottom", "Left"];
  let n = 0;
  for (const s of sides) {
    const w = parseFloat(cs[`border${s}Width`] || "0");
    const style = cs[`border${s}Style`];
    if (!(w >= 0.5) || !style || style === "none" || style === "hidden") continue;
    const c = parseColor(cs[`border${s}Color`]);
    if (c && c[3] < 0.05) continue;   // 透明描边(占位用,视觉上不存在)
    n++;
  }
  return n;
}

/** chrome 身份豁免:TabBar / Header / 玻璃砖 / 浮层(规范《03》§4 明写不在约束内) */
export function isChrome(className, borderColorRaw) {
  const c = String(className || "");
  if (/nx-tabbar|nx-header|nx-chrome|nx-glass|glass|chassis|nx-nova|nx-toast|nx-sticky/i.test(c)) return true;
  if (/var\(--v5-(glass|chrome|tabbar)-border\)/.test(String(borderColorRaw || ""))) return true;
  return false;
}

/**
 * allowlist 的尺寸匹配:route + cls 已精确对上之后,尺寸允许 ±SIZE_TOL px 漂移。
 *
 * 🔴 为什么不精确匹配(同一根因第 3 次发作:genesis hero 232→242 · orb 卡 388→391 → 391→390):
 *   size 是**字体度量的函数**,而全站首选字体 "General Sans" 本工程根本不随包发运
 *   (index.html 只取 Manrope / JetBrains Mono,tokens.css 那句「loaded via <link> in
 *   layout.tsx」是从 Next 原型抄来的、在 uni 侧不成立)。于是行高取决于**跑门那台机器
 *   装没装 General Sans**——同一份源码换机器/换时间就差 1px,精确 pin 必然假红。
 *   2026-07-24 B4 那轮已经踩过一次,当时的对策是在 commit message 里写「改字号必顺手核对
 *   各基线里 pin 了尺寸的条目」——把机器能测的事交给人记,4 天后原样再犯。归层:进门。
 *
 * 只给 allowlist 容差,不给基线:基线本来就有自愈路径(--update-baseline,且被 added=0 守着);
 * allowlist 没有,失配只会把人推向 --update-baseline,而那会把「带裁决理由的例外」洗成
 * 「无理由的存量」——恰恰是本文件通篇在防的那件事。
 *
 * ±2 的取值:真实设计改动(改字号 10→12 撑高 3px、热区 34→44 撑高 10px)仍会失配并被拦下来复核,
 * 只放行度量抖动的 1~2px。
 */
export const SIZE_TOL = 2;
export function sizeMatches(exemptSize, hitSize) {
  if (!exemptSize) return true;              // 未 pin 尺寸 = 不按尺寸收窄
  const parse = (s) => { const m = /^(\d+)x(\d+)$/.exec(String(s).trim()); return m ? [+m[1], +m[2]] : null; };
  const a = parse(exemptSize), b = parse(hitSize);
  if (!a || !b) return String(exemptSize) === String(hitSize);   // 格式不对 → 退回严格相等,不放水
  return Math.abs(a[0] - b[0]) <= SIZE_TOL && Math.abs(a[1] - b[1]) <= SIZE_TOL;
}

export function judge({ fill, sides, chrome, dashed, isoRing, ring, outline }) {
  if (!fill || chrome) return null;
  // 《03》§3 明写 border 的两个合法归属,判据来自规范不是为放行调参:
  if (dashed) return null;   // empty-state 虚线(dashed/dotted 是空态惯用法,填充卡不会用虚线)
  if (isoRing) return null;  // 「隔离描边环」:≤16px 的圆形元素用底色描边做分隔,是技法不是卡片描边
  if (sides >= 3 || ring || outline) return "full";   // ring/outline 是四面环,等同 full
  if (sides >= 1) return "partial";
  return null;
}

/* ── 浏览器内探针 ── */
const PROBE = () => {
  // 🔴 扫描前先卸掉焦点:浏览器给**当前聚焦元素**画的焦点环走的是 outline,而本门把
  // outline 计入"描边"(见 judge:ring/outline 等同四面环)。于是「弹层打开后焦点自动
  // 移入第一个控件」这种**无障碍必需**的正确行为(WCAG 2.4.7 焦点可见),会被判成设计违例。
  // 2026-08-11 实测:领券弹层在首页自动弹出时,焦点落到 .vcs-close,本门就报一条新增违例
  // —— 而那个类的样式里根本没有 border。两道门判据方向相反时,任何源码状态都不可能同时绿,
  // 所以在这里划清边界:焦点态不属于本门要管的"设计描边"。
  try { (document.activeElement instanceof HTMLElement) && document.activeElement.blur(); } catch { /* 无焦点可卸 */ }
  const out = [];
  document.querySelectorAll("uni-view,view,uni-text,text,uni-button,button").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return;
    const cs = getComputedStyle(el);
    out.push({
      cls: (el.className || "").toString().slice(0, 60),
      tag: el.tagName,
      w: Math.round(r.width), h: Math.round(r.height),
      bg: cs.backgroundColor, bgImg: cs.backgroundImage === "none" ? "" : cs.backgroundImage.slice(0, 60),
      radius: cs.borderTopLeftRadius,
      shadow: cs.boxShadow === "none" ? "" : cs.boxShadow.slice(0, 120),
      ow: cs.outlineWidth, os: cs.outlineStyle, oc: cs.outlineColor,
      bw: [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth],
      bs: [cs.borderTopStyle, cs.borderRightStyle, cs.borderBottomStyle, cs.borderLeftStyle],
      bc: [cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor],
      txt: (el.textContent || "").trim().slice(0, 26),
    });
  });
  return out;
};

function evaluate(raw) {
  const cs = {
    backgroundColor: raw.bg, backgroundImage: raw.bgImg || "none",
    borderTopWidth: raw.bw[0], borderRightWidth: raw.bw[1], borderBottomWidth: raw.bw[2], borderLeftWidth: raw.bw[3],
    borderTopStyle: raw.bs[0], borderRightStyle: raw.bs[1], borderBottomStyle: raw.bs[2], borderLeftStyle: raw.bs[3],
    borderTopColor: raw.bc[0], borderRightColor: raw.bc[1], borderBottomColor: raw.bc[2], borderLeftColor: raw.bc[3],
  };
  const dashed = raw.bs.some((x) => x === "dashed" || x === "dotted");
  const isoRing = Math.max(raw.w, raw.h) <= 16 && /^(50%|999px|9999px)$/.test(String(raw.radius || ""));
  const ring = shadowRing(raw.shadow || "");
  const outline = hasOutline({ outlineWidth: raw.ow, outlineStyle: raw.os, outlineColor: raw.oc });
  return judge({ fill: hasFill(cs), sides: borderSides(cs), chrome: isChrome(raw.cls, ""), dashed, isoRing, ring, outline });
}

async function sweep() {
  const { chromium } = require("playwright");
  const browser = await chromium.launch();
  const found = new Map();
  // 🔴 导航失败必须记账,不能静默跳过(2026-07-23 独立验收 v2 抓出):
  // 少扫的路由在下游会被当成「违例已修好」→ 触发棘轮哨兵假红 → 照提示重建基线
  // 就把**真违例从基线里删掉**。漏扫必须让整个门失败,而不是产出一份残缺结果。
  const failed = [];
  // 包 ax:N 条 lane(各自独立 context / 渲染进程)并行各扫一条路由(PROBE_CONCURRENCY,默认 3);每条路由仍是 goto → 700ms →
  //   两主题各 300+300ms 的原节奏,判定逻辑不动;结果按路由原顺序合并,found 的插入顺序与串行一致。
  // 🔴 导航语义变了(tester-F F-06 要求写明):query 带 &zb=<序号> → 每条路由**整页重载**,不再是同文档换 hash。
  //   原来 checkout 页弹开的支付面板(.tis-panel)会留在 DOM 里被记到后面 74 条路由名下(基线 159 条里 73 条是它);
  //   现在只归属它真正所在的路由,hit 少 46% 全是这一类假归属,没丢覆盖(full 3 条逐字一致,并行 3 与串行 1 逐字节一致)。
  //   基线里那 73 条从此稳定「消失」(partial 只报不拦),用不带 PROBE_ROUTES 的 --update-baseline 收缩。
  const perRoute = await mapRoutes(browser, SCAN, async (page, route, i, lanes) => {
    try {
      await page.goto(`${BASE}/?nx_device=off&zb=${i}#${route}`, { waitUntil: "networkidle", timeout: 20000 });
    } catch { return { route, failed: true, raws: [] }; }
    await page.waitForTimeout(700);
    const raws = [];
    for (const theme of ["dark", "light"]) {
      await page.evaluate((m) => document.querySelector("#app")?.__vue_app__?.config?.globalProperties?.$pinia?._s?.get("theme")?.setMode(m), theme);
      await page.waitForTimeout(300);
      await page.evaluate(() => { const s = document.querySelector(".nx-scroll"); if (s) s.scrollTop = s.scrollHeight; });
      await settleNetwork(page, 3000, lanes); // 包 ax:滚到底可能触发懒加载;并行时 dev server 忙,先等本页网络空闲(有界);实际 1 lane 时空转(R2-03)
      await page.waitForTimeout(300);
      raws.push(...await page.evaluate(PROBE));
    }
    return { route, failed: false, raws };
  }, { context: { viewport: { width: 390, height: 844 }, locale: "en-US" } });
  for (const r of perRoute) {
    if (!r || r.error) { failed.push(r?.route ?? "?"); continue; }
    if (r.failed) { failed.push(r.route); continue; }
    for (const raw of r.raws) {
      const v = evaluate(raw);
      if (!v) continue;
      // 指纹不含主题:同一元素两主题都违例算一条
      const fp = `${r.route}|${v}|${raw.cls}|${raw.w}x${raw.h}`;
      if (!found.has(fp)) found.set(fp, { route: r.route, kind: v, cls: raw.cls, size: `${raw.w}x${raw.h}`, radius: raw.radius, sample: raw.txt, count: 0 });
      found.get(fp).count++;
    }
  }
  await browser.close();
  return {
    hits: [...found.values()].sort((a, b) => (a.kind + a.route + a.cls).localeCompare(b.kind + b.route + b.cls)),
    failed,
  };
}

/* ── selftest:双向红测(纯函数,不需浏览器) ── */
function selftest() {
  const P = [];
  const p = (n, e, a) => P.push({ n, ok: JSON.stringify(e) === JSON.stringify(a), e, a });
  const mk = (bg, w, color = "rgb(200,200,200)", style = "solid", bgImg = "none") => ({
    backgroundColor: bg, backgroundImage: bgImg,
    borderTopWidth: w[0], borderRightWidth: w[1], borderBottomWidth: w[2], borderLeftWidth: w[3],
    borderTopStyle: style, borderRightStyle: style, borderBottomStyle: style, borderLeftStyle: style,
    borderTopColor: color, borderRightColor: color, borderBottomColor: color, borderLeftColor: color,
  });
  const J = (o, cls = "") => judge({ fill: hasFill(o), sides: borderSides(o), chrome: isChrome(cls, "") });

  p("解析 rgba", [1, 2, 3, 0.5], parseColor("rgba(1, 2, 3, 0.5)"));
  p("解析 color(srgb)", [255, 0, 0, 0.5], parseColor("color(srgb 1 0 0 / 0.5)"));

  // 🔴 阳性:有填充 + 四边描边 = 违例
  p("阳性 实底卡 + 四边框", "full", J(mk("rgb(20,20,20)", ["1px", "1px", "1px", "1px"])));
  p("阳性 半透明 tint 底 + 四边框", "full", J(mk("rgba(158,220,29,0.2)", ["1px", "1px", "1px", "1px"])));
  p("阳性 渐变底 + 四边框", "full", J(mk("rgba(0,0,0,0)", ["1px", "1px", "1px", "1px"], "rgb(200,200,200)", "solid", "linear-gradient(rgb(1,1,1), rgb(2,2,2))")));
  p("阳性 实底 + 单边(记 partial 不拦)", "partial", J(mk("rgb(20,20,20)", ["0px", "0px", "1px", "0px"])));

  // 阴性:透明底带边 = 合法(分组 hairline / empty-state 虚线)
  p("阴性 透明底 + 四边框(合法透明容器)", null, J(mk("rgba(0,0,0,0)", ["1px", "1px", "1px", "1px"])));
  p("阴性 透明底 + 虚线框(empty state)", null, J(mk("rgba(0,0,0,0)", ["1px", "1px", "1px", "1px"], "rgb(200,200,200)", "dashed")));
  p("阴性 实底无边(合规卡片)", null, J(mk("rgb(20,20,20)", ["0px", "0px", "0px", "0px"])));
  p("阴性 实底 + 全透明描边(占位不跳位)", null, J(mk("rgb(20,20,20)", ["1px", "1px", "1px", "1px"], "rgba(0,0,0,0)")));
  p("阴性 实底 + style:none", null, J(mk("rgb(20,20,20)", ["1px", "1px", "1px", "1px"], "rgb(200,200,200)", "none")));
  p("阴性 极淡底(alpha<0.03)视为透明", null, J(mk("rgba(255,255,255,0.01)", ["1px", "1px", "1px", "1px"])));

  // chrome 豁免(《03》§4 明写)
  p("阴性 tabbar 玻璃砖", null, J(mk("rgba(255,255,255,0.2)", ["1px", "1px", "1px", "1px"]), "nx-tabbar-pill"));
  p("阴性 header chrome", null, J(mk("rgba(0,0,0,0.55)", ["1px", "1px", "1px", "1px"]), "nx-header-bar"));
  p("阳性 普通卡不被 chrome 豁免误放", "full", J(mk("rgb(20,20,20)", ["1px", "1px", "1px", "1px"]), "vb-card"));

  // 🔴 描边的另外两种写法(C2 独立验收抓出的假阴性)
  p("阳性 box-shadow 0 0 0 1px 环", true, shadowRing("rgb(1,2,3) 0px 0px 0px 1px"));
  p("阳性 box-shadow 0 0 0 0.5px 环(线上真实写法)", true, shadowRing("rgba(0,0,0,0.1) 0px 1px 2px 0px, rgb(229,223,208) 0px 0px 0px 0.5px"));
  p("阴性 普通投影不算环", false, shadowRing("rgba(0,0,0,0.5) 0px 8px 24px 0px"));
  p("阴性 none", false, shadowRing("none"));
  p("阳性 outline 也算描边", true, hasOutline({ outlineWidth: "2px", outlineStyle: "solid", outlineColor: "rgb(1,2,3)" }));
  p("阴性 outline:none", false, hasOutline({ outlineWidth: "0px", outlineStyle: "none", outlineColor: "rgb(1,2,3)" }));
  p("阳性 填充 + ring(无 border)判 full", "full", judge({ fill: true, sides: 0, chrome: false, ring: true }));

  // 规范自带的两条豁免(判据来自《03》§3,不是为放行调参)
  p("阴性 填充 + dashed(empty-state 虚线)", null, judge({ fill: true, sides: 4, chrome: false, dashed: true }));
  p("阴性 ≤16px 圆形隔离描边环", null, judge({ fill: true, sides: 4, chrome: false, isoRing: true }));
  p("阳性 大圆形填充带边不被隔离环误放", "full", judge({ fill: true, sides: 4, chrome: false, isoRing: false }));

  // 🔴 allowlist 尺寸容差(2026-07-28:同一根因第 3 次发作后归层进门,见 sizeMatches 注释)
  p("阳性 尺寸完全相同", true, sizeMatches("358x390", "358x390"));
  p("阳性 高度 -1px 度量漂移(orb 卡 391→390 真实案例)", true, sizeMatches("358x391", "358x390"));
  p("阳性 宽高各 +2px 仍在容差内", true, sizeMatches("358x390", "360x392"));
  p("阴性 高度差 3px(改字号 10→12 的真实位移)必须失配复核", false, sizeMatches("358x388", "358x391"));
  p("阴性 高度差 10px(热区 34→44 的真实位移)必须失配复核", false, sizeMatches("358x232", "358x242"));
  p("阴性 同页同 cls 的另一个元素不被容差误放", false, sizeMatches("358x54", "358x252"));
  p("未 pin 尺寸 = 不按尺寸收窄", true, sizeMatches("", "358x390"));
  p("格式不合法退回严格相等(不放水)", false, sizeMatches("358*390", "358x390"));

  // allowlist reason 必填 + size 格式必须可解析(否则 sizeMatches 静默退回严格相等 = 容差形同虚设)
  const ex = fs.existsSync(ALLOWLIST) ? JSON.parse(fs.readFileSync(ALLOWLIST, "utf8")).exemptions ?? [] : [];
  p("allowlist 每条有 reason", 0, ex.filter((e) => !e.reason || !String(e.reason).trim()).length);
  p("allowlist 每条 size 格式合法(WxH)", 0, ex.filter((e) => e.size && !/^\d+x\d+$/.test(String(e.size).trim())).length);

  const bad = P.filter((x) => !x.ok);
  console.log("=== zero-border gate selftest ===");
  for (const x of P) console.log(`${x.ok ? "PASS" : "FAIL"}  ${x.n}${x.ok ? "" : ` expect=${JSON.stringify(x.e)} actual=${JSON.stringify(x.a)}`}`);
  console.log(`\n${P.length - bad.length}/${P.length} pass`);
  process.exit(bad.length ? 1 : 0);
}
if (process.argv.includes("--selftest")) selftest();

const { hits, failed } = await sweep();
// 🔴 覆盖率断言排在所有下游逻辑之前:漏扫过的结果**一律不许**用来判违例、更不许写基线。
if (failed.length) {
  console.error(`零-border:${failed.length}/${SCAN.length} 条路由导航失败,结果不完整,拒绝据此判定或写基线\n`);
  for (const r of failed) console.error(`  ${r}`);
  console.error(`\n先确认 dev server(${BASE})健康再重跑。`);
  process.exit(2);
}
const key = (h) => `${h.route}|${h.kind}|${h.cls}|${h.size}`;
const ex = fs.existsSync(ALLOWLIST) ? JSON.parse(fs.readFileSync(ALLOWLIST, "utf8")).exemptions ?? [] : [];
// 豁免必须 route + cls + size 三者都对上才放行 —— cls 常是泛用工具类(如 "relative overflow-hidden"),
// 只比 route+cls 会把同页所有同类名元素一起放走(C1 验收批评过整文件级豁免过宽,同一个病)。
// size 走 ±SIZE_TOL 容差(见 sizeMatches:字体度量随机器变,精确 pin 会假红)。
const allowed = (h) =>
  ex.some((e) => (!e.route || e.route === h.route) && (!e.cls || e.cls === h.cls) && sizeMatches(e.size, h.size));
const live = hits.filter((h) => !allowed(h));

if (process.argv.includes("--update-baseline")) {
  if (SCOPE.scoped) { console.error("零-border:PROBE_ROUTES 范围模式下不许 --update-baseline(只扫了一部分路由,重建会把没扫的路由从基线里删掉)。不设 PROBE_ROUTES 全量跑再重建。"); process.exit(2); }
  // 🔴 note 必须按 key 继承(2026-07-23 C2 第二轮 audit 抓出):原实现把每条 note 硬编码冲成
  // "存量,C2 批次待判",与本文件 _doc 自称的「每条 note 写为什么还在」自相矛盾 ——
  // 重建一次就把历轮的裁决理由(为什么留 / 谁拍的板)全抹了,下一轮只能从无理由的清单重判。
  const prevRaw = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, "utf8")) : {};
  const prevNote = new Map((prevRaw.entries ?? []).map((e) => [key(e), e.note]));
  const stampArg = process.argv.find((a) => a.startsWith("--stamp="));
  fs.writeFileSync(BASELINE, JSON.stringify({
    _doc: "零-border 铁律棘轮基线。门只拦新增 full 违例(≥3 边描边 + 有填充);partial(1-2 边,多为行分隔线)只列不拦。基线只许缩不许涨,每条 note 写为什么还在(重建时按 route|kind|cls|size 继承,不会被冲掉)。",
    _updated: stampArg ? stampArg.slice(8) : (prevRaw._updated ?? "") + " · regenerated",
    entries: live.map((h) => ({ ...h, note: prevNote.get(key(h)) ?? "新登记,待判" })),
  }, null, 1));
  console.log(`baseline 已更新:${live.length} 条(full ${live.filter(h=>h.kind==="full").length} · partial ${live.filter(h=>h.kind==="partial").length})`);
  process.exit(0);
}

if (process.argv.includes("--list")) {
  for (const h of live) console.log(`${h.kind.padEnd(7)} ${h.route}  ${h.size}  r${h.radius}  .${h.cls}  « ${h.sample}`);
  console.log(`\n合计 full ${live.filter(h=>h.kind==="full").length} · partial ${live.filter(h=>h.kind==="partial").length}`);
  process.exit(0);
}

const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, "utf8")).entries ?? [] : [];
const known = new Set(baseline.map(key));
const added = live.filter((h) => h.kind === "full" && !known.has(key(h)));
// scoped:只对扫过的路由比「消失」—— 没扫的路由不算修好,也不催缩棘轮
const gone = baseline.filter((b) => SCANNED.has(b.route) && !live.some((h) => key(h) === key(b)));

// 🔴 顺序不可调换(2026-07-23 独立验收 v2 抓出的洞 A):
// 「新增违例」必须**先于**「棘轮该缩了」报出。反过来的话,当一次改动同时
// 「修好 3 条旧的 + 带进 1 条新的」时,门只会说「重建基线」,而它给的处置命令
// --update-baseline 会把 live 整批写盘 —— 照做就把那条新违例**洗进基线**合法化了。
// 先报 added 并退出,就永远不会走到那条会洗白的指令。
if (added.length) {
  console.error(`零-border:新增 ${added.length} 处「有填充 + 四边描边」(基线 ${baseline.length},消失 ${gone.length})\n`);
  for (const h of added) console.error(`  ${h.route}  ${h.size}  .${h.cls}  « ${h.sample}`);
  console.error(`\n《03》§3:带 bg 填充的卡片/板块一律零 border,层级靠 surface 微差色。删 border 即可。`);
  console.error(`确属 chrome / 透明容器 / 隔离环 → docs/ZERO-BORDER-ALLOWLIST.json 加一条并写 reason。`);
  console.error(`🔴 此时**不要**跑 --update-baseline —— 那会把上面这些新违例收编成「存量」。先修掉它们。`);
  process.exit(1);
}

// 棘轮必须跟着缩:违例修好后若不重建基线,那些**陈旧 key 仍留在 known 集合里** ——
// 同款违例原样改回来,门查 known 命中、判为「存量」直接放行,等于修过的地方从此不设防。
// 只对 full 生效:partial 多是极小 hairline,受滚动深度/浮层时机影响会抖,拿它当硬门会假红。
const goneFull = baseline.filter((b) => b.kind === "full" && SCANNED.has(b.route) && !live.some((h) => key(h) === key(b)));
if (goneFull.length) {
  console.error(`零-border:基线有 ${goneFull.length} 条 full 已修好但基线没跟着缩 —— 棘轮必须收紧,否则这些位置改回来门抓不到\n`);
  for (const b of goneFull) console.error(`  ${b.route}  ${b.size}  .${b.cls}`);
  console.error(`\n跑 node scripts/zero-border-gate.mjs --update-baseline --stamp="<说明>" 重建(note 会按 key 继承,不会丢裁决理由)。`);
  console.error(`(此处已确保 added=0 —— 不存在被一并洗白的新违例。)`);
  process.exit(1);
}
console.log(`零-border:无新增 full 违例(基线 ${baseline.length} 条,本次消失 ${gone.length} 条${SCOPE.scoped ? ` · scoped ${SCAN.length}/${ROUTES.length} 路由` : ""})`);

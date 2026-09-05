// 溢出探测器(B0/B1 尺寸迁移配套 · 2026-07-22)
// 字号升档最可能的崩法 = 窄容器被撑破。本脚本对指定路由实测每个元素的
// 横向溢出(scrollWidth>clientWidth)与文本截断,产出可 diff 的快照。
// 迁移前采基线 → 迁移后再采 → diff 出「我改坏的」与「本来就有的」。
//
// 用法:
//   node scripts/overflow-probe.mjs --out docs/OVERFLOW-BASELINE.json
//   node scripts/overflow-probe.mjs --out /tmp/after.json --diff docs/OVERFLOW-BASELINE.json
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const args = process.argv.slice(2);
// 🔴 必须先 includes 再取:没传 --out 时 indexOf 返回 -1,args[-1+1] = args[0],
// 于是 `--diff docs/X.json` 会把快照写进一个**名叫 `--diff` 的文件**(本轮在仓库根目录
// 捡到两次这个垃圾文件,还误提交过一次)。相邻的 diffPath 那行本来就有这层保护,这行漏了。
const outPath = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;
const diffPath = args.includes("--diff") ? args[args.indexOf("--diff") + 1] : null;
const BASE = process.env.BASE_URL || "http://localhost:5173";
// 🔴 默认只扫五 tab(B1 范围)。B2 迁移的是 wallet **子页**,拿这个默认档 diff 出来的
//    「新增溢出 0」对那批改动**没有效力** —— 探针压根没走到改动页。子页批次必须 --all。
//    (同一形状的坑本轮第三次:C3 的尺寸门对页面正文失效、B1 的字号哨兵与 codemod 共用瞎正则,
//     都是「用一把量不到目标的尺子量出一个假的 0」。)
const TABS = [
  "/pages/index/index",
  "/pages/earn/earn",
  "/pages/store/store",
  "/pages/team/team",
  "/pages/me/me",
];
function allRoutes() {
  const pj = JSON.parse(readFileSync("src/pages.json", "utf8").replace(/\/\/[^\n"]*$/gm, ""));
  return [...new Set([...TABS, ...pj.pages.map((p) => "/" + p.path)])];
}
// --all 扫 pages.json 全站;--routes a,b,c 扫指定几条
const ROUTES = args.includes("--all")
  ? allRoutes()
  : args.includes("--routes")
    ? args[args.indexOf("--routes") + 1].split(",").map((r) => (r.startsWith("/") ? r : "/" + r))
    : TABS;

const PROBE = () => {
  const out = [];
  const sel = (el) => {
    // 稳定定位符:标签 + class 链 + 同级序号(不依赖行号,迁移后仍可对齐)
    const parts = [];
    let n = el, depth = 0;
    while (n && n.nodeType === 1 && depth++ < 4) {
      const cls = (n.className && typeof n.className === "string" ? n.className : "").trim().split(/\s+/).filter(Boolean).slice(0, 2).join(".");
      const idx = n.parentElement ? [...n.parentElement.children].indexOf(n) : 0;
      parts.unshift(`${n.tagName.toLowerCase()}${cls ? "." + cls : ""}[${idx}]`);
      n = n.parentElement;
    }
    return parts.join(">");
  };
  for (const el of document.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const overflowX = el.scrollWidth - el.clientWidth;
    // 只记有意义的溢出(>1px 容差,排除亚像素噪声);排除声明为可滚动的容器
    const scrollable = /auto|scroll/.test(cs.overflowX + cs.overflow);
    // 🔴 也排除「刻意截断」:overflow:hidden + text-overflow:ellipsis + nowrap 的元素,
    //    scrollWidth > clientWidth **正是省略号存在的意义** —— 那是设计生效,不是布局破损。
    //    B8 实测:market 代币行副标题被判溢出 +23px,但页面 docW=viewW=390 根本不横向滚动、
    //    省略号也正常显示。真撑破容器的元素没有 ellipsis(B7 的统计磁贴就是那种,已修)。
    const ellipsized = cs.textOverflow === "ellipsis" && cs.overflow.includes("hidden") && cs.whiteSpace === "nowrap";
    if (overflowX > 1 && !scrollable && !ellipsized) {
      out.push({
        sel: sel(el),
        fs: cs.fontSize,
        overflowX,
        w: Math.round(r.width),
        text: (el.textContent || "").trim().slice(0, 40),
      });
    }
  }
  return out;
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); // 默认手机档
const snap = {};
for (const route of ROUTES) {
  await page.goto(`${BASE}/?nx_device=off#${route}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  snap[route] = await page.evaluate(PROBE);
}
await browser.close();

const result = { viewport: "390x844", routes: ROUTES, snap };
if (outPath) writeFileSync(outPath, JSON.stringify(result, null, 2));

const total = Object.values(snap).reduce((a, v) => a + v.length, 0);
console.log(`OVERFLOW PROBE: ${total} 处横向溢出 / ${ROUTES.length} 路由`);
for (const [r, v] of Object.entries(snap)) console.log(`  ${v.length}\t${r}`);

if (diffPath && existsSync(diffPath)) {
  const base = JSON.parse(readFileSync(diffPath, "utf8"));
  let regressions = 0, fixed = 0;
  for (const route of ROUTES) {
    const b = new Set((base.snap[route] || []).map((x) => x.sel));
    const c = new Set((snap[route] || []).map((x) => x.sel));
    const newOnes = [...c].filter((s) => !b.has(s));
    const goneOnes = [...b].filter((s) => !c.has(s));
    regressions += newOnes.length; fixed += goneOnes.length;
    for (const s of newOnes) {
      const d = snap[route].find((x) => x.sel === s);
      console.error(`  [NEW OVERFLOW] ${route} ${s} fs=${d.fs} +${d.overflowX}px "${d.text}"`);
    }
  }
  console.log(`DIFF vs baseline: 新增溢出 ${regressions} · 消失 ${fixed}`);
  if (regressions > 0) { console.error("OVERFLOW REGRESSION — 迁移撑破了容器,逐条修"); process.exit(1); }
  console.log("OVERFLOW OK: 无新增溢出");
}

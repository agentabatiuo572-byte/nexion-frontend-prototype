#!/usr/bin/env node
// SVG 内文字运行时门(P-121,2026-08-17;A1 独立审计后加固)—— 源码门只能证「没写错的写法」,这道门证明「字真的排出来、看得见」。
//
// 为什么源码门不够:P-121 的全部危险性在于源码看起来完全正常 —— `<text>` 编成 `<uni-text>` 后 0×0、不报错;
// UnoCSS attributify 把 `font-size="9.5"` 劫持成 2.375rem 后字大 4 倍、把 `:opacity="0.25"` 劫持成 0.0025 后整片大陆点隐形,
// 也不报错。这些只有在浏览器里量 `getBoundingClientRect()` / `getComputedStyle()` 才看得见。所以逐路由真渲染、真测量。
//
// 判据(每条带 tag;红测按 tag 计数):
//   [count]          路由上**带出处标记** `svg text[data-svgtext]`(SvgText 组件渲染的才有)数量 ≥ 期望(期望 = 该文件模板里 SvgText 用法的
//                    静态个数;v-for 承载的写 min + whyMin 覆盖;页面上别的 svg 文字不能顶数 —— A2 P0-1;
//                    min ≤ 0 或有 min 没 whyMin 直接判红,防静默摘门 —— A1 P2-2/P2-3)。
//   [rendered]       每个 `svg text` 的 bbox 宽 > 0 **且** 高 > 0(0×0 = 没排版;单轴为 0 也算没排版)。
//   [empty]          textContent 非空。
//   [invisible]      看得见:自身与祖先(到 body)computed visibility 均 visible、opacity 均 > 0;fill 不透明(alpha > 0 且非 none;fill 是 url(#渐变)
//                    时渐变至少一个 stop 不透明)、fill-opacity > 0(A1 P0-3:此前只判「排版了」不判「看得见」)。
//   [masked]         文字自身 clip-path / mask 不为 none → 红(裁没了也是看不见;真要用请走人工豁免,A2 P2-3)。
//   [inside-svg]     文字 bbox 落在所属 <svg> 自己的盒内(容差 2px)—— 画出 svg 盒外会被裁掉。**不是**浏览器视口判据。
//   [offpage]        文字的页面坐标落在文档范围内(整个 svg 被 top:-9999px 之类挪出文档 → 红)。
//   [clipped]        任一祖先 overflow 为 hidden/clip 时,文字 bbox 须落在该祖先盒内(容差 2px)—— 祖先把 svg 裁掉 → 红。
//   [uni-text-in-svg] 页面里 `svg uni-text` 必须为 0(P-121 原形回归)。
//   [attr-hijacked]  页面里所有 svg 元素的呈现属性 font-size / letter-spacing / font-weight / opacity / fill-opacity / stroke-width,
//                    计算值必须等于属性值(attributify / 任何 CSS 劫持都在这里现形;A1 P0-2 的 :opacity 就是这条抓)。数字 / px / 科学计数 /
//                    负数都比;opacity 族的百分比按 ÷100 比(A2 P1-4);比不了的形态(em / inherit / var())跳过并计数打印,不静默。
//   [unregistered]   完整性:仓内**svg 里有任何文字候选**(SvgText / svg-text / 别名 / 裸 <text> / <component> / v-html)的文件都必须在
//                    ROUTE_MAP 登记到一条路由(名单型的门对没入册的页面天然隐形,P-118;这里反过来:没登记 → 红,不静默跳过;
//                    候选谓词与源码门共用 lib,A1 P1-2)。`route:null`(不探)必须带 whyMin,且不探的条数不得过半、探到的路由与文字
//                    数必须 ≥ 1 —— 全员豁免跑出「0 路由全部真渲染」的绿话判红(A2 P1-3)。
//   [console]        路由上 console error = 0,且 **Vue warn**(未解析组件 / 未知 custom element)= 0(A1 P2-6:忘 import 时 Vue 只发 warn)。
//
// 已知边界(如实,不装作守住了):字色与背景同色 / 被别的层盖住 / 两个标签互相重叠 / mix-blend-mode 混成底色 / 祖先 clip-path 或
// mask(只查文字自身)/ 折叠区里的示意图会被 [clipped] 判红(A2 P2-7,出现时给 ROUTE_MAP 加展开钩子而不是放宽容差)—— 前四条属
// 对比度与遮挡问题,由走查 tester 与 a11y 工具判,本门不判(判「盖住」会被 mock 的里程碑弹层弄成随机红)。
//
// 用法:UNI_BASE_URL=http://localhost:5231 node scripts/svg-text-render-probe.mjs      (默认 en;--lang zh|vi 换语言)
//       node scripts/svg-text-render-probe.mjs --selftest   红测:合成页面逐条隔离(阳性必中 + 合法必放行),不需要 server
//       ⚠ 独立跑时必须显式给 UNI_BASE_URL(默认 5173 多半是主 checkout 的 server,验的是别的树 —— 起手会打印靶子并核树身份)。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { isThirdPartyResourceError } from "./lib/console-origin-filter.mjs";
import { analyzeTemplate, listVueFiles } from "./lib/svg-text-predicate.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.UNI_BASE_URL || process.env.BASE_URL || "http://localhost:5173";
const argv = process.argv.slice(2);
const LANG = argv.includes("--lang") ? argv[argv.indexOf("--lang") + 1] : "en";
const TOL = 2;

/** 含 SVG 文字候选的源文件 → 承载它的路由。min/whyMin 只在静态计数不适用(v-for)时覆盖。 */
export const ROUTE_MAP = {
  "src/pages/team/network.vue": { route: "pages/team/network" },
  "src/pages/team/binary-how.vue": { route: "pages/team/binary-how" },
  "src/pages/globe/globe.vue": { route: "pages/globe/globe" },
  // 组件:商品详情 Cloud Share 档才走抽象云图(硬件档是照片 + HTML 叠字);2 丝印 + v-for 4 芯片 = 6
  "src/components/store/product-render.vue": { route: "pages/store/detail?id=cloud-share", min: 6, whyMin: "静态 3 处里 1 处是 v-for 4 个芯片(GPU/CPU/RAM/SSD),提案 Done-when 钉 6" },
  // lucky-spin 转盘:v-html 字符串画的真 SVG text(P-121 追记点名保留的先例)。它是 sheet 里的内容,不在任何路由首屏,
  // 由 sheet 自己的走查覆盖;这里登记为不探(route:null)但写明理由,不让它静默逃出清单。
  "src/components/lucky-spin-sheet.vue": { route: null, whyMin: "转盘 sheet 内 v-html 真 SVG text,需点开 sheet 才在 DOM 里;不在本门探,登记只为不静默" },
};

/** 仓内哪些文件的 svg 里有文字候选(与源码门同一判定面)。返回 { rel: { svgText: n, other: m } }。 */
export function svgLabelFiles(root = ROOT) {
  const out = {};
  for (const p of listVueFiles(fs, path, root)) {
    const t = analyzeTemplate(fs.readFileSync(p, "utf8"));
    if (t.svgTextNodes.length || t.otherLabelCandidates.length) out[path.relative(root, p).replace(/\\/g, "/")] = { svgText: t.svgTextNodes.length, other: t.otherLabelCandidates.length };
  }
  return out;
}

/** 完整性:每个候选文件都登记;登记项的 min/whyMin 合法。纯函数,红测喂假清单。 */
export function judgeRegistry(files, routeMap = ROUTE_MAP) {
  const hits = [];
  for (const f of Object.keys(files)) if (!routeMap[f]) hits.push({ tag: "unregistered", msg: `${f} 的 <svg> 里有文字候选(SvgText ${files[f].svgText} · 其它写法 ${files[f].other}),但 svg-text-render-probe.mjs 的 ROUTE_MAP 没登记它该在哪条路由上被验 —— 加一条(不探也要登记 route:null + whyMin 写明理由),别让新示意图逃出运行时门` });
  const total = Object.keys(routeMap).length, skipped = Object.values(routeMap).filter((c) => c.route === null).length;
  if (total > 0 && skipped * 2 > total) hits.push({ tag: "bad-min", msg: `ROUTE_MAP 里 route:null(不探)的条目 ${skipped}/${total} 过半 —— 这不是登记,是把运行时门整体豁免(A2 P1-3)` });
  for (const [f, cfg] of Object.entries(routeMap)) {
    if (cfg.min != null && !(cfg.min > 0)) hits.push({ tag: "bad-min", msg: `${f}:min=${cfg.min} 会把 [count] 判据静默摘掉,不许 ≤ 0` });
    if (cfg.min != null && !cfg.whyMin) hits.push({ tag: "bad-min", msg: `${f}:写了 min 必须同时写 whyMin(为什么静态计数不适用)` });
    if (cfg.route === null && !cfg.whyMin) hits.push({ tag: "bad-min", msg: `${f}:route:null(不探)必须写 whyMin 说明由谁覆盖` });
  }
  return hits;
}

/** 页内测量:在页面上下文里跑,返回可序列化快照。 */
export function snapshotScript() {
  return () => {
    const colorAlpha = (c) => { const m = String(c).match(/(?:rgba?|color)\(([^)]+)\)/); if (!m) return c === "transparent" || c === "none" ? 0 : 1; const p = m[1].replace(/^srgb\s+/, "").split(/[,/\s]+/).filter(Boolean); return p.length >= 4 ? parseFloat(p[3]) : 1; };
    // fill 是 url(#渐变) 时:至少一个 stop 的 stop-color alpha × stop-opacity > 0 才算看得见(A2 P2-3 V1)
    const alpha = (c) => {
      const u = String(c).match(/url\(["']?#([^"')]+)["']?\)/);
      if (!u) return colorAlpha(c);
      const ref = document.getElementById(u[1]);
      if (!ref) return 0;
      const stops = [...ref.querySelectorAll("stop")];
      if (!stops.length) return 1; // pattern / 别的 paint server:不判(按可见算)
      return stops.some((st) => { const cs = getComputedStyle(st); return colorAlpha(cs.stopColor) * parseFloat(cs.stopOpacity || "1") > 0; }) ? 1 : 0;
    };
    const clipBox = (el) => { // 最近一层会裁切的祖先们
      const boxes = [];
      for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (/(hidden|clip)/.test(cs.overflowX + " " + cs.overflowY + " " + cs.overflow)) { const r = a.getBoundingClientRect(); boxes.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom }); }
      }
      return boxes;
    };
    const chain = (el) => { // 自身 + 祖先的可见性
      let minOpacity = 1, hidden = false;
      for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (cs.visibility === "hidden" || cs.visibility === "collapse") hidden = true;
        minOpacity = Math.min(minOpacity, parseFloat(cs.opacity));
      }
      return { hidden, minOpacity };
    };
    const texts = [...document.querySelectorAll("svg text")].map((t) => {
      const b = t.getBoundingClientRect();
      const svg = t.closest("svg");
      const s = svg ? svg.getBoundingClientRect() : null;
      const cs = getComputedStyle(t);
      const c = chain(t);
      return {
        text: (t.textContent || "").trim(),
        w: b.width, h: b.height, left: b.left, right: b.right, top: b.top, bottom: b.bottom,
        pageLeft: b.left + window.scrollX, pageTop: b.top + window.scrollY,
        svg: s ? { left: s.left, right: s.right, top: s.top, bottom: s.bottom } : null,
        fontSizeAttr: t.getAttribute("font-size"), fontSizeComputed: cs.fontSize,
        hidden: c.hidden, minOpacity: c.minOpacity, fillAlpha: alpha(cs.fill), fillOpacity: parseFloat(cs.fillOpacity),
        clips: clipBox(t),
        marked: t.hasAttribute("data-svgtext"),
        masked: (cs.clipPath && cs.clipPath !== "none") || (cs.mask && cs.mask !== "" && !/^none\b/.test(cs.mask)),
      };
    });
    // 呈现属性 vs 计算值(全页 svg 元素)
    const ATTRS = { "font-size": (v, cs) => [parseFloat(v), parseFloat(cs.fontSize)], "letter-spacing": (v, cs) => [parseFloat(v), cs.letterSpacing === "normal" ? 0 : parseFloat(cs.letterSpacing)], "font-weight": (v, cs) => [parseFloat(v), parseFloat(cs.fontWeight)], "opacity": (v, cs) => [parseFloat(v), parseFloat(cs.opacity)], "fill-opacity": (v, cs) => [parseFloat(v), parseFloat(cs.fillOpacity)], "stroke-width": (v, cs) => [parseFloat(v), parseFloat(cs.strokeWidth)] };
    const hijacked = [];
    let attrSkipped = 0;
    const NUM = /^\s*-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?\s*(px|%)?\s*$/i;
    for (const el of document.querySelectorAll("svg, svg *")) {
      const cs = getComputedStyle(el);
      for (const [name, f] of Object.entries(ATTRS)) {
        const v = el.getAttribute(name);
        if (v == null) continue;
        const mm = v.match(NUM);
        if (!mm) { attrSkipped++; continue; } // em / rem / inherit / var() 等比不了的形态:计数,不静默
        let [want, got] = f(v, cs);
        if (mm[1] === "%") { if (name === "opacity" || name === "fill-opacity") want = want / 100; else { attrSkipped++; continue; } }
        if (Number.isFinite(want) && Number.isFinite(got) && Math.abs(want - got) > 0.01) hijacked.push(`<${el.localName} ${name}="${v}"> 计算值 ${got}`);
      }
    }
    return { texts, markedCount: texts.filter((t) => t.marked).length, uniTextInSvg: document.querySelectorAll("svg uni-text").length, hijacked: hijacked.slice(0, 8), hijackedCount: hijacked.length, attrSkipped, doc: { w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight } };
  };
}

/** 对一份快照下判决(纯函数;红测用合成页面产快照)。 */
export function judgeSnapshot(snap, min, tol = TOL) {
  const hits = [];
  const marked = snap.markedCount ?? snap.texts.length;
  if (marked < min) hits.push({ tag: "count", msg: `带出处标记的 svg text[data-svgtext] 只有 ${marked} 个(页面 svg text 共 ${snap.texts.length}),期望 ≥ ${min}` });
  if (snap.uniTextInSvg > 0) hits.push({ tag: "uni-text-in-svg", msg: `页面里有 ${snap.uniTextInSvg} 个 <svg> 内的 <uni-text>(P-121 原形:0×0 不渲染)` });
  if (snap.hijackedCount > 0) hits.push({ tag: "attr-hijacked", msg: `${snap.hijackedCount} 个 svg 元素的呈现属性被 CSS 改写:${snap.hijacked.join(" · ")}` });
  snap.texts.forEach((t, i) => {
    const label = `#${i + 1}[${t.text.slice(0, 24)}]`;
    if (!t.text) hits.push({ tag: "empty", msg: `${label} 文本为空` });
    if (!(t.w > 0 && t.h > 0)) hits.push({ tag: "rendered", msg: `${label} bbox ${t.w.toFixed(1)}×${t.h.toFixed(1)} —— 没排版出来` });
    if (t.hidden || !(t.minOpacity > 0) || !(t.fillAlpha > 0) || !(t.fillOpacity > 0)) hits.push({ tag: "invisible", msg: `${label} 看不见(visibility hidden=${t.hidden} · 链上最小 opacity=${t.minOpacity} · fill alpha=${t.fillAlpha} · fill-opacity=${t.fillOpacity})` });
    if (t.masked) hits.push({ tag: "masked", msg: `${label} 自身带 clip-path / mask(裁没了也是看不见)` });
    if (t.svg && t.w > 0 && (t.left < t.svg.left - tol || t.right > t.svg.right + tol || t.top < t.svg.top - tol || t.bottom > t.svg.bottom + tol)) hits.push({ tag: "inside-svg", msg: `${label} 画到了所属 svg 盒之外(会被裁掉)` });
    if (t.w > 0 && (t.pageLeft + t.w <= 0 || t.pageTop + t.h <= 0 || t.pageLeft >= snap.doc.w || t.pageTop >= snap.doc.h)) hits.push({ tag: "offpage", msg: `${label} 整个在文档范围之外(page ${t.pageLeft.toFixed(0)},${t.pageTop.toFixed(0)};doc ${snap.doc.w}×${snap.doc.h})` });
    for (const c of t.clips) if (t.w > 0 && (t.left < c.left - tol || t.right > c.right + tol || t.top < c.top - tol || t.bottom > c.bottom + tol)) { hits.push({ tag: "clipped", msg: `${label} 被 overflow:hidden 的祖先裁掉(祖先盒 ${c.left.toFixed(0)}..${c.right.toFixed(0)} × ${c.top.toFixed(0)}..${c.bottom.toFixed(0)})` }); break; }
    if (t.fontSizeAttr != null && /^[0-9.]+(px)?$/.test(t.fontSizeAttr.trim())) {
      const want = parseFloat(t.fontSizeAttr), got = parseFloat(t.fontSizeComputed);
      if (!(Math.abs(want - got) < 0.01)) hits.push({ tag: "font-size-hijacked", msg: `${label} font-size 属性 ${t.fontSizeAttr} 但计算值 ${t.fontSizeComputed}(有 CSS 规则劫持了它)` });
    }
  });
  return hits;
}

const isVueResolveWarn = (text) => /\[Vue warn\].*(Failed to resolve component|custom element|Unknown custom element|Failed to resolve directive)/i.test(text);

// ── selftest(合成页面,不需要 dev server)─────────────────────────────────────
async function selftest() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 414, height: 896 } });
  const html = (body, head = "") => `<!doctype html><html><head><meta charset="utf-8">${head}</head><body style="margin:0;background:#111">${body}</body></html>`;
  const SVG = (inner, attrs = 'viewBox="0 0 200 60" width="200" height="60"') => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${inner}</svg>`;
  const T = (inner, attrs = 'x="100" y="35" text-anchor="middle" font-size="18" fill="#c6ff3a"') => `<text data-svgtext="" ${attrs}>${inner}</text>`;
  const U = (inner, attrs = 'x="100" y="35" text-anchor="middle" font-size="18" fill="#c6ff3a"') => `<text ${attrs}>${inner}</text>`; // 无出处标记的外来 svg 文字
  const cases = [
    // [name, html, min, tag, expectedHits]
    ["合法:真 SVG text 渲染", html(SVG(T("YOU"))), 1, "*", 0],
    ["🔴 <uni-text> 塞在 svg 里(P-121 原形):uni-text-in-svg 红", html(SVG('<uni-text x="1" y="2">YOU</uni-text>')), 0, "uni-text-in-svg", 1],
    ["🔴 同上也算 count 不足(它不是 svg text)", html(SVG('<uni-text x="1" y="2">YOU</uni-text>')), 1, "count", 1],
    ["🔴 字号被 CSS 劫持([font-size~=\"18\"]{font-size:72px}):font-size-hijacked 红", html(SVG(T("BIG")), '<style>[font-size~="18"]{font-size:72px}</style>'), 1, "font-size-hijacked", 1],
    ["🔴 同上也算 attr-hijacked(全页呈现属性核对)", html(SVG(T("BIG")), '<style>[font-size~="18"]{font-size:72px}</style>'), 1, "attr-hijacked", 1],
    ["🔴 圆点 opacity 属性被劫持([opacity~=\"0.25\"]{opacity:0.0025},A1 P0-2 全球节点图原形):attr-hijacked 红", html(SVG('<circle cx="10" cy="10" r="3" opacity="0.25" fill="#c6ff3a" />' + T("OK")), '<style>[opacity~="0.25"]{opacity:0.0025}</style>'), 1, "attr-hijacked", 1],
    ["🔴 stroke-width 属性被劫持成 20px:attr-hijacked 红", html(SVG('<line x1="0" y1="0" x2="10" y2="10" stroke="#fff" stroke-width="2" />' + T("OK")), '<style>[stroke-width~="2"]{stroke-width:20px}</style>'), 1, "attr-hijacked", 1],
    ["合法:属性未被劫持(stroke-width=2 · opacity=0.5 · font-weight=600 · letter-spacing=1.5)→ 0", html(SVG('<circle cx="10" cy="10" r="3" opacity="0.5" /><line x1="0" y1="0" x2="10" y2="10" stroke="#fff" stroke-width="2" />' + T("OK", 'x="100" y="35" font-size="18" font-weight="600" letter-spacing="1.5" fill="#c6ff3a"'))), 1, "attr-hijacked", 0],
    ["合法:字号没被劫持 → 0", html(SVG(T("OK"))), 1, "font-size-hijacked", 0],
    ["合法:字号写在 style 里(没有属性)不判劫持", html(SVG(T("OK", 'x="100" y="35" style="font-size:18px" fill="#c6ff3a"'))), 1, "font-size-hijacked", 0],
    ["🔴 空文本:empty 红", html(SVG(T(""))), 1, "empty", 1],
    ["🔴 空文本同时 rendered 红(0×0)", html(SVG(T(""))), 1, "rendered", 1],
    ["🔴 单轴为 0 的 bbox 也算没排版(A1 P2-5 变异体):rendered 红", html(SVG(T("ZERO", 'x="100" y="35" font-size="18" fill="#c6ff3a" transform="scale(1,0)"'))), 1, "rendered", 1],
    ["🔴 svg display:none:rendered 红(结构在、没排版)", html(SVG(T("HID"), 'viewBox="0 0 200 60" width="200" height="60" style="display:none"')), 1, "rendered", 1],
    ["🔴 visibility:hidden:invisible 红(A1 P0-3)", html(SVG(T("V", 'x="100" y="35" font-size="18" fill="#c6ff3a" style="visibility:hidden"'))), 1, "invisible", 1],
    ["🔴 祖先 opacity:0:invisible 红", html(`<div style="opacity:0">${SVG(T("O"))}</div>`), 1, "invisible", 1],
    ["🔴 fill=\"transparent\":invisible 红", html(SVG(T("T", 'x="100" y="35" font-size="18" fill="transparent"'))), 1, "invisible", 1],
    ["🔴 fill=\"none\":invisible 红", html(SVG(T("N", 'x="100" y="35" font-size="18" fill="none"'))), 1, "invisible", 1],
    ["🔴 fill-opacity=\"0\":invisible 红", html(SVG(T("F", 'x="100" y="35" font-size="18" fill="#c6ff3a" fill-opacity="0"'))), 1, "invisible", 1],
    ["合法:半透明 fill(fill-opacity 0.45)可见 → invisible 0", html(SVG(T("H", 'x="100" y="35" font-size="18" fill="#c6ff3a" fill-opacity="0.45"'))), 1, "invisible", 0],
    ["🔴 文字画到 svg 盒外(x=-500):inside-svg 红", html(SVG(T("OUT", 'x="-500" y="35" font-size="18" fill="#c6ff3a"'))), 1, "inside-svg", 1],
    ["合法:文字贴边但在 svg 盒内 → inside-svg 0", html(SVG(T("EDGE", 'x="4" y="40" font-size="12" fill="#c6ff3a"'))), 1, "inside-svg", 0],
    ["🔴 整个 svg 挪到文档外(top:-9999px):offpage 红", html(`<div style="position:absolute;top:-9999px;left:0">${SVG(T("FAR"))}</div>`), 1, "offpage", 1],
    ["🔴 祖先 overflow:hidden 把 svg 裁掉:clipped 红", html(`<div style="width:20px;height:5px;overflow:hidden">${SVG(T("CLIP"))}</div>`), 1, "clipped", 1],
    ["合法:祖先 overflow:hidden 但文字在祖先盒内 → clipped 0", html(`<div style="width:300px;height:100px;overflow:hidden">${SVG(T("FIT"))}</div>`), 1, "clipped", 0],
    ["🔴 数量不足(1 < 3):count 红", html(SVG(T("ONE"))), 3, "count", 1],
    ["合法:v-for 式多于期望(3 ≥ 1)不算错", html(SVG(T("A") + T("B", 'x="50" y="35" font-size="18"') + T("C", 'x="150" y="35" font-size="18"'))), 1, "count", 0],
    ["🔴 两个 svg,第二个里的 text 0×0(font-size 0):rendered 红 1", html(SVG(T("A")) + SVG(T("Z", 'x="100" y="35" font-size="0"'))), 2, "rendered", 1],
    // ── A2 加固 ──
    ["🔴 外来 svg 文字(无 data-svgtext 标记)不能顶数:真标注全删 + 别处 4 个外来文字 → count 红(A2 P0-1)", html(SVG(U("F0") + U("F1", 'x="50" y="35"') + U("F2", 'x="150" y="35"') + U("F3", 'x="100" y="50"'))), 4, "count", 1],
    ["合法:外来 svg 文字照样过逐元素判据(rendered/invisible),只是不计入 count", html(SVG(T("A") + U("F"))), 1, "*", 0],
    ["🔴 letter-spacing 属性被劫持(1.5 → 6px):attr-hijacked 红(A2 P2-2 变异体)", html(SVG(T("LS", 'x="100" y="35" font-size="18" letter-spacing="1.5" fill="#c6ff3a"')), '<style>[letter-spacing~="1.5"]{letter-spacing:6px}</style>'), 1, "attr-hijacked", 1],
    ["🔴 font-weight 属性被劫持(600 → 100):attr-hijacked 红", html(SVG(T("FW", 'x="100" y="35" font-size="18" font-weight="600" fill="#c6ff3a"')), '<style>[font-weight~="600"]{font-weight:100}</style>'), 1, "attr-hijacked", 1],
    ["🔴 fill-opacity 属性被劫持(0.65 → 0.0065):attr-hijacked 红", html(SVG(T("FO", 'x="100" y="35" font-size="18" fill="#c6ff3a" fill-opacity="0.65"')), '<style>[fill-opacity~="0.65"]{fill-opacity:0.0065}</style>'), 1, "attr-hijacked", 1],
    ["🔴 百分比 opacity=\"25%\" 被劫持成 0.0025:attr-hijacked 红(A2 P1-4)", html(SVG('<circle cx="10" cy="10" r="3" opacity="25%" fill="#c6ff3a" />' + T("OK")), '<style>[opacity~="25%"]{opacity:0.0025}</style>'), 1, "attr-hijacked", 1],
    ["合法:百分比 / 科学计数 / 负数 / px 的呈现属性未被劫持 → 0", html(SVG('<circle cx="10" cy="10" r="3" opacity="50%" /><line x1="0" y1="0" x2="10" y2="10" stroke="#fff" stroke-width="2px" />' + T("OK", 'x="100" y="35" font-size="1e1" fill="#c6ff3a"'))), 1, "attr-hijacked", 0],
    ["🔴 fill=url(#渐变) 且全部 stop 透明:invisible 红(A2 P2-3 V1)", html(SVG('<defs><linearGradient id="g"><stop offset="0" stop-color="#c6ff3a" stop-opacity="0" /><stop offset="1" stop-color="#c6ff3a" stop-opacity="0" /></linearGradient></defs>' + T("G", 'x="100" y="35" font-size="18" fill="url(#g)"'))), 1, "invisible", 1],
    ["合法:fill=url(#渐变) 有不透明 stop → invisible 0", html(SVG('<defs><linearGradient id="g2"><stop offset="0" stop-color="#c6ff3a" stop-opacity="1" /><stop offset="1" stop-color="#c6ff3a" stop-opacity="0" /></linearGradient></defs>' + T("G", 'x="100" y="35" font-size="18" fill="url(#g2)"'))), 1, "invisible", 0],
    ["🔴 文字自身 clip-path 裁成 0:masked 红(V2)", html(SVG(T("CP", 'x="100" y="35" font-size="18" fill="#c6ff3a" style="clip-path:inset(100%)"'))), 1, "masked", 1],
    ["🔴 文字自身 mask 全黑:masked 红(V3)", html(SVG('<defs><mask id="mk"><rect width="200" height="60" fill="black" /></mask></defs>' + T("MK", 'x="100" y="35" font-size="18" fill="#c6ff3a" mask="url(#mk)"'))), 1, "masked", 1],
    ["合法:无 clip-path / mask → masked 0", html(SVG(T("OK"))), 1, "masked", 0],
    ["🔴 祖先 overflow:clip 裁掉:clipped 红(A2 P2-2 变异体)", html(`<div style="width:20px;height:5px;overflow:clip">${SVG(T("CLIP"))}</div>`), 1, "clipped", 1],
    ["🔴 visibility:collapse:invisible 红(A2 P2-2 变异体)", html(SVG(T("V", 'x="100" y="35" font-size="18" fill="#c6ff3a" style="visibility:collapse"'))), 1, "invisible", 1],
    ["合法:svg 之外的 HTML <text>(未知元素)不算 svg text(选择器 svg 限定)", html('<div><text>junk</text></div>' + SVG(T("OK"))), 1, "*", 0],
  ];
  let pass = 0, fail = 0;
  const say = (ok, name, got, want) => { if (ok) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name} —— 期望 ${want} 命中,实得 ${got}`); } };
  for (const [name, doc, min, tag, want] of cases) {
    await page.setContent(doc, { waitUntil: "load" });
    const snap = await page.evaluate(snapshotScript());
    const hits = judgeSnapshot(snap, min);
    const got = tag === "*" ? hits.length : hits.filter((h) => h.tag === tag).length;
    say(got === want, name, got, want);
  }
  // Vue warn 判据(纯函数)
  say(isVueResolveWarn("[Vue warn]: Failed to resolve component: svg-text\nIf this is a native custom element, make sure to exclude it"), "🔴 Vue「Failed to resolve component」warn 判红", true, true);
  say(isVueResolveWarn("[Vue warn]: Unknown custom element: <svg-text>"), "🔴 Vue「Unknown custom element」warn 判红", true, true);
  say(isVueResolveWarn("[Vue warn]: Failed to resolve directive: foo"), "🔴 Vue「Failed to resolve directive」warn 判红", true, true);
  say(!isVueResolveWarn("[Vue warn]: Extraneous non-props attributes (x) were passed"), "合法:其它 Vue warn 不在本门判定内", false, false);
  // 完整性轴(纯函数)
  const reg1 = judgeRegistry({ "src/pages/x/new-diagram.vue": { svgText: 2, other: 0 } }, ROUTE_MAP);
  say(reg1.some((h) => h.tag === "unregistered"), "🔴 新文件有 SvgText 但 ROUTE_MAP 没登记 → unregistered 红", reg1.length, "≥1");
  const reg1b = judgeRegistry({ "src/pages/x/raw.vue": { svgText: 0, other: 1 } }, ROUTE_MAP);
  say(reg1b.some((h) => h.tag === "unregistered"), "🔴 新文件 svg 里只有裸 <text>/<component>/v-html(没有 SvgText)同样要登记(A1 P1-2)", reg1b.length, "≥1");
  say(judgeRegistry({}, { "a.vue": { route: "x", min: 0, whyMin: "写了理由也不行" } }).some((h) => h.tag === "bad-min"), "🔴 min:0 即使带 whyMin 也判红(A2 P2-2 变异体)", true, true);
  say(judgeRegistry({}, { "a.vue": { route: null, whyMin: "x" }, "b.vue": { route: null, whyMin: "y" }, "c.vue": { route: "r" } }).some((h) => h.tag === "bad-min"), "🔴 route:null 过半 → bad-min 红(A2 P1-3)", true, true);
  const reg2 = judgeRegistry({ "src/pages/team/network.vue": { svgText: 4, other: 0 } }, ROUTE_MAP);
  say(reg2.length === 0, "合法:已登记文件 + 现行 ROUTE_MAP 合法 → 0", reg2.length, 0);
  say(judgeRegistry({}, { "a.vue": { route: "x", min: 0 } }).some((h) => h.tag === "bad-min"), "🔴 min:0 会静默摘掉 count → bad-min 红(A1 P2-3)", true, true);
  say(judgeRegistry({}, { "a.vue": { route: "x", min: 3 } }).some((h) => h.tag === "bad-min"), "🔴 写了 min 没写 whyMin → bad-min 红", true, true);
  say(judgeRegistry({}, { "a.vue": { route: null } }).some((h) => h.tag === "bad-min"), "🔴 route:null 不探却没写 whyMin → bad-min 红", true, true);
  // 判定面自证:真仓里含候选的文件 ≥ 1 且全部登记(0 文件 = 判定面塌缩)
  const files = svgLabelFiles();
  say(Object.keys(files).length >= 1, "判定面:仓内至少 1 个 svg 内有文字候选的文件(0 = 门瞎了)", Object.keys(files).length, "≥1");
  say(judgeRegistry(files).length === 0, "判定面:仓内候选文件全部已登记且登记项合法", judgeRegistry(files).length, 0);
  await browser.close();
  console.log(`svg-text-render-probe selftest: ${pass}/${pass + fail} 格通过`);
  process.exit(fail ? 1 : 0);
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  const files = svgLabelFiles();
  const regHits = judgeRegistry(files);
  let fail = 0;
  for (const h of regHits) { fail++; console.log(`FAIL [${h.tag}] ${h.msg}`); }
  if (Object.keys(files).length === 0) { console.log("FAIL [judged-plane] 仓内一个 svg 里有文字候选的文件都没有 —— 判定面塌缩(本有 4 文件)"); process.exit(1); }
  console.log(`svg-text-render-probe: 靶子 ${BASE}(lang=${LANG})`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 414, height: 896 }, locale: "en-US" });
  // 语言在 app 启动前注入(uni 存储壳格式;写完再换 hash 是 no-op,store 只 hydrate 一次)
  await context.addInitScript((code) => {
    try { localStorage.setItem("nexgrid-locale-v1", JSON.stringify({ type: "object", data: { code, userSet: true } })); } catch {}
  }, LANG);
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (m) => {
    const text = m.text();
    if (m.type() === "error" && !/favicon/i.test(text) && !isThirdPartyResourceError(text, m.location?.().url, BASE)) consoleErrors.push(text.slice(0, 100));
    if (m.type() === "warning" && isVueResolveWarn(text)) consoleErrors.push("VUE-WARN " + text.slice(0, 100));
  });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror ${String(e).slice(0, 100)}`));
  // 树身份:靶子必须是本树的 dev server(默认 5173 多半是主 checkout;CLAUDE.md 记过对错靶跑出 10 红的假象)
  try {
    const home = await (await fetch(`${BASE}/`)).text();
    if (!/uni-app|<div id="app">/i.test(home)) { console.log(`FAIL [target] ${BASE} 不像 uni H5 dev server`); process.exit(1); }
  } catch (e) { console.log(`FAIL [target] 探不到 ${BASE}:${String(e).slice(0, 80)} —— 独立跑请 UNI_BASE_URL 指向本树 mock server`); process.exit(1); }
  let routes = 0, texts = 0;
  for (const [file, cfg] of Object.entries(ROUTE_MAP)) {
    if (!files[file]) { console.log(`WARN ${file} 已不含 svg 文字候选(ROUTE_MAP 里的登记可以删了)`); continue; }
    if (cfg.route === null) { console.log(`SKIP ${file}(不探:${cfg.whyMin})`); continue; }
    const min = cfg.min ?? files[file].svgText;
    const [p, q] = cfg.route.split("?");
    consoleErrors.length = 0;
    await page.goto(`${BASE}/?nx_device=off#/${p}${q ? "?" + q : ""}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2200);
    const snap = await page.evaluate(snapshotScript());
    const hits = judgeSnapshot(snap, min);
    if (consoleErrors.length) hits.push({ tag: "console", msg: `console error/Vue warn ${consoleErrors.length}:${consoleErrors[0]}` });
    routes++; texts += snap.texts.length;
    if (hits.length) { fail += hits.length; console.log(`FAIL ${cfg.route}(${file})`); for (const h of hits) console.log(`  [${h.tag}] ${h.msg}`); }
    else console.log(`PASS ${cfg.route}  svg text ${snap.texts.length}(带标记 ${snap.markedCount} ≥ ${min})· 全部 bbox>0 · 可见 · 呈现属性未被劫持(跳过比不了的 ${snap.attrSkipped})· uni-text 0 · console 0 —— ${snap.texts.map((t) => t.text).join(" / ")}`);
  }
  await browser.close();
  if (routes === 0 || texts === 0) { fail++; console.log(`FAIL [coverage] 探到 ${routes} 条路由 / ${texts} 个 svg 文字 —— 0 覆盖不算绿(A2 P1-3)`); }
  if (fail) { console.log(`svg-text-render-probe: ${fail} 条不通过(lang=${LANG})`); process.exit(1); }
  console.log(`svg-text-render-probe: ${routes} 路由 ${texts} 个 SVG 文字全部真渲染且可见(lang=${LANG};bbox>0 · 可见 · svg 盒内 · 呈现属性=计算值 · svg 内 uni-text 0 · console/Vue warn 0)`);
}

// 只在直接执行时跑(被 import 取判定函数时不动;A1 P2-4)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (argv.includes("--selftest")) selftest();
  else main();
}

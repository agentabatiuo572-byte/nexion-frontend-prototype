// SVG 内文字的**发现谓词**(P-121 两道门共用一份 —— 源码门与运行时门若各写一份,源码门的每个盲区同时就是
// 运行时门的盲区(独立审计 A1 P1-2);共用之后谓词的洞就是两门同时的洞(A2 P1-1),所以这里的每条都要有红测盯着)。
//
// 提供:
//   svgContext(tpl)           逐标签扫描出的上下文分段:每段 {start,end,inSvg,island};引号感知(属性值里的 `</svg>` / `>` 不算标签),
//                              自闭合 `<svg …/>` / `<foreignObject …/>` 不开层,嵌套按深度配对,`<svg:svg>` 命名空间写法也算 svg,
//                              foreignObject 岛只在 svg 内成立、岛内再嵌 `<svg>` 时重新回到判定面(A2 P1-1)。
//   svgTextLocalNames(clean)  import 自 components/svg-text 的**本地名**:默认导入 / `{ default as X }` / `* as ns` /
//                              `defineAsyncComponent(() => import(...))`,后缀 .ts/.js 可有可无;只认**真代码**里的 import(字符串里的假 import 不算,A2 P2-5)。
//   svgTextTagRegex(names)     匹配 <SvgText / <svg-text / 别名(Pascal 与 kebab)开标签,大小写不敏感。
//   analyzeTemplate(src)      一次算齐:segments · spans · svgTextNodes · svgTextOutside · otherLabelCandidates · localNames · importedButUnused。
//   listVueFiles(fs,path,root) 两门共用的判定面文件清单(src/**/*.vue)。
//
// 输入约定:传入 analyzeTemplate 的是原文;内部用 sfc-strip-comments(注释 → 等长空白;script/style → 等长空白)与
// strip-code(字符串内容 → 等长空白)算,下标 1:1 对回原文。
import { stripComments, templateRegion } from "./sfc-strip-comments.mjs";
import { strip as stripCode } from "./strip-code.mjs";

export const SVGTEXT_IMPORT_TAIL = "components/svg-text";

/** 从 `<` 开始找该开标签的 `>` 下标(引号感知,属性值里的 > 不算)。找不到返回 -1。 */
export function tagEnd(s, from) {
  let q = null;
  for (let i = from + 1; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; continue; }
    if (ch === ">") return i;
  }
  return -1;
}

/**
 * 逐标签扫描,产出上下文分段。栈里只放 svg / foreignObject 两种;`island` = 栈顶是 foreignObject(且它在某个 svg 里)。
 * 返回 { segments:[{start,end,inSvg,island}], spans:[[start,end]], unclosed:[start] }。
 */
export function svgContext(tpl) {
  const segments = [];
  const spans = [];
  const unclosed = [];
  const stack = []; // {kind:"svg"|"fo", start}
  const reTag = /<\/?[A-Za-z][\w:.-]*/g;
  let m, segStart = 0, spanStart = -1;
  const top = () => stack[stack.length - 1]?.kind ?? null;
  const svgDepth = () => stack.filter((x) => x.kind === "svg").length;
  const cut = (at) => { // 结束当前分段
    if (at > segStart) segments.push({ start: segStart, end: at, inSvg: svgDepth() > 0, island: top() === "fo" });
    segStart = at;
  };
  while ((m = reTag.exec(tpl))) {
    const raw = m[0].replace(/^<\/?/, "");
    const name = raw.split(":").pop().toLowerCase();
    const closing = m[0][1] === "/";
    const end = tagEnd(tpl, m.index);
    const selfClosing = end > 0 && tpl[end - 1] === "/";
    if (name === "svg" || name === "foreignobject") {
      const kind = name === "svg" ? "svg" : "fo";
      if (closing) {
        // 弹到最近的同类(容忍不配对的闭标签)
        const idx = stack.map((x) => x.kind).lastIndexOf(kind);
        if (idx >= 0) {
          cut(m.index);
          stack.splice(idx);
          if (kind === "svg" && svgDepth() === 0 && spanStart >= 0) { spans.push([spanStart, m.index]); spanStart = -1; }
          segStart = end > 0 ? end + 1 : m.index + m[0].length;
        }
      } else if (!selfClosing) {
        // 岛只在 svg 里才是岛;svg 里外都开层(岛外的 foreignObject 不影响判定)
        if (kind === "svg" || svgDepth() > 0) {
          cut(m.index);
          if (kind === "svg" && svgDepth() === 0) spanStart = m.index;
          stack.push({ kind, start: m.index });
          segStart = end > 0 ? end + 1 : m.index + m[0].length;
        }
      }
    }
    if (end > 0) reTag.lastIndex = end + 1;
  }
  cut(tpl.length);
  if (svgDepth() > 0 && spanStart >= 0) unclosed.push(spanStart);
  return { segments, spans, unclosed };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

/** 本文件里 import 自 components/svg-text 的本地标识符(只认真代码里的 import)。返回 { names:[...], imported:boolean }。 */
export function svgTextLocalNames(clean) {
  // 只看 <script> 区域(把 template/style 抹白),再把字符串内容抹白 → 剩下的 import 关键字一定在真代码里;路径从 clean 同下标读回。
  const scriptOnly = clean.replace(/^<template[^>]*>[\s\S]*?^<\/template>/gim, (s) => s.replace(/[^\n]/g, " ")).replace(/^<style[^>]*>[\s\S]*?<\/style>/gim, (s) => s.replace(/[^\n]/g, " "));
  const code = stripCode(scriptOnly, false);
  const names = new Set();
  let imported = false;
  const pathAt = (quoteIdx) => { const q = clean[quoteIdx]; const e = clean.indexOf(q, quoteIdx + 1); return e < 0 ? "" : clean.slice(quoteIdx + 1, e); };
  const isSvgText = (p) => new RegExp(`(^|/)${escapeRe(SVGTEXT_IMPORT_TAIL)}(\\.[jt]s)?$`).test(p.trim());
  // import X from "…" / import { default as X, … } from "…" / import * as ns from "…"
  const reImp = /import\s+(?:([A-Za-z_$][\w$]*)|\{([^}]*)\}|\*\s+as\s+([A-Za-z_$][\w$]*))\s+from\s*(["'])/g;
  let m;
  while ((m = reImp.exec(code))) {
    const quoteIdx = m.index + m[0].length - 1;
    if (!isSvgText(pathAt(quoteIdx))) continue;
    imported = true;
    if (m[1]) names.add(m[1]);
    if (m[2]) { const d = clean.slice(m.index, m.index + m[0].length).match(/\bdefault\s+as\s+([A-Za-z_$][\w$]*)/); if (d) names.add(d[1]); }
    if (m[3]) names.add(m[3]);
  }
  // const X = defineAsyncComponent(() => import("…"))
  const reAsync = /([A-Za-z_$][\w$]*)\s*=\s*defineAsyncComponent\s*\(\s*\(\s*\)\s*=>\s*import\s*\(\s*(["'])/g;
  while ((m = reAsync.exec(code))) {
    const quoteIdx = m.index + m[0].length - 1;
    if (!isSvgText(pathAt(quoteIdx))) continue;
    imported = true; names.add(m[1]);
  }
  return { names: [...names], imported };
}

/** 匹配「SvgText 用法」开标签:<SvgText / <svg-text / 别名(Pascal 与 kebab)。大小写不敏感。 */
export function svgTextTagRegex(localNames = []) {
  const alts = new Set(["SvgText", "svg-text"]);
  for (const n of localNames) { alts.add(n); alts.add(kebab(n)); }
  return new RegExp(`<(${[...alts].map(escapeRe).join("|")})(?=[\\s>\\/])`, "gi");
}

/** 一次算齐模板事实。src = 原文;返回下标都对原文。 */
export function analyzeTemplate(src) {
  const clean = stripComments(src, true);           // 注释 → 等长空白
  const tpl = templateRegion(clean);                // script/style → 等长空白
  const { segments, spans, unclosed } = svgContext(tpl);
  const segAt = (i) => segments.find((s) => i >= s.start && i < s.end);
  const inSpan = (i) => !!segAt(i)?.inSvg;
  const inIsland = (i) => !!segAt(i)?.island;
  const judged = (i) => { const s = segAt(i); return !!s && s.inSvg && !s.island; }; // svg 内且不在岛里 = 判定面
  const { names: localNames, imported } = svgTextLocalNames(clean);
  const svgTextRe = svgTextTagRegex(localNames);
  const svgTextNodes = [], svgTextOutside = [];
  let m;
  while ((m = svgTextRe.exec(tpl))) (inSpan(m.index) ? svgTextNodes : svgTextOutside).push({ index: m.index, tag: m[1] });
  // svg 内「可能是文字」的其它写法(运行时门据此要求登记路由,而不是只认 <SvgText>)
  const otherLabelCandidates = [];
  const reOther = /<text(?=[\s>\/])|<component(?=[\s>\/])|v-html\s*=/gi;
  while ((m = reOther.exec(tpl))) if (judged(m.index)) otherLabelCandidates.push({ index: m.index, tag: m[0] });
  const importedButUnused = imported && svgTextNodes.length + svgTextOutside.length === 0 && !/<component(?=[\s>\/])/i.test(tpl);
  return { clean, tpl, segments, spans, unclosed, inSpan, inIsland, judged, localNames, imported, importedButUnused, svgTextNodes, svgTextOutside, otherLabelCandidates };
}

/** 判定面上的 .vue 文件清单(src/**),供两道门共用 —— 一处改目录两门同变。 */
export function listVueFiles(fs, path, root) {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".vue")) out.push(p);
    }
  };
  walk(path.join(root, "src"));
  return out;
}

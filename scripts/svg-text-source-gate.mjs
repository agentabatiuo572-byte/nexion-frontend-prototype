#!/usr/bin/env node
// SVG 内文字源码门(P-121,2026-08-17;A1 独立审计后加固)—— 守「`<svg>` 里不许出现会被 uni 编译成 HTML 元素的组件标签」。
//
// 为什么要这道门:模板里的 `<text>` 是 uni 的文本组件,写在 `<svg>` 里会编成自定义元素 `<uni-text>`,
// 它不是合法 SVG 子元素,浏览器不排版 —— 不报错、不留痕、i18n 三道门全绿,用户看到的是没有标注的示意图
// (实测 `svg uni-text` 6 个,`getBoundingClientRect()` 全 0×0)。这个缺陷的全部危险性在于**源码看起来完全正常**,
// 所以源码面必须有人守;渲染面另有 `scripts/svg-text-render-probe.mjs`(运行时 bbox > 0 · 可见 · 属性未被劫持)兜第二道。
// 发现谓词(svg 跨度 / SvgText 用法 / 别名 import / foreignObject 岛)在 `scripts/lib/svg-text-predicate.mjs`,两道门共用一份。
//
// 判据(每条带 tag,红测按 tag 计数,不按行号 —— 行号会随编辑漂):
//   [svg-text]          `<svg>…</svg>` 之内(注释已剥;<foreignObject> 岛除外;嵌套 svg 按最外层整段算)出现 `<text` / `<Text`
//                       (大小写不敏感;`<textPath` 不算)→ 红。正确写法 `<SvgText …>…</SvgText>`(src/components/svg-text.ts)。
//   [svg-uni-tag]       同族:svg 内(岛外)出现 uni 的其它内置组件标签(view / image / switch / button / navigator / input …)→ 红。
//                       它们编出来都是 HTML 元素,放进 SVG 一样不画;修一处≠修全部,整族一起守。要在 SVG 里放 HTML 请包
//                       `<foreignObject>`;要 SVG 图片请照 SvgText 的路子先做 SvgImage 并把这里的名单一并改。
//   [svgtext-outside]   `<SvgText` / `<svg-text` / 别名 出现在 `<svg>` 之外 → 红(HTML 里它是未知元素)。把带标注的子图抽成
//                       子组件是合法写法(命名空间由父级 svg 继承),这种文件在该标签**前面的注释里**(同一行或上一行,必须真在注释里,
//                       写进文本 / 属性不算)写 `svg-text-outside-ok: <理由>` 放行,一条注释只放行**紧随其后的一个**标签,豁免会打印出来供 review(A2 P2-1)。
//   [svgtext-import]    模板用了 `<SvgText` / `<svg-text` 却没 import `@/components/svg-text` → 红。没导入时 Vue 只警告一句然后按
//                       元素名建 `<svg-text>`,在 SVG 命名空间下 0×0(A1 P0-1 实测),vue-tsc 不报错。别名 import 也认。
//   [svgtext-unused]    import 了 components/svg-text(任何认得出的形态)却在模板里一个用法都没扫到 → 红:要么是死 import,要么是本门认不出的
//                       新写法整族隐形(A2 P1-2 的防线;`<component :is>` 用法不算未用)。
//   [svg-unclosed]      `<svg` 没闭合 → 红(自闭合 `<svg …/>` 合法,不算)。
//   [attributify]       uno.config.ts 启用了 UnoCSS presetAttributify 且不是 prefixedOnly:true → 红。它把 SVG 呈现属性
//                       (`font-size="9.5"` → 2.375rem 字大 4 倍;`:opacity="0.25"` → 0.0025 全球节点图 669 个点隐形)当工具类;
//                       ignoreAttributes 只挡裸属性、挡不住绑定式(提取器先查表后剥 `:`),所以「加豁免」不算修(A1 P0-2)。
//   [judged-plane]      全仓一个 `<svg>` 块都扫不到、或一个 SvgText 都没有 → 判定面塌缩,红(仓内实有 4 文件 13 处)。
//
// 边界(如实):只判 .vue 的 <template> 区域;`v-html` 字符串里拼的 `<text>`(lucky-spin 转盘先例)在 script 面,不判 —— 运行时
// 它是真 SVG text;`<component :is="'text'">` 也不判(H5 实测能出真 text)—— 但含这两种写法的 svg 文件同样会被运行时门要求登记路由。
//
// 用法:node scripts/svg-text-source-gate.mjs           扫全仓
//       node scripts/svg-text-source-gate.mjs --selftest 红测(每条判据单独隔离:阳性必中 + 合法必放行)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeTemplate, listVueFiles, SVGTEXT_IMPORT_TAIL } from "./lib/svg-text-predicate.mjs";
import { stripComments } from "./lib/sfc-strip-comments.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// uni 内置组件标签(与 @dcloudio/uni-shared BUILT_IN_TAGS 同源,去掉 text —— 它有专门的判据与提示语)。
export const UNI_BUILTIN_TAGS = ["view", "image", "button", "input", "textarea", "navigator", "scroll-view", "swiper", "swiper-item", "icon", "progress", "rich-text", "picker", "picker-view", "picker-view-column", "label", "form", "checkbox", "checkbox-group", "radio", "radio-group", "switch", "slider", "canvas", "video", "map", "web-view", "cover-view", "cover-image", "movable-area", "movable-view", "editor", "live-player", "live-pusher", "ad", "camera", "audio", "match-media", "page-container"];

/** 单文件判据。纯函数,红测直接喂字符串。 */
export function judgeVue(src, relFile = "<mem>") {
  const hits = [];
  const t = analyzeTemplate(src);
  const lineOf = (i) => src.slice(0, i).split(/\r?\n/).length;
  const lineText = (n) => src.split(/\r?\n/)[n - 1] ?? "";
  for (const i of t.unclosed) hits.push({ tag: "svg-unclosed", line: lineOf(i), msg: "<svg 没有闭合" });
  // [svg-text]
  const reText = /<text(?=[\s>\/])/gi;
  let m;
  while ((m = reText.exec(t.tpl))) {
    if (t.judged(m.index)) hits.push({ tag: "svg-text", line: lineOf(m.index), msg: "<svg> 里写了 <text>(会编成 <uni-text>,0×0 不渲染)—— 改用 <SvgText>(src/components/svg-text.ts)" });
  }
  // [svg-uni-tag]
  const reUni = new RegExp(`<(${UNI_BUILTIN_TAGS.join("|")})(?=[\\s>\\/])`, "gi");
  while ((m = reUni.exec(t.tpl))) {
    if (t.judged(m.index)) hits.push({ tag: "svg-uni-tag", line: lineOf(m.index), msg: `<svg> 里写了 uni 内置组件 <${m[1].toLowerCase()}>(编成 HTML 元素,SVG 不画)—— HTML 内容包 <foreignObject>;SVG 图片照 SvgText 的路子做 SvgImage` });
  }
  // [svgtext-outside](注释里的 svg-text-outside-ok: 放行,一条注释只放行紧随其后的一个标签 —— A2 P2-1)
  const exempt = [];
  // 标记必须真在注释里:原文有字而剥注释后是空白的位置 = 注释区(文本 / 属性字符串里写的不算)
  const markers = [];
  const reMark = /svg-text-outside-ok:\s*([^\r\n]*)/g;
  while ((m = reMark.exec(src))) {
    if (t.clean[m.index] === " " && src[m.index] !== " ") markers.push({ index: m.index, why: m[1].replace(/-->.*$/, "").replace(/\*\/.*$/, "").trim(), used: false });
  }
  for (const o of t.svgTextOutside) {
    const ln = lineOf(o.index);
    const mk = markers.find((k) => !k.used && k.index < o.index && lineOf(k.index) >= ln - 1);
    if (mk) { mk.used = true; exempt.push({ line: ln, why: mk.why }); }
    else hits.push({ tag: "svgtext-outside", line: ln, msg: `<${o.tag}> 写在 <svg> 之外(HTML 里它是未知元素,不是 uni 文本组件)—— 用 <text>;确是抽出来的子图组件就在它前面(同行/上一行)的注释里写 svg-text-outside-ok: 理由` });
  }
  // [svgtext-import]
  if (t.svgTextNodes.length + t.svgTextOutside.length > 0 && t.localNames.length === 0) {
    hits.push({ tag: "svgtext-import", line: lineOf(t.svgTextNodes[0]?.index ?? t.svgTextOutside[0].index), msg: `模板用了 <SvgText>/<svg-text> 但没有 import SvgText from "@/${SVGTEXT_IMPORT_TAIL}"(未解析的组件会按元素名建 <svg-text>,SVG 命名空间下 0×0)` });
  }
  // [svgtext-unused]
  if (t.importedButUnused) hits.push({ tag: "svgtext-unused", line: 1, msg: "import 了 components/svg-text 却在模板里一个 <SvgText>/别名 用法都没扫到 —— 要么是死 import,要么是本门认不出的写法(整族会同时逃出两道门);删掉 import 或改回 <SvgText …>" });
  return { hits, exempt, svgSpans: t.spans.length, svgTextNodes: t.svgTextNodes.length, localNames: t.localNames, file: relFile };
}

/** uno.config 判据:attributify 要么不启用、要么 prefixedOnly:true;ignore-list 不算修。 */
export function judgeUnoConfig(rawText) {
  const hits = [];
  const text = stripComments(rawText, false); // 注释里提到 presetAttributify(比如说明为什么摘掉它)不算启用
  if (!/presetAttributify\s*\(/.test(text)) return { hits, mode: "attributify-off" };
  const call = text.slice(text.indexOf("presetAttributify"));
  if (/prefixedOnly\s*:\s*true/.test(call.slice(0, 800))) return { hits, mode: "prefixed-only" };
  hits.push({ tag: "attributify", line: 1, msg: "uno.config.ts 启用了 presetAttributify 且不是 prefixedOnly:true —— 它会把 SVG 呈现属性(font-size / opacity / fill-opacity …)当工具类改写,ignoreAttributes 挡不住绑定式(:opacity)。全仓没有属性式工具类用法,请摘掉这个 preset(P-123)" });
  return { hits, mode: /ignoreAttributes/.test(call) ? "ignore-list(不够)" : "default(不够)" };
}

/** 全仓判决(纯函数;输入 = 文件清单 + uno.config 文本,红测可喂假清单)。 */
export function judgeRepo(files, unoText) {
  const all = [], exempts = [];
  let spans = 0, nodes = 0, sites = 0;
  for (const { rel, src } of files) {
    const r = judgeVue(src, rel);
    spans += r.svgSpans; nodes += r.svgTextNodes; if (r.svgTextNodes) sites++;
    for (const h of r.hits) all.push({ ...h, file: rel });
    for (const e of r.exempt) exempts.push({ ...e, file: rel });
  }
  const uno = judgeUnoConfig(unoText);
  for (const h of uno.hits) all.push({ ...h, file: "uno.config.ts" });
  if (spans === 0) all.push({ tag: "judged-plane", file: "src/**", line: 0, msg: "全仓一个 <svg> 块都没扫到 —— 判定面塌缩(仓内本有几百处内联 SVG)" });
  if (nodes === 0) all.push({ tag: "judged-plane", file: "src/**", line: 0, msg: "全仓一个 <SvgText> 都没有 —— 判定面塌缩(仓内本有 4 文件 13 处 SVG 内文字)" });
  return { hits: all, exempts, spans, nodes, sites, unoMode: uno.mode };
}

// ── selftest ─────────────────────────────────────────────────────────────────
function selftest() {
  const IMP = 'import SvgText from "@/components/svg-text";';
  const S = (tpl, script = IMP) => `<template><view>${tpl}</view></template>\n<script setup lang="ts">\n${script}\n</script>\n`;
  const cases = [
    // [name, source, tag, expectedCount]
    ["🔴 svg 里裸 <text>", S('<svg><text x="1">YOU</text></svg>'), "svg-text", 1],
    ["🔴 大写 <Text> 同样拦(XML 大小写敏感,渲染成未知元素)", S("<svg><Text>YOU</Text></svg>"), "svg-text", 1],
    ["🔴 嵌在 <g> 里也拦", S('<svg><g><g><text x="1">A</text></g></g></svg>'), "svg-text", 1],
    ["🔴 跨行开标签(<text\\n x=)也拦", S('<svg><text\n  x="1"\n  y="2">A</text></svg>'), "svg-text", 1],
    ["🔴 一个 svg 里两处各计一次", S("<svg><text>A</text><text>B</text></svg>"), "svg-text", 2],
    ["🔴 第二个 svg 块里的也抓(不只看第一个)", S("<svg><circle /></svg><view><svg><text>Z</text></svg></view>"), "svg-text", 1],
    ["🔴 嵌套 svg:内层 </svg> 之后、外层之内的 <text> 也抓(A1 P1-1)", S('<svg><svg x="10" width="50"><circle /></svg><text x="1">GHOST</text></svg>'), "svg-text", 1],
    ["🔴 三层嵌套 svg 的最外层 <text>", S("<svg><svg><svg><circle /></svg></svg><text>G</text></svg>"), "svg-text", 1],
    ["🔴 属性值里的 </svg> 字符串不算闭合,其后 <text> 照抓", S('<svg><g data-x="</svg>"></g><text>G</text></svg>'), "svg-text", 1],
    ["合法:自闭合 <svg …/> 后面的裸 <text> 是 uni 文本,不判", S('<svg viewBox="0 0 1 1" /><text>hello</text>'), "svg-text", 0],
    ["合法:自闭合 <svg …/> 不算未闭合", S('<svg viewBox="0 0 1 1" /><text>hello</text>'), "svg-unclosed", 0],
    ["合法:svg 外的 <text> 是 uni 文本组件,不判", S("<text>hello</text><svg><circle /></svg>"), "svg-text", 0],
    ["合法:svg 里注释里提到 <text> 不算(注释已剥)", S("<svg><!-- <text>x</text> --><circle /></svg>"), "svg-text", 0],
    ["合法:<textPath> 是别的 SVG 元素", S("<svg><SvgText><textPath href='#p'>x</textPath></SvgText></svg>"), "svg-text", 0],
    ["合法:<foreignObject> 岛里的 <text> 是 HTML 内容(uni 文本在那里合法)", S('<svg><foreignObject x="0" y="0" width="10" height="10"><view><text>ok</text></view></foreignObject></svg>'), "svg-text", 0],
    ["合法:script 里拼 v-html 字符串的 <text> 不在判定面(lucky-spin 先例)", S('<svg><g v-html="s" /></svg>', `${IMP}\nconst s = '<text x="1">A</text>';`), "svg-text", 0],
    ["合法:script 字符串里自带 <svg> + <text>(判定面必须真的抹掉 script,A1 P2-5)", S("<view />", `${IMP}\nconst s = '<svg><text x=\"1\">A</text></svg>';`), "svg-text", 0],
    ["合法:<SvgText> 在 svg 内 + 已 import", S('<svg><SvgText x="1">YOU</SvgText></svg>'), "svg-text", 0],
    ["🔴 同族:svg 里写 <image>(uni 图片组件,SVG 不画)", S('<svg><image href="/a.png" x="1" y="1" width="10" height="10" /></svg>'), "svg-uni-tag", 1],
    ["🔴 同族:svg 里写 <view>", S("<svg><view>x</view></svg>"), "svg-uni-tag", 1],
    ["🔴 同族:svg 里写 <switch>(SVG 与 uni 都有这个名字)", S("<svg><switch><circle /></switch></svg>"), "svg-uni-tag", 1],
    ["🔴 同族:svg 里写 <button>", S('<svg><button @click="go">x</button></svg>'), "svg-uni-tag", 1],
    ["合法:foreignObject 岛里的 <view>/<text> 不判 uni-tag", S('<svg><foreignObject x="0" y="0" width="10" height="10"><view><text>ok</text></view></foreignObject></svg>'), "svg-uni-tag", 0],
    ["合法:svg 外的 <image> 不判", S('<image src="/a.png" /><svg><circle /></svg>'), "svg-uni-tag", 0],
    ["合法:前缀相同的自定义标签(<viewport-x> / <image-card>)不误伤", S("<svg><viewport-thing /><image-card /></svg>"), "svg-uni-tag", 0],
    ["🔴 <SvgText> 写在 svg 外", S("<SvgText>oops</SvgText><svg><circle /></svg>"), "svgtext-outside", 1],
    ["🔴 kebab <svg-text> 写在 svg 外也算", S("<svg-text>oops</svg-text><svg><circle /></svg>"), "svgtext-outside", 1],
    ["合法:svg 外的 <SvgText> 带 svg-text-outside-ok: 注释(抽出来的子图组件)放行", S("<!-- svg-text-outside-ok: 关系网标注子组件,由父级 svg 承载 -->\n<SvgText>ok</SvgText>"), "svgtext-outside", 0],
    ["合法:<SvgText> 在 svg 内不算 outside", S("<svg><SvgText>ok</SvgText></svg>"), "svgtext-outside", 0],
    ["🔴 用了 <SvgText> 却没 import", S("<svg><SvgText>x</SvgText></svg>", "const a = 1;"), "svgtext-import", 1],
    ["🔴 kebab <svg-text> 没 import(A1 P0-1:0×0 且两门曾全绿)", S("<svg><svg-text>x</svg-text></svg>", "const a = 1;"), "svgtext-import", 1],
    ["🔴 大小写变体 <SVGTEXT> 没 import 也判", S("<svg><SVGTEXT>x</SVGTEXT></svg>", "const a = 1;"), "svgtext-import", 1],
    ["合法:kebab <svg-text> + Pascal import(Vue 两种写法都认)", S("<svg><svg-text>x</svg-text></svg>"), "svgtext-import", 0],
    ["合法:别名 import + 别名标签(<SvgLabel>)算已 import 且计入节点", S("<svg><SvgLabel>x</SvgLabel></svg>", 'import SvgLabel from "@/components/svg-text";'), "svgtext-import", 0],
    ["合法:相对路径 import 也认", S("<svg><SvgText>x</SvgText></svg>", 'import SvgText from "../../components/svg-text";'), "svgtext-import", 0],
    ["合法:没用 <SvgText> 就不要求 import", S("<svg><circle /></svg>", "const a = 1;"), "svgtext-import", 0],
    ["🔴 <svg 没闭合", S("<svg><SvgText>x</SvgText>"), "svg-unclosed", 1],
    // ── A2 加固 ──
    ["🔴 自闭合 <foreignObject …/> 不开岛:其后 svg 内的 <text> 照抓(A2 P1-1)", S('<svg><foreignObject x="0" y="0" width="1" height="1" /><text>GHOST</text><foreignObject x="0" y="0" width="1" height="1"><view>x</view></foreignObject></svg>'), "svg-text", 1],
    ["🔴 同上对 <view> 也一样(svg-uni-tag)", S('<svg><foreignObject x="0" y="0" width="1" height="1" /><view>GHOST</view></svg>'), "svg-uni-tag", 1],
    ["🔴 foreignObject 岛里再嵌真 <svg>,里面的 <text> 回到判定面", S('<svg><foreignObject x="0" y="0" width="10" height="10"><view><svg><text>DEEP</text></svg></view></foreignObject></svg>'), "svg-text", 1],
    ["🔴 svg 之外的 <foreignObject> 不是岛:里面 <svg><text> 照抓", S("<foreignObject><svg><text>GHOST</text></svg></foreignObject>"), "svg-text", 1],
    ["🔴 <svg:svg> 命名空间写法也开跨度(A2 P2-4)", S("<svg:svg><text>NS</text></svg:svg>"), "svg-text", 1],
    ["合法:import { default as X } + <X>(A2 P1-2)算已 import", S("<svg><SvgLabel>x</SvgLabel></svg>", 'import { default as SvgLabel } from "@/components/svg-text";'), "svgtext-import", 0],
    ["合法:defineAsyncComponent(() => import(...))(A2 P2-6)", S("<svg><SvgText>x</SvgText></svg>", 'import { defineAsyncComponent } from "vue";\nconst SvgText = defineAsyncComponent(() => import("@/components/svg-text"));'), "svgtext-import", 0],
    ["合法:.js 后缀 import(A2 P2-6)", S("<svg><SvgText>x</SvgText></svg>", 'import SvgText from "@/components/svg-text.js";'), "svgtext-import", 0],
    ["🔴 script 字符串里的假 import 不算(A2 P2-5)", S("<svg><SvgText>x</SvgText></svg>", "const doc = 'import SvgText from \"@/components/svg-text\";';"), "svgtext-import", 1],
    ["🔴 import 了 svg-text 却一个用法都没有 → svgtext-unused(死 import / 认不出的写法整族隐形)", S("<svg><circle /></svg>"), "svgtext-unused", 1],
    ["合法:import 了且用了 → 不算 unused", S("<svg><SvgText>x</SvgText></svg>"), "svgtext-unused", 0],
    ["合法:import 了、用 <component :is> 用法 → 不算 unused(候选另有登记要求)", S('<svg><component :is="SvgText" x="1">x</component></svg>'), "svgtext-unused", 0],
    ["🔴 valve 写在元素文本里不算(A2 P2-1 E1)", S("<SvgText>svg-text-outside-ok: 借口</SvgText>"), "svgtext-outside", 1],
    ["🔴 valve 写在属性字符串里不算(E2)", S('<SvgText title="svg-text-outside-ok: 借口">x</SvgText>'), "svgtext-outside", 1],
    ["🔴 一条注释只放行紧随其后的一个标签,同行第二个照红(E4)", S("<!-- svg-text-outside-ok: 抽出的子图 -->\n<SvgText>a</SvgText><SvgText>b</SvgText>"), "svgtext-outside", 1],
    ["合法:注释 valve + 紧随的一个标签 → 放行", S("<!-- svg-text-outside-ok: 抽出的子图 -->\n<SvgText>a</SvgText>"), "svgtext-outside", 0],
  ];
  const unoCases = [
    ["合法:根本没启用 attributify(本仓现状)", "presets: [presetWind3()]", 0],
    ["合法:只在注释里提到 presetAttributify( 与 prefixedOnly(本仓 uno.config 现状)不算启用", "// 不要再加 presetAttributify(2026-08-17 摘除):prefixedOnly:true 也别\npresets: [presetWind3()]", 0],
    ["🔴 注释里写着「摘除」但代码里仍启用 → 照红(判据看代码不看注释)", "// 已摘除 presetAttributify(见 P-123)\npresets: [presetWind3(), presetAttributify()]", 1],
    ["合法:prefixedOnly:true(裸属性一律不当工具类,实测 0 条属性规则)", "presetAttributify({ prefixedOnly: true })", 0],
    ["🔴 裸 presetAttributify()", "presets: [presetWind3(), presetAttributify()]", 1],
    ["🔴 ignoreAttributes 含 font-size 也不算修(绑定式 :opacity 绕过,A1 P0-2)", 'presetAttributify({ ignoreAttributes: ["placeholder", "fill", "opacity", "stroke-opacity", "font-size", "fill-opacity"] })', 1],
  ];
  let pass = 0, fail = 0;
  const say = (ok, name, got, want) => { if (ok) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name} —— 期望 ${want} 命中,实得 ${got}`); } };
  for (const [name, src, tag, want] of cases) {
    const got = judgeVue(src).hits.filter((h) => h.tag === tag).length;
    say(got === want, name, got, want);
  }
  for (const [name, text, want] of unoCases) {
    const got = judgeUnoConfig(text).hits.length;
    say(got === want, `uno:${name}`, got, want);
  }
  // 别名 import 的节点要计入 svgTextNodes(运行时门据此登记路由)
  const alias = judgeVue(S("<svg><SvgLabel>x</SvgLabel></svg>", 'import SvgLabel from "@/components/svg-text";'));
  say(alias.svgTextNodes === 1, "别名标签计入 svgTextNodes(=1)", alias.svgTextNodes, 1);
  // 行号钉在被判节点那一行(不是文件头)
  const lineSrc = S("<svg>\n  <circle />\n  <text>L</text>\n</svg>");
  const h = judgeVue(lineSrc).hits.find((x) => x.tag === "svg-text");
  say(h && h.line === 3, "命中行号 = <text> 所在行(第 3 行)", h?.line, 3);
  // 判定面塌缩:空清单 / 没有 SvgText 的清单
  const okUno = "presets: [presetWind3()]";
  const empty = judgeRepo([], okUno).hits.filter((x) => x.tag === "judged-plane").length;
  say(empty === 2, "🔴 判定面塌缩:0 文件 → judged-plane 红(svg 块 0 + SvgText 0)", empty, 2);
  const noSvgText = judgeRepo([{ rel: "a.vue", src: S("<svg><circle /></svg>") }], okUno).hits.filter((x) => x.tag === "judged-plane").length;
  say(noSvgText === 1, "🔴 判定面塌缩:有 svg 但全仓 0 个 SvgText → 红", noSvgText, 1);
  const clean = judgeRepo([{ rel: "a.vue", src: S("<svg><SvgText>x</SvgText></svg>") }], okUno).hits.length;
  say(clean === 0, "合法:有 svg + 有 SvgText + attributify 未启用 → 0 命中", clean, 0);
  console.log(`svg-text-source-gate selftest: ${pass}/${pass + fail} 格通过`);
  process.exit(fail ? 1 : 0);
}

// ── main ─────────────────────────────────────────────────────────────────────
if (process.argv.includes("--selftest")) selftest();
else {
  const files = listVueFiles(fs, path, ROOT).map((p) => ({ rel: path.relative(ROOT, p).replace(/\\/g, "/"), src: fs.readFileSync(p, "utf8") }));
  const unoText = fs.existsSync(path.join(ROOT, "uno.config.ts")) ? fs.readFileSync(path.join(ROOT, "uno.config.ts"), "utf8") : "";
  const r = judgeRepo(files, unoText);
  for (const e of r.exempts) console.log(`EXEMPT [svgtext-outside] ${e.file}:${e.line}  ${e.why}`);
  if (r.hits.length) {
    for (const h of r.hits) console.log(`FAIL [${h.tag}] ${h.file}:${h.line}  ${h.msg}`);
    console.log(`svg-text-source-gate: ${r.hits.length} 处违规(svg 块 ${r.spans} · SvgText ${r.nodes} 处 / ${r.sites} 文件 · attributify=${r.unoMode})`);
    process.exit(1);
  }
  console.log(`svg-text-source-gate: 0 违规 —— 扫 ${files.length} 个 .vue,<svg> 块 ${r.spans},SvgText ${r.nodes} 处 / ${r.sites} 文件,attributify=${r.unoMode},svg 外豁免 ${r.exempts.length} 处`);
}

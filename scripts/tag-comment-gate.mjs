// 标签内注释哨兵(C3/C5 2026-07-23):HTML 注释卡在标签属性之间 —— Vue 模板里这是非法位置。
//
// 为什么要机器门:vue-tsc **不报**这种错(它只看类型),浏览器里 Vue 编译器多数时候
// 也能容忍着渲染出来,所以肉眼和 tsc 双双看不见。本轮我自己连犯三次、且在 B1 的存量代码里
// 也扫出一处 —— 典型的「人眼与既有门都测不到」,该归机器层。
//
//   <view                                  <!-- ✅ 合法:注释在标签外 -->
//     v-for="x in xs"                      <view
//     <!-- ❌ 非法:卡在属性之间 -->          v-for="x in xs"
//     :style="s"                             :style="s"
//   >                                      >
//
// 用法:node scripts/tag-comment-gate.mjs [--selftest]
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// 标签开始 <tag,随后是属性(其中不含收尾 >),然后撞上 <!--
const RE = /<[a-zA-Z][a-zA-Z0-9-]*(?:\s+(?!>)[^>]*?)?<!--/g;

function scanText(src) {
  const t = src.indexOf("<template>");
  const e = src.lastIndexOf("</template>");
  if (t < 0 || e < 0) return [];
  const head = src.slice(0, t).split("\n").length - 1;
  const body = src.slice(t, e);
  const out = [];
  let m;
  RE.lastIndex = 0;
  while ((m = RE.exec(body))) {
    if (m[0].includes(">")) continue; // 标签已闭合,注释在外面 —— 合法
    out.push({ line: head + body.slice(0, m.index).split("\n").length, snippet: m[0].replace(/\s+/g, " ").slice(0, 90) });
  }
  return out;
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(join(dir, d.name)) : d.name.endsWith(".vue") ? [join(dir, d.name)] : [],
  );
}

if (process.argv.includes("--selftest")) {
  const BAD = `<template>\n  <view\n    v-for="x in xs"\n    <!-- 注释卡在属性之间 -->\n    :style="s"\n  >\n    <text>hi</text>\n  </view>\n</template>`;
  const CLEAN = `<template>\n  <!-- 注释在标签外,合法 -->\n  <view v-for="x in xs" :style="s">\n    <!-- 子元素之间的注释也合法 -->\n    <text>hi</text>\n  </view>\n</template>`;
  const fails = [];
  if (scanText(BAD).length !== 1) fails.push(`假阴:阳性 fixture 应中 1 条,实得 ${scanText(BAD).length}`);
  if (scanText(CLEAN).length !== 0) fails.push(`假阳:干净 fixture 报了 ${scanText(CLEAN).length} 条`);
  if (fails.length) {
    fails.forEach((f) => console.error("SELFTEST FAIL: " + f));
    process.exit(1);
  }
  console.log("tag-comment selftest 全过(标签内阳性中 + 标签外/子元素间假阳 0)");
  process.exit(0);
}

let hits = 0;
for (const f of walk("src")) {
  for (const h of scanText(readFileSync(f, "utf8"))) {
    console.error(`  ${f}:${h.line}  ${h.snippet}`);
    hits++;
  }
}
if (hits) {
  console.error(`标签内注释:${hits} 处 —— 注释挪到标签外(<view> 之前那一行)`);
  process.exit(1);
}
console.log("标签内注释:0 处");

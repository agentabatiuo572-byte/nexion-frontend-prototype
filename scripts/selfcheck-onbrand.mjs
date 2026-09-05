#!/usr/bin/env node
// selfcheck-onbrand —— 「亮底文字必须用 --v5-on-brand*」哨兵。
//
// 缘起(2026-08-01 审计 C-7,浏览器实测):
//   · 提现页**主提交 CTA** = `--v5-brand` 底 + `--v5-ink` 字 → 对比度 **1.54:1**;
//     换成 `--v5-on-brand` 是 11.98:1。
//   · legacy CTA = `--v5-brand-2` 底 + `--v5-ink` 字 → 2.41:1;`--v5-on-brand-2` 是 7.64:1。
//   · tokens.css 自己的注释就写着「white on orange fails WCAG AA」,而 verify 里
//     grep `on-brand` 零命中 —— 这个维度**一道门都没有**,所以违规能一直躺着。
//
// 判据:同一个样式对象/内联 style 里,若 background 用了 brand 家族,则 color 不得用 ink 家族。
// 只看**同一个块**,不做 -A N 的上下文近似(那会把隔壁无关的样式对象算进来)。
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(root, "src");

let pass = 0, fail = 0;
function check(name, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const f = path.join(dir, e);
    if (statSync(f).isDirectory()) walk(f, out);
    else if (/\.(vue|ts)$/.test(f)) out.push(f);
  }
  return out;
}

// 品牌家族填充(文字必须走 on-brand*);--v5-brand-soft / -tint 这类是浅色 tint,不属于亮底
const BRAND_BG = /background(?:-color)?:\s*(?:[^;,}]*?)var\(--v5-(brand|brand-2)\)/;
const INK_FG = /\bcolor:\s*(?:[^;,}]*?)var\(--v5-(ink|ink-2|ink-3)\)/;

/** 把源码切成「样式块」:CSSProperties 对象字面量 + 内联 style="..."。 */
function styleBlocks(src) {
  const out = [];
  // ① 对象字面量:从 `{` 配对到 `}`
  const re = /(?:CSSProperties\s*=\s*|computed<CSSProperties>\(\(\)\s*=>\s*)\(?\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    const start = src.indexOf("{", m.index + m[0].length - 1);
    let depth = 0;
    for (let k = start; k < src.length; k++) {
      if (src[k] === "{") depth++;
      else if (src[k] === "}") { depth--; if (depth === 0) { out.push({ text: src.slice(start, k + 1), at: start }); break; } }
    }
  }
  // ② 内联 style="..."(单个属性串本身就是一个块)
  for (const im of src.matchAll(/style="([^"]*)"/g)) out.push({ text: im[1], at: im.index });
  return out;
}

const violations = [];
let scanned = 0, blocks = 0;
for (const f of walk(SRC)) {
  const src = readFileSync(f, "utf8");
  scanned++;
  for (const b of styleBlocks(src)) {
    blocks++;
    if (BRAND_BG.test(b.text) && INK_FG.test(b.text)) {
      const line = src.slice(0, b.at).split("\n").length;
      violations.push(`${path.relative(root, f)}:${line}`);
    }
  }
}

// 🔴 候选为空必须判失败 —— 扫不到任何样式块 = 解析器坏了,不是「没有违规」。
check(`扫描器有效(扫到样式块 ${blocks} 个 / 文件 ${scanned} 个)`, blocks > 200,
  `只扫到 ${blocks} 个块,解析器可能失效`);

// 自检:构造阳性/阴性各一,证明判据两个方向都работает
{
  const positive = `const x: CSSProperties = { background: "var(--v5-brand)", color: "var(--v5-ink)" };`;
  const negative = `const y: CSSProperties = { background: "var(--v5-brand)", color: "var(--v5-on-brand)" };`;
  const negTint = `const z: CSSProperties = { background: "color-mix(in srgb, var(--v5-brand) 8%, transparent)", color: "var(--v5-ink)" };`;
  const hit = (s) => styleBlocks(s).some((b) => BRAND_BG.test(b.text) && INK_FG.test(b.text));
  check("selftest:brand 底 + ink 字 → 命中", hit(positive));
  check("selftest:brand 底 + on-brand 字 → 不命中", !hit(negative));
  check("selftest:color-mix 浅色 tint 底 + ink 字 → 不命中(那不是亮底)", !hit(negTint));
}

check(`亮底文字全部走 on-brand*(违例 ${violations.length} 处)`, violations.length === 0,
  violations.join(" · "));

console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);

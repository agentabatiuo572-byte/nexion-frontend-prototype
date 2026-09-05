#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function propName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return null;
}

function collectObjectKeys(node, prefix = "") {
  if (!ts.isObjectLiteralExpression(node)) return [];
  const keys = [];
  for (const prop of node.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const name = propName(prop.name);
    if (!name) continue;
    const key = prefix ? `${prefix}.${name}` : name;
    keys.push(key);
    if (ts.isObjectLiteralExpression(prop.initializer)) {
      keys.push(...collectObjectKeys(prop.initializer, key));
    }
  }
  return keys;
}

// 占位符收集(2026-07-23 B1 新增):键名镜像通过 ≠ 插值安全。若某语言漏写
// {name} 占位符,fmt 的插值静默丢失(UI 少一段信息);若多写,UI 裸露花括号。
// 两者 tsc/键镜像都抓不到 —— 本轮新增 66 条带插值文案后补上这道门。
function collectPlaceholders(node, prefix = "", out = new Map()) {
  if (!ts.isObjectLiteralExpression(node)) return out;
  for (const prop of node.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const name = propName(prop.name);
    if (!name) continue;
    const key = prefix ? `${prefix}.${name}` : name;
    if (ts.isObjectLiteralExpression(prop.initializer)) {
      collectPlaceholders(prop.initializer, key, out);
    } else if (ts.isStringLiteral(prop.initializer) || ts.isNoSubstitutionTemplateLiteral(prop.initializer)) {
      const marks = [...prop.initializer.text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      if (marks.length) out.set(key, marks.join(","));
    }
  }
  return out;
}

function readExportedObject(file, exportName) {
  const sourcePath = path.join(ROOT, file);
  const src = fs.readFileSync(sourcePath, "utf8");
  const sf = ts.createSourceFile(sourcePath, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let found = null;
  sf.forEachChild((node) => {
    if (!ts.isVariableStatement(node)) return;
    for (const decl of node.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.name.text === exportName && decl.initializer) {
        found = decl.initializer;
      }
    }
  });
  if (!found || !ts.isObjectLiteralExpression(found)) {
    throw new Error(`Could not find exported object ${exportName} in ${file}`);
  }
  return found;
}

// en is the source of truth; every other locale dictionary must mirror its key
// tree exactly (no missing, no extra). Added vi 2026-07-21 — a two-way en/zh
// check would let vi drift silently, so all locales are gated against en here.
const enRoot = readExportedObject("src/i18n/messages/en.ts", "en");
const enKeys = new Set(collectObjectKeys(enRoot));
const enMarks = collectPlaceholders(enRoot);
const LOCALES = [
  ["zh", "src/i18n/messages/zh.ts"],
  ["vi", "src/i18n/messages/vi.ts"],
];

// 🔴 占位符门(2026-08-05 由 INFO 升级为真判据)。升级理由:原判据只打印不 fail —— 证伪方
// 实证「把 zh 某键的 {n} 抽掉,门照样 exit 0」,即『三语占位符一致』这条契约当时无门可守。
//
// 现判据:逐键比较 en 与各语言的 {xxx} 集合,**对称差必须为空**,否则 FAIL。
// 原降级理由(跨语言语法差异真实存在)靠下面这张白名单承接,而不是靠放宽判据:
//   ① 英文复数 / 冠词语法标记(`seat{s}`、`direct {label}`)CJK/vi 无需对应,
//      调用点形如 `{ s: qty > 1 ? "s" : "" }`,少写是**正确**的;
//   ② 组件可传占位符「超集」供各语言各取所需 —— binary-how.vue 明写
//      「zh 用 {freq}、en 用 {unit},两者都传,fmt 忽略未用占位符」。
//
// 白名单三条纪律(防止它变成「换个地方放宽」):
//   · **按占位符名授权,不是整键豁免** —— `networkCardGapDirectRefs` 只放行 {label},
//     同一键漏掉 {n} 照样红;
//   · 每条必写理由(见每行行尾注释)与真实调用点;
//   · **失效即红** —— 白名单某条不再对应任何真实差异(例如译文补上了该占位符),
//     门直接 FAIL 要求删掉它,不许留着做静默扩权(0 命中即判据失效)。
// 🔴 授权是**三元组:键 × 占位符 × 语言**(2026-08-05 独立证伪 A8 抓的洞):
//   授权理由几乎都是对着某一种语言说的(「zh 无单复数」),旧表却对所有语言一视同仁 ——
//   vi 真消费 {label}(network-card.vue 传本地化名词),把它从 vi 删掉门照样绿。
//   缺语言维的豁免 = 给全语言开静默后门;每条 locales 只列理由真实覆盖的那些语言。
const MARK_EXEMPT = {
  // en `"{n} more direct {label}"` 的 {label} 承载 invite/invites 单复数词(network-card.vue
  // formatPrimaryGap 传入);zh「还差 {n} 个直推」无单复数不需要它;vi 真消费,不豁免。
  "me.networkCardGapDirectRefs": { marks: ["label"], locales: ["zh"] },
  // en `"{n} more V{v} member{s}"` 的 {s} 是纯复数字母;zh/vi 均无复数屈折。
  "me.networkCardGapVDownlines": { marks: ["s"], locales: ["zh", "vi"] },
  // en `"{n} Genesis seat{s} secured"` 同上(purchase-sheet.vue 传 `s: qty > 1 ? "s" : ""`)。
  "genesis.purchaseSuccess": { marks: ["s"], locales: ["zh", "vi"] },
  // 超集传参:binary-how.vue 同时传 {freq} 与 {unit},zh 取 {freq}、en/vi 同取 {unit}。
  "binaryHowItWorks.s4Intro": { marks: ["freq", "unit"], locales: ["zh"] },
};

let failed = false;
let exemptHits = 0;
const exemptUsed = new Set(); // `${key}:${mark}:${locale}` —— 真正被行使过的授权(三元组粒度)

// 🔴 多重集,不是集合(2026-08-05 独立证伪 P2):`{n} {n}` vs `{n}` 在 Set 比较下不可见,
//   而重复占位符少一个 = 该语言 UI 静默少一段信息。计数逐项比。
function markCounts(map, key) {
  const c = new Map();
  for (const m of (map.get(key) ?? "").split(",").filter(Boolean)) c.set(m, (c.get(m) ?? 0) + 1);
  return c;
}

for (const [name, file] of LOCALES) {
  const root = readExportedObject(file, name);
  const keys = new Set(collectObjectKeys(root));
  const missing = [...enKeys].filter((key) => !keys.has(key));
  const extra = [...keys].filter((key) => !enKeys.has(key));
  if (missing.length || extra.length) {
    failed = true;
    console.error(`uniapp i18n mirror FAIL (${name} vs en)`);
    if (missing.length) console.error(`missing in ${name}:\n${missing.join("\n")}`);
    if (extra.length) console.error(`extra in ${name}:\n${extra.join("\n")}`);
  }
  // 占位符对齐:以 en 为准,逐键比较 {xxx} 集合(对称差 − 白名单授权 必须为空)
  const marks = collectPlaceholders(root);
  const bad = [];
  const allowed = [];
  for (const key of new Set([...enMarks.keys(), ...marks.keys()])) {
    const a = markCounts(enMarks, key);
    const b = markCounts(marks, key);
    const diff = [...new Set([...a.keys(), ...b.keys()])].filter((m) => (a.get(m) ?? 0) !== (b.get(m) ?? 0));
    if (!diff.length) continue;
    const allow = MARK_EXEMPT[key];
    const render = (c) => [...c.entries()].map(([m, n]) => (n > 1 ? `${m}×${n}` : m)).join(",") || "—";
    const shown = `${key}: en{${render(a)}} ${name}{${render(b)}}`;
    const grant = (m) => !!allow && allow.marks.includes(m) && allow.locales.includes(name);
    const offending = diff.filter((m) => !grant(m));
    for (const m of diff) {
      if (grant(m)) {
        exemptUsed.add(`${key}:${m}:${name}`);
        exemptHits += 1;
      }
    }
    if (offending.length) bad.push(`  ${shown} ← 未授权差异 {${offending.join(",")}}`);
    else allowed.push(`  ${shown} ← 白名单已授权 {${diff.join(",")}}`);
  }
  if (allowed.length) {
    console.log(`uniapp i18n placeholder EXEMPT (${name} vs en) — ${allowed.length} 条已授权语法差异:\n${allowed.join("\n")}`);
  }
  if (bad.length) {
    failed = true;
    console.error(
      `uniapp i18n placeholder FAIL (${name} vs en) — ${bad.length} 条占位符集合差异未授权。\n` +
        `插值文案跨语言漏写 {x} = 该语言 UI 静默少一段信息;多写 = 裸露花括号。\n` +
        `确属语法差异请在 scripts/i18n-key-mirror.mjs 的 MARK_EXEMPT 按占位符名授权并写明理由:\n${bad.join("\n")}`
    );
  }
}

// 🔴 白名单失效检测:授权没被行使 = 译文已修好或键已删,这条授权只剩静默扩权作用。
const stale = [];
for (const [key, ex] of Object.entries(MARK_EXEMPT)) {
  for (const m of ex.marks) {
    for (const loc of ex.locales) {
      if (!exemptUsed.has(`${key}:${m}:${loc}`)) stale.push(`  ${key} → {${m}} @ ${loc}`);
    }
  }
}
if (stale.length) {
  failed = true;
  console.error(
    `uniapp i18n placeholder FAIL — MARK_EXEMPT 有 ${stale.length} 条授权已无对应差异(0 命中即判据失效),请从白名单删除:\n${stale.join("\n")}`
  );
}

if (failed) process.exit(1);

// 🔴 总结行不许和上面打印的内容自相矛盾:授权差异数如实带出来,
// 谁把这行 PASS 当成「三语插值零差异」就会得到假结论(2026-08-01 审计 completeness critic 点名)。
const markNote =
  exemptHits > 0
    ? `${enMarks.size} 条带插值文案占位符逐键对齐(${exemptHits} 处跨语言语法差异按 MARK_EXEMPT 授权放行)`
    : `${enMarks.size} 条带插值文案占位符完全对齐`;
console.log(`uniapp i18n mirror PASS: en/zh/vi ${enKeys.size} keys · ${markNote}`);

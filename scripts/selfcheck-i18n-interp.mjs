#!/usr/bin/env node
// i18n 插值直出哨兵 · 行为自检 — node 直跑:
//   node scripts/selfcheck-i18n-interp.mjs
//
// 🔴 守的不变量:**带占位符的文案必须过 fmt() 才能进 DOM**。
//
// 由来(2026-07-31 独立验收 D-1):`trackEtaPending` 从「预计 24 小时内完成」改成
// 「预计 {n} 小时内完成」时,只改了两个消费者中的一个。另一个直出原文,用户在提现
// 追踪页看到标题「预计 {n} 小时内完成」——zh/en/vi × 2 态共 6 处全中,而
// type-check / i18n-key-mirror / 既有源码哨兵**全绿**:它只在渲染后的 DOM 里现形。
//
// 这是「改一个 key 的形态 = 改它所有消费者」这类坑的机器门。
// i18n-key-mirror 守的是「三语占位符对齐」,是另一个维度,两者不互相覆盖。
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { transformSync } from "esbuild";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// ── 1. 取出所有「带占位符」的 key 路径 ──────────────────
// 🔴 三语取**并集**,不能只读 zh:占位符名在三语之间可以不同(mirror 只把这种情况报
//    INFO 不拦),只读一份的话「只在 en 带占位符」的 key 会整条漏掉。
async function loadLocale(locale) {
  const src = readFileSync(path.join(root, "src", "i18n", "messages", `${locale}.ts`), "utf8")
    .replace(/^import type .*$/m, "")
    .replace(new RegExp(`export const ${locale}: Messages =`), `export const msg =`)
    .replace(new RegExp(`export const ${locale} =`), `export const msg =`);
  const { code } = transformSync(src, { loader: "ts", format: "esm" });
  const m = await import("data:text/javascript;base64," + Buffer.from(code, "utf8").toString("base64"));
  return m.msg;
}
const locales = ["zh", "en", "vi"];
const messagesByLocale = [];
for (const l of locales) messagesByLocale.push(await loadLocale(l));

const PLACEHOLDER = /\{[A-Za-z0-9_]+\}/;
/** key 路径(如 wallet.trackEtaPending)→ 该文案含占位符 */
const interpolated = new Set();
function walk(node, prefix) {
  for (const [k, v] of Object.entries(node ?? {})) {
    const keyPath = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") {
      if (PLACEHOLDER.test(v)) interpolated.add(keyPath);
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      walk(v, keyPath);
    }
  }
}
for (const m of messagesByLocale) walk(m, "");

// ── 2. 扫源码里的引用 ───────────────────────────────────
function listFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === "messages") continue;
      listFiles(full, out);
    } else if (/\.(vue|ts)$/.test(name)) out.push(full);
  }
  return out;
}

// t.value.a.b / t.a.b(最多三层,覆盖本工程的 namespace 深度)
const REF = /\bt(?:\.value)?((?:\.[A-Za-z0-9_]+){2,3})\b/g;
// 🔴 别名写法必须一起扫。独立验收实测构造出来的盲区:工程里常见
//    `const w = computed(() => t.value.someNamespace);` 再 `w.value.someKey` ——
//    只认字面 `t.` 开头的话,这类引用整条穿过(实测哨兵全绿而 DOM 里真漏 {freq})。
//    全工程 23 处别名声明 / 30 处别名引用曾全在覆盖外。
const ALIAS_DECL = /\bconst\s+([A-Za-z0-9_]+)\s*=\s*computed\(\(\)\s*=>\s*t\.value\.([A-Za-z0-9_]+)\s*\)/g;
const ALIAS_DECL_PLAIN = /\bconst\s+([A-Za-z0-9_]+)\s*=\s*t\.value\.([A-Za-z0-9_]+)\s*;/g;
/** 逃生阀:同行写 `i18n-raw-ok` 说明理由(如「原文另处再 fmt」)。 */
const ESCAPE = "i18n-raw-ok";

const violations = [];
let refsChecked = 0;
let aliasDecls = 0;
let aliasRefs = 0;
for (const file of listFiles(path.join(root, "src"))) {
  const text = readFileSync(file, "utf8");

  // 本文件里的 namespace 别名表:局部名 → namespace
  const aliases = new Map();
  for (const d of text.matchAll(ALIAS_DECL)) aliases.set(d[1], d[2]);
  for (const d of text.matchAll(ALIAS_DECL_PLAIN)) aliases.set(d[1], d[2]);
  aliasDecls += aliases.size;

  /** 把源码里的一处引用统一成 key 路径;认不出来返回 null。 */
  const refs = [];
  for (const m of text.matchAll(REF)) refs.push({ index: m.index, raw: m[0], keyPath: m[1].slice(1) });
  for (const [local, ns] of aliases) {
    const aliasRe = new RegExp(`\\b${local}(?:\\.value)?\\.([A-Za-z0-9_]+)\\b`, "g");
    for (const m of text.matchAll(aliasRe)) {
      const keyPath = `${ns}.${m[1]}`;
      if (interpolated.has(keyPath)) aliasRefs++;
      refs.push({ index: m.index, raw: m[0], keyPath });
    }
  }
  refs.sort((a, b) => a.index - b.index);

  for (const m of refs) {
    const keyPath = m.keyPath;
    if (!interpolated.has(keyPath)) continue;
    refsChecked++;
    // 判「占位符有没有被处理掉」。三种合法形态(实测工程里都在用,不是只有 fmt):
    //  (a) fmt(t.value.x.y, {...})
    //  (b) 紧接着自己处理:t.value.x.y.replace("{n}", …) / .indexOf("{ / .slice(
    //  (c) 先存进局部变量再处理:const tpl = t.value.x.y;  … tpl.replace("{dc}", …)
    // ⚠️ 这是**源码层的代理判据**,真正的不变量是「{x} 不许进 DOM」——
    //    那个只有运行时走查能证。此门的作用是在改 key 形态时当场拦住,不是替代走查。
    let i = m.index - 1;
    while (i >= 0 && /\s/.test(text[i])) i--;
    const before = text.slice(Math.max(0, i - 3), i + 1);
    if (before.endsWith("fmt(")) continue;                                  // (a)
    // (b) 同一表达式里自己处理。允许中间夹 `|| "兜底"`、右括号等
    //     (工程里真实写法:`(t.value.x.y || "{s}s").replace("{s}", …)`),故给 80 字窗口。
    const after = text.slice(m.index + m.raw.length, m.index + m.raw.length + 80);
    if (/\.(replace|indexOf|slice|split)\s*\(/.test(after)) continue;
    // (c) 先存局部变量再处理。`=` 与引用之间可能夹三元(order-detail 就是),故往回找 160 字。
    // ⚠️ 必须取**最近的**那个声明:窗口里常有外层 `const headlineSegs = computed(() => {`,
    //    正则从左匹配会抓到外层名字,然后去找一个不存在的用法 → 误报(踩过)。
    const window160 = text.slice(Math.max(0, m.index - 160), m.index);
    const assigns = [...window160.matchAll(/\b(?:const|let|var)\s+([A-Za-z0-9_]+)\s*=/g)];
    const assign = assigns.length ? assigns[assigns.length - 1] : null;
    if (assign) {                                                           // (c)
      const local = assign[1];
      const rest = text.slice(m.index + m.raw.length);
      const used = new RegExp(`\\b${local}\\b\\s*\\.(replace|indexOf|slice|split)\\s*\\(|fmt\\(\\s*${local}\\b`);
      if (used.test(rest)) continue;
    }
    const lineStart = text.lastIndexOf("\n", m.index) + 1;
    let lineEnd = text.indexOf("\n", m.index);
    if (lineEnd < 0) lineEnd = text.length;
    const line = text.slice(lineStart, lineEnd);
    if (line.includes(ESCAPE)) continue;
    const lineNo = text.slice(0, m.index).split("\n").length;
    violations.push(`${path.relative(root, file)}:${lineNo}  ${m.raw}  → 文案含占位符却未过 fmt()`);
  }
}

// ── 3. 自检的自检:判据本身不能失效 ─────────────────────
// 🔴 「候选为空」必须当失败处理 —— 判据一失效就变成永远绿,踩过多次。
let pass = 0;
let fail = 0;
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
};

check(`扫到带占位符的文案 key(样本 ${interpolated.size} 条)`, interpolated.size > 100, `仅 ${interpolated.size} 条,判据可能失效`);
check(`扫到对这些 key 的引用(样本 ${refsChecked} 处)`, refsChecked > 20, `仅 ${refsChecked} 处,正则可能没匹配上`);
// 🔴 别名面必须真的被扫到。这两条是「空门」探针:独立验收实测过,只认字面 t. 开头时
//    别名引用 30 处全在覆盖外,哨兵全绿而 DOM 真漏。样本掉到 0 = 别名正则失效。
check(`识别到 namespace 别名声明(样本 ${aliasDecls} 处)`, aliasDecls >= 15, `仅 ${aliasDecls} 处,别名正则可能失效`);
check(`经别名引用到带占位符文案(样本 ${aliasRefs} 处)`, aliasRefs >= 10, `仅 ${aliasRefs} 处,别名解析可能失效`);
check(`三语并集取 key(${locales.join("/")},共 ${interpolated.size} 条)`, messagesByLocale.length === 3);
check("🔴 带占位符的文案全部过了 fmt(),没有原样直出 DOM", violations.length === 0,
  "\n        " + violations.slice(0, 12).join("\n        ") + (violations.length > 12 ? `\n        …共 ${violations.length} 处` : ""));

console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);

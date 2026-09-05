#!/usr/bin/env node
// 账户快照三处对象字面量的**字段集一致性**门 — node 直跑:
//   node scripts/selfcheck-snapshot-literals.mjs
//
// 背景(2026-08-04 完全版 A 证伪结论 · 改动③):
//   `AccountCloudSnapshot` 的字段被**三个各自独立的对象字面量**构造,加字段时必须同时改三处:
//     ① `mergeAccountSnapshots` 的返回值(account-cloud.ts)—— 漏了它,每次合并**静默抹掉**
//        那个字段;而且只在 `base && latest` 都在时才走合并,**首写看起来完全正常**,坑会延迟暴露;
//     ② `persistAccountSnapshot` 拼的快照(app.ts)—— 漏了它,每次落盘写出 `undefined`;
//     ③ `createSeedSnapshot`(app.ts)—— 漏了它,新账号该字段归属未定义。
//
//   这三处**没有任何类型检查能兜住**:TS 只管 ① 的返回类型对不对,而 ①② 都是
//   「先取出再拼回」的写法,少一个字段照样过编译(可选字段更是完全无感)。
//
// 🔴 守的不变量:**三处字面量的字段集完全相同**,且等于类型里声明的字段集。
//   判据不是「逐个 grep 某个字段名」—— 那是每加一个字段就要记得加一条 grep,
//   而「忘了加」正是本门要防的那件事。判集合,不判成员。
//
// 方法:结构断言跑在正主源码上;字段集从**对象字面量本身**抠出(不是从类型抠),
// 因为出事的正是字面量与类型脱节。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { strip } from "./lib/strip-code.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cloud = strip(readFileSync(path.join(root, "src", "store", "account-cloud.ts"), "utf8"), true);
const app = strip(readFileSync(path.join(root, "src", "store", "app.ts"), "utf8"), true);

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}

/** 从 `needle` 之后的第一个 `{` 起,按括号配对抠出整块对象字面量原文。
 *  抠不到 = 实现被改名/重写,**直接抛**(不许静默放行 —— 空集会让全称命题恒真)。 */
function objectLiteralAfter(src, needle, who) {
  const at = src.indexOf(needle);
  if (at < 0) throw new Error(`selfcheck-snapshot-literals: 找不到 \`${needle}\`(${who} 被改名或重写?判据已失效,先修判据)`);
  const open = src.indexOf("{", at);
  if (open < 0) throw new Error(`selfcheck-snapshot-literals: \`${needle}\` 之后没有对象字面量`);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) return src.slice(open, i + 1); }
  }
  throw new Error(`selfcheck-snapshot-literals: \`${needle}\` 的对象字面量括号不闭合`);
}

/** 取**顶层**键名(嵌套对象里的键不算)。 */
function topLevelKeys(literal) {
  const keys = [];
  let depth = 0;
  let line = "";
  for (let i = 1; i < literal.length - 1; i++) {
    const c = literal[i];
    if (c === "{" || c === "[" || c === "(") depth++;
    else if (c === "}" || c === "]" || c === ")") depth--;
    if (depth === 0 && (c === "," || c === "\n")) {
      const m = line.match(/^\s*(?:\.\.\.)?\s*([A-Za-z_$][\w$]*)\s*:/) ?? line.match(/^\s*([A-Za-z_$][\w$]*)\s*$/);
      if (m) keys.push(m[1]);
      line = "";
      continue;
    }
    if (depth >= 0) line += c;
  }
  const m = line.match(/^\s*(?:\.\.\.)?\s*([A-Za-z_$][\w$]*)\s*:/) ?? line.match(/^\s*([A-Za-z_$][\w$]*)\s*$/);
  if (m) keys.push(m[1]);
  return [...new Set(keys)].sort();
}

console.log("selfcheck-snapshot-literals — 账户快照三处字面量的字段集必须一致");

const LITERALS = [
  ["mergeAccountSnapshots 的返回值", cloud, "function mergeAccountSnapshots(", "account-cloud.ts"],
  ["persistAccountSnapshot 拼的快照", app, "const snapshot: AccountCloudSnapshot = ", "app.ts"],
  ["createSeedSnapshot 的种子", app, "function createSeedSnapshot(", "app.ts"],
];

const sets = [];
for (const [label, src, needle, file] of LITERALS) {
  // 🔴 `function X(` 之后的第一个 `{` 是**函数体**,不是要找的字面量 —— 得先抠函数体、
  // 再在里面找 `return {`。第一版对 createSeedSnapshot 直接抠,拿到的是函数体,
  // 顶层键一个也认不出来 → 空集。空集本会让「集合相同」这类全称判据恒真,
  // 幸好上面那条「抠得到且 ≥5 个」的守卫当场把它判红了 —— 这就是空集守卫存在的理由。
  const keys = needle.startsWith("function ")
    ? topLevelKeys(objectLiteralAfter(objectLiteralAfter(src, needle, label), "return ", label))
    : topLevelKeys(objectLiteralAfter(src, needle, label));
  sets.push({ label, file, keys });
  // 🔴 空集或过小 = 判据没抠对,不是「字段真的少」。响亮失败,不静默。
  check(`抠得到「${label}」的字段集(${file},${keys.length} 个:${keys.join(",")})`,
    keys.length >= 5, keys.join(",") || "(空集 —— 判据失效)");
}

// ── 核心:三处字段集必须完全相同 ──────────────────────────────────────────────
{
  const [a, b, c] = sets;
  const same = (x, y) => x.length === y.length && x.every((k, i) => k === y[i]);
  const diff = (x, y) => [
    ...x.filter((k) => !y.includes(k)).map((k) => `+${k}`),
    ...y.filter((k) => !x.includes(k)).map((k) => `-${k}`),
  ].join(" ");
  check(`🔴 ① 与 ② 字段集相同(合并 vs 落盘)`, same(a.keys, b.keys), diff(a.keys, b.keys));
  check(`🔴 ① 与 ③ 字段集相同(合并 vs 种子)`, same(a.keys, c.keys), diff(a.keys, c.keys));
}

// ── 与类型声明对齐(字面量与类型脱节同样要报)────────────────────────────────
{
  const typeBlock = cloud.match(/export interface AccountCloudSnapshot \{[\s\S]*?\n\}/)?.[0] ?? "";
  const typeKeys = [...typeBlock.matchAll(/^\s{2}([A-Za-z_$][\w$]*)\??:/gm)].map((m) => m[1]).sort();
  check(`🔴 字面量字段集 = 类型声明字段集(类型 ${typeKeys.length} 个:${typeKeys.join(",")})`,
    typeKeys.length >= 5 && typeKeys.length === sets[0].keys.length && typeKeys.every((k, i) => k === sets[0].keys[i]),
    `类型有而字面量无:${typeKeys.filter((k) => !sets[0].keys.includes(k)).join(",") || "无"} | ` +
    `字面量有而类型无:${sets[0].keys.filter((k) => !typeKeys.includes(k)).join(",") || "无"}`);
}

// ── 红测自证:判据不是空转 ──────────────────────────────────────────────────
{
  // 从任一字面量里摘掉一个字段,三处一致性必须转 false。用内存副本,不碰磁盘。
  const victim = sets[0].keys[sets[0].keys.length - 1];
  const shrunk = sets[0].keys.filter((k) => k !== victim);
  const same = shrunk.length === sets[1].keys.length && shrunk.every((k, i) => k === sets[1].keys[i]);
  check(`红测自证:从①摘掉「${victim}」后与②必须不再相同`, same === false, `摘后仍判相同 = 判据空转`);
}

console.log(`\n${pass} pass / ${fail} fail(样本:3 处字面量 × ${sets[0]?.keys.length ?? 0} 个字段 · 1 处类型声明 · 1 条判据红测自证)`);
process.exit(fail === 0 ? 0 : 1);

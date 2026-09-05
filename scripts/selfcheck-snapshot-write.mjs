#!/usr/bin/env node
// 账户快照**必须无条件写盘**的门 — node 直跑:
//   node scripts/selfcheck-snapshot-write.mjs
//
// 背景(2026-08-04 → 08-05,一次被实测推翻的优化):
//   我在 `mergeAndWriteAccountSnapshotResult` 里加过「内容没变就跳过写盘」的脏检查,
//   理由是「静置 60 秒写了 60 次,一半以上内容一字节没变」。写盘次数确实从 60 降到 40。
//   然后真浏览器实测把它整个推翻:
//
//     真 105KB 账户表:`setItem` 102µs · `JSON.stringify` 74µs
//       → 跳过一次写只省 ~177µs,而能跳的只有 1/3 的拍,折合 **59µs/拍**
//     判据本身(键排序稳定序列化,每次 persist 要跑两遍):**1126µs/拍**
//       → **判据花掉的是它省下的约 19 倍**,tick 循环净变慢 ~70%
//
//   独立证伪另外查出两件事:① 跳过写等于**连内存里的新值一起回退**(`stored = latest`);
//   ② 判据的安全性压在两条没写下来的不变量上 —— 红测把 `todayEarnings` 塞进排除名单,
//   钱当场少算(10 而非 25),而当时全部哨兵照样绿。
//
// 🔴 守的不变量:这条写盘路径上**没有任何条件**。
//   守它的理由不是「跳过写一定错」,而是「跳过写省下的那点钱,远不够付判据的账」——
//   而这件事**只有量了才知道**,靠读代码看不出来。所以门拦的是「没量就凭直觉再走一遍」。
//   真要动:先量「贵在哪」,把数字写进这个文件,再改判据。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { strip } from "./lib/strip-code.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const REL = "src/store/account-cloud.ts";
const src = strip(readFileSync(path.join(root, REL), "utf8"), true);

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}

/** 抠出函数体原文。抠不到 = 被改名/重写,**直接抛** —— 空集会让下面的全称判据恒真。 */
function bodyOf(name) {
  const at = src.indexOf(`export function ${name}(`);
  if (at < 0) throw new Error(`selfcheck-snapshot-write: 找不到 \`${name}\`(被改名或重写?先修判据)`);
  const open = src.indexOf("{", src.indexOf(")", at));
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) return src.slice(open, i + 1); }
  }
  throw new Error(`selfcheck-snapshot-write: \`${name}\` 括号不闭合`);
}

console.log("selfcheck-snapshot-write — 账户快照写盘路径上不许有条件");

const body = bodyOf("mergeAndWriteAccountSnapshotResult");
check(`抠得到函数体(${REL},${body.length} 字符)`, body.length >= 200, `${body.length} 字符 —— 太短,判据可能没抠对`);

// ── ① 写盘那行必须是无条件调用 ────────────────────────────────────────────────
// 允许 `const x = writeAccountSnapshot(merged);`,不允许任何三元 / 短路 / if 包裹。
const writeLines = body.split("\n").filter((l) => l.includes("writeAccountSnapshot("));
check(`写盘调用点唯一(实测 ${writeLines.length} 处)`, writeLines.length === 1, writeLines.join(" | ").trim());
check(
  `🔴 写盘无条件(不含 ?: / && / || / if)`,
  writeLines.length === 1 && /^\s*const\s+\w+\s*=\s*writeAccountSnapshot\([\w.]+\);\s*$/.test(writeLines[0]),
  (writeLines[0] ?? "(无)").trim(),
);

// ── ② 回读那行同样不许有条件(跳过写的老实现是靠这里把内存值回退掉的)────────────
// 🔴 筛选条件只认函数名、**不认赋值形态**:第一版写的是 `/=\s*readAccountSnapshot\(/`,
//   而注入 `const x = skip ? latest : readAccountSnapshot(k)` 之后 `=` 后面跟的是 `skip`,
//   这行直接被筛掉了 —— 剩下的干净行当然全过。**筛样本的正则不能把要抓的形态一起筛掉。**
// 🔴 数量写死:门都在「遍历现存成员」,删掉一处回读没有任何遍历会走到它。
const READBACK_EXPECTED = 2;
const readBackLines = body.split("\n").filter((l) => l.includes("readAccountSnapshot("));
check(`回读调用点 ${READBACK_EXPECTED} 处(实测 ${readBackLines.length} 处)`,
  readBackLines.length === READBACK_EXPECTED,
  `数量对不上 —— 加了就把 EXPECTED 调大并说明用途,少了要写明为什么能删`);
check(`🔴 回读无条件(不含 ?: / && / ||)`,
  readBackLines.length > 0 && readBackLines.every((l) => !/[?]|&&|\|\|/.test(l)),
  readBackLines.filter((l) => /[?]|&&|\|\|/.test(l)).map((l) => l.trim()).join(" | "));

// ── ③ 内容比对类判据不许在本文件复活 ─────────────────────────────────────────
const REVIVED = ["stableJson", "sameAsDisk", "HEARTBEAT_ONLY_KEYS"];
const found = REVIVED.filter((n) => src.includes(n));
check(`🔴 已撤的脏检查判据没复活(查 ${REVIVED.length} 个名字)`, found.length === 0,
  `复活了:${found.join(", ")} —— 要重来先把实测数字写进 scripts/selfcheck-snapshot-write.mjs 顶部`);

// ── 红测自证:每条合取项**各自**注入,不许靠一条红掩护其余 ──────────────────────
{
  const cases = [
    ["写盘加三元", body.replace(/const (\w+) = writeAccountSnapshot\((\w+)\);/, "const $1 = skip ? true : writeAccountSnapshot($2);"),
      (b) => /^\s*const\s+\w+\s*=\s*writeAccountSnapshot\([\w.]+\);\s*$/m.test(b)],
    ["回读加三元", body.replace("const stored = readAccountSnapshot(key);", "const stored = skip ? latest : readAccountSnapshot(key);"),
      (b) => { const ls = b.split("\n").filter((l) => l.includes("readAccountSnapshot(")); return ls.length > 0 && ls.every((l) => !/[?]|&&|\|\|/.test(l)); }],
    ["删掉一处回读", body.replace("const stored = readAccountSnapshot(key);", "const stored = merged;"),
      (b) => b.split("\n").filter((l) => l.includes("readAccountSnapshot(")).length === READBACK_EXPECTED],
  ];
  for (const [label, injected, judge] of cases) {
    check(`红测自证:${label} 后本条必须转 false`, injected !== body && judge(injected) === false,
      injected === body ? "注入没生效 —— 红测本身是空转的" : "注入了却仍判通过 = 判据空转");
  }
  // 判据③单独隔离:名字复活必须被抓到
  check(`红测自证:判据名复活后必须转 false`,
    REVIVED.some((n) => `${src}\nconst ${REVIVED[0]} = 1;`.includes(n)) === true && found.length === 0,
    "复活判据本身失效");
}

console.log(`\n${pass} pass / ${fail} fail(样本:1 个函数体 · ${writeLines.length} 处写盘 · ${readBackLines.length} 处回读 · ${REVIVED.length} 个禁名 · 3 条判据红测自证)`);
process.exit(fail === 0 ? 0 : 1);

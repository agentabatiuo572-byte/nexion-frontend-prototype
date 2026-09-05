#!/usr/bin/env node
// 运行时开关等价性哨兵 —— node scripts/runtime-flag-parity-gate.mjs
//
// 现场(2026-08-12 独立审计 P2-1):`deposits.ts` 有 6 道防资金损失的闸,其中一道挡的是
// 「远端档不许返回本地假充值地址,否则用户把币打到一个没人管的地址,永久丢失」。
// 这 6 道闸写的是 `fundsServerEnabled`,而同文件注释断言它与 `remoteApiEnabled`
// 「是同一个谓词」—— 两者当前确实都是 `mode !== "mock"`,但这条等价**没有任何门守着**。
// 哪天有人收窄其中一个(例如把 fundsServerEnabled 改成 `mode === "remote"`,
// 于是 sandbox 档不再被它挡住),6 道闸静默失效,而所有静态检查全绿。
//
// 🔴 判据构造性:从**真源码**里把两个导出的表达式抠出来逐字比,不维护「它们应该等于什么」
//   的清单 —— 清单会和实现一起漂。抠不出来 = 判据失效 = 判红。
//
// 🔴 这道门不主张「它们必须永远相等」,而是主张「**要拆就得显式拆**」:
//   真需要两个不同的谓词时,改这道门 + 把 deposits.ts 那 6 道闸逐个复核该用哪个,
//   是一次显式动作;而现在这种「悄悄改一个、另一个的消费者跟着塌」不是。
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = readFileSync(path.join(root, "src/api/runtime.ts"), "utf8");

const exprOf = (name) => {
  const m = src.match(new RegExp(`export const ${name}\\s*=\\s*([^;]+);`));
  return m ? m[1].trim() : null;
};

const PAIR = ["remoteApiEnabled", "fundsServerEnabled"];
const exprs = PAIR.map((n) => [n, exprOf(n)]);
const missing = exprs.filter(([, e]) => e === null).map(([n]) => n);
if (missing.length) {
  console.log(`FAIL  在 src/api/runtime.ts 里抠不出这些导出的表达式:${missing.join(", ")} —— 判据失效,判红`);
  process.exit(1);
}

// 消费者基数:抠不到消费者说明这道门在守一个不存在的东西,同样判红。
const deposits = readFileSync(path.join(root, "src/store/deposits.ts"), "utf8");
const guards = (deposits.match(/if \(fundsServerEnabled\) return/g) || []).length;
const MIN_GUARDS = 6;
if (guards < MIN_GUARDS) {
  console.log(`FAIL  deposits.ts 里的 fundsServerEnabled 闸只剩 ${guards} 道(登记 ${MIN_GUARDS} 道)—— 要么闸被删了,要么判据失效,两种都判红`);
  process.exit(1);
}

const [a, b] = exprs.map(([, e]) => e);
if (a !== b) {
  console.log(`FAIL  ${PAIR[0]} 与 ${PAIR[1]} 的定义已经不同:`);
  console.log(`        ${PAIR[0]} = ${a}`);
  console.log(`        ${PAIR[1]} = ${b}`);
  console.log("      deposits.ts 那 6 道防资金损失的闸靠两者等价才成立(注释里写着「是同一个谓词」)。");
  console.log("      真要拆开:逐个复核那 6 道闸该用哪一个,再改本门 —— 别让它们悄悄分叉。");
  process.exit(1);
}

console.log(`runtime-flag-parity PASS —— ${PAIR.join(" ≡ ")} = ${a};下游 ${guards} 道资金闸依赖此等价`);

#!/usr/bin/env node
// 交接书指针门 —— docs/HANDOFF-后端与待接手事项.md 只许是「指针 + 一行式索引」,正文必须住后台仓。
// why:2026-08-08~14 十二条 U-x 正文漂进本文件,还发生 U-4 撞号(与正文 publicStats 条目同号,已重编 U-19)。
//     约定没有门就必漂 —— 门站在写入压力发生的这一侧(这些条目全是本仓的会话写的)。
// 判据(逐条独立,红测记录见 docs/changes/2026-08-14-handoff-single-source-restore.md):
//   1) 表格行单行 ≤ MAX_ROW 字符 —— 正文型条目 500+,一行式索引实测 ≤200;
//   2) 表格行禁含「本文件(新增」—— 历史漂移条目的自我标记;
//   3) 索引里的 U-x/Q-x/E-x 必须能在后台仓正文里找到(指针不许指空);
//   4) 反向:正文加粗表格 ID **U-x** 必须全部出现在索引里(Q-13/E-6 曾这样漏;Q/E 不双向:索引只收用户端相关者);
//      ⚠️ 反向判据依赖「正文表格 ID 加粗」的写法约定,新条目不加粗本门看不见 —— 由正控 5b 兜底最低数量。
//   5) 正控两道:5a 本文件 ID 行数 < MIN_ROWS 判红(表格被清空/改形不许假绿);
//               5b 正文提取到的加粗 U-x < MIN_ADMIN_U 判红(提取机制坏了先修判据,不许顺手当绿)。
// 后台仓缺席(独立 checkout / 临时 worktree)时:3/4/5b 显式 SKIP 并打印原因,1/2/5a 照跑。
// 测试入口:HANDOFF_ADMIN_FILE=<路径> 覆盖正文位置(红测用)。

import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const POINTER = resolve(ROOT, "docs/HANDOFF-后端与待接手事项.md");
const ADMIN =
  process.env.HANDOFF_ADMIN_FILE ||
  resolve(ROOT, "../admin-ops/docs/PRD/HANDOFF-后端与待接手事项_2026-08-07.md");
const MAX_ROW = 300;
const MIN_ROWS = 5;
const MIN_ADMIN_U = 10;

const fails = [];
if (!existsSync(POINTER)) {
  console.error(`FAIL handoff-pointer-gate:指针文件不存在 ${POINTER}(被挪走/改名?门判据要跟着走)`);
  process.exit(1);
}
const text = readFileSync(POINTER, "utf8").replace(/\r\n/g, "\n");
const rows = text.split("\n").filter((l) => l.trimStart().startsWith("|"));
const idRows = rows.filter((l) => /^\|\s*\*{0,2}[UQE]-\d+/.test(l.trimStart()));
if (idRows.length < MIN_ROWS) {
  fails.push(`正控 5a:索引 ID 行只剩 ${idRows.length}(<${MIN_ROWS})—— 表格被清空/改形/挪走,不许当绿`);
}
for (const l of rows) {
  if (l.length > MAX_ROW) fails.push(`行超长 ${l.length}>${MAX_ROW}(疑似把正文写进了指针):${l.slice(0, 50)}…`);
  if (l.includes("本文件(新增")) fails.push(`出现「本文件(新增」(正文条目住进了指针):${l.slice(0, 50)}…`);
}
const ids = [...new Set(idRows.map((l) => l.trimStart().match(/[UQE]-\d+/)[0]))];
let crossNote = "";
if (!existsSync(ADMIN)) {
  crossNote = `;⚠️ 跨仓半边 SKIP(后台仓正文不可达:${ADMIN})—— 只跑了本地判据 1/2/5a`;
} else {
  const admin = readFileSync(ADMIN, "utf8");
  for (const id of ids) {
    if (!new RegExp(`${id}(?!\\d)`).test(admin)) fails.push(`索引有 ${id},正文里找不到它(指针指空)`);
  }
  const adminU = [...new Set([...admin.matchAll(/\*\*(U-\d+)\*\*/g)].map((m) => m[1]))];
  if (adminU.length < MIN_ADMIN_U) {
    fails.push(`正控 5b:正文只提取到 ${adminU.length} 个加粗 U-x(<${MIN_ADMIN_U})—— 加粗约定变了或正文改形,先修判据再谈绿`);
  }
  for (const id of adminU) {
    if (!ids.includes(id)) fails.push(`正文有 ${id},索引缺行(U-x 必须双向镜像;Q-13/E-6 式漏行就是这么来的)`);
  }
  crossNote = `,U-x 双向集合相等(正文加粗 U-x = ${adminU.length} 个)`;
}
if (fails.length) {
  console.error(`FAIL handoff-pointer-gate(${fails.length} 条):`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `PASS handoff-pointer-gate:索引 ${ids.length} 个 ID,${rows.length} 行全部 ≤${MAX_ROW} 字符,无正文标记${crossNote}`
);

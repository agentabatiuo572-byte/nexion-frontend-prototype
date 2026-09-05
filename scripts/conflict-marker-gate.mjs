#!/usr/bin/env node
// 冲突标记哨兵 —— node scripts/conflict-marker-gate.mjs
//
// 现场(2026-08-12 收口会话,同一会话内连犯两次):合并后用 `git add -A` 一把入暂存,
// 而 `git add` 对一个处于 UU 状态的文件的语义是**「标记为已解决」** —— 文件里那三行
// `<<<<<<<` / `=======` / `>>>>>>>` 原样跟着进了提交。三个文件就这么带着标记被提交:
// docs/前端产品更新日志.md · docs/HANDOFF-后端与待接手事项.md · scripts/selfcheck-money-receipt.mjs
//
// 为什么现有的门一个都没拦住:
//   · tsc 只看 .ts/.vue —— .md 和 .mjs 不在它的视野里;
//   · 契约登记门只扫 scripts/*.test.mjs —— selfcheck-*.mjs 不是;
//   · verify.sh 会跑那个 selfcheck,但要跑到才发现,而门链本身是提交之后才跑的。
// 也就是说这一族**天然无人看管**,而代价是「一个门里钉着不存在的符号名」这种假绿。
//
// 🔴 判据构造性,不枚举:扫**全部**被 git 跟踪的文本文件,不维护「哪些类型要查」的清单
//   —— 清单必漏,而漏掉的那类正是下次出事的那类。候选集为 0 时本门自己判红。
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.dirname(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")));

// 行首三种标记。`=======` 单独一行在正常文本里也可能出现(markdown 分隔线),
// 所以它不单独算证据:只有同一文件里同时出现 `<<<<<<< ` 与 `>>>>>>> ` 才判定。
const OPEN = /^<<<<<<< /m;
const CLOSE = /^>>>>>>> /m;

const files = execSync("git ls-files -z", { cwd: root, encoding: "buffer" })
  .toString("utf8")
  .split("\0")
  .filter(Boolean);

if (files.length < 100) {
  console.log(`FAIL  候选集只有 ${files.length} 个文件,不像一次完整的 git ls-files —— 判据失效,判红`);
  process.exit(1);
}

const hits = [];
for (const rel of files) {
  let text;
  try {
    text = readFileSync(path.join(root, rel), "utf8");
  } catch {
    continue; // 二进制 / 读不了的跳过
  }
  if (text.includes("\0")) continue; // 二进制
  if (OPEN.test(text) && CLOSE.test(text)) {
    // 本文件自己会写这两个串(上面的正则源码),按「同一行里带 /^ 」排除自身说明
    if (rel.endsWith("conflict-marker-gate.mjs")) continue;
    const lines = text.split(/\r?\n/);
    const at = lines.map((l, i) => (/^(<<<<<<< |>>>>>>> )/.test(l) ? i + 1 : 0)).filter(Boolean);
    hits.push({ rel, at });
  }
}

if (hits.length) {
  console.log(`FAIL  ${hits.length} 个文件里留着未收的冲突标记(git add 对 UU 文件 = 「标记为已解决」,标记会原样进提交):`);
  for (const h of hits) console.log(`        ${h.rel}  行 ${h.at.join(", ")}`);
  process.exit(1);
}

console.log(`conflict-marker-gate PASS —— 扫 ${files.length} 个被跟踪文件,无残留冲突标记`);

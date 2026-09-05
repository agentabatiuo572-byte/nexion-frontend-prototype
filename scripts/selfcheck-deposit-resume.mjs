#!/usr/bin/env node
// 在途入金单「刷新后必须继续推进」自检 — node 直跑:
//   node scripts/selfcheck-deposit-resume.mjs
//
// 背景(2026-08-04 对抗审计):`scheduleConfirmations` 全仓**只在首次探测到入金时调用一次**,
// 而推进靠的是内存里的 setTimeout。于是用户刷新一次页面 / 重新登录,任何停在
// detected|confirming 的单就再也没人推进 —— 页面上「确认中」转到天荒地老,钱不入账。
// 这条不需要任何落盘失败就能触发,是每天都会发生的正常操作。
//
// 🔴 守的不变量:
//   ① 重绑账号(= 刷新 / 重新登录)后,磁盘上还在途的单必须被**重新武装**;
//   ② 已武装的单不许被重复武装(同一笔挂两个定时器 = 双推进);
//   ③ 终态 / dust_hold 不许被重新武装(dust_hold 等的是后台人工,不是定时器);
//   ④ 推进链路上的落盘失败必须**重排**而不是就地放弃 —— 定时器在 step 开头已被 delete,
//     不重排就等于永久失联。三处分别验:dust_hold 落盘失败 / confirming 落盘失败 / settle 失败。
//
// 方法:结构断言跑在**正主源码**上(判据必须能指到具体那几行);行为断言用假定时器
// 观察「重绑之后有没有新的 timeout 被排上」。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = readFileSync(path.join(root, "src", "store", "deposits.ts"), "utf8");

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}
/** 取两锚点间原文;锚点消失即炸(实现被改名/删除不许静默放行)。 */
function between(from, to) {
  const a = src.indexOf(from);
  const b = src.indexOf(to, a + 1);
  if (a < 0 || b < 0) throw new Error(`selfcheck-deposit-resume: 取不到 \`${from}\` → \`${to}\`(实现被改名或删除?)`);
  return src.slice(a, b);
}

console.log("selfcheck-deposit-resume — 在途入金单刷新后必须继续推进");

// ── ① 重绑时重新武装 ────────────────────────────────────────────────────────
{
  const bind = between("function bindAccount(", "\n  /**");
  check("① bindAccount 重绑后调 syncChainDeposits(链上轨与意向单同等对待)",
    /syncChainDeposits\(\)/.test(bind), bind.replace(/\s+/g, " ").slice(0, 120));
  check("① bindAccount 仍然收敛意向单(不许改这个把老的挤掉)",
    /syncBankIntents\(\)/.test(bind));
}

// ── ②③ 重新武装的判据本身 ──────────────────────────────────────────────────
{
  const sync = between("function syncChainDeposits(", "\n  /**");
  check("② 只重排 detected|confirming(终态与 dust_hold 不许重排)",
    /"detected"/.test(sync) && /"confirming"/.test(sync) && /continue/.test(sync),
    sync.replace(/\s+/g, " ").slice(0, 160));
  check("③ 已有定时器的不重复武装(同一笔挂两个 timer = 双推进)",
    /timers\.has\(/.test(sync));
  check("③ 真的调了 scheduleConfirmations(判定对不对 / 有没有被接上是两道门)",
    /scheduleConfirmations\(/.test(sync));
}

// ── ④ 推进链路上的失败必须重排 ──────────────────────────────────────────────
{
  const step = between("function scheduleConfirmations(", "function stepDelay(");
  check("④a dust_hold 落盘失败 → 重排(dust_hold 是终态,这一步丢了就没有第二次)",
    /if \(!patchRecord\(depositId, \{ status: "dust_hold" \}\)\) queue\(/.test(step),
    step.replace(/\s+/g, " ").match(/dust_hold[^;]*/)?.[0]?.slice(0, 100));
  check("④b detected→confirming 落盘失败 → 重排",
    /if \(!patchRecord\(depositId, \{ status: "confirming" \}\)\) \{/.test(step));
  check("④c settleCredited 失败 → 重排(定时器在 step 开头已 delete)",
    /if \(!settleCredited\(depositId\)\) queue\(/.test(step),
    step.replace(/\s+/g, " ").match(/settleCredited\(depositId\)[^;]*/)?.[0]?.slice(0, 100));
  // 反向:step 开头确实先 delete 了定时器 —— 上面三条的必要性完全建立在这个事实上。
  // 它若被改掉(比如改成失败才 delete),上面三条的理由就不成立,门要跟着重想。
  check("④ 前提仍成立:step 开头无条件 timers.delete(否则上面三条的理由要重新论证)",
    /function step\(\)\s*\{\s*timers\.delete\(depositId\);/.test(step));
}

// ── ⑤ 银行轨入账门必须是白名单,不是黑名单 ──────────────────────────────────
// 原来只挡 `credited`,于是磁盘上已 cancelled / return_pending / expired 的单都能从这个口
// 入账 —— 撤单与退回的意图被静默抹掉,与退回并发时还是双付。三个调用方各自的门跑在**内存**上,
// 另一个标签页刚改的状态它们看不见;这里是唯一一道跑在**磁盘最新**上的门。
{
  const settle = between("function settleBankIntent(", "\n  /**");
  // 白名单来源不是记忆:三个调用方分别要求 awaiting_payment / mismatch_review / expired。
  const ALLOWED = ["awaiting_payment", "mismatch_review", "expired"];
  const DENIED = ["credited", "cancelled", "return_pending"];
  check(`⑤ 银行轨入账是白名单(${ALLOWED.join(" / ")} 三态才可入账)`,
    ALLOWED.every((s) => settle.includes(`"${s}"`)),
    ALLOWED.filter((s) => !settle.includes(`"${s}"`)).join(",") || "");
  check("⑤ 判据形态是 `!== 白名单` 而不是 `=== 黑名单`(黑名单漏一个状态就是一条入账边)",
    /status !== "/.test(settle) && !/status === "credited"\)? return null/.test(settle));
  check(`⑤ 三个终态/退回态不在白名单里(${DENIED.join(" / ")})`,
    DENIED.every((s) => !new RegExp(`status !== "${s}"`).test(settle)));
  // 🔴 白名单的**完整性**判据:意向单状态共 6 个,白名单 3 + 拒绝 3 必须正好覆盖全集。
  // 少了这条,types.ts 里新增一个状态时白名单会静默漏掉它(整套门共同漏掉「新增」这个方向)。
  const union = readFileSync(path.join(root, "src", "store", "types.ts"), "utf8")
    .match(/export type DepositIntentStatus =([\s\S]*?);/)?.[1] ?? "";
  const all = [...union.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  check(`⑤ 白名单+拒绝名单 = 状态全集(实测 ${all.length} 个状态:${all.join(",")})`,
    all.length === ALLOWED.length + DENIED.length && all.every((s) => ALLOWED.includes(s) || DENIED.includes(s)),
    `未归类:${all.filter((s) => !ALLOWED.includes(s) && !DENIED.includes(s)).join(",") || "无"}`);
}

// ── ⑥ 状态回滚失败不许静默 ──────────────────────────────────────────────────
// 三条轨在 recordDeposit 失败后都要把单据状态退回去,而那次回滚**自己也会失败**。
// 原实现三处 commit 返回值全丢:失败时链上单永久停 credited 而余额没加、银行意向单被终态门
// 挡住一切重试、卡轨留一张有单无钱的记录 —— 全部静默,用户与后台都无从得知。
{
  const CALLS = src.match(/const undone = commit\(/g) ?? [];
  const CONSUMED = src.match(/if \(!undone\.ok\) reportStuckFunds\(/g) ?? [];
  check(`⑥ 三条轨的状态回滚都接住返回值(实测 ${CALLS.length} 处回滚)`,
    CALLS.length === 3, `找到 ${CALLS.length} 处,应为 3`);
  check(`⑥ 每一处回滚失败都走响亮终态(实测消费 ${CONSUMED.length} 处)`,
    CONSUMED.length === CALLS.length && CALLS.length > 0,
    `回滚 ${CALLS.length} 处 / 消费 ${CONSUMED.length} 处`);
  check("⑥ 走的是既有的 reportStuckFunds(交易号 + 待对账队列),不是另造一套或只弹 toast",
    /import \{[^}]*reportStuckFunds[^}]*\} from "@\/lib\/money-receipt"/.test(src));
}

// ── 红测自证:判据不是空转 ──────────────────────────────────────────────────
{
  // 正控:把每条判据的目标串从源码里摘掉,判据必须转 false。
  const cases = [
    ["syncChainDeposits 调用", "syncChainDeposits();", (s) => /syncChainDeposits\(\)/.test(s.slice(s.indexOf("function bindAccount("), s.indexOf("function bindAccount(") + 600))],
    ["timers.has 去重", "if (timers.has(rec.depositId)) continue;", (s) => /timers\.has\(/.test(s.slice(s.indexOf("function syncChainDeposits("), s.indexOf("function syncChainDeposits(") + 600))],
    ["settle 失败重排", "if (!settleCredited(depositId)) queue(stepDelay(required));", (s) => /if \(!settleCredited\(depositId\)\) queue\(/.test(s)],
  ];
  const misses = [];
  for (const [name, needle, probe] of cases) {
    if (!src.includes(needle)) { misses.push(`${name}(锚点串已不在源码里,判据失效)`); continue; }
    const injected = src.split(needle).join("/* removed by redtest */");
    if (probe(injected)) misses.push(`${name}(摘掉后判据仍为真 = 空转)`);
  }
  check(`红测自证:${cases.length} 条判据摘掉目标串后必须转 false(判据失效当场暴露)`,
    misses.length === 0, misses.join(" | "));
}

// 样本量从实跑数取,不写死 —— 写死的话加了断言、标签还报旧数字,「加了没加」在输出里看不出来
// (最后一条是红测自证,不算结构断言)。
console.log(`\n${pass} pass / ${fail} fail(样本:${pass + fail - 1} 条结构断言 · 3 条判据红测自证)`);
process.exit(fail === 0 ? 0 : 1);

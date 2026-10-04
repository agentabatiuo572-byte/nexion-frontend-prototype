#!/usr/bin/env node
// 提现分诊的**数据流**门 —— node scripts/selfcheck-withdraw-triage-dataflow.mjs
//
// 🔴🔴 为什么要这道门(2026-08-13 结构性反思的产物,见
//   docs/changes/2026-08-12-triage-gate-structural-reflection.md):
// 同型缺陷连续两轮复发,两轮都是独立审计发现的:
//   v1 —— 门自己重推导规则(两个真理源)→「结果未知也退役键」骗过 32/32;
//   v2 —— 门改为跑真函数,守住了判决的**值域**,却完全没守它的**输入域**
//         →「页面谎报 isReplay: false」骗过 48/48,而且三道门同时全绿。
// 根因是同一个:**判据是静态的(形状 / 字符串匹配),被守的性质是动态的(运行时哪个值流到哪里)**。
// 停在静态层,盲区只会被挪位置,不会消失 —— 逐个补正则必然复发第三次。
//
// 这道门换层:**把 catch 段的真源码跑起来**,注入桩替换它依赖的一切,
// 然后断言「桩收到的上下文是对的」。页面无论怎么改写实参,只要值不对就红。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transformSync } from "esbuild";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const page = readFileSync(path.join(root, "src/pages/me/wallet-withdraw.vue"), "utf8");

// ── 抠出 catch 段的真源码(先证起点:抠错了就判红,不给结论)──────────────
const anchor = page.indexOf("const verdict = triageWithdrawFailure(");
assert.notEqual(anchor, -1, "页面没有调用 triageWithdrawFailure —— 判据失效,判红");
const catchAt = page.lastIndexOf("} catch (err) {", anchor);
assert.notEqual(catchAt, -1, "锚之前找不到 catch 段 —— 判据失效,判红");
const open = page.indexOf("{", catchAt);
let depth = 0, close = -1;
for (let i = open; i < page.length; i++) {
  if (page[i] === "{") depth++;
  else if (page[i] === "}" && --depth === 0) { close = i; break; }
}
assert.notEqual(close, -1, "catch 段大括号不配平 —— 判据失效,判红");
const body = page.slice(open + 1, close);
assert.ok(body.length > 800, `catch 段只抠到 ${body.length} 字符 —— 判据失效,判红`);
for (const marker of ["triageWithdrawFailure(", "verdict.fate", "verdict.refreshPolicy", "switch (verdict.kind)"]) {
  assert.ok(body.includes(marker), `抠出的段里没有 ${marker} —— 抠错了目标,判据失效,判红`);
}

// ── 真判决函数(不打桩:值域由 selfcheck-withdraw-replay-triage 守,这里守输入域)──
const loadTs = (rel, req) => {
  const js = transformSync(readFileSync(path.join(root, rel), "utf8"), { loader: "ts", format: "cjs" }).code;
  const m = { exports: {} };
  new Function("module", "exports", "require", js)(m, m.exports, req ?? (() => { throw new Error("unexpected import"); }));
  return m.exports;
};
const errors = loadTs("src/api/errors.ts");
const realTriage = loadTs("src/lib/withdraw-failure-triage.ts", (id) => {
  if (id === "@/api/errors") return errors;
  throw new Error(`未预期的 import:${id}`);
}).triageWithdrawFailure;

let bad = 0, total = 0;
const check = (name, cond) => {
  total++;
  if (cond) console.log(`  PASS  ${name}`);
  else { bad++; console.log(`  FAIL  ${name}`); }
};

/**
 * 跑一次 catch 段,回收「它到底往判决里喂了什么」以及「它做了什么副作用」。
 * scenario.pending = null 表示首次提交;非 null 表示在重放一笔未收口的尝试。
 */
async function runCatch(scenario) {
  const seen = { ctx: null, forgot: 0, refreshed: 0, toasts: [] };
  const t = new Proxy({}, { get: () => new Proxy({}, { get: (_, k) => `T:${String(k)}` }) });
  const sandbox = {
    err: scenario.err,
    pending: scenario.pending,
    snap: { account: "acct-1" },
    clearSubmitFreeze: () => {},
    geoPolicyUserMessage: () => (scenario.isGeo ? "GEO_TEXT" : null),
    isFundsSandboxStaleRequestError: () => false,
    isDailyLimitRejection: () => scenario.isDailyLimit === true,
    triageWithdrawFailure: (e, ctx) => { seen.ctx = ctx; return realTriage(e, ctx); },
    forgetWithdrawAttempt: () => { seen.forgot++; },
    refreshPendingAttempt: () => {},
    loadWithdrawalPolicy: async () => { seen.refreshed++; },
    toast: { error: (a, b) => seen.toasts.push([a, b]) },
    dailyLimitReachedText: { value: "T:dailyLimitReached" },
    dailyLimitReachedWithPendingText: { value: "T:dailyLimitWithPending" },
    t: { value: t },
    ApiError: errors.ApiError,
  };
  const names = Object.keys(sandbox);
  // catch 段里有 `return`,包成 async 函数直接跑
  const fn = new Function(...names, `return (async () => {\n${body}\n})();`);
  await fn(...names.map((n) => sandbox[n]));
  return seen;
}

const http = (status, message = `HTTP_${status}`) => new errors.ApiError({ kind: "http", message, status });
const PENDING = { key: "k1", amount: 10, network: "trc20", address: "T1", policyVersion: 7, offset: false };

// ── ① 输入域:喂给判决的上下文必须真实反映页面状态 ────────────────────
{
  const r = await runCatch({ err: http(500), pending: PENDING });
  check("🔴 存在未收口尝试时,喂给判决的 isReplay 必须为 true", r.ctx?.isReplay === true);
}
{
  const r = await runCatch({ err: http(500), pending: null });
  check("🔴 不存在未收口尝试时,isReplay 必须为 false", r.ctx?.isReplay === false);
}
{
  const r = await runCatch({ err: http(429, "DAILY_LIMIT_EXCEEDED"), pending: null, isDailyLimit: true });
  check("🔴 页面认出日限时,必须把 isDailyLimit=true 传下去", r.ctx?.isDailyLimit === true);
}
{
  const r = await runCatch({ err: http(500), pending: null, isDailyLimit: false });
  check("认不出日限时传 false", r.ctx?.isDailyLimit === false);
}
{
  const r = await runCatch({ err: http(403), pending: null, isGeo: true });
  check("🔴 页面认出地区拒单时,必须把 isGeo=true 传下去", r.ctx?.isGeo === true);
}

// ── ② 副作用:动作必须与判决一致(不是「代码里写了 if」,是真跑出来的次数)──
const SCENARIOS = [
  ["重放 + 401", { err: new errors.ApiError({ kind: "auth", message: "SESSION_EXPIRED", status: 401 }), pending: PENDING }, 0],
  ["重放 + 403", { err: http(403), pending: PENDING }, 0],
  ["重放 + business", { err: new errors.ApiError({ kind: "business", message: "X" }), pending: PENDING }, 0],
  ["重放 + 409", { err: http(409), pending: PENDING }, 1],
  ["重放 + 超时 504", { err: http(504), pending: PENDING }, 0],
  ["重放 + 日限 429", { err: http(429, "DAILY_LIMIT_EXCEEDED"), pending: PENDING, isDailyLimit: true }, 0],
  ["首次 + 401", { err: new errors.ApiError({ kind: "auth", message: "X", status: 401 }), pending: null }, 1],
  ["首次 + 409", { err: http(409), pending: null }, 1],
  ["首次 + 超时 504", { err: http(504), pending: null }, 0],
  ["首次 + 日限 429", { err: http(429, "DAILY_LIMIT_EXCEEDED"), pending: null, isDailyLimit: true }, 1],
  ["首次 + 5xx 带日限字样", { err: http(500, "DAILY_LIMIT_CHECK_FAILED"), pending: null, isDailyLimit: true }, 0],
];
for (const [name, sc, expectForgot] of SCENARIOS) {
  const r = await runCatch(sc);
  check(`${name} → 退役 ${expectForgot} 次`, r.forgot === expectForgot);
}

// ── ③ 不变量(对新增场景也成立)────────────────────────────────────
const replayForgot = [];
for (const [name, sc] of SCENARIOS.filter(([, s]) => s.pending)) {
  const r = await runCatch(sc);
  if (r.forgot > 0) replayForgot.push(name);
}
check(`🔴 重放路径上退役键的只有 409(实得:${replayForgot.join(" / ") || "无"})`,
  replayForgot.length === 1 && replayForgot[0].includes("409"));
{
  let refreshedOnReplay = 0;
  for (const [, sc] of SCENARIOS.filter(([, s]) => s.pending)) refreshedOnReplay += (await runCatch(sc)).refreshed;
  check("🔴 重放路径上一律不刷费率", refreshedOnReplay === 0);
}
{
  const r = await runCatch({ err: http(504), pending: PENDING });
  check("🔴 每条路径都给了用户一句话(不静默)", r.toasts.length >= 1);
}

const FLOOR = 19;
if (total < FLOOR) {
  console.log(`FAIL  只跑了 ${total} 格,低于登记的 ${FLOOR} 格 —— 靶被删或没执行`);
  process.exit(1);
}
console.log(bad === 0
  ? `triage-dataflow PASS —— ${total}/${total}(真跑 catch 段:输入域 5 格 + 副作用 ${SCENARIOS.length} 格 + 不变量 3 格)`
  : `triage-dataflow FAIL —— ${bad}/${total} 格`);
process.exit(bad === 0 ? 0 : 1);

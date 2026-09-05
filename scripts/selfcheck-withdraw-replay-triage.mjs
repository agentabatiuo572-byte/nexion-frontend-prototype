#!/usr/bin/env node
// 提现失败判决门 —— node scripts/selfcheck-withdraw-replay-triage.mjs
//
// 🔴🔴 v2(2026-08-12 第四轮独立审计之后重写)。v1 有两个致命缺陷,都被实测出来:
//   ① 门在自己内部**重新推导了一遍**判决规则(两个真理源)。于是门与实现分叉时门看不见 ——
//      实测三个必然出事的变异让 v1 32/32 全绿,其中「结果未知也退役键」正是这整套机制
//      存在的唯一理由所要防的那个 bug。
//   ② 两格**构造性恒真**:v1 从 `const isReplay = pending !== null;` 反向抠 catch 段,
//      抠出来的段必然包含 `isReplay`,那格永远不可能失败;另一格的正则方向写反了
//      (钉「未知文案之后不许刷费率」,而真实回归形态是刷在它**之前**)。
//
// v2 的做法:判决已抽成 `src/lib/withdraw-failure-triage.ts` 的纯函数,页面只消费它。
// 本门**加载那个真函数**跑全矩阵(不复制任何规则),再用接线断言钉住「页面确实只消费、不自己判」。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { transformSync } from "esbuild";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

// 真模块:triage 依赖 api/errors,把两份都转译进同一个 CJS 沙箱,不打桩、不复制。
const load = () => {
  const errJs = transformSync(read("src/api/errors.ts"), { loader: "ts", format: "cjs" }).code;
  const errMod = { exports: {} };
  new Function("module", "exports", errJs)(errMod, errMod.exports);
  let triJs = transformSync(read("src/lib/withdraw-failure-triage.ts"), { loader: "ts", format: "cjs" }).code;
  const triMod = { exports: {} };
  new Function("module", "exports", "require", triJs)(triMod, triMod.exports, (id) => {
    if (id === "@/api/errors") return errMod.exports;
    throw new Error(`未预期的 import:${id}`);
  });
  return { ...errMod.exports, ...triMod.exports };
};
const { ApiError, triageWithdrawFailure } = load();
assert.equal(typeof triageWithdrawFailure, "function", "加载不到 triageWithdrawFailure —— 判据失效,判红");

let bad = 0, total = 0;
const check = (name, cond) => {
  total++;
  if (cond) console.log(`  PASS  ${name}`);
  else { bad++; console.log(`  FAIL  ${name}`); }
};

// ── ① 全矩阵行为(跑真函数)────────────────────────────────────────────
const http = (status, message = `HTTP_${status}`) => new ApiError({ kind: "http", message, status });
// [名字, err, 额外上下文, 首次期望 fate, 重放期望 fate]
const CASES = [
  ["409 幂等冲突", http(409), {}, "retire", "retire"],
  ["401 鉴权(边缘层,对上一次零信息量)", new ApiError({ kind: "auth", message: "SESSION_EXPIRED", status: 401 }), {}, "retire", "keep"],
  ["业务拒单", new ApiError({ kind: "business", message: "REVIEW_BLOCKED" }), {}, "retire", "keep"],
  ["403 地区限制", http(403), { isGeo: true }, "retire", "keep"],
  ["403 非地区", http(403), {}, "retire", "keep"],
  ["400 参数错", http(400), {}, "retire", "keep"],
  ["422 不可处理实体", http(422), {}, "retire", "keep"],
  ["404", http(404), {}, "retire", "keep"],
  ["429 通用限流", http(429), {}, "keep", "keep"],
  ["429 + 日限(实测线型)", http(429, "DAILY_LIMIT_EXCEEDED"), { isDailyLimit: true }, "retire", "keep"],
  ["408 请求超时", http(408), {}, "keep", "keep"],
  ["425 太早", http(425), {}, "keep", "keep"],
  ["500", http(500), {}, "keep", "keep"],
  ["502", http(502), {}, "keep", "keep"],
  ["504 网关超时", http(504), {}, "keep", "keep"],
  ["http 无 status", new ApiError({ kind: "http", message: "NO_STATUS" }), {}, "keep", "keep"],
  ["网络断", new ApiError({ kind: "network", message: "NETWORK_UNAVAILABLE" }), {}, "keep", "keep"],
  ["响应读不懂", new ApiError({ kind: "protocol", message: "BAD_RESPONSE" }), {}, "keep", "keep"],
  ["客户端配置错", new ApiError({ kind: "configuration", message: "REMOTE_API_DISABLED_IN_MOCK_MODE" }), {}, "keep", "keep"],
  ["非 ApiError(含沙箱本地前置抛的裸 Error)", new Error("FUNDS_SANDBOX_INSUFFICIENT_BALANCE"), {}, "keep", "keep"],
];
const call = (err, extra, isReplay) =>
  triageWithdrawFailure(err, { isReplay, isDailyLimit: false, isGeo: false, ...extra });
for (const [name, err, extra, first, replay] of CASES) {
  check(`首次 · ${name} → ${first}`, call(err, extra, false).fate === first);
  check(`重放 · ${name} → ${replay}`, call(err, extra, true).fate === replay);
}

// ── ② 不变量(比逐格更强:它们对**新增的格**也成立)──────────────────
const retiredOnReplay = CASES.filter(([, e, x]) => call(e, x, true).fate === "retire").map(([n]) => n);
check(`🔴 重放路径上退役键的只有 409(实得:${retiredOnReplay.join(" / ") || "无"})`,
  retiredOnReplay.length === 1 && retiredOnReplay[0].startsWith("409"));
const unknownKeeps = CASES.filter(([, e, x]) => call(e, x, false).kind === "unknown")
  .every(([, e, x]) => call(e, x, false).fate === "keep" && call(e, x, true).fate === "keep");
check("🔴 判成「结果未知」的一律保留键(首次与重放都是)", unknownKeeps);
const noRefreshOnReplay = CASES.every(([, e, x]) => call(e, x, true).refreshPolicy === false);
check("🔴 重放路径上一律不刷费率(刷了 policyVersion 就变 → 同 key 异 body → 409)", noRefreshOnReplay);
check("🔴 首次撞日限必须退役(否则首提即被锁进重放模式)",
  call(http(429, "DAILY_LIMIT_EXCEEDED"), { isDailyLimit: true }, false).fate === "retire");

// ── ③ 接线:页面只消费判决,不自己判 ────────────────────────────────
const page = read("src/pages/me/wallet-withdraw.vue");
const anchor = page.indexOf("const verdict = triageWithdrawFailure(");
assert.notEqual(anchor, -1, "页面没有调用 triageWithdrawFailure —— 判据失效,判红");
const catchAt = page.lastIndexOf("} catch (err) {", anchor);
assert.notEqual(catchAt, -1, "锚之前找不到 catch 段 —— 判据失效,判红");
const catchSeg = (() => {
  const open = page.indexOf("{", catchAt);
  let depth = 0;
  for (let i = open; i < page.length; i++) {
    if (page[i] === "{") depth++;
    else if (page[i] === "}" && --depth === 0) return page.slice(open, i + 1);
  }
  return "";
})();
assert.ok(catchSeg.length > 800, `catch 段只抠到 ${catchSeg.length} 字符 —— 判据失效,判红`);
// 🔴 这些格**不是**构造性恒真:锚是 `triageWithdrawFailure(`,而下面钉的是别的东西。
check("退役动作只有一处,且由判决门控", (catchSeg.match(/forgetWithdrawAttempt\(/g) || []).length === 1
  && /if \(verdict\.fate === "retire"\)\s*\{[\s\S]*?forgetWithdrawAttempt/.test(catchSeg));
check("刷费率只有一处,且由判决门控", (catchSeg.match(/loadWithdrawalPolicy\(/g) || []).length === 1
  && /if \(verdict\.refreshPolicy\) await loadWithdrawalPolicy/.test(catchSeg));
check("catch 段里不再自己判定局(没有裸的 isSettledRejection / isIdempotencyConflict)",
  !/isSettledRejection\(|isIdempotencyConflict\(/.test(catchSeg));
check("catch 段里不再有裸的早退分支绕开判决(每条 return 都在 switch 之内或判决之后)",
  catchSeg.indexOf("const verdict") < catchSeg.indexOf("return"));

const FLOOR = 45;
if (total < FLOOR) {
  console.log(`FAIL  只跑了 ${total} 格,低于登记的 ${FLOOR} 格 —— 靶被删或没执行`);
  process.exit(1);
}
console.log(bad === 0
  ? `replay-triage PASS —— ${total}/${total}(行为 ${CASES.length * 2} 格 + 不变量 4 格 + 接线 4 格)`
  : `replay-triage FAIL —— ${bad}/${total} 格`);
process.exit(bad === 0 ? 0 : 1);

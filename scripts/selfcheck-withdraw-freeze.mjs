#!/usr/bin/env node
// D5 real-boundary sentinel. The server owns pricing, NEX burn, wallet
// reservation, withdrawal order and ledgers; the App only freezes intent and
// mirrors the canonical response.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pageRaw = readFileSync(path.join(root, "src", "pages", "me", "wallet-withdraw.vue"), "utf8");
const appRaw = readFileSync(path.join(root, "src", "store", "app.ts"), "utf8");
const apiRaw = readFileSync(path.join(root, "src", "api", "withdrawal-api.ts"), "utf8");
const mutationRaw = readFileSync(path.join(root, "src", "lib", "funds-mutation-key.ts"), "utf8");
const strip = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

function grabBlock(source, needle) {
  const start = source.indexOf(needle);
  if (start < 0) throw new Error(`selfcheck-withdraw-freeze: missing ${needle}`);
  let depth = 0;
  for (let index = source.indexOf("{", start); index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`selfcheck-withdraw-freeze: unclosed ${needle}`);
}

let passed = 0;
let failed = 0;
function check(name, condition) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}`);
  }
}

console.log("selfcheck-withdraw-freeze — D5 server-authoritative submission boundary");
const page = strip(pageRaw);
const app = strip(appRaw);
const api = strip(apiRaw);
const mutation = strip(mutationRaw);
const submit = grabBlock(page, "async function handleSubmit()");
const appSubmit = grabBlock(app, "async function submitWithdrawal(");
const snapAt = submit.indexOf("const snap = {");
const firstAwaitAt = submit.indexOf("await ");
const identityAt = submit.indexOf("app.accountKey !== snap.account");
const realSubmitAt = submit.indexOf("await app.submitWithdrawal(");

check("提交意图在首个 await 前冻结", snapAt >= 0 && firstAwaitAt > snapAt);
check("快照包含账号、网络、地址、金额、抵扣意图与 policyVersion；幂等键由持久意图注册表生成",
  ["account:", "network:", "address:", "amount:", "offset:", "policyVersion:"]
    .every((key) => submit.slice(snapAt, snapAt + 900).includes(key))
  // 🔴 幂等键分两轨(2026-08-12 双向分叉合并收口,原判据只认沙箱那一轨):
  //   · 沙箱轨:持久意图注册表(nexgrid-funds-pending-mutations-v1)。它的
  //     normalized() 对 environment !== "SANDBOX" 直接抛 —— **生产档根本用不了它**,
  //     原判据要求生产提交也走它,等于要求一条会抛错的路。
  //   · 生产轨:页面按「账号|网络|金额|地址|抵扣」签名冻结一把键,意图不变则重试沿用
  //     (wallet-withdraw.vue currentIdempotencyKey)。这比「每次现造一把」强得多 ——
  //     现造会让「提交超时 → 用户重试」在服务端眼里变成两个请求 = 第二笔真出账。
  // 两轨都守:沙箱走注册表 · 生产不在 store 内现造键(负向断言钉死那条工厂)。
  && /pendingFundsMutationKey\(mutation\)/.test(appSubmit)
  && /nexgrid-funds-pending-mutations-v1/.test(mutation)
  && !/createProductionFundsRequestKey\(\)/.test(appSubmit));
check("确认后先复核账号/网络/地址，再调用真实提交", identityAt >= 0 && realSubmitAt > identityAt);
check("页面按快照提交 policyVersion 与抵扣意图",
  /submitWithdrawal\(\s*snap\.amount,\s*snap\.network,\s*snap\.address,\s*snap\.fee,\s*snap\.offset,\s*snap\.policyVersion,\s*snap\.idempotencyKey/.test(submit));

// ── 幂等键的一生(2026-08-11 独立审计 P0)──
// 键此前在 handleSubmit 里每次点击现铸 → 超时重试 = 服务端第二张单;catch 又把所有异常
// 一律报成「费率已更新,请重试」,主动把用户推去建那第二张单。三道门各钉一段:
// 铸(不许现铸)→ 存(发请求前落盘)→ 判(结果未知时保留键、不刷费率、不喊重试)。
const readAttemptAt = submit.indexOf("readWithdrawAttempt(");
const rememberAt = submit.indexOf("rememberWithdrawAttempt(");
const catchAt = submit.indexOf("} catch (", realSubmitAt);
const catchTail = catchAt >= 0 ? submit.slice(catchAt) : "";

check("幂等键不在提交函数里现铸(超时重试必须复用同一个键)",
  !/idempotencyKey:[^\n]*(?:Date\.now|Math\.random|randomUUID)/.test(submit));
check("快照优先取落盘的冻结件(重放要与首次逐字节相同,否则同键异 body 撞 409)",
  readAttemptAt >= 0 && snapAt > readAttemptAt && /idempotencyKey:\s*pending\?\./.test(submit));
// 落盘失败必须拒发:写不进去 = 这一次没有重放保护,超时后认不回那个键,用户一重试就是第二张单。
check("未收口的提交尝试在请求发出前落盘,且落盘失败即拒发",
  rememberAt >= 0 && rememberAt < realSubmitAt && /if \(!rememberWithdrawAttempt\(/.test(submit));
// 刷费率只许出现在「服务端已定局拒绝」那一支的**大括号之内**:结果未知时刷它 →
// policyVersion 变 → 重放的 body 跟着变 → 撞「同键异 body → 409 + 安全事件」。
// 🔴 判据必须按大括号配对划界,不能按「另一个标识符出现在第几个字符」—— 后者能被
// 「插在那个标识符前面」整个绕过(本门自己的变异测试抓到的洞)。
// ⚠️ 2026-08-12 重锚:上一版钉的是 `if (isSettledRejection(err)) {` 这行**出现在 catch 段里**,
// 即「页面自己判定局」。判决现已抽成 `src/lib/withdraw-failure-triage.ts` 的纯函数,
// 页面只消费它 —— 那一行按设计消失了。**不变量没丢,而且更强**:
// 退役与刷费率各自只剩一处、且都由判决门控,值域层面的逐格断言由
// `scripts/selfcheck-withdraw-replay-triage.mjs` 跑真函数全矩阵(48 格,含
// 「重放路径上退役键的只有 409」「判成未知的一律留键」「重放一律不刷费率」三条不变量)。
// 本门只钉**接线形状**:页面不许绕过判决自己动手。钉行为落点,不钉某个谓词名。
const retireGated = /if \(verdict\.fate === "retire"\)\s*\{[\s\S]*?forgetWithdrawAttempt\(/.test(catchTail)
  && (catchTail.match(/forgetWithdrawAttempt\(/g) || []).length === 1;
const refreshGated = /if \(verdict\.refreshPolicy\) await loadWithdrawalPolicy\(/.test(catchTail)
  && (catchTail.match(/loadWithdrawalPolicy\(/g) || []).length === 1;

check("失败按结果分层:退役与刷费率都只有一处且由判决门控,页面不自行判定局",
  catchTail.includes("triageWithdrawFailure(")
  && !/isSettledRejection\(|isIdempotencyConflict\(/.test(catchTail)
  && catchTail.includes("withdrawOutcomeUnknown")
  && !catchTail.includes("withdrawFeeStale")
  && retireGated
  && refreshGated);
check("页面提交路径没有本地扣 USDT、烧 NEX 或伪造提现账单",
  !/app\.(?:debitBalance|debitNex)\(/.test(submit)
  && !/bills\.(?:add|addForAccount)\(/.test(submit));
check("policy 只从真实 GET /api/withdrawals/policy 获取且失败置空",
  /withdrawalPolicy\.value\s*=\s*await withdrawalApi\.policy\(\)/.test(page)
  && /withdrawalPolicy\.value\s*=\s*null/.test(page)
  && /method:\s*"GET",\s*path:\s*"\/api\/withdrawals\/policy"/.test(api));
check("POST 只发用户意图与版本，不接受客户端费用金额",
  /method:\s*"POST",\s*path:\s*"\/api\/withdrawals"/.test(api)
  && /body:\s*\{\s*amount,\s*chain,\s*address:\s*targetAddress,\s*policyVersion,\s*useNexFeeOffset\s*\}/.test(api)
  && !/body:\s*\{[^}]*networkConfirmUsd/.test(api));
check("幂等键透传到真实 POST", /idempotencyKey,\s*timeoutMs:\s*30_000/.test(api));
check("响应严格要求服务端费用/NEX/净到账快照与 policyVersion",
  ["networkConfirmUsd", "nexBurned", "feeWaived", "actualFee", "netReceive", "policyVersion", "useNexFeeOffset", "idSource"]
    .every((field) => api.includes(field))
  && /row\.idSource !== "server"/.test(api));
check("App 只镜像服务端 canonical order，不改本地余额桶", /withdrawalApi\.submit\(/.test(appSubmit)
  && /toCanonicalWithdrawal\(submission, address\)/.test(appSubmit)
  && !/(?:debitBalance|debitNex|creditRewardBucketOnce)\(/.test(appSubmit));

console.log(`\n${passed} pass / ${failed} fail`);
process.exit(failed ? 1 : 0);

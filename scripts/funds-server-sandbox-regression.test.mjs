import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { strip } from "./lib/strip-code.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const app = read("src/store/app.ts");
const shell = read("src/App.vue");
const bills = read("src/store/bills.ts");
// 🔴 窗口正则(`[\s\S]{0,N}`)必须跑在**剥注释 + 压空白**的文本上,两步缺一不可 ——
//   两步各自的教训都在本文件实测过(2026-08-14):
//   ① 只在原文上量:窗口正则要求「重绑账号 → 180 字符内清空 records」,一段合法的
//      三行注释插在中间就把窗口撑爆 —— 不变量没坏,测试红了(deposits 那条真实发生);
//   ② 只剥不压:共享 strip() 是**等长填空格**的(保行号偏移是它的设计),字符距离
//      一个都没少,窗口照样爆 —— 修了等于没修(本文件第一版修法就栽在这)。
//   keepStrings=true 是因为下面有断言的靶是字符串字面量(FUNDS_SANDBOX_ACCOUNT_CHANGED),
//   默认模式会把字符串内容抹掉,修一格坏一格。压空白后窗口量的是**代码密度**距离,
//   对注释与排版都免疫;正则里的字面空格仍匹配(压完还是单空格)。
const squeeze = (s) => strip(s, true).replace(/\s+/g, " ");
const deposits = squeeze(read("src/store/deposits.ts"));
const withdraw = read("src/pages/me/wallet-withdraw.vue");
const billPage = read("src/pages/me/wallet-bills.vue");
const walletPage = read("src/pages/me/wallet.vue");
const ledgerProjection = read("src/store/funds-sandbox-ledger.ts");
const cardPane = read("src/components/me/topup-card-form.vue");
const bankPane = read("src/components/me/deposit-bank-pane.vue");
const chainPane = read("src/components/me/deposit-usdt-pane.vue");
const trackingPage = read("src/pages/me/wallet-withdraw-tracking.vue");
const withdrawPage = read("src/pages/me/wallet-withdraw.vue");
const mutationKeys = read("src/lib/funds-mutation-key.ts");
const sandboxBadge = read("src/components/me/funds-sandbox-badge.vue");
const fundsRefresh = squeeze(app.slice(
  app.indexOf("async function refreshFundsSandbox"),
  app.indexOf("function refreshFundsSandboxForAccount"),
));

assert.match(app, /const bootSnapshot = remoteApiEnabled[\s\S]{0,180}\? createServerEmptySnapshot[\s\S]{0,180}: hydrateSnapshotEconomics\(readAccountSnapshot/,
  "server boot must not adopt the legacy local account snapshot");
assert.match(app, /const withdrawals = ref<Withdrawal\[]>\(remoteApiEnabled\s*\?\s*\[\]/,
  "server boot must not hydrate legacy local withdrawals");
assert.match(app, /if \(remoteApiEnabled\)[\s\S]{0,1200}withdrawals\.value = \[\]/,
  "server account rebind must clear the prior subject's withdrawals synchronously");
assert.match(app, /lastCloudSnapshot = createServerEmptySnapshot\(/,
  "server account rebind must replace the local merge base");
assert.match(fundsRefresh, /expectedAccountKey !== accountKey\.value[\s\S]*isCurrentFundsSandboxRequestScope\(expectedScope[\s\S]*withdrawals\.value = \[\]/,
  "a stale or failed account refresh must fail closed without adopting another subject's facts");
assert.match(walletPage, /fundsAuthorityError[\s\S]{0,250}fundsSandboxError/,
  "wallet refresh failure must remain visible instead of falling back to a local balance");
assert.match(walletPage, /<FundsSandboxBadge\b/,
  "the successful sandbox wallet balance must stay visibly labelled");
assert.match(sandboxBadge, /Acceptance Sandbox · source=mock · SANDBOX[\s\S]{0,900}fundsSandboxEvidence/,
  "the label must be derived from the validated server provenance");
// Remote and explicit sandbox balances are both server-owned. The client may
// mirror their readbacks, but it must never apply a second local debit/refund.
assert.match(app, /function applyWithdrawalDebit\([\s\S]{0,400}if \(remoteApiEnabled\) return false/,
  "every remote rail must reject the legacy local shadow debit");
assert.match(app, /function refundFailedWithdrawals\(\)[\s\S]{0,900}if \(fundsServerEnabled\) return \[\]/,
  "every server rail must reject the legacy local shadow refund");
assert.match(app, /function refundFailedWithdrawals\(\)[\s\S]{0,1400}refundWithdrawalDebit\(wd\)/,
  "the principal refund leg must reuse the debit's own reversal path");
assert.match(app, /function creditRewardBucketOnce[\s\S]{0,220}if \(fundsServerEnabled\) return false/,
  "server mode must reject local reward-bucket credits");

// 🔴 同族改档(理由同上面的「扣与退同档」):这三处是**退款/对账的调用方**。
// 若它们停在 fundsServerEnabled 而扣款停在 fundsSandboxEnabled,那么普通 remote 轨上
// 「本地扣了款」却「对账与退款的驱动整条不跑」—— store 层修好的退款调用方够不到。
// 沙箱轨才是服务端整体重投影钱包的那条,本地对账在那条轨上才该让位。
assert.match(shell, /function advanceArrivalAndSettleBill\(\)[\s\S]{0,180}if \(fundsSandboxEnabled\) return/,
  "local arrival/bill reconciliation must yield on the same rail as the debit (sandbox), not on every server mode");
assert.match(shell, /function startArrivalPoll\(\)[\s\S]{0,180}if \(fundsSandboxEnabled\) return/,
  "the local finalizer must yield on the sandbox rail only");

assert.match(bills, /fundsServerEnabled \? \[\] : hydrate\(/,
  "server bills must not hydrate localStorage or seed rows");
assert.match(bills, /adoptFundsSandboxLedger/);
assert.match(ledgerProjection, /balanceAfter: entry\.availableAfter/,
  "server balanceAfter must come from the authoritative sandbox ledger");
assert.match(bills, /if \(fundsServerEnabled\) return false/,
  "local bill persistence must fail closed in server mode");
assert.match(bills, /expectedAccountKey[\s\S]{0,800}FUNDS_SANDBOX_ACCOUNT_CHANGED/,
  "ledger refresh must reject a response after account switching");
assert.match(ledgerProjection, /source: "mock"[\s\S]{0,120}sourceEnvironment: "SANDBOX"/,
  "sandbox ledger rows must remain visibly labelled");
assert.match(billPage, /async function refreshLedger\(\)[\s\S]{0,500}refreshServerLedger\(\)[\s\S]{0,500}onShow\(\(\) => \{ void refreshLedger\(\); \}\)/,
  "the ledger page must re-read the current server authority after refresh or re-entry");
assert.match(billPage, /b\.balanceAfter !== undefined[\s\S]{0,200}runningBalanceLabel\(b\.balanceAfter!/,
  "ledger UI must render the authoritative availableAfter projection");
assert.match(billPage, /<FundsSandboxBadge\b/,
  "the authoritative sandbox ledger must stay visibly labelled");

assert.match(deposits, /serverAccountKey = normalizeAccountKey\(rawAccountKey\)[\s\S]{0,180}records\.value = \[\][\s\S]{0,120}intents\.value = \[\]/,
  "deposit facts must clear synchronously when switching accounts");
assert.match(deposits, /async function refreshFundsSandboxDeposits[\s\S]{0,700}expectedAccountKey !== serverAccountKey/,
  "deposit refresh must reject a stale account response");
assert.doesNotMatch(deposits, /refreshFundsSandboxDeposits\(\)\.catch\(\(\) => undefined\)/,
  "sandbox refresh failures must not be silently converted into local fallback");

assert.match(withdraw, /fundsSandboxEnabled\s*\?\s*\[\{ id: "USDT-BEP20"/,
  "sandbox withdrawal UI must expose only the backend-supported BEP20 network");
assert.match(withdraw, /withdrawalPolicyError/,
  "provider/policy errors must remain visible instead of collapsing to a fake fallback");
assert.match(withdraw, /if \(withdrawalPolicyError\.value\) return withdrawalPolicyError\.value/,
  "the submit blocker must preserve the real policy error");
assert.doesNotMatch(withdraw, /idempotencyKey:\s*`withdrawal:[^`]*(Date\.now|Math\.random)/,
  "a withdrawal retry must not mint a new key from the client clock or PRNG");

assert.match(cardPane, /runRecoverableFundsOperation\(async \(\) =>[\s\S]{0,900}await deposits\.createSandboxTopup\("CARD", usdtAmount\.value, acct\)[\s\S]{0,700}failure: \(reason\)[\s\S]{0,180}phase\.value = "fail"/,
  "card API rejection (401, missing schema, or network loss) must leave 3DS in a retryable failure state");
assert.match(cardPane, /failureReason\.value = reason/,
  "card failures must retain the authority's real reason");
assert.match(bankPane, /expectedAccountKey = dep\.currentAccountKey\(\)[\s\S]{0,180}setTimeout\(\(\) => \{ void completeCreateOrder\(usdt, expectedAccountKey\); \}, 600\)/,
  "VietQR timer must not contain an unobserved async callback");
assert.match(bankPane, /async function completeCreateOrder[\s\S]{0,900}runRecoverableFundsOperation[\s\S]{0,900}failure: \(reason\)[\s\S]{0,300}settled: \(\) => \{ creating\.value = false/,
  "VietQR API rejection must expose the reason and always release loading for retry");
assert.match(deposits, /normalizeAccountKey\(rawExpectedAccountKey\) !== expectedAccountKey[\s\S]{0,150}FUNDS_SANDBOX_ACCOUNT_CHANGED/,
  "delayed top-up intents must not move to a newly bound account before the request starts");

for (const [name, source] of [["card", cardPane], ["VietQR", bankPane], ["Cregis", chainPane]]) {
  assert.doesNotMatch(source, /createSandbox(?:Topup|BankIntent)\([^\n]*(?:Date\.now|Math\.random)/,
    `${name} response-lost retry must not generate a second mutation key`);
}
assert.match(mutationKeys, /accountKey[\s\S]{0,120}environment[\s\S]{0,120}method[\s\S]{0,120}fingerprint/,
  "pending mutation keys must be isolated by account, environment, method and payload");
assert.match(mutationKeys, /generations[\s\S]{0,2500}getOrCreate[\s\S]{0,1800}finishByOrder/,
  "pending mutation keys must survive retry and rotate only after a bound order reaches terminal authority");
assert.match(app, /const mutation: FundsMutationIdentity \| null = fundsSandboxEnabled \?[\s\S]{0,900}: null/,
  "the durable pending registry must be limited to server sandbox commands");
// 🔴 生产侧幂等键改由**调用方冻结后传入**,不在 store 内现造(2026-08-12 合并收口)。
// 原判据要求 store 走 createProductionFundsRequestKey() —— 那个工厂每调一次就新造一把,
// 于是「提交超时 → 用户重试」在服务端眼里是两个互不相干的请求 = **第二笔真出账**。
// 现在的契约更强:页面把键**连同整个请求体**冻结后落盘,重试原样重放。sandbox 轨的持久
// 注册表原样保留。三条断言分别守「沙箱走注册表」「生产走入参、store 内不现造」「页面冻结落盘」。
//
// ⚠️ 2026-08-12 二次重锚:上一版这里钉的是 `submitIntentSig.value !== sig … submitIntentKey.value =`
// —— 那是**内存签名轨**的内部实现,已随本轮收口删除(它与 lib/withdraw-attempt 的落盘轨
// 是同一件事的两套实现,内存那条活不过刷新页面,而「请求在途时刷页面」正是要兜的那一刻)。
// 不变量没变,变的是它落在哪儿,所以**重锚不删门**:改钉「键取自落盘的冻结件」+
// 「落盘发生在请求发出之前」。钉行为落点,不钉某个变量名。
assert.match(app, /if \(fundsSandboxEnabled\)[\s\S]{0,300}pendingFundsMutationKey\(mutation\)/,
  "the sandbox rail must still key its command off the durable pending registry");
assert.doesNotMatch(app, /createProductionFundsRequestKey\(\)/,
  "production commands must not mint a fresh idempotency key inside the store (a retry would become a second payout)");
assert.match(withdrawPage, /idempotencyKey:\s*pending\?\.key\s*\?\?/,
  "the production key must come from the persisted frozen attempt when one exists, so a retry reuses it");
const rememberAt = withdrawPage.indexOf("rememberWithdrawAttempt(");
const submitAt = withdrawPage.indexOf("app.submitWithdrawal(");
assert.notEqual(rememberAt, -1, "找不到 rememberWithdrawAttempt 调用 —— 判据失效,判红");
assert.notEqual(submitAt, -1, "找不到 app.submitWithdrawal 调用 —— 判据失效,判红");
assert.ok(rememberAt < submitAt,
  "the frozen key/body must be persisted BEFORE the request goes out (otherwise a crash mid-flight loses the only way to recognise that attempt)");
assert.match(trackingPage, /<FundsSandboxBadge\b/,
  "terminal and non-terminal sandbox orders must remain visibly labelled");

console.log("funds server sandbox regressions: PASS");

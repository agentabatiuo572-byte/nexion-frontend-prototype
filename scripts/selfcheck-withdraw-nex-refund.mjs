#!/usr/bin/env node
// 失败提现「退还已烧 NEX」冲正分录 — **行为门**,node 直跑:
//   node scripts/selfcheck-withdraw-nex-refund.mjs
//
// 🔴 为什么必须是行为门而不是源码哨兵(2026-08-11 包 z6):
// 本条缺陷的形态**恰恰是「代码存在但链路走不到」** —— 冲正分录的代码一直在 App.vue 里,
// 判据锚在本地幂等键 `refund-nex:<id>` 上,而写那个键的函数:
//   · remote 模式:`creditRewardBucketInternal` 第一行 `if (remoteApiEnabled) return false`;
//   · mock 模式:`apiClient` 恒 reject → 压根建不出提现单。
// 两头落空 = 在**任何真实配置下**都不可达。而 grep「有没有这段代码」是绿的,
// 「有没有生产者」也是绿的 —— 静态哨兵对这一族天然瞎。
// 所以本门载**真 app store + 真 bills store + 真 withdrawalBillDrafts**,
// 从**服务端回执**这一端喂进去,断言账本另一端**真的多出那一行**。
//
// 🔴 `remoteApiEnabled = true`:共用桩 `runtimeStub()` 写死 false(mock),而缺陷正是
// **只在 remote 下**发作。在 mock 下测这条链等于在「本来就好使」的那个模式里自证清白。
// 本门显式把它翻成 true —— 这一条是全门最要紧的一行配置。
//
// 🔴 判据必须**逐层**覆盖(2026-08-11 独立审计后的结构性修正)。这个字段要穿过 4 层:
//    解析 → 落盘合并 → 对账决定 → 分录构造。上一版只在第 4 层设判据,于是审计当场打出三种
//    「改坏了门还全绿」的变异;而前两层里各有一处会**静默吃掉证据**(见 ⑨⑩)。
//    本门现在从服务端回执一路跑到账本行,**中间不许用重写的调用绕过任何一层**。
//
// 覆盖:
//   ① 服务端回执带 nexRefunded → 单据带出来(穿过 parseSubmission + toCanonicalWithdrawal)
//   ② → 真账本里出现 +N NEX 行(走 App.vue ⓪ 抠出来的**真**对账循环,不是本门重写的调用)
//   ③ 负向:没退(0 / 字段缺失)→ **不许**有 +N 行(否则本门是空转的)
//   ④ 负向:退得比烧的多 → 不许有 +N 行(账本不许凭空造 NEX)
//   ⑤ 幂等:补记两次 → 恰好一条 +N、一条 −N(方向判重没把冲正吞掉)
//   ⑥ App.vue ⓪ 的存在性判据**含方向** —— 抠真源码出来跑,丢了方向 +N 永远不会被补写
//   ⑦ 缺陷本体回归:remote 下旧证据源(本地幂等键)确实恒不成立
//   ⑧ **生产时序**:账上已有提交时写的两行、退款事实**后到**,仍补得出 +N
//      (上一版全部用例从空账本起跑,而 `every`/`some` 的差别只在这个前提下才显现)
//   ⑨ **解析层**(喂真 parseSubmission,不走桩):只认 JSON 整数,`true`/`"3"`/`[3]`/小数/负数 → 0
//   ⑩ **落盘合并层**:同状态更新 / 换失败终态 / 另一端回 0,都不许把退款事实丢掉
//   ⑪ **跨包接线**:本仓一旦出现状态回查面,其响应契约必须带 nexRefunded(条件式,空过时打印样本量 0)
//   ⑫ **mock 模式**:本地退款腿退完必须自己写下同一份证据(否则钱退了、账没记上)
//   ⑬ **冲正行的日期**:跟退款时刻走、不跟提交时刻走(2026-08-12)。分五面:
//      主格(服务端给了时刻 → ts 跟它,且与「烧掉」行落在不同月分组;同批其余行不被带跑;
//      `atMs` 不落盘)· b 回落(没给 → 观测此刻,**不许**沿用提交时刻)· c 越界(早于提交 = 当没给)
//      · f 换号后的直写盘路径同样按单条时刻落 · d 解析层 + 咽喉 · e 合并层金额与时刻成对
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { build } from "esbuild";
import { atAliasResolver } from "./lib/at-alias.mjs";
import { VUE_STUB_NXREF, runtimeStub } from "./lib/harness-stubs.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(root, "src");

let pass = 0;
let fail = 0;
/** 条件式判据本轮实际激活了几格(⑪ 的回查面一落地就 +1)。下限按它动,见文件末尾。 */
let conditionalChecks = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}

console.log("selfcheck-withdraw-nex-refund — 失败提现退还 NEX 的冲正分录:链路必须真的走到");

// ── 假 uni storage ──
const disk = new Map();
const uni = {
  getStorageSync(key) { const raw = disk.get(key); return raw === undefined ? "" : JSON.parse(raw); },
  setStorageSync(key, value) { disk.set(key, JSON.stringify(value)); },
  removeStorageSync(key) { disk.delete(key); },
  getSystemInfoSync() { return { language: "en" }; },
};
globalThis.uni = uni;

// 🔴 服务端建单响应的桩。只桩**网络那一层**;parseSubmission / toCanonicalWithdrawal /
// account-cloud / app store / bills store 全是真代码 —— 被测的正是它们。
const HOLD_UNTIL = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
let serverSeq = 0;
/** 当期这一单的服务端回执覆盖项(逐用例改)。 */
let nextOverride = {};
const WORKING_WITHDRAWAL_API = `export const withdrawalApi = {
  policy: async () => { throw new Error("policy 不在本自检范围"); },
  submit: async () => globalThis.__nextSubmission(),
};`;
globalThis.__nextSubmission = () => {
  serverSeq += 1;
  // 费用等式必须自洽,否则 parseSubmission 会先因等式不成立抛协议错 ——
  // 那样本门测的就成了「等式校验」而不是退还字段(假绿的一种)。
  // $50 提现 · 网络费 $1 · 烧 3 NEX 全额抵扣($0.40/NEX,feeWaived 封顶到 $1)。
  const base = {
    withdrawalNo: `WD-NEXREFUND-${serverSeq}`,
    amount: 50, chain: "USDT-TRC20", status: "REJECTED", holdUntil: HOLD_UNTIL,
    networkConfirmUsd: 1, networkFee: 1, penaltyFee: 0, grossFee: 1,
    nexBurned: 3, feeWaived: 1, actualFee: 0, netReceive: 50,
    nexRefunded: 3,
    policyVersion: "nexrefund", useNexFeeOffset: true, riskRoute: "fast-pass", idSource: "server",
  };
  const row = { ...base, ...nextOverride };
  // `undefined` 覆盖 = 老后端**根本没发**这个字段(用例 ③b)。JSON 里不存在与显式 null 不同。
  for (const k of Object.keys(row)) if (row[k] === undefined) delete row[k];
  return row;
};

const baseRuntime = runtimeStub(root);
const DEAD_LINE = "export const withdrawalApi = unavailable;";
if (!baseRuntime.includes(DEAD_LINE)) {
  throw new Error("harness: 运行时桩里找不到 withdrawalApi 的占位导出 —— 桩已失效,禁静默放行");
}
const MOCK_FLAG = "export const remoteApiEnabled = false;";
if (!baseRuntime.includes(MOCK_FLAG)) {
  // 🔴 判据依赖值必须显式 pin:共用桩哪天改了这行(或改了变量名),
  // 本门就会**静默退回 mock 模式**测一条本来就好使的链 —— 那是最坏的假绿。
  throw new Error("harness: 共用桩里找不到 remoteApiEnabled=false —— 无法确认已切到 remote,禁静默放行");
}
const runtimeRemote = baseRuntime
  .replace(MOCK_FLAG, "export const remoteApiEnabled = true;")
  .replace(DEAD_LINE, WORKING_WITHDRAWAL_API);

const STUBS = {
  "pinia-stub": `const cache = new Map();
const unwrap = (v) => (v && typeof v === "object" && v.__nxRef === true);
export const defineStore = (id, setup) => () => {
  if (!cache.has(id)) cache.set(id, new Proxy(setup(), {
    get(t, k) { const v = Reflect.get(t, k); return unwrap(v) ? v.value : v; },
    set(t, k, val) { const v = Reflect.get(t, k); if (unwrap(v)) { v.value = val; return true; } return Reflect.set(t, k, val); },
  }));
  return cache.get(id);
};`,
  "vue-stub": VUE_STUB_NXREF,
  "runtime-stub": runtimeRemote,
};
const bundle = await build({
  stdin: {
    contents: `export { useApp } from "@/store/app";
export { useBills } from "@/store/bills";
export { withdrawalBillDrafts } from "@/lib/withdrawal-bill-drafts";
export { postReceiptForAccount } from "@/lib/money-receipt";
export { remoteApiEnabled } from "@/api/runtime";
export { createWithdrawalApi, toCanonicalWithdrawal } from "@/api/withdrawal-api";
export { mergeAccountSnapshots } from "@/store/account-cloud";`,
    resolveDir: root,
    loader: "ts",
  },
  bundle: true, write: false, format: "esm",
  define: { "import.meta.env": JSON.stringify({ PROD: false, DEV: true, MODE: "selfcheck" }) },
  plugins: [{
    name: "stubs",
    setup(b) {
      b.onResolve({ filter: /^pinia$/ }, () => ({ path: "pinia-stub", namespace: "stub" }));
      b.onResolve({ filter: /^vue$/ }, () => ({ path: "vue-stub", namespace: "stub" }));
      b.onResolve({ filter: /^@\/api\/runtime$/ }, () => ({ path: "runtime-stub", namespace: "stub" }));
      b.onResolve({ filter: /^@\// }, atAliasResolver(SRC, "selfcheck-withdraw-nex-refund"));
      b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: STUBS[a.path], loader: "js" }));
    },
  }],
});
const { useApp, useBills, withdrawalBillDrafts, postReceiptForAccount, remoteApiEnabled,
  createWithdrawalApi, toCanonicalWithdrawal, mergeAccountSnapshots } =
  await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text, "utf8").toString("base64"));

// 🔴 先证明「测的确实是 remote 模式」。这一条挂了,后面每一条的结论都不成立。
check("🔴 ⓪ 本门跑在 **remote** 模式下(缺陷只在这个模式下发作)", remoteApiEnabled === true, String(remoteApiEnabled));

const app = useApp();
const bills = useBills();
const ACCT = "nexrefund@nexgrid.test";
const FEE = { networkConfirmUsd: 1, nexBurned: 3, actualFeeUsd: 0 };

function reset(override = {}) {
  nextOverride = override;
  disk.clear();
  app.bindAccount(ACCT);
  // 🔴 两个 store 各自绑账号,且**不许写成 `bills.bindAccount?.(…)`**:
  // 可选调用在方法改名时会静默变成 no-op,于是 `addManyForAccountOnce` 走「非当前账号」那条路
  // ——分录落到磁盘上另一个账号的行里,`bills.bills` 恒空,而每条断言都只是「账上没有」,
  // 看起来像功能没实现(本门第一版正是这么假红的)。改名就该当场炸。
  bills.bindAccount(ACCT);
}
const submit = () =>
  app.submitWithdrawal(50, "USDT-TRC20", "TXnexrefund000000000000000000000001", FEE, true, "nexrefund", `idem-${serverSeq + 1}`);

/** 该单在**真账本**里的 NEX 行(账本才是用户看到的东西,不是 drafts)。 */
const nexRows = (id) => bills.bills.filter((b) => b.ref === id && b.symbol === "NEX");
const plusNex = (id) => nexRows(id).filter((b) => b.amount > 0);
const minusNex = (id) => nexRows(id).filter((b) => b.amount < 0);
/**
 * App.vue ⓪ 的对账循环 —— **从源码整段抠出来真跑**,不在这里重写一份。
 *
 * 🔴 上一版本门在这里自己写了 `postReceiptForAccount(ACCT, withdrawalBillDrafts(wd), ...)`,
 * 于是**绕过了 ⓪ 真正做决定的那两行**(`has` 谓词 + `drafts.every(has)` 才补写)。
 * 独立审计变异实测:把 `every` 改成 `some`,生产上账本已有提交时写的 USDT− 主行 → 整组跳过
 * → 冲正行永不补写,**缺陷原样复发,而本门连同另外两道门全绿**。
 * 那正是本卡要修的病(代码在、链路走不到)在门里的翻版:门只证到了后半截。
 * 现在把整个 for 循环连同判据一起执行,前半截的「要不要补」也进了射程。
 */
const RECONCILE_SRC = (() => {
  const appVue = readFileSync(path.join(SRC, "App.vue"), "utf8");
  const m = appVue.match(/for \(const wd of app\.withdrawals\) \{[\s\S]*?catch \{[^\n]*\}\r?\n {2}\}/);
  if (!m) throw new Error("harness: 抠不出 App.vue ⓪ 的对账循环 —— 判据失效必红,禁静默放行");
  return m[0].replace(/: ReceiptDraft/g, "");
})();
const runReconcile = new Function(
  "app", "bills", "withdrawalBillDrafts", "postReceiptForAccount", RECONCILE_SRC,
);
/** 跑一次真实对账(等价于轮询打一拍)。 */
const reconcilePost = () => runReconcile(app, bills, withdrawalBillDrafts, postReceiptForAccount);

// ── ① 服务端回执带 nexRefunded → 单据带得出来 ────────────────────────
{
  reset();
  const wd = await submit();
  check("① 服务端说退了 3 NEX → 单据 `nexRefunded` 带出来(穿过 parseSubmission + toCanonicalWithdrawal)",
    wd?.nexRefunded === 3, JSON.stringify({ nexRefunded: wd?.nexRefunded, nexBurned: wd?.fee?.nexBurned }));

  // ── ② → 真账本里出现 +3 NEX 行 ──
  reconcilePost();
  check("🔴 ② remote 模式下账本**真的多出** +3 NEX 冲正行(本卡修的就是这一行永不出现)",
    plusNex(wd.id).length === 1 && plusNex(wd.id)[0].amount === 3,
    JSON.stringify(nexRows(wd.id).map((b) => b.amount)));
  check("② 冲正行用 memoKey 而不是写死英文(切语言不留旧语)",
    plusNex(wd.id)[0]?.memoKey === "withdrawNexRefund", plusNex(wd.id)[0]?.memoKey);
  check("② 烧掉那条 −3 NEX **原样还在**(冲正靠反向分录,不改写原分录)",
    minusNex(wd.id).length === 1 && minusNex(wd.id)[0].amount === -3,
    JSON.stringify(minusNex(wd.id).map((b) => b.amount)));

  // ── ⑤ 幂等:再补一次不许多出行 ──
  reconcilePost();
  reconcilePost();
  check("🔴 ⑤ 补记三次后仍**恰好**一条 +3 与一条 −3(方向判重既不吞冲正也不重复写)",
    plusNex(wd.id).length === 1 && minusNex(wd.id).length === 1,
    JSON.stringify(nexRows(wd.id).map((b) => b.amount)));
}

// ── ③ 负向:没退就不许有冲正行 ──────────────────────────────────────
{
  reset({ nexRefunded: 0 });
  const wd = await submit();
  reconcilePost();
  check("🔴 ③a 服务端说没退(0)→ 账本**不许**有 +N NEX 行(此条挂 = 本门在空转)",
    plusNex(wd.id).length === 0, JSON.stringify(nexRows(wd.id).map((b) => b.amount)));
  check("③a 但烧掉那条 −3 照记不误(烧是既成事实)",
    minusNex(wd.id).length === 1, JSON.stringify(nexRows(wd.id).map((b) => b.amount)));
}
{
  // 老后端**根本没发**这个字段:必须当「没退」读,且**不许抛协议错** ——
  // 抛了就是「后端还没上线该字段 → 整单被拒,而钱已经扣了」(FEAT-WD01 异常6)。
  reset({ nexRefunded: undefined });
  let threw = null;
  let wd = null;
  try { wd = await submit(); } catch (e) { threw = e; }
  check("🔴 ③b 老后端不发该字段 → **不抛协议错**(严格必填会造出「钱扣了却显示失败」)",
    threw === null && !!wd, threw ? String(threw?.message ?? threw) : "no withdrawal");
  if (wd) {
    reconcilePost();
    check("③b 字段缺失读作「没退」→ 无 +N NEX 行", plusNex(wd.id).length === 0,
      JSON.stringify(nexRows(wd.id).map((b) => b.amount)));
  }
}

// ── ④ 负向:退得比烧的多 → 整条不写(不夹到 nexBurned) ──────────────
{
  reset({ nexRefunded: 5 });
  const wd = await submit();
  reconcilePost();
  check("🔴 ④ 退 5 > 烧 3 → **一条冲正也不写**(夹到 3 会拿已知是错的数写一条看着合理的分录)",
    plusNex(wd.id).length === 0, JSON.stringify(nexRows(wd.id).map((b) => b.amount)));
}
{
  // 🔴 **邻界**靶(2026-08-12 独立审计实测:上一版只测 5 vs 3 这一个远点,
  // 于是把上限放松成 `<= nexBurned + 1` 门照样 45/45 全绿 —— 而那意味着烧 3 退 4 会写一条 +4 NEX)。
  // 判据边界只有紧挨着它的那个点测得出来。
  reset({ nexRefunded: 4 });
  const wd = await submit();
  reconcilePost();
  check("🔴 ④ **邻界**:退 4 = 烧 3 + 1 → 仍然一条都不写(只测远点的话上限松一格也全绿)",
    plusNex(wd.id).length === 0, JSON.stringify(nexRows(wd.id).map((b) => b.amount)));
}

// ── ⑥ App.vue ⓪ 的存在性判据必须**含方向** ──────────────────────────
// 抠真源码出来跑,不是 grep 字面量:判据若丢了方向,⓪ 会因为「这单已经有 NEX 行了」
// 而整组跳过 —— 冲正行永远不会被补写,而账本里那条 −N 看着一切正常。
{
  const appVue = readFileSync(path.join(SRC, "App.vue"), "utf8");
  const m = appVue.match(/const has = \(d: ReceiptDraft\) => bills\.bills\.some\(\s*([\s\S]*?),?\s*\);/);
  if (!m) {
    check("⑥ 能从 App.vue 抠出 ⓪ 的存在性判据(抠不到 = 判据已失效,禁静默放行)", false, "regex 未命中");
  } else {
    const predicate = new Function("bills", "wd", "d", `return bills.bills.some(${m[1]});`);
    const ledger = { bills: [{ ref: "WD-X", symbol: "NEX", amount: -3 }] };
    const wdRef = { id: "WD-X" };
    const minusDraft = { symbol: "NEX", amount: -3 };
    const plusDraft = { symbol: "NEX", amount: 3 };
    check("🔴 ⑥ 账上只有 −3 时,判据认为 **+3 还不存在**(丢了方向这里会返回 true → 冲正永不补写)",
      predicate(ledger, wdRef, plusDraft) === false, String(predicate(ledger, wdRef, plusDraft)));
    check("⑥ 反向对照:−3 自己判为已存在(判据没有恒假 —— 恒假会让 ⓪ 每拍重复补写)",
      predicate(ledger, wdRef, minusDraft) === true, String(predicate(ledger, wdRef, minusDraft)));
  }
}

// ── ⑦ 缺陷本体回归:remote 下旧证据源恒不成立 ────────────────────────
// 本卡的根因是「判据锚在一个 remote 下永远不会被写的本地键上」。把那个事实钉成断言:
// 哪天有人把判据挪回本地键,这一条会连同 ② 一起红。
// (只断言 NEX 那一把键;USDT 腿归 z5 包,不在本门射程内。)
{
  reset();
  const wd = await submit();
  app.refundFailedWithdrawals();
  const legacyKey = "refund-nex:" + wd.id;
  check("🔴 ⑦ remote 下旧证据源(本地幂等键)**确实恒不成立** —— 这就是缺陷本体",
    app.user.appliedRewardKeys?.[legacyKey] !== true, JSON.stringify(app.user.appliedRewardKeys ?? {}));
  check("⑦ 而账本里那条 +3 冲正照样在(证据换成了服务端事实,不再依赖那把键)",
    plusNex(wd.id).length === 0 && (reconcilePost(), plusNex(wd.id).length === 1),
    JSON.stringify(nexRows(wd.id).map((b) => b.amount)));
}

// ── ⑧ 🔴 生产时序:账上**已有**提交时写的两行,退款事实**后到** ────────────────
// 这一格是本门最重要的一格,也是上一版**整个漏掉**的那一格。
//
// 真实时序是两拍:① 提现页建单成功当场写 USDT− 主行 + NEX− 抵扣费行(那一刻 nexRefunded=0);
// ② 之后单据失败、服务端退还,`nexRefunded` 才变成 3,由对账补上 +3。
// 上一版所有用例都从**空账本**起跑,于是「已有部分行」这个前提从未出现 ——
// 而 ⓪ 的跳过判据(`drafts.every(has)`)恰恰只在这个前提下才起作用:
// 独立审计变异实测把它改成 `.some(has)`,生产上账本已有主行 → 整组跳过 → 冲正永不补写,
// 而当时本门 15/15 全绿(空账本下 some 与 every 行为相同,测不出差别)。
// 补上这一格之后,那个变异才会判红。
{
  reset({ nexRefunded: 0 });          // 第一拍:服务端还没退
  const wd = await submit();
  reconcilePost();                    // 提现页/对账写下 USDT− 与 NEX−
  const seeded = nexRows(wd.id).length === 1 && minusNex(wd.id).length === 1;
  check("⑧ 前提:第一拍后账上只有 −3(没有冲正行)", seeded,
    JSON.stringify(nexRows(wd.id).map((b) => b.amount)));

  // 第二拍:退款事实到达(状态回查把它 patch 进单据 / 本地退款腿写下证据)
  app.withdrawals = app.withdrawals.map((w) => (w.id === wd.id ? { ...w, nexRefunded: 3 } : w));
  reconcilePost();
  check("🔴 ⑧ 账上已有主行的情况下,后到的退款事实**仍然补得出** +3 NEX",
    plusNex(wd.id).length === 1 && plusNex(wd.id)[0].amount === 3,
    JSON.stringify(nexRows(wd.id).map((b) => b.amount)));
  check("⑧ 且不重复写:再对账两拍仍是一条 +3、一条 −3",
    (reconcilePost(), reconcilePost(),
      plusNex(wd.id).length === 1 && minusNex(wd.id).length === 1),
    JSON.stringify(nexRows(wd.id).map((b) => b.amount)));
}

// ── ⑨ 解析层:喂**真** parseSubmission,不走桩 ────────────────────────────────
// 🔴 上面 ①③b 走的是被替换掉的 `withdrawalApi` 桩,**根本没经过 parseSubmission** ——
// 独立审计实测:桩路径下字段缺失得到 `undefined`,而真解析给的是 `0`。
// 那两条断言的名字写着「穿过 parseSubmission」,实际是空转。这一格补上真解析。
//
// 值域收口的由来:共用的 `number()` 内部是 `Number(value)`,于是 `true→1`、`"3"→3`、`[3]→3`
// 全部通过。后端若发规格 §4.6③ 明确否掉的 boolean 形状,烧 3 退 3 的单会落一条「退回 1 NEX」——
// 账本上那个数指不到任何源。故解析层只认真正的 JSON 整数,其余一律 0(= 没退,安全侧)。
{
  const realApi = createWithdrawalApi({ request: async () => globalThis.__probeRow });
  const baseRow = globalThis.__nextSubmission();
  const parseWith = async (v) => {
    const row = { ...baseRow, withdrawalNo: "WD-PARSE-1" };
    if (v === undefined) delete row.nexRefunded; else row.nexRefunded = v;
    globalThis.__probeRow = row;
    try { return (await realApi.submit(50, "USDT-TRC20", "T", "p", true, "k")).nexRefunded; }
    catch (e) { return `threw:${e?.message ?? e}`; }
  };
  const cases = [[undefined, 0], [null, 0], [true, 0], ["3", 0], [[3], 0], [2.5, 0], [-3, 0], [3, 3], [0, 0]];
  const got = [];
  for (const [input] of cases) got.push(await parseWith(input));
  const okAll = cases.every(([, want], i) => got[i] === want);
  check("🔴 ⑨ 真解析层值域收口:只认 JSON 整数,`true`/`\"3\"`/`[3]`/小数/负数一律读作 0",
    okAll, JSON.stringify(cases.map(([inp], i) => `${JSON.stringify(inp)}→${got[i]}`)));
  check("⑨ 且以上没有任何一种输入会**抛协议错**(严格必填会造出「钱扣了却显示失败」)",
    got.every((g) => typeof g === "number"), JSON.stringify(got));
}

// ── ⑩ 落盘合并层:同状态更新**不许**把退款事实丢掉 ────────────────────────────
// 🔴 独立审计实测:`mergeWithdrawals` 是**整对象**按状态 rank 取胜、平局保留先入的那份,
// 而四个失败终态 rank 相同 —— 「状态没变、只是补了退款事实」这种更新会被整份丢弃,
// 合并后 nexRefunded 变回 0。冲正的唯一判据就是它,丢了等于退款从没发生过,
// 而所有静态门全绿(与本包要修的缺陷同形:证据在半路被吃掉)。
{
  const mk = (over) => ({
    schema: 1, accountKey: ACCT, entrySurface: "h5", updatedAt: Date.now(),
    user: { email: ACCT, earningBuckets: {}, appliedRewardKeys: {} },
    devices: [], earnings: {},
    withdrawals: [{
      id: "WD-MERGE-1", amount: 50, network: "USDT-TRC20", address: "T",
      fee: { networkConfirmUsd: 1, nexBurned: 3, actualFeeUsd: 0 },
      riskRoute: "pass", riskReasons: [], submittedAt: 1, estimatedCompletion: 2,
      ...over,
    }],
  });
  const pick = (snap) => snap.withdrawals[0].nexRefunded ?? 0;
  // 同 rank(两边都是 tx-failed):一边有退款事实、一边没有
  const sameRank = mergeAccountSnapshots(
    mk({ status: "tx-failed" }),
    mk({ status: "tx-failed", nexRefunded: 3 }),
    mk({ status: "tx-failed" }),
  );
  check("🔴 ⑩ 同状态合并**不丢**退款事实(整对象按 rank 取胜会把它整份淘汰)",
    pick(sameRank) === 3, `nexRefunded=${pick(sameRank)}`);
  // 跨失败终态(rank 相同):tx-failed(有) → refunded(无)
  const crossTerminal = mergeAccountSnapshots(
    mk({ status: "tx-failed" }),
    mk({ status: "refunded" }),
    mk({ status: "tx-failed", nexRefunded: 3 }),
  );
  check("🔴 ⑩ 换一个失败终态也不丢(四个失败态 rank 相同,最容易在这里被吃掉)",
    pick(crossTerminal) === 3, `nexRefunded=${pick(crossTerminal)}`);
  // 单调不减:已知 3,另一端回 0 不许把它抹回去
  const regress = mergeAccountSnapshots(
    mk({ status: "tx-failed" }),
    mk({ status: "tx-failed", nexRefunded: 0 }),
    mk({ status: "tx-failed", nexRefunded: 3 }),
  );
  check("🔴 ⑩ 单调不减:另一端回 0 不许把已知的 3 抹掉(规格 §4.6② 单调不减)",
    pick(regress) === 3, `nexRefunded=${pick(regress)}`);
}

// ── ⑪ 跨包接线:退还判据依赖的字段,回查端点必须真的带得回来 ──────────────────
// 🔴 本包一度在注释/规格/交接文档三处写着「回查端点复用 toCanonicalWithdrawal,字段自然跟着走」——
// 独立审计当场证伪:回查端点已在并行包 z7 里写完,有自己的响应类型与解析器,只回 5 个字段,
// **不带 nexRefunded**。两包各自合入主线后,这条冲正照样一次都不会触发。
// 「另一层会配合」是断言不是事实,必须有判据盯着。
// 判据扫的是**本仓自己的 src**,不是隔壁工作树:别的分支没合进来之前不属于本包的交付物,
// 拿它判红会让本分支永远绿不了,而真正该被拦的时刻是**合并之后**。
// 于是判据写成条件式:「本仓一旦有了状态回查面,它就必须带 nexRefunded」。
// 今天本仓没有该面 → 这一格空过(**并显式打印样本量,空过必须看得见**,不许伪装成已覆盖);
// z7 合入主线那一刻,`WithdrawalStatusSnapshot`/`parseStatusSnapshot` 出现而字段没跟上 → 当场判红。
{
  const apiSrcRaw = readFileSync(path.join(SRC, "api", "withdrawal-api.ts"), "utf8");
  // 🔴 **先剥注释再判**(本仓硬规则,与 selfcheck-feegate 同款剥法)。
  // 实测:本文件的注释里就写着「z7 有自己的 WithdrawalStatusSnapshot / parseStatusSnapshot」——
  // 不剥注释的话这段解释文字**自己把判据点亮**,随后因为文件里别处有 nexRefunded 而无条件通过,
  // 于是这一格变成一条永远为真的自证。注释里出现判定式文本不能哄绿。
  const apiSrc = apiSrcRaw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  // 回查面的构造性判据:不枚举具体命名,认「状态快照/回查」这一族的任一形态。
  const hasStatusSurface = /StatusSnapshot|parseStatusSnapshot|status\s*\(\s*withdrawalNo|\/api\/withdrawals\/\$\{|:withdrawalNo/.test(apiSrc);
  if (!hasStatusSurface) {
    console.log("  INFO  ⑪ 本仓尚无提现单状态回查面 → 跨包判据空过(样本量 0)。"
      + "这不是「已覆盖」:回查面落地当轮必须带 nexRefunded,否则本包冲正永远拿不到证据(HANDOFF U-9)。");
    // 顺带把隔壁在写的那版的实情打出来,免得合并时才发现(只报信,不判本分支的红)。
    try {
      const z7 = readFileSync(path.join(root, "..", "z7-withdraw-status", "src", "api", "withdrawal-api.ts"), "utf8");
      console.log(/nexRefunded/.test(z7)
        ? "  INFO  ⑪ 并行包 z7 的回查契约**已带** nexRefunded —— 合并后本格会自动接管。"
        : "  INFO  🔴 ⑪ 并行包 z7 的回查契约**不带** nexRefunded —— 按现状合并后本包冲正不可达(HANDOFF U-9)。");
    } catch { /* 隔壁工作树不在本机:不影响本分支判定 */ }
  } else {
    conditionalChecks += 1; // 这一格本轮真的跑了 → 下限同步 +1,不留白送的余量
    check("🔴 ⑪ 本仓已有状态回查面 → 它的响应契约**必须**带 `nexRefunded`(否则冲正永远拿不到证据)",
      /nexRefunded/.test(apiSrc.split(/interface WithdrawalStatusSnapshot|parseStatusSnapshot/)[1] ?? apiSrc),
      "回查响应里搜不到 nexRefunded —— 冲正判据拿不到证据,见 HANDOFF U-9");
  }
}

// ── ⑫ mock 模式:本地退款腿必须**自己留下退款证据**,否则「钱退了、账没记上」 ────────
// 🔴 为什么要单独建一个 mock 实例:本门主体跑在 remote 下(缺陷发作的那个模式),
// 而 `refundFailedWithdrawals` 里的本地退款腿在 remote 下**恒早退**——
// 也就是说本包给它加的那段「退成功就写 nexRefunded」在主体用例里**一次都执行不到**。
// 不补这一格就等于**把一条没跑过的防线当成修好了**,正是本包结构性反思点名的那个毛病。
//
// 缺陷本身(独立审计发现):mock 下 `creditRewardBucketOnce` 真会把 NEX 加回钱包,
// 而冲正分录的判据已改锚服务端字段 —— mock 永远拿不到 → 钱包退了、账单上一条冲正也没有。
// 两条腿必须同生共死,故本地退款成功时同步写下同一份证据。
{
  const mockBundle = await build({
    stdin: { contents: `export { useApp } from "@/store/app";`, resolveDir: root, loader: "ts" },
    bundle: true, write: false, format: "esm",
    define: { "import.meta.env": JSON.stringify({ PROD: false, DEV: true, MODE: "selfcheck" }) },
    plugins: [{
      name: "stubs-mock",
      setup(b) {
        b.onResolve({ filter: /^pinia$/ }, () => ({ path: "pinia-stub", namespace: "stub" }));
        b.onResolve({ filter: /^vue$/ }, () => ({ path: "vue-stub", namespace: "stub" }));
        // 关键区别:这一份**不翻** remoteApiEnabled,保持共用桩的 false = mock 模式。
        b.onResolve({ filter: /^@\/api\/runtime$/ }, () => ({ path: "runtime-mock", namespace: "stub" }));
        b.onResolve({ filter: /^@\// }, atAliasResolver(SRC, "selfcheck-withdraw-nex-refund"));
        b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({
          contents: a.path === "runtime-mock" ? baseRuntime : STUBS[a.path], loader: "js",
        }));
      },
    }],
  });
  const mockMod = await import("data:text/javascript;base64,"
    + Buffer.from(mockBundle.outputFiles[0].text, "utf8").toString("base64"));
  const mockApp = mockMod.useApp();
  const MACCT = "nexrefund-mock@nexgrid.test";
  disk.clear();
  mockApp.bindAccount(MACCT);
  // mock 建不出单(apiClient 恒 reject),用**水合**造出一张失败的存量单 —— 这正是现实里的来路。
  mockApp.withdrawals = [{
    id: "WD-MOCK-1", amount: 50, network: "USDT-TRC20", address: "T",
    fee: { networkConfirmUsd: 1, nexBurned: 3, actualFeeUsd: 0 },
    status: "tx-failed", riskRoute: "pass", riskReasons: [],
    submittedAt: Date.now() - 3600e3, estimatedCompletion: Date.now(),
  }];
  const nexBefore = mockApp.user.nexBalance;
  const refundT0 = Date.now();
  mockApp.refundFailedWithdrawals();
  const refundT1 = Date.now();
  const after = mockApp.withdrawals.find((w) => w.id === "WD-MOCK-1");
  check("🔴 ⑫ mock 下本地退款腿真的退了 NEX(前提成立,否则下一条无意义)",
    mockApp.user.nexBalance === nexBefore + 3, `${nexBefore} → ${mockApp.user.nexBalance}`);
  check("🔴 ⑫ 退完**同步写下退款证据** `nexRefunded`(否则钱包退了、账单没对手方)",
    after?.nexRefunded === 3, `nexRefunded=${after?.nexRefunded}`);
  // 🔴 证据是**金额 + 时刻**一对:这条腿知道确切答案(退款就发生在此刻),只写金额等于
  // 把日期让给下游去猜(回落到「哪一拍轮询先看到它」),而真值本来就在手上。
  check("🔴 ⑫ 且**同时**写下 `nexRefundedAt`(就是此刻)—— 只写金额 = 日期交给下游去猜",
    typeof after?.nexRefundedAt === "number"
      && after.nexRefundedAt >= refundT0 && after.nexRefundedAt <= refundT1,
    `nexRefundedAt=${after?.nexRefundedAt} 期望区间=[${refundT0}, ${refundT1}]`);

  // ⑫b 🔴 **幂等重放分支**(独立审计 P0):幂等键已在盘时 `creditRewardBucketOnce` 走
  // `adoptAccountSnapshot` + `return true` —— **不加钱**。返回 true 只保证「退过」,不保证「刚刚退的」。
  // 此时若读闭包里那份**进循环之前**的 `wd` 快照,就会把「本次注意到」的时刻当成退款时刻写下,
  // 冲正行落进错的月份且永不自愈 —— 本包要修的缺陷的镜像。
  const OLD_REFUND_AT = Date.parse("2026-07-03T10:00:00.000Z");
  mockApp.withdrawals = [{
    id: "WD-MOCK-2", amount: 50, network: "USDT-TRC20", address: "T",
    fee: { networkConfirmUsd: 1, nexBurned: 3, actualFeeUsd: 0 },
    status: "tx-failed", riskRoute: "pass", riskReasons: [],
    submittedAt: OLD_REFUND_AT - 3600e3, estimatedCompletion: OLD_REFUND_AT,
    // 证据半写:金额那半没落上(模拟当初写盘失败),时刻那半在盘上。
    nexRefunded: 0, nexRefundedAt: OLD_REFUND_AT,
  }];
  mockApp.refundFailedWithdrawals();
  const replayed = mockApp.withdrawals.find((w) => w.id === "WD-MOCK-2");
  check("🔴 ⑫b 重放分支上**已有的退款时刻不许被当前时钟覆盖**(读 stale 快照会把它盖成「本次注意到」)",
    replayed?.nexRefundedAt === OLD_REFUND_AT,
    `nexRefundedAt=${replayed?.nexRefundedAt} 期望=${OLD_REFUND_AT}(= 盘上已有的那个)`);
}

// ── ⑬ 🔴 冲正行的**日期**必须跟退款走,不跟提交走 ──────────────────────────────
// 缺陷:⓪ 用 `postReceiptForAccount(..., wd.submittedAt)` 给**整组**分录盖一个时刻,而这一组里
// 只有 USDT 主行与 NEX 抵扣费行真的发生在提交那一刻;失败退还的 `+N NEX` 是**事后**发生的。
// 后果(账单页按 ts 分月分组):7 月提交、8 月退还的那笔,「退回 N NEX」落进 **7 月**那一组、
// 贴在当初「烧掉 N NEX」那行旁边 —— 用户在 8 月的账单里找不到钱回来的记录,
// 而钱包里的 NEX 确实是 8 月变的,两个口径对不上。
const JULY = Date.parse("2026-07-03T09:00:00.000Z");
const AUGUST = Date.parse("2026-08-05T11:30:00.000Z");

/**
 * 账单页的分月键 —— **从页面源码抠那一行出来跑**,不在门里重写一份口径。
 * (时区、locale、粒度任一处漂移,门与页面就会各说各话 —— 本门 ⑧ 正是栽在「重写一份」上。)
 *
 * 🔴 语言钉死成英文,与页面**当前**取语言的方式解耦。抠出来的表达式里那个「取语言」的调用
 * (2026-08-16 P-096 起是 `dateLocale()`,此前是 `localeTag.value`)由本门注入 ——
 * 本门断言的是**分月粒度**,与显示成哪种语言无关,钉死才可重复。
 * 两个形参都给:页面写哪一种都跑得起来,改名不必跟着改门。
 *
 * 🔴 抠不到 / 跑不起来时**不抛**,回 null 让下面的哨兵值去判红。
 * module 级一抛会把它**后面**十几格断言整片带走 —— 门的输出就只剩一条堆栈,
 * 红测反而看不出是哪一条在守(实测:P-096 改名后本门自 ⑬ 起全部没跑,形同虚设)。
 */
let monthKeyErr = "";
const PINNED_DATE_LOCALE = "en-US";
const monthKeyFn = (() => {
  // 🔴 **先剥注释再判**(本仓硬规则,与本门 ⑪ 同款剥法):注释里出现同形文本会把判据引到
  // 一段不是真在跑的代码上,而抠出来的东西照样能跑、照样全绿。
  const page = readFileSync(path.join(SRC, "pages", "me", "wallet-bills.vue"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  const m = page.match(/const key = d\.toLocaleDateString\(([\s\S]*?)\);/);
  if (!m) { monthKeyErr = "抠不出 wallet-bills 的分月键"; return null; }
  try {
    const fn = new Function("ts", "dateLocale", "localeTag",
      `const d = new Date(ts); return d.toLocaleDateString(${m[1]});`);
    // 构造成功 ≠ 跑得起来:表达式里引用了本门没注入的名字时,`new Function` 不报错,
    // 第一次调用才 ReferenceError。当场试跑一次,把「判据已失效」提前到这里认出来。
    fn(0, () => PINNED_DATE_LOCALE, { value: PINNED_DATE_LOCALE });
    return fn;
  } catch (e) {
    monthKeyErr = `抠出来的分月键跑不起来:${e?.message ?? e}`;
    return null;
  }
})();
/** 失效时回**常量**哨兵:同月同键恒成立、跨月异键恒不成立 ⇒ 依赖它的两格都判红(而不是一格假绿)。 */
const monthOf = (ts) => (monthKeyFn
  ? monthKeyFn(ts, () => PINNED_DATE_LOCALE, { value: PINNED_DATE_LOCALE })
  : `harness-broken(${monthKeyErr})`);
// 🔴 判据自证:分月键必须**恰好是月粒度**。抠错了表达式(比如抓到页面里那个精确到分的
// `fmtTime`)的话,任意两个不同时刻都会得到不同的键 —— 下面那条「落在不同月分组」就变成
// 一条恒真的自证,而冲正行哪怕只差一秒也算「换了月」。两头都钉:同月同键 + 跨月异键。
check("🔴 ⑬ 判据自证:抠出来的分月键**恰好是月粒度**(同月同键、跨月异键)",
  monthOf(AUGUST) === monthOf(AUGUST + 3 * 86400_000) && monthOf(JULY) !== monthOf(AUGUST),
  JSON.stringify({ aug: monthOf(AUGUST), augPlus3d: monthOf(AUGUST + 3 * 86400_000), jul: monthOf(JULY) }));

{
  // 第一拍:7 月提交,服务端还没退 → 账上只有 USDT− 与 NEX−,都该盖提交时刻。
  reset({ nexRefunded: 0 });
  const wd = await submit();
  app.withdrawals = app.withdrawals.map((w) => (w.id === wd.id ? { ...w, submittedAt: JULY } : w));
  reconcilePost();
  const usdtRow = () => bills.bills.find((b) => b.ref === wd.id && b.symbol === "USDT");
  check("⑬ 前提:第一拍(7 月提交、还没退)写下的两行都盖**提交时刻**",
    usdtRow()?.ts === JULY && minusNex(wd.id)[0]?.ts === JULY,
    JSON.stringify({ usdt: usdtRow()?.ts, burn: minusNex(wd.id)[0]?.ts, submittedAt: JULY }));

  // 第二拍:8 月判失败并退还,退款事实带着**自己的时刻**后到。
  app.withdrawals = app.withdrawals.map((w) =>
    (w.id === wd.id ? { ...w, nexRefunded: 3, nexRefundedAt: AUGUST } : w));
  reconcilePost();
  const plus = plusNex(wd.id)[0];
  check("🔴 ⑬ 退款时刻晚于提交 → 冲正行的 ts **跟退款走**(本卡修的就是这一条)",
    plus?.ts === AUGUST, `ts=${plus?.ts} 期望=${AUGUST}`);
  check("🔴 ⑬ 且**不等于**提交时刻 —— 改回 `submittedAt` 这一条必红",
    plus?.ts !== JULY, `ts=${plus?.ts} submittedAt=${JULY}`);
  check("🔴 ⑬ 用户看得见的那一面:冲正行与被它冲正的「烧掉」行落在**不同的月分组**里",
    plus && monthOf(plus.ts) !== monthOf(minusNex(wd.id)[0].ts),
    `退回→${plus && monthOf(plus.ts)} ｜ 烧掉→${monthOf(minusNex(wd.id)[0].ts)}`);
  check("⑬ 同批其余分录不被带跑:USDT 主行与烧掉行**仍**盖提交时刻(整批时刻照旧生效)",
    usdtRow()?.ts === JULY && minusNex(wd.id)[0]?.ts === JULY,
    JSON.stringify({ usdt: usdtRow()?.ts, burn: minusNex(wd.id)[0]?.ts }));
  // 🔴 `atMs` 是**构造期**字段:它决定 ts,自己不该出现在落盘的 Bill 行上。
  // 盘上多一个没人读的键 = 渲染/判重/合并全不认它,却随存量数据长期留存。
  const onDisk = [...disk.values()].join("");
  check("🔴 ⑬ `atMs` 是构造期字段 → **不许落进账单行**(内存与盘上都搜不到这个键)",
    !("atMs" in (plus ?? {})) && !/"atMs"/.test(JSON.stringify(bills.bills)) && !/"atMs"/.test(onDisk),
    JSON.stringify({ inRow: "atMs" in (plus ?? {}), inMemory: /"atMs"/.test(JSON.stringify(bills.bills)), onDisk: /"atMs"/.test(onDisk) }));
}

// ⑬b 回落:拿不到退款时刻(存量单 / 后端还没上该字段)→ 盖**观测此刻**,不许静默沿用提交时刻。
{
  reset({ nexRefunded: 0 });
  const wd = await submit();
  app.withdrawals = app.withdrawals.map((w) =>
    (w.id === wd.id ? { ...w, submittedAt: JULY, nexRefunded: 3 } : w)); // 注意:没有 nexRefundedAt
  const t0 = Date.now();
  reconcilePost();
  const t1 = Date.now();
  const plus = plusNex(wd.id)[0];
  check("🔴 ⑬b 没有 `nexRefundedAt` → 回落到**观测此刻**(区间内),而不是静默沿用提交时刻",
    plus && plus.ts >= t0 && plus.ts <= t1, `ts=${plus?.ts} 期望区间=[${t0}, ${t1}]`);
  check("⑬b 回落值明确 ≠ 提交时刻(沿用 = 本卡的缺陷原样保留)",
    plus?.ts !== JULY, `ts=${plus?.ts} submittedAt=${JULY}`);
}

// ⑬c 服务端给了个**早于提交**的时刻(服务端 bug):当它没给。
// 照单全收会把这一行扔进提交之前 —— 比缺一个准确日期错得更远(同 ④「已知是错的数不拿来写分录」)。
{
  reset({ nexRefunded: 0 });
  const wd = await submit();
  app.withdrawals = app.withdrawals.map((w) => (w.id === wd.id
    ? { ...w, submittedAt: JULY, nexRefunded: 3, nexRefundedAt: JULY - 30 * 86400_000 } : w));
  const t0 = Date.now();
  reconcilePost();
  const plus = plusNex(wd.id)[0];
  check("🔴 ⑬c 退款时刻早于提交(服务端 bug)→ 当它没给,回落此刻;**不许**落在提交之前",
    plus && plus.ts >= t0, `ts=${plus?.ts} submittedAt=${JULY}`);
}

// ⑬c2 🔴 **上界**:退款也不可能发生在未来。五份独立审计各自命中这一条(上一版只卡下界)。
// 后端错发 `2099` 会让这行按 ts 倒序**永久钉在账单首位**、落进一个还没到的月份组,且落盘后永不自愈。
{
  reset({ nexRefunded: 0 });
  const wd = await submit();
  const FUTURE = Date.parse("2099-01-01T00:00:00.000Z");
  app.withdrawals = app.withdrawals.map((w) => (w.id === wd.id
    ? { ...w, submittedAt: JULY, nexRefunded: 3, nexRefundedAt: FUTURE } : w));
  const t0 = Date.now();
  reconcilePost();
  const t1 = Date.now();
  const plus = plusNex(wd.id)[0];
  check("🔴 ⑬c2 退款时刻在**未来** → 当它没给,回落观测此刻(否则该行永久置顶在未来月份组)",
    plus && plus.ts >= t0 && plus.ts <= t1, `ts=${plus?.ts} 服务端给的=${FUTURE}`);
}

// ⑬g 🔴 **共用资金原语**的纵深防御:非法 `atMs` 不许退回整批 ts。
// 整批 ts 在唯一存量调用路径上**就是 `submittedAt`** —— 退回它 = 把本卡要修的缺陷原样放回去。
{
  reset();
  bills.bindAccount(ACCT);
  const t0 = Date.now();
  // 直接喂原语:一条正常跟批、一条带非法 atMs。整批时刻取 JULY(模拟 ⓪ 传 submittedAt)。
  const rows = bills.addMany([
    { type: "withdraw", symbol: "USDT", amount: -1, status: "pending", memo: "x", ref: "WD-PRIM-1" },
    { type: "withdraw", symbol: "NEX", amount: 1, status: "posted", memo: "y", ref: "WD-PRIM-1", atMs: Number.NaN },
  ], JULY);
  const t1 = Date.now();
  check("⑬g 没带 atMs 的那条**跟整批走**(这是正常路径,不是降级)",
    rows?.[0]?.ts === JULY, `ts=${rows?.[0]?.ts} 期望=${JULY}`);
  check("🔴 ⑬g 带**非法** atMs 的那条盖观测此刻,**不退回整批 ts**(整批 ts 就是 submittedAt)",
    rows?.[1] && rows[1].ts >= t0 && rows[1].ts <= t1 && rows[1].ts !== JULY,
    `ts=${rows?.[1]?.ts} 整批=${JULY}`);
  check("⑬g 且非法 atMs 不落进账单行",
    !("atMs" in (rows?.[1] ?? {})) && !/"atMs"/.test(JSON.stringify(bills.bills)),
    JSON.stringify(rows?.[1] ?? {}));
}

// ⑬f 跨账号直写盘那条路 —— **提交期间被换号**时分录写回真正被扣款的那个账号,走的是
// `addManyForAccountOnce` 里另一段代码(不经过 `addMany`)。两段各有一处 `ts` 赋值,
// 只测当前账号那条 = 换号路径可以悄悄漂移回整批时刻,而这一族门全绿(修一处≠修全部)。
{
  reset({ nexRefunded: 0 });
  const wd = await submit();
  app.withdrawals = app.withdrawals.map((w) => (w.id === wd.id
    ? { ...w, submittedAt: JULY, nexRefunded: 3, nexRefundedAt: AUGUST } : w));
  bills.bindAccount("someone-else@nexgrid.test"); // 换号:账单 store 现在装的是别人的视图
  reconcilePost();                                 // ⓪ 仍按 app.accountKey 写回原账号 → 直写盘
  bills.bindAccount(ACCT);                         // 换回来,从**盘上**读这几行
  const plus = plusNex(wd.id)[0];
  check("🔴 ⑬f 换号后的直写盘路径**同样**按单条时刻落 ts(两段实现不许各走各的)",
    plus?.ts === AUGUST, `ts=${plus?.ts} 期望=${AUGUST}(提交时刻=${JULY})`);
  check("⑬f 且同批的烧掉行仍盖提交时刻、`atMs` 同样没落进盘上的行",
    minusNex(wd.id)[0]?.ts === JULY && !/"atMs"/.test([...disk.values()].join("")),
    JSON.stringify({ burn: minusNex(wd.id)[0]?.ts, onDisk: /"atMs"/.test([...disk.values()].join("")) }));
}

// ⑬d 解析层:线上是 ISO-8601 **字符串**,客户端存 epoch ms。喂真 parseSubmission。
// 🔴 不能只靠 `Date.parse`:`Date.parse("3")` 在 V8(node 24)上实测是 **2001-03-01**(本地)—— 后端错发一个裸数字串
// 就能把冲正行扔进 2001 年,而所有静态门全绿(与同批 `Number(true) === 1` 同型)。
{
  const realApi = createWithdrawalApi({ request: async () => globalThis.__probeRow });
  const baseRow = globalThis.__nextSubmission();
  const parseWith = async (v) => {
    const row = { ...baseRow, withdrawalNo: "WD-PARSE-AT" };
    if (v === undefined) delete row.nexRefundedAt; else row.nexRefundedAt = v;
    globalThis.__probeRow = row;
    try { return (await realApi.submit(50, "USDT-TRC20", "T", "p", true, "k")).nexRefundedAt; }
    catch (e) { return `threw:${e?.message ?? e}`; }
  };
  const ISO = "2026-08-05T11:30:00.000Z";
  /** 只到日 = **降级兼容路径**,按**本地正午**解析(不是 Date.parse 的 UTC 午夜)。 */
  const localNoon = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d, 12).getTime(); };
  const cases = [
    [ISO, Date.parse(ISO)],
    ["2026-08-05T11:30:00+07:00", Date.parse("2026-08-05T11:30:00+07:00")], // 越南偏移必须收
    ["2026-08-05", localNoon("2026-08-05")],
    [undefined, undefined], [null, undefined], ["", undefined],
    ["3", undefined],            // 🔴 Date.parse 实测读成 2001-03-01
    ["2026", undefined],         // 同上,读成 2026-01-01
    [AUGUST, undefined],         // 裸 epoch 数字不是契约形状(线上是字符串)
    [true, undefined], ["not-a-date", undefined],
    // 🔴 以下四族是 2026-08-12 独立审计打出来的、上一版**一条都没有**的真实坏值。
    // 上一版用例集只覆盖「明显不像日期」的输入,于是 45/45 全绿而这四族全部放行。
    ["2026-08-05junk", undefined],   // 尾部垃圾:前缀正则放行 → Date.parse 给 2026-06-07(差两个月)
    ["2026-08-05//", undefined],     // 同族:实测给 2026-08-04(差一天,月末即跨月)
    ["2026-08-05\\u0000", undefined],  // 同族:尾巴是转义序列字面量(整串锚定才拦得住)
    ["2026-02-29", undefined],       // 日历进位:实测给 2026-03-01(换月)
    ["2026-06-31", undefined],       // 同上:给 2026-07-01
    ["2026-08-05 11:30:00", undefined], // 空格分隔不是 ISO-8601
  ];
  const got = [];
  for (const [input] of cases) got.push(await parseWith(input));
  check("🔴 ⑬d 真解析层:ISO-8601 → epoch ms;`\"3\"`/`\"2026\"`/裸数字/垃圾/缺失一律读作**没给**",
    cases.every(([, want], i) => got[i] === want),
    JSON.stringify(cases.map(([inp, want], i) => `${JSON.stringify(inp)}→${got[i]}(期望 ${want})`)));
  check("⑬d 且以上没有任何一种输入会**抛协议错**(严格必填会造出「钱扣了却显示失败」)",
    got.every((g) => g === undefined || typeof g === "number"), JSON.stringify(got));

  // 🔴 咽喉:上面证的是**解析层**,而 ⑬ 那几格为了造「退款事实后到」的时序是手工 patch
  // `app.withdrawals` 的 —— 两头都测到了,中间 `toCanonicalWithdrawal` 这一段却没有。
  // 它漏带这个字段的话(z6 修 `nexRefunded` 时踩过同一个坑),线上永远拿不到时刻、
  // 全站回落到观测此刻,而以上每一格照样全绿。这一条把中间那段接上:解析结果 → 单据对象。
  globalThis.__probeRow = { ...baseRow, withdrawalNo: "WD-THROAT-1", nexRefundedAt: ISO };
  const parsed = await realApi.submit(50, "USDT-TRC20", "T", "p", true, "k");
  const canonical = toCanonicalWithdrawal(parsed, "TXthroat00000000000000000000000001");
  check("🔴 ⑬d 咽喉:解析出来的时刻**真的进得了单据对象**(toCanonicalWithdrawal 漏带 = 全站回落)",
    canonical?.nexRefundedAt === Date.parse(ISO),
    `nexRefundedAt=${canonical?.nexRefundedAt} 期望=${Date.parse(ISO)}`);
  check("⑬d 咽喉反向对照:服务端没发时,单据上就是「没有」(不是 0 —— 0 是 1970)",
    (globalThis.__probeRow = { ...baseRow, withdrawalNo: "WD-THROAT-2" },
      toCanonicalWithdrawal(await realApi.submit(50, "USDT-TRC20", "T", "p", true, "k"),
        "TXthroat00000000000000000000000002").nexRefundedAt === undefined),
    "缺失时应为 undefined");
}

// ⑬e 落盘合并层:金额与**发生时刻**是同一件事实的两个面,必须整对取自同一份快照。
// 分开取会拼出一份两端都没有的事实(「退 3 · 无时刻」),冲正行的日期于是丢回观测此刻,
// 而准确日期本来就在被丢弃的那一份里 —— 与 ⑩ 的金额面同一个丢失面。
{
  const mk = (over) => ({
    schema: 1, accountKey: ACCT, entrySurface: "h5", updatedAt: Date.now(),
    user: { email: ACCT, earningBuckets: {}, appliedRewardKeys: {} },
    devices: [], earnings: {},
    withdrawals: [{
      id: "WD-MERGE-AT", amount: 50, network: "USDT-TRC20", address: "T",
      fee: { networkConfirmUsd: 1, nexBurned: 3, actualFeeUsd: 0 },
      riskRoute: "pass", riskReasons: [], submittedAt: JULY, estimatedCompletion: JULY + 1,
      ...over,
    }],
  });
  const at = (snap) => snap.withdrawals[0].nexRefundedAt;
  const amt = (snap) => snap.withdrawals[0].nexRefunded ?? 0;
  // 同 rank:一边有完整的退款事实,另一边什么都没有
  const paired = mergeAccountSnapshots(
    mk({ status: "tx-failed" }),
    mk({ status: "tx-failed" }),
    mk({ status: "tx-failed", nexRefunded: 3, nexRefundedAt: AUGUST }),
  );
  check("🔴 ⑬e 合并:退款**金额与时刻成对**保留(只留金额 = 冲正行日期丢回观测此刻)",
    amt(paired) === 3 && at(paired) === AUGUST, JSON.stringify({ nexRefunded: amt(paired), nexRefundedAt: at(paired) }));
  // 胜出的那份(状态 rank 更靠后)自己没有退款事实 —— 时刻必须从证据那份带过来
  const winnerBlank = mergeAccountSnapshots(
    mk({ status: "tx-failed" }),
    mk({ status: "refunded" }),
    mk({ status: "tx-failed", nexRefunded: 3, nexRefundedAt: AUGUST }),
  );
  check("🔴 ⑬e 胜出方自己没有退款事实时,金额与时刻**都**从证据那份带过来",
    amt(winnerBlank) === 3 && at(winnerBlank) === AUGUST,
    JSON.stringify({ nexRefunded: amt(winnerBlank), nexRefundedAt: at(winnerBlank) }));
  // 🔴 金额**相同**、只有一份带时刻(一端从服务端拿到完整事实、另一端是旧客户端/本地腿写的):
  // 光比金额分不出胜负,得按「哪份更完整」挑 —— 挑错就把已知的准确日期换成了「不知道」,
  // 冲正行回落到观测此刻。红测实测:不补这一条,合并层的取证规则退化成纯比金额也不判红。
  const tieBreak = mergeAccountSnapshots(
    mk({ status: "tx-failed" }),
    mk({ status: "tx-failed", nexRefunded: 3 }),                          // 有金额、无时刻
    mk({ status: "tx-failed", nexRefunded: 3, nexRefundedAt: AUGUST }),   // 完整事实
  );
  check("🔴 ⑬e 金额打平时取**更完整**的那份(带时刻的)—— 否则准确日期被换成「不知道」",
    amt(tieBreak) === 3 && at(tieBreak) === AUGUST,
    JSON.stringify({ nexRefunded: amt(tieBreak), nexRefundedAt: at(tieBreak) }));

  // 🔴 **镜像用例:证据放 `next` 侧**(2026-08-12 独立审计实测,上一版三条全是空转)。
  // 合并循环是 `for (const w of [...latest, ...next])`,四个失败终态 rank 相同 ⇒ **latest 恒为 winner**。
  // 上面三条把证据全放在 latest,于是 `{...winner}` **自带答案** —— 把被测的
  // `nexRefundedAt: refundedAt` 整行删掉,三条照样全过。只有证据在**落败**那一侧才真正考验它。
  const mirrorTie = mergeAccountSnapshots(
    mk({ status: "tx-failed" }),
    mk({ status: "tx-failed", nexRefunded: 3, nexRefundedAt: AUGUST }), // next 侧带证据(落败侧)
    mk({ status: "tx-failed", nexRefunded: 3 }),                        // latest 侧无时刻(胜出侧)
  );
  check("🔴 ⑬e 镜像:证据在**落败侧**时,时刻仍被取过来(上一版三条全在胜出侧 = 空转)",
    amt(mirrorTie) === 3 && at(mirrorTie) === AUGUST,
    JSON.stringify({ nexRefunded: amt(mirrorTie), nexRefundedAt: at(mirrorTie) }));
  const mirrorAmount = mergeAccountSnapshots(
    mk({ status: "tx-failed" }),
    mk({ status: "tx-failed", nexRefunded: 3, nexRefundedAt: AUGUST }), // next 侧金额更大
    mk({ status: "tx-failed", nexRefunded: 0 }),
  );
  check("🔴 ⑬e 镜像:金额也在落败侧更大时,金额与时刻**成对**被取过来",
    amt(mirrorAmount) === 3 && at(mirrorAmount) === AUGUST,
    JSON.stringify({ nexRefunded: amt(mirrorAmount), nexRefundedAt: at(mirrorAmount) }));

  // 🔴 `0` 必须被判成「没有时刻」而不是「有时刻」(独立审计实测:把 `> 0` 放宽成 `>= 0` 门全绿)。
  // 放宽后 0 会在平局分支里冒充「更完整的那份」,顶掉真正带准确日期的一份 → 冲正行回落观测此刻。
  const zeroInstant = mergeAccountSnapshots(
    mk({ status: "tx-failed" }),
    mk({ status: "tx-failed", nexRefunded: 3, nexRefundedAt: AUGUST }),
    mk({ status: "tx-failed", nexRefunded: 3, nexRefundedAt: 0 }),
  );
  check("🔴 ⑬e `nexRefundedAt: 0` 判为**没有时刻**,不许顶掉真正准确的那一份",
    amt(zeroInstant) === 3 && at(zeroInstant) === AUGUST,
    JSON.stringify({ nexRefunded: amt(zeroInstant), nexRefundedAt: at(zeroInstant) }));
  // 🔴 上面这条守的是「`numericRefundedAt` 里的 `> 0`」:放宽成 `>= 0` 后,0 会在平局分支里
  // 冒充「带时刻的那份」并顶掉真正准确的一份 —— 红测实测该变异判红,靠的正是这条用例。
  //
  // 📝 过程留痕(免得下一个人重走):我一度给 `pickRefundEvidence` 加过一个「按消费方谓词排序」的
  // 分支,那时这条变异确实变成良性的(0 在排序阶段就出局),我也据此写了「不该红」的结论。
  // 随后那个分支因 `account-cloud` 必须 value-import-free(SPEC-4 哨兵)而回滚,
  // 于是「不该红」的结论同步作废。**结论会随代码作废,别把某一轮的判断当成永久事实。**
}

// 🔴 样本量当判据:PASS 数少于下限 = 有断言被删/跳过,按红处理(空集全过是哨兵最常见的假绿)。
//
// 🔴 下限**不是手写常量**(2026-08-12 独立审计实测:上一版写死 45,而 ⑪ 是条件式空过 ——
// z7 的回查面一合入,那一格改调 `check()`、总数变 46,于是**可以静默删掉任意一条断言**仍报 45 通过。
// 门里自己写着「留余量 = 允许悄悄删一条」,而我亲手造了一个**会自己长出余量**的结构)。
// 改成:无条件断言数写死,条件式那几格**各自登记**,下限 = 写死数 + 本轮真正激活的条件格数。
const UNCONDITIONAL_MIN = 54;
const MIN_PASS = UNCONDITIONAL_MIN + conditionalChecks;
console.log(`\nselfcheck-withdraw-nex-refund: ${pass} passed, ${fail} failed (min pass ${MIN_PASS})`);
if (fail > 0 || pass < MIN_PASS) {
  console.log(`FAIL — fail=${fail} pass=${pass}(pass 低于 ${MIN_PASS} = 有断言被删或跳过,同样判红)`);
  process.exit(1);
}

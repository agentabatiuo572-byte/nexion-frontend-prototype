#!/usr/bin/env node
// P1 涉钱 / 配额 store 的「乐观并发(CAS)」自检 — node 直跑,不起浏览器:
//   node scripts/selfcheck-money-cas.mjs
//
// 背景(2026-08-04 存量 P1 二期 · 跨标签页竞态双记账):
//   质押(staking)一期把 writeAccountRowCas 立起来之后,同型缺陷还留在五个 store 上
//   (判据见 docs/changes/2026-08-04-staking-cas-redtest.md 的「后续」表):
//     deposits          入金单状态推进 + 到账入账,两端并发推进 = 同一笔充值入账两次
//     voucher           代金券 claim 账本,同一张券两个标签页各领一次
//     nex-faucet        每日签到 / 里程碑 / saver,覆盖式写 = 一天领两次
//     daily-powerup     连胜增益一次性激活,覆盖 = 白送一档
//     lucky-spin        每日免费票 + bonus 票,覆盖 = 一张票抽两次奖
//   H5 端 uni storage 就是 localStorage,同源多标签页共享同一份;全仓又没有任何 storage
//   事件重新水合这些 store —— 窗口不是几毫秒的传播延迟,而是「两个标签页只要都打开过,
//   状态就永久不同步」。而 usdtBalance / nexBalance 在 account-cloud 的 ADDITIVE_NUMBER_KEYS
//   里(按增量三路合并)→ 两次入账都记 = 真·双花。
//
// 🔴 守的不变量(编号对应红测文档 docs/changes/2026-08-04-money-cas-p1.md):
//   ① 变更的前置条件在**磁盘最新状态**上复核 —— 别处已经领走 / 推进过的不再放行,
//      余额 / 计数器只动一次(五个 store 各自的固定靶)。
//   ①b 「读完到写之间被插队」也拦得住 —— rev 版本号 CAS(写前复读挡不住这一格)。
//   ② 正常单标签页路径不受影响(领取 / 入账 / 抽奖 / 占额度照常成交并落盘)。
//   ③ 失败可区分:版本冲突 conflict=true,「本来就不该成交」conflict=false。
//   ④ 向后兼容:writeAccountRow 逐字节没动,未接 CAS 的 store 行为一致。
//   ⑤ 追加型变更冲突时重放到最新列表上,两个标签页各建的单都留得住 + 主键不重号。
//   ⑥ 接线门:五个 store 真的全路径走了 CAS,页面真的接了失败信号(判定对不对 /
//      有没有被接上,是两道门)。
//
// 方法(同 selfcheck-staking-cas.mjs):结构断言跑在**剥注释后的正主源码**上(注释里出现
// 判定式文本不得哄绿);行为断言 esbuild 载**真 store + 真 account-scoped-storage**跑真
// 代码,两个 store 实例 = 两个标签页,共享同一份 JSON 序列化的假 storage(与 localStorage
// 同语义:跨标签页不共享对象引用)。
//
// 🔴 诚实边界:deposits 依赖 app / bills / fx 三个**跨 store 组合方**,它们不是被测对象
// (双花的判据 = 假账本上余额动了几次),故只把这三个换成可观测的假账本;deposits 自身、
// deposits-core、account-scoped-storage 全是真代码。其余五个 store 一个依赖都没 stub。
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { build } from "esbuild";
import { atAliasPlugin, atAliasResolver } from "./lib/at-alias.mjs";
import { VUE_STUB_PLAIN, runtimeStub } from "./lib/harness-stubs.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(root, "src");
const STORE_DIR = path.join(SRC, "store");
const readSrc = (...p) => readFileSync(path.join(root, ...p), "utf8");

// stores:2026-08-11 由 6 降为 5 —— withdraw-daily-count 随 z1 审计 P0-1 删除
// (日限改由提现单列表现算,没有第二份计数状态要防覆盖)。这个数是**报出去的样本量**,
// 少一个 store 就必须跟着降,否则 PASS 行会替一个不存在的被测对象背书。
const samples = { tabs: 2, stores: 5, targetGroups: 0, locales: 3 };
let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}
function group() { samples.targetGroups++; }

/** 行首 // 与块注释一起剥 —— 只剥「整行就是注释」的,不碰 url 里的 //。 */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

console.log("selfcheck-money-cas — P1 涉钱/配额 store 乐观并发 + 跨标签页双记账");

// ── 假 uni storage:JSON 序列化,与 localStorage 同语义(两个标签页拿不到同一个对象引用) ──
const disk = new Map();
/** 一次性插队钩子:模拟「A 读完、还没写」的那一瞬别的标签页抢先写完整一轮。
 *  按表名 + 跳过前 skip 次读定位,比「第 N 次读」稳(不受被测函数里读了几次盘影响)。 */
let interleave = null;
function armInterleave(tableKey, fn, skip = 0) {
  interleave = { tableKey, fn, skip };
}
const uni = {
  getStorageSync(key) {
    const raw = disk.get(key);
    const value = raw === undefined ? "" : JSON.parse(raw);
    if (interleave && interleave.tableKey === key) {
      if (interleave.skip > 0) interleave.skip--;
      else { const fn = interleave.fn; interleave = null; fn(); }
    }
    return value;
  },
  setStorageSync(key, value) { disk.set(key, JSON.stringify(value)); },
};
globalThis.uni = uni;

// ── deposits 的三个跨 store 组合方:换成可观测的假账本(它们不是被测对象) ──
const ledger = { usdt: 0, recordDepositCalls: 0, failRecord: false };
globalThis.__fakeApp = {
  recordDeposit(amount) {
    ledger.recordDepositCalls++;
    if (ledger.failRecord) return false;
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1e9) return false;
    ledger.usdt = +(ledger.usdt + amount).toFixed(2);
    return true;
  },
};
globalThis.__fakeBills = { entries: [], addOnce(b) { this.entries.push(b); } };
globalThis.__fakeFx = { fxAvailable: true, lockWindowMin: 15, quoteRate: 25000 };
function resetLedger() {
  ledger.usdt = 0;
  ledger.recordDepositCalls = 0;
  ledger.failRecord = false;
  globalThis.__fakeBills.entries = [];
}

// ── 载真 store(只 stub pinia/vue 运行时外壳 + deposits 的三个跨 store 组合方) ──
const STUBS = {
  "pinia-stub": `export const defineStore = (_id, setup) => setup;`,
  "vue-stub": VUE_STUB_PLAIN,
  "runtime-stub": runtimeStub(root),
  "app-stub": `export const useApp = () => globalThis.__fakeApp;`,
  "bills-stub": `export const useBills = () => globalThis.__fakeBills;`,
  "fx-stub": `export const useFx = () => globalThis.__fakeFx;`,
};
const CROSS_STORE_STUBS = [
  [/^\.\/app$/, "app-stub"],
  [/^\.\/bills$/, "bills-stub"],
  [/^\.\/fx$/, "fx-stub"],
];

async function loadStore(rel) {
  const out = await build({
    entryPoints: [path.join(STORE_DIR, rel)],
    bundle: true, write: false, format: "esm",
    define: { "import.meta.env.PROD": "false" },
    plugins: [{
      name: "stubs",
      setup(b) {
        b.onResolve({ filter: /^pinia$/ }, () => ({ path: "pinia-stub", namespace: "stub" }));
        b.onResolve({ filter: /^vue$/ }, () => ({ path: "vue-stub", namespace: "stub" }));
        b.onResolve({ filter: /^@\/api\/runtime$/ }, () => ({ path: "runtime-stub", namespace: "stub" }));
        for (const [filter, stub] of CROSS_STORE_STUBS) {
          b.onResolve({ filter }, () => ({ path: stub, namespace: "stub" }));
        }
        b.onResolve({ filter: /^@\// }, atAliasResolver(SRC, "selfcheck-money-cas"));
        b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: STUBS[a.path], loader: "js" }));
      },
    }],
  });
  return import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text, "utf8").toString("base64"));
}

const { useDeposits } = await loadStore("deposits.ts");
const { useVoucher } = await loadStore("voucher.ts");
const { useNexFaucet } = await loadStore("nex-faucet.ts");
const { useDailyPowerUp } = await loadStore("daily-powerup.ts");
const { useLuckySpin } = await loadStore("lucky-spin.ts");
const { readAccountRow, writeAccountRow, writeAccountRowCas, accountRowRev } =
  await loadStore("account-scoped-storage.ts");
const { listVouchers, isVoucherValid } = await import(
  "data:text/javascript;base64," + Buffer.from(
    (await build({
      entryPoints: [path.join(SRC, "mock", "vouchers.ts")],
      bundle: true, write: false, format: "esm",
      define: { "import.meta.env.PROD": "false" },
      plugins: [atAliasPlugin(SRC, "selfcheck-money-cas/vouchers")],
    })).outputFiles[0].text, "utf8").toString("base64")
);

const ACCT = "tab-race@nexgrid.test";
const KEYS = {
  deposits: "nexgrid-deposits-accounts-v1",
  voucher: "nexgrid-voucher-accounts-v1",
  faucet: "nexgrid-nex-faucet-accounts-v1",
  powerup: "nexgrid-daily-powerup-accounts-v1",
  spin: "nexgrid-lucky-spin-accounts-v1",
};

/** 用**老调用方**写盘(不带 rev)= 真实存量行的形态,顺便证明老行能被 CAS 直接接管。 */
function seed(tableKey, row) {
  disk.clear();
  resetLedger();
  writeAccountRow(tableKey, ACCT, row);
}
function diskRow(tableKey) {
  return readAccountRow(tableKey, ACCT);
}
function diskRev(tableKey) {
  return accountRowRev(readAccountRow(tableKey, ACCT));
}
/** 开一个「标签页」:独立 store 实例,共享同一份 storage。 */
function openTab(useStore) {
  const s = useStore();
  s.bindAccount(ACCT);
  return s;
}

// ══════════════ ① deposits:同一笔入金单被两端各推一次 → 只入账一次 ══════════════
group();
{
  // dust_hold 人工核销(后台动作形态)—— 状态推进 + 入账合在一起的那条边。
  const rec = {
    depositId: "DP-20260804-0001", channel: "usdt-trc20", grossAmountUsdt: 100,
    feeUsdt: 0, creditedUsdt: 100, status: "dust_hold", createdAt: 1,
  };
  seed(KEYS.deposits, { records: [rec], intents: [] });
  const tabA = openTab(useDeposits);   // A 打开页面(读到 dust_hold),之后一直没再刷新
  const tabB = openTab(useDeposits);

  const okB = tabB._devResolveDustHold("DP-20260804-0001", "credit");
  check("①dep B 标签页正常核销入账成功(先手不受影响)", okB === true && ledger.usdt === 100);

  const okA = tabA._devResolveDustHold("DP-20260804-0001", "credit");
  check("①dep 🔴 A 标签页拿着陈旧状态再核销 → 被拒(这一笔已经在别处入账)", okA === false);
  check("①dep 🔴 余额只增加一次(双花的核心断言)", ledger.usdt === 100, `usdt=${ledger.usdt}`);
  check("①dep 🔴 recordDeposit 只被调用一次(不是靠 app 侧幂等兜回来的)",
    ledger.recordDepositCalls === 1, `calls=${ledger.recordDepositCalls}`);
  check("①dep 磁盘上该单只有一个终态 credited,不会被 A 的陈旧数组覆盖回 dust_hold",
    diskRow(KEYS.deposits).records.every((r) => r.status === "credited"));
  check("①dep A 的内存态被刷新到最新(UI 立刻看到别处的结果,不再永久陈旧)",
    tabA.records.value.find((r) => r.depositId === "DP-20260804-0001").status === "credited");
}

// ── ①b deposits:读完到写之间被插队,写前复读挡不住,rev CAS 才挡得住 ──
group();
{
  const rec = {
    depositId: "DP-20260804-0002", channel: "usdt-trc20", grossAmountUsdt: 250,
    feeUsdt: 0, creditedUsdt: 250, status: "dust_hold", createdAt: 1,
  };
  seed(KEYS.deposits, { records: [rec], intents: [] });
  const tabA = openTab(useDeposits);
  const tabB = openTab(useDeposits);

  // A 读到最新的 dust_hold 之后、写回之前,B 完成一整轮核销入账(真实多标签页里就是
  // 另一个进程插队;localStorage 没有锁,这一格是「写前复读校验」永远补不上的)。
  armInterleave(KEYS.deposits, () => { tabB._devResolveDustHold("DP-20260804-0002", "credit"); });
  const okA = tabA._devResolveDustHold("DP-20260804-0002", "credit");

  check("①b dep 插队确实发生了(B 在 A 的读与写之间成交,固定靶不是空转)",
    ledger.usdt === 250 && diskRow(KEYS.deposits).records[0].status === "credited");
  check("①b dep 🔴 A 的写入被版本号挡下 → 被拒", okA === false);
  check("①b dep 🔴 余额仍只增加一次 + recordDeposit 只调一次",
    ledger.usdt === 250 && ledger.recordDepositCalls === 1,
    `usdt=${ledger.usdt} calls=${ledger.recordDepositCalls}`);
}

// ── ① 银行轨:同一张付款单两端各回一次回单 → 只入账一次 ──
group();
{
  const intent = {
    intentId: "DP-20260804-0100", usdtAmount: 80, fxRate: 25000, vndAmount: 2_000_000,
    memoCode: "NX123456", bankAccount: { bankName: "X", accountName: "Y", accountNumber: "1234", enabled: true },
    status: "awaiting_payment", expireAt: Date.now() + 600_000,
  };
  seed(KEYS.deposits, { records: [], intents: [intent] });
  const tabA = openTab(useDeposits);
  const tabB = openTab(useDeposits);

  const rB = tabB._devBankCallback("DP-20260804-0100", 2_000_000);
  check("①bank B 标签页回单匹配成功并入账", rB !== null && ledger.usdt === 80);
  const rA = tabA._devBankCallback("DP-20260804-0100", 2_000_000);
  check("①bank 🔴 A 拿陈旧的 awaiting_payment 再回一次 → 被拒,余额只增加一次",
    rA === null && ledger.usdt === 80 && ledger.recordDepositCalls === 1,
    `usdt=${ledger.usdt} calls=${ledger.recordDepositCalls}`);
  check("①bank 磁盘上只落了一张入金单(同号关联单不会被写两遍)",
    diskRow(KEYS.deposits).records.filter((r) => r.depositId === "DP-20260804-0100").length === 1);
}

// ══════════════ ② deposits 单标签页正常路径不受影响 ══════════════
group();
{
  seed(KEYS.deposits, { records: [], intents: [] });
  const tab = openTab(useDeposits);

  const card = tab.submitCardPayment(60, ACCT);
  // 卡轨有 CARD_DECLINE_RATE 拒付率:拒付返 null 属既有语义,重试到成交为止再断言。
  let paid = card;
  for (let i = 0; i < 40 && paid === null; i++) paid = tab.submitCardPayment(60, ACCT);
  check("②dep 卡轨支付成交并落盘(金额 / 终态 / 余额三处一致)",
    paid !== null && paid.creditedUsdt === 60 && paid.status === "credited"
    && diskRow(KEYS.deposits).records.some((r) => r.depositId === paid.depositId),
    paid === null ? "40 次全被 mock 拒付率拒掉" : "");
  check("②dep 卡轨入账后余额 = 成交笔数 × 60(单标签页从头到尾不掉单)",
    ledger.usdt === 60 * ledger.recordDepositCalls && ledger.usdt > 0, `usdt=${ledger.usdt}`);

  const it = tab.createBankIntent(50);
  check("②dep 银行轨下单成功(锁价三件套齐 + 落盘)",
    it !== null && it.usdtAmount === 50 && it.status === "awaiting_payment"
    && diskRow(KEYS.deposits).intents.some((x) => x.intentId === it.intentId));
  const cancelled = tab.cancelBankIntent(it.intentId);
  check("②dep 撤单成功且落盘为 cancelled,正常路径 0 次 conflict",
    cancelled.ok === true && cancelled.conflict === undefined
    && diskRow(KEYS.deposits).intents.find((x) => x.intentId === it.intentId).status === "cancelled");

  const tabReload = openTab(useDeposits); // 关掉再打开 = 重新水合
  check("②dep 重新水合读回同一份账本(单据数与磁盘一致)",
    tabReload.records.value.length === diskRow(KEYS.deposits).records.length
    && tabReload.intents.value.length === diskRow(KEYS.deposits).intents.length);
}

// ══════════════ ③ deposits 失败可区分 ══════════════
group();
{
  seed(KEYS.deposits, { records: [], intents: [] });
  const tab = openTab(useDeposits);
  const it = tab.createBankIntent(50);

  const unknown = tab.cancelBankIntent("DP-does-not-exist");
  check("③dep 不存在的付款单:ok=false / conflict=false(本来就不该成交)",
    unknown.ok === false && unknown.conflict === false);
  tab.cancelBankIntent(it.intentId);
  const twice = tab.cancelBankIntent(it.intentId);
  check("③dep 已撤的单再撤:ok=false / conflict=false —— 别把「本来就不该成交」误报成「数据已更新」",
    twice.ok === false && twice.conflict === false);

  // 版本被别处推进过 → 同一次拒绝要归因成 conflict=true
  seed(KEYS.deposits, { records: [], intents: [] });
  const tabA = openTab(useDeposits);
  const tabB = openTab(useDeposits);
  const it2 = tabA.createBankIntent(50);
  tabB.cancelBankIntent(it2.intentId);           // B 先撤掉
  const rA = tabA.cancelBankIntent(it2.intentId); // A 拿陈旧状态再撤
  check("③dep 🔴 被别处改过导致的拒绝归因为 conflict=true(页面据此提示已刷新)",
    rA.ok === false && rA.conflict === true);
}

// ══════════════ ⑤ deposits 追加型:两个标签页各下一单,两笔都留得住 + 单号不重号 ══════════════
group();
{
  seed(KEYS.deposits, { records: [], intents: [] });
  const tabA = openTab(useDeposits);
  const tabB = openTab(useDeposits);
  const a = tabA.createBankIntent(11);
  const b = tabB.createBankIntent(22);
  const rows = diskRow(KEYS.deposits).intents;
  check("⑤dep 🔴 两个标签页各下的单都在磁盘上(不会被对方的陈旧数组顶掉)",
    rows.length === 2 && rows.map((x) => x.usdtAmount).sort((m, n) => m - n).join(",") === "11,22",
    rows.map((x) => x.usdtAmount).join(","));
  check("⑤dep 单号不重号 —— depositId 是三轨共享主键,撞号会让 find() 永远命中第一笔",
    a.intentId !== b.intentId && new Set(rows.map((x) => x.intentId)).size === 2,
    `${a.intentId} / ${b.intentId}`);
  check("⑤dep 两笔都能各自独立撤掉(撞号的话第二笔会失败)",
    tabA.cancelBankIntent(a.intentId).ok && tabB.cancelBankIntent(b.intentId).ok);
}

// ══════════════ ① voucher:同一张券两个标签页各领一次 → 只领到一次 ══════════════
group();
const VOUCHER_ID = listVouchers().find((d) => isVoucherValid(d))?.id;
{
  check("①vou 取到一张当前有效的券作固定靶(取不到说明券目录空了,后面全是空转)",
    typeof VOUCHER_ID === "string" && VOUCHER_ID.length > 0, String(VOUCHER_ID));
  seed(KEYS.voucher, { claimed: [] });
  const tabA = openTab(useVoucher);
  const tabB = openTab(useVoucher);

  const rB = tabB.claim(VOUCHER_ID);
  check("①vou B 标签页正常领取成功(先手不受影响)", rB.ok === true);
  const rA = tabA.claim(VOUCHER_ID);
  check("①vou 🔴 A 拿陈旧券包再领同一张 → 被拒", rA.ok === false);
  check("①vou 🔴 磁盘上该券只有一条领取记录(双花的核心断言)",
    diskRow(KEYS.voucher).claimed.filter((c) => c.id === VOUCHER_ID).length === 1,
    JSON.stringify(diskRow(KEYS.voucher).claimed));
  check("①vou 拒单归因为版本冲突(conflict=true)", rA.conflict === true);
  check("①vou A 的内存态被刷新到最新(立刻看到别处已领)", tabA.isClaimed(VOUCHER_ID) === true);
}

// ── ①b voucher 插队 ──
group();
{
  seed(KEYS.voucher, { claimed: [] });
  const tabA = openTab(useVoucher);
  const tabB = openTab(useVoucher);
  armInterleave(KEYS.voucher, () => { tabB.claim(VOUCHER_ID); });
  const rA = tabA.claim(VOUCHER_ID);
  check("①b vou 插队确实发生了(B 在 A 的读与写之间领走)",
    diskRow(KEYS.voucher).claimed.length === 1);
  check("①b vou 🔴 A 的写入被版本号挡下 → 被拒 + conflict=true",
    rA.ok === false && rA.conflict === true);
  check("①b vou 🔴 券只被领走一次", diskRow(KEYS.voucher).claimed.filter((c) => c.id === VOUCHER_ID).length === 1);
}

// ── ② / ③ voucher 单标签页 + 失败可区分 ──
group();
{
  seed(KEYS.voucher, { claimed: [] });
  const tab = openTab(useVoucher);
  const ok = tab.claim(VOUCHER_ID);
  check("②vou 单标签页领取成功并落盘,0 次 conflict",
    ok.ok === true && ok.conflict === undefined && diskRow(KEYS.voucher).claimed.length === 1);
  const again = tab.claim(VOUCHER_ID);
  check("③vou 同一标签页重复领取被拒,且**不是**版本冲突(conflict=false)",
    again.ok === false && again.conflict === false);
  const bogus = tab.claim("voucher-does-not-exist");
  check("③vou 不存在 / 失效的券:ok=false / conflict=false", bogus.ok === false && bogus.conflict === false);
  tab.markUsed(VOUCHER_ID);
  check("②vou markUsed 落盘(核销时刻写进磁盘,不是只改内存)",
    diskRow(KEYS.voucher).claimed.find((c) => c.id === VOUCHER_ID).usedAt !== null);
  check("②vou 重新水合读回同一份券包", openTab(useVoucher).isUsed(VOUCHER_ID) === true);
}

// ══════════════ ① nex-faucet:里程碑 / 签到的每日与一次性配额 ══════════════
group();
{
  const base = {
    history: [], lastSignedInAt: 0, signInStreak: 30,
    longestStreak: 30, streakSavers: 1, claimedMilestones: [],
  };
  seed(KEYS.faucet, base);
  const tabA = openTab(useNexFaucet);
  const tabB = openTab(useNexFaucet);

  const rB = tabB.claimMilestone(7, 50, "Milestone Day-7");
  check("①fau B 标签页正常领里程碑成功", rB.ok === true);
  const rA = tabA.claimMilestone(7, 50, "Milestone Day-7");
  check("①fau 🔴 A 拿陈旧状态再领同一个里程碑 → 被拒 + conflict=true",
    rA.ok === false && rA.conflict === true);
  check("①fau 🔴 磁盘上 Day-7 只记了一次(重复领 = 重复发币)",
    diskRow(KEYS.faucet).claimedMilestones.filter((d) => d === 7).length === 1,
    JSON.stringify(diskRow(KEYS.faucet).claimedMilestones));

  // 签到:同一天两个标签页各签一次
  seed(KEYS.faucet, base);
  const t2A = openTab(useNexFaucet);
  const t2B = openTab(useNexFaucet);
  const sB = t2B.signIn();
  const sA = t2A.signIn();
  check("①fau 🔴 同一天第二个标签页签到被拒(一天绝不发两次币)",
    sB.ok === true && sA.ok === false && sA.gained === 0);
  check("①fau 磁盘 history 只多了一条签到事件", diskRow(KEYS.faucet).history.length === 1);

  // saver:同一张 saver 两端各用一次
  seed(KEYS.faucet, { ...base, signInStreak: 0, lastSignedInAt: 0, streakSavers: 1 });
  const t3A = openTab(useNexFaucet);
  const t3B = openTab(useNexFaucet);
  const vB = t3B.useSaver();
  const vA = t3A.useSaver();
  check("①fau 🔴 同一张 streak saver 只用得掉一次(存量不会被覆盖回去)",
    vB.ok === true && vA.ok === false && diskRow(KEYS.faucet).streakSavers === 0,
    `savers=${diskRow(KEYS.faucet).streakSavers}`);
}

// ── ①b nex-faucet 插队 + ② 单标签页 + ③ 可区分 ──
group();
{
  const base = {
    history: [], lastSignedInAt: 0, signInStreak: 30,
    longestStreak: 30, streakSavers: 1, claimedMilestones: [],
  };
  seed(KEYS.faucet, base);
  const tabA = openTab(useNexFaucet);
  const tabB = openTab(useNexFaucet);
  armInterleave(KEYS.faucet, () => { tabB.claimMilestone(7, 50, "Milestone Day-7"); });
  const rA = tabA.claimMilestone(7, 50, "Milestone Day-7");
  check("①b fau 🔴 读写之间被插队同样拦得住(conflict=true,Day-7 只记一次)",
    rA.ok === false && rA.conflict === true
    && diskRow(KEYS.faucet).claimedMilestones.filter((d) => d === 7).length === 1);

  // 昨天签过 → 今天签是「连胜 +1」(lastSignedInAt=0 会被判成从没签过,连胜从 1 起)。
  seed(KEYS.faucet, { ...base, lastSignedInAt: Date.now() - 86400_000 });
  const tab = openTab(useNexFaucet);
  const s = tab.signIn();
  check("②fau 单标签页签到成功:发币 + 连胜推进 + 落盘,0 次 conflict",
    s.ok === true && s.gained > 0 && s.streak === 31 && s.conflict === undefined
    && diskRow(KEYS.faucet).signInStreak === 31, `ok=${s.ok} streak=${s.streak}`);
  const again = tab.signIn();
  check("③fau 同一标签页当天再签被拒,且**不是**版本冲突(conflict=false)",
    again.ok === false && again.conflict === false);
  const locked = tab.claimMilestone(999, 1, "not reached");
  check("③fau 连胜没到的里程碑:ok=false / conflict=false(既有语义原样保留)",
    locked.ok === false && locked.conflict === false);
  check("②fau 重新水合读回同一份状态机", openTab(useNexFaucet).signInStreak.value === 31);
}

// ══════════════ ① daily-powerup:一次性增益激活 ══════════════
group();
{
  seed(KEYS.powerup, { claimed: [], claimedAt: {} });
  const tabA = openTab(useDailyPowerUp);
  const tabB = openTab(useDailyPowerUp);

  const rB = tabB.claim("royalty_boost");
  const rA = tabA.claim("royalty_boost");
  check("①pow 🔴 同一档增益只激活得了一次(第二个标签页被拒 + conflict=true)",
    rB.ok === true && rA.ok === false && rA.conflict === true);
  check("①pow 🔴 磁盘上只记了一次激活",
    diskRow(KEYS.powerup).claimed.filter((x) => x === "royalty_boost").length === 1,
    JSON.stringify(diskRow(KEYS.powerup).claimed));

  // 插队
  seed(KEYS.powerup, { claimed: [], claimedAt: {} });
  const t2A = openTab(useDailyPowerUp);
  const t2B = openTab(useDailyPowerUp);
  armInterleave(KEYS.powerup, () => { t2B.claim("nex_boost"); });
  const iA = t2A.claim("nex_boost");
  check("①b pow 🔴 读写之间被插队同样拦得住",
    iA.ok === false && iA.conflict === true
    && diskRow(KEYS.powerup).claimed.filter((x) => x === "nex_boost").length === 1);

  // 两个标签页各激活**不同**档:都得留得住(追加型重放)
  seed(KEYS.powerup, { claimed: [], claimedAt: {} });
  const t3A = openTab(useDailyPowerUp);
  const t3B = openTab(useDailyPowerUp);
  t3A.claim("royalty_boost");
  t3B.claim("staking_boost");
  check("⑤pow 两个标签页各激活不同档,两档都留得住(不会被对方的陈旧数组顶掉)",
    diskRow(KEYS.powerup).claimed.slice().sort().join(",") === "royalty_boost,staking_boost",
    JSON.stringify(diskRow(KEYS.powerup).claimed));

  // 单标签页 + 可区分
  seed(KEYS.powerup, { claimed: [], claimedAt: {} });
  const tab = openTab(useDailyPowerUp);
  const ok = tab.claim("royalty_boost");
  check("②pow 单标签页激活成功并落盘,0 次 conflict",
    ok.ok === true && ok.conflict === undefined && tab.hasClaimed("royalty_boost")
    && diskRow(KEYS.powerup).claimedAt.royalty_boost > 0);
  const dup = tab.claim("royalty_boost");
  check("③pow 同一标签页重复激活被拒,且**不是**版本冲突", dup.ok === false && dup.conflict === false);
  tab.reset();
  check("②pow reset 落盘清空(不是只改内存)", diskRow(KEYS.powerup).claimed.length === 0);
}

// ══════════════ ① lucky-spin:每日免费票 + bonus 票 ══════════════
group();
{
  // 与 store 内部的 utcDate(mockServerNow()) 同口径 —— 用它把「今日免费已用掉」造出来。
  const TODAY = new Date(Date.now()).toISOString().slice(0, 10);
  const base = { bonusTickets: 0, lastFreeSpinDate: "", history: [], realPrizeSoldOut: false, coverageDegraded: false };
  seed(KEYS.spin, base);
  const tabA = openTab(useLuckySpin);
  const tabB = openTab(useLuckySpin);

  const rB = tabB.spin();
  const rA = tabA.spin();
  check("①spin 🔴 今日免费票只花得掉一次(第二个标签页被拒 + conflict=true)",
    rB.ok === true && typeof rB.prizeId === "string" && rA.ok === false && rA.prizeId === null
    && rA.conflict === true);
  check("①spin 🔴 磁盘上今日已抽标记只落一次,bonus 票没被顺手扣掉",
    diskRow(KEYS.spin).lastFreeSpinDate !== "" && diskRow(KEYS.spin).bonusTickets === 0);

  // 插队:B 在 A 的读与写之间把票花掉
  seed(KEYS.spin, base);
  const t2A = openTab(useLuckySpin);
  const t2B = openTab(useLuckySpin);
  armInterleave(KEYS.spin, () => { t2B.spin(); });
  const iA = t2A.spin();
  check("①b spin 🔴 读写之间被插队同样拦得住(票没被花第二次)",
    iA.ok === false && iA.conflict === true && diskRow(KEYS.spin).bonusTickets === 0);

  // bonus 票:今日免费**已用掉**(lastFreeSpinDate = 今天)时,两端各抽一次只扣得掉一张
  seed(KEYS.spin, { ...base, bonusTickets: 1, lastFreeSpinDate: TODAY });
  const t3A = openTab(useLuckySpin);
  const t3B = openTab(useLuckySpin);
  const bB = t3B.spin();
  const bA = t3A.spin();
  check("①spin 🔴 一张 bonus 票只抽得了一次(覆盖式写会让两边各抽一次)",
    bB.ok === true && bA.ok === false && bA.conflict === true && diskRow(KEYS.spin).bonusTickets === 0,
    `B=${bB.ok} A=${bA.ok} tickets=${diskRow(KEYS.spin).bonusTickets}`);

  // 单标签页 + 追加型 + 可区分
  seed(KEYS.spin, { ...base, bonusTickets: 2, lastFreeSpinDate: TODAY });
  const tab = openTab(useLuckySpin);
  const s1 = tab.spin();
  check("②spin 单标签页抽奖成功:扣票 + 出奖 + 落盘,0 次 conflict",
    s1.ok === true && typeof s1.prizeId === "string" && s1.conflict === undefined
    && diskRow(KEYS.spin).bonusTickets === 1, `tickets=${diskRow(KEYS.spin).bonusTickets}`);
  tab.pushHistory(s1.prizeId);
  check("②spin 中奖历史落盘", diskRow(KEYS.spin).history.length === 1);
  tab.grantBonusTicket(3);
  check("②spin 发票落盘(增量型:在磁盘最新票数上加)", diskRow(KEYS.spin).bonusTickets === 4);
  tab.spin(); tab.spin(); tab.spin(); tab.spin();
  const dry = tab.spin();
  check("③spin 票用光后再抽被拒,且**不是**版本冲突(conflict=false)",
    dry.ok === false && dry.conflict === false && diskRow(KEYS.spin).bonusTickets === 0,
    `tickets=${diskRow(KEYS.spin).bonusTickets}`);
}

// ══════════════ ①② withdraw-daily-count:已随 z1 审计 P0-1 整体删除 ══════════════
// 2026-08-11:客户端不再维护日限计数器 —— 今日笔数改由 core 从提现单列表现算
// (withdrawal-eligibility-core.countWithdrawalsOnPlatformDay),没有第二份状态就不必
// 用 CAS + 令牌去防并发覆盖。原两节测的是 claimWithdrawSlot / releaseWithdrawSlot 的
// 落盘竞争,模块已删,留着就是绿着守死代码(正是 z1 点名的那种假绿)。
// 日限的行为覆盖现在全部在 scripts/selfcheck-fastlane.mjs §7(含平台日边界与到达上限固定靶)。

// ══════════════ ④ 向后兼容:老写法逐字节不变 + 爆炸半径 ══════════════
group();
{
  const TBL = "compat-table-v1";
  disk.clear();

  const wrote = writeAccountRow(TBL, "Alice@x.com", { a: 1, list: [1, 2] });
  const back = readAccountRow(TBL, "alice@x.com");
  check("④ 老写法:返回 true,大小写归一后可读回,内容逐字节相同",
    wrote === true && JSON.stringify(back) === JSON.stringify({ a: 1, list: [1, 2] }));
  check("④ 🔴 老写法不注入 rev 字段(写进去什么就是什么,键集合不变)",
    Object.keys(back).join(",") === "a,list" && !("rev" in back));
  writeAccountRow(TBL, "bob@x.com", { a: 9 });
  writeAccountRow(TBL, "alice@x.com", { a: 2 });
  check("④ 老写法仍是覆盖式 last-write-wins(不合并、不拒绝、不报冲突)",
    JSON.stringify(readAccountRow(TBL, "alice@x.com")) === JSON.stringify({ a: 2 })
    && readAccountRow(TBL, "bob@x.com").a === 9);
  check("④ CAS 接管老行:expectedRev=0 通过并写成 rev=1;版本不符时不写盘",
    accountRowRev(readAccountRow(TBL, "bob@x.com")) === 0
    && writeAccountRowCas(TBL, "bob@x.com", { a: 10 }, 0).rev === 1
    && writeAccountRowCas(TBL, "bob@x.com", { a: 99 }, 0).conflict === true
    && readAccountRow(TBL, "bob@x.com").a === 10);

  const storageRaw = readSrc("src", "store", "account-scoped-storage.ts");
  const stripped = strip(storageRaw);
  const start = stripped.indexOf("export function writeAccountRow<T>");
  const oldWriter = stripped.slice(start, stripped.indexOf("\n}", start));
  check("④ 🔴 老写法函数体内 0 处 rev / CAS 相关引用(两条路径彻底不耦合)",
    start >= 0 && !/rev|Cas|expected/i.test(oldWriter), oldWriter.replace(/\s+/g, " ").slice(0, 120));
}

// ══════════════ ⑥ 接线门:判定对不对 / 有没有被接上,是两道门 ══════════════
group();
{
  // 每个 store 的 commit() 处数 = 该 store 的全部变更路径(含入账失败回滚那几处)。
  // 掉到门槛以下 = 有路径被摘出去自己写盘了,这道闸就漏了。
  const CONVERTED = {
    "deposits.ts": 11, "voucher.ts": 2, "nex-faucet.ts": 3,
    "daily-powerup.ts": 2, "lucky-spin.ts": 7, "orders.ts": 1,
  };
  for (const [file, minCommits] of Object.entries(CONVERTED)) {
    const s = strip(readSrc("src", "store", file));
    check(`⑥ ${file} 落盘只走 CAS(0 处裸 writeAccountRow / 0 处残留 persist(),否则这道门等于没接)`,
      !/[^C]\bwriteAccountRow\(/.test(s) && !/\bpersist\(\)/.test(s) && s.includes("createAccountRowCommit"),
      (s.match(/[^C]\bwriteAccountRow\(|\bpersist\(\)/g) || []).join(","));
    const commits = (s.match(/\bcommit\(/g) || []).length;
    check(`⑥ ${file} 的变更路径全部经由 commit(实测 ${commits} 处,门槛 ${minCommits})`,
      commits >= minCommits, `commits=${commits}`);
  }
  // 🔴 正交维度:「裸 writeAccountRow 有没有」查的是**存在的对不对**,查不到「该走 commit 的
  // 有没有绕过去」。绕法不是再写一次盘,而是**直接改内存 ref 而根本不落盘** —— 页面当场看着对,
  // 刷新即丢,而且完全绕开了前置条件复核。
  //
  // 判据 v2(z1 2026-08-10)。v1 是「每个持久化 ref 全文只许被赋值 2 次(sync 回调 + bindAccount)」;
  // c37e642 起出现第三类**合法**赋值宿主 —— remote-apply 缝(refreshRemote / clearRemoteFacts:
  // 远端权威快照灌回本地镜像 / 清远端事实,不走本地 commit 是设计不是绕过)。数次数改成**宿主分类**:
  //   每一处 `ref.value =` 必须落在 {① 提交器 sync 回调, ② bindAccount, ③ remote-apply 函数};
  //   ③ 不是名字白名单,是**构造性守卫**,二选一:
  //     A. 函数体首句 `if (!remoteApiEnabled) return …` 自守;
  //     B. 该函数在本文件的**全部**调用点(必须 ≥1,空集不证明守卫)都受守卫 —— 调用点位于
  //        `if (remoteApiEnabled) {…}` 块内 / A 类函数体内 / 「体内调用了 A 类函数」的 remote
  //        包装函数体内(claimRemote / checkInRemote 族 catch 里的清理是最后一种形态)。
  //        ponytail: 包装函数自身被页面在 mock 态直调是已知天花板,升级路径 = 包装补首句自守。
  //   列不进三类的赋值点照红,失败信息打「文件#函数#L行」。
  // 🔴 删除向不失明(v1 的 `=== 2` 顺带守着这一面,分类判据必须显式接住):每个持久化 ref
  //   必须在 sync 回调与 bindAccount 里**各至少赋值一次** —— sync 断了 = 提交结果灌不回内存,
  //   bindAccount 断了 = 切号残留上一账号状态。
  const PERSISTED_REFS = {
    "deposits.ts": ["records", "intents"],
    "voucher.ts": ["claimed"],
    "daily-powerup.ts": ["claimed", "claimedAt"],
    "nex-faucet.ts": ["history", "lastSignedInAt", "signInStreak", "longestStreak", "streakSavers", "claimedMilestones"],
    "lucky-spin.ts": ["bonusTickets", "lastFreeSpinDate", "history", "realPrizeSoldOut", "coverageDegraded"],
    "pending-checkout.ts": ["sessions"], // 2026-08-16 pkg/ad:待支付发票(begin/consume/remove/markLeftNotice 全部走 CAS)
    "orders.ts": ["orders"], // 2026-08-17 pkg/ad R10:订单行 CAS(create / advance / markActivated / cancel 全部走 commit;remote-apply 缝 refreshRemote 自守)
  };
  // 🔴 清单是手抄的 → 加一道覆盖门(z1 R2 对抗审计 P1-17c:c37e662 那批新接远端缝的
  //    store 不在册,清单静默漏检)。判据从磁盘来:凡是走了 CAS 提交器
  //    (createAccountRowCommit)的 store,都必须在册;在册但文件没了也红。
  {
    const storeDir = path.join(SRC, "store");
    const casStores = readdirSync(STORE_DIR)
      .filter((n) => n.endsWith(".ts"))
      .filter((n) => {
        const src = readFileSync(path.join(STORE_DIR, n), "utf8");
        // 排除定义方本身:它 export 这个提交器,不是它的消费者
        return /createAccountRowCommit\s*[<(]/.test(src) && !/export function createAccountRowCommit/.test(src);
      });
    check(`⑥ 覆盖门:CAS 提交器 store 扫描面非空(实扫 ${casStores.length} 个)`, casStores.length >= 3, `只扫到 ${casStores.length}`);
    const missing = casStores.filter((n) => !PERSISTED_REFS[n]);
    const stale = Object.keys(PERSISTED_REFS).filter((n) => !casStores.includes(n));
    check(`⑥ 🔴 走 CAS 的 store 全部在册(漏 ${missing.length} 个 · 陈旧 ${stale.length} 个)`,
      missing.length === 0 && stale.length === 0,
      `漏:${missing.join(",") || "无"} | 陈旧:${stale.join(",") || "无"}`);
  }
  /** 行号保持的剥注释:块注释以空格填充不吞行、整行 // 置空 —— 偏移→行号才对得上。 */
  const stripKeepLines = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\r\n]/g, " "))
    .replace(/^([ \t]*)\/\/.*$/gm, "$1");
  function analyzeAssignmentHosts(file, refs) {
    const src = stripKeepLines(readSrc("src", "store", file));
    const lineAt = (i) => src.slice(0, i).split("\n").length;
    const matchBrace = (open) => {
      let depth = 0;
      for (let i = open; i < src.length; i++) {
        if (src[i] === "{") depth++;
        else if (src[i] === "}") { depth--; if (depth === 0) return i; }
      }
      return src.length - 1;
    };
    /** 函数体开括号:配对参数括号后,走过可选的 `: 返回类型`(类型里的 `{…}` 组与 `<…>`
     *  里的花括号都不是函数体 —— `Promise<{ ok }>` / `: { ok } {` 两种形态都要跳过)。 */
    const bodyOpenAfter = (parenOpen) => {
      let depth = 0;
      let i = parenOpen;
      for (; i < src.length; i++) {
        if (src[i] === "(") depth++;
        else if (src[i] === ")") { depth--; if (depth === 0) { i++; break; } }
      }
      let angle = 0;
      let prev = ")";
      for (; i < src.length; i++) {
        const c = src[i];
        if (/\s/.test(c)) continue;
        if (c === "<") { angle++; prev = c; continue; }
        if (c === ">") { if (angle > 0) angle--; prev = c; continue; }
        if (c === "{") {
          if (angle === 0 && !/[:|&,(=]/.test(prev)) return i; // 真函数体
          i = matchBrace(i);                                    // 类型对象组,整块跳过
          prev = "}";
          continue;
        }
        prev = c;
      }
      return -1;
    };
    const fns = [];
    for (const m of src.matchAll(/(?:^|[\r\n])[ \t]*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
      const open = bodyOpenAfter(m.index + m[0].length - 1);
      if (open >= 0) fns.push({ name: m[1], open, close: matchBrace(open) });
    }
    for (const m of src.matchAll(/(?:^|[\r\n])[ \t]*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)[^={]*=>\s*\{/g)) {
      const open = m.index + m[0].length - 1;
      fns.push({ name: m[1], open, close: matchBrace(open) });
    }
    for (const m of src.matchAll(/\bsync:\s*\([^)]*\)\s*=>\s*\{/g)) {
      const open = m.index + m[0].length - 1;
      fns.push({ name: "sync 回调", open, close: matchBrace(open) });
    }
    const hostOf = (i) => {
      let best = null;
      for (const f of fns) if (i > f.open && i < f.close && (!best || f.open > best.open)) best = f;
      return best;
    };
    const guardRanges = [...src.matchAll(/if\s*\(\s*remoteApiEnabled\s*\)\s*\{/g)]
      .map((m) => { const open = m.index + m[0].length - 1; return [open, matchBrace(open)]; });
    const inGuardBlock = (i) => guardRanges.some(([a, b]) => i > a && i < b);
    const bodyOf = (f) => src.slice(f.open + 1, f.close);
    // 🔴 2026-08-13 扩充自守形态:原先只认 `if (!remoteApiEnabled) return`,
    // 而沙箱专用函数(refreshFundsSandboxDeposits / createSandboxTopup 等)用的是
    // `if (!fundsSandboxEnabled) return` —— 门不认,于是把**受守的**函数报成越界。
    // 两者不是随便互换:`fundsSandboxEnabled = mode === "sandbox" && modeExplicit`,
    // 而 `remoteApiEnabled = mode !== "mock"` ⇒ **沙箱档是非 mock 档的真子集**,
    // 所以按 fundsSandboxEnabled 自守**更严**(只在沙箱跑,remote 档也进不来),
    // 用它守沙箱专用函数是精确而非放宽。
    // 判据仍是构造性的:只认这两种**函数体开头的早退**,写在中间或藏进分支的不算。
    // 🔴 复合早退也算,但**只认 `||` 不认 `&&`**:
    //   `if (!闸 || 金额非法) return` —— 闸一关就返回,安全(createSandboxTopup 正是这形态);
    //   `if (!闸 && 别的) return` —— 要两个条件同时成立才返回,**闸单独关时照样往下跑**,不安全。
    //   所以判据钉「以 `!闸` 开头,且紧跟 `)` 或 `||`」,把这两种形态精确分开。
    const isFormA = (f) => /^\s*if\s*\(\s*!(remoteApiEnabled|fundsSandboxEnabled)\s*(\)|\|\|)/.test(bodyOf(f));
    const formANames = fns.filter(isFormA).map((f) => f.name);
    const callsFormA = (f) => formANames.some((n) => new RegExp(`(?<![\\w$.])${n}\\s*\\(`).test(bodyOf(f)));
    const callSiteGuarded = (i) => {
      if (inGuardBlock(i)) return true;
      const host = hostOf(i);
      return !!host && host.name !== "sync 回调" && (isFormA(host) || callsFormA(host));
    };
    const remoteApplyOk = (f) => {
      if (isFormA(f)) return { ok: true };
      const sites = [...src.matchAll(new RegExp(`(?<![\\w$.])${f.name}\\s*\\(`, "g"))]
        .filter((m) => !/function\s+$/.test(src.slice(Math.max(0, m.index - 20), m.index)));
      if (sites.length === 0) return { ok: false, why: "无自守且本文件 0 个调用点(空集不证明守卫)" };
      const bad = sites.filter((m) => !callSiteGuarded(m.index));
      return bad.length === 0
        ? { ok: true }
        : { ok: false, why: `存在未受守卫的调用点 L${bad.map((m) => lineAt(m.index)).join("/L")}` };
    };
    const out = { offenders: [], missing: [], stats: { sync: 0, bind: 0, remote: 0 } };
    for (const ref of refs) {
      let inSync = 0;
      let inBind = 0;
      for (const m of src.matchAll(new RegExp(`\\b${ref}\\.value\\s*=[^=]`, "g"))) {
        const host = hostOf(m.index);
        const at = `${file}#${host?.name ?? "模块顶层"}#L${lineAt(m.index)}(${ref})`;
        if (!host) { out.offenders.push(`${at} —— 不在任何函数内`); continue; }
        if (host.name === "sync 回调") { inSync++; out.stats.sync++; continue; }
        if (host.name === "bindAccount") { inBind++; out.stats.bind++; continue; }
        const verdict = remoteApplyOk(host);
        if (verdict.ok) { out.stats.remote++; continue; }
        out.offenders.push(`${at} —— ${verdict.why}`);
      }
      if (inSync < 1) out.missing.push(`${ref}: sync 回调 0 处赋值`);
      if (inBind < 1) out.missing.push(`${ref}: bindAccount 0 处赋值`);
    }
    return out;
  }
  for (const [file, refs] of Object.entries(PERSISTED_REFS)) {
    const a = analyzeAssignmentHosts(file, refs);
    check(`⑥ 🔴 ${file} 的 ${refs.length} 个持久化 ref 赋值宿主全落 {sync 回调, bindAccount, remote-apply 构造性守卫} 三类`
      + `(实测 sync ${a.stats.sync} · bind ${a.stats.bind} · remote-apply ${a.stats.remote})`,
      a.offenders.length === 0, a.offenders.join(" ; "));
    check(`⑥ ${file} 每个持久化 ref 在 sync 回调与 bindAccount 各至少赋值一次(删除向:sync 断=提交灌不回内存,bind 断=切号串账)`,
      a.missing.length === 0, a.missing.join(" ; "));
  }

  const vou = strip(readSrc("src", "store", "voucher.ts"));
  check("⑥ 🔴 voucher 的 `watch(claimed, persist, deep)` 旁路已删除(留着它 = 绕过 CAS 的第二条落盘路)",
    !/\bwatch\s*\(/.test(vou), (vou.match(/.*watch\s*\(.*/g) || []).join(" | "));

  const engine = strip(readSrc("src", "store", "account-scoped-storage.ts"));
  check("⑥ 共用提交器以**磁盘最新**行为基准(不是拿内存副本自证)",
    /const disk = readDisk\(\);/.test(engine) && /const base = disk\.row \?\? opts\.snapshot\(\);/.test(engine));
  check("⑥ 共用提交器带 rev 做 CAS(expectedRev 取的是基准那一刻的版本)",
    /writeAccountRowCas<Row>\([\s\S]{0,120}?baseRev\)/.test(engine));
  check("⑥ 重放次数有上限(不会因对方持续写而空转)", /attempt < 3/.test(engine));

  // 页面接线:失败信号必须被读到 —— 返回对象后 `if (store.claim(x))` 恒真,是最容易漏的一格。
  const SITES = [
    ["src/components/voucher-claim-sheet.vue", /const r = voucher\.claim\([\s\S]{0,80}?r\.ok/],
    ["src/components/daily/streak-power-ups.vue", /const r = powerUp\.claim\([\s\S]{0,80}?r\.ok/],
    ["src/pages/daily/daily.vue", /const claim = faucet\.claimMilestone\([\s\S]{0,200}?if \(!claim\.ok\)[\s\S]{0,200}?return;/],
    ["src/pages/daily/daily.vue", /const r = faucet\.useSaver\(\);[\s\S]{0,80}?r\.ok/],
    ["src/components/lucky-spin-sheet.vue", /const r = spin\.spin\(\);[\s\S]{0,120}?if \(!r\.ok\)[\s\S]{0,140}?return;/],
    ["src/components/me/deposit-bank-pane.vue", /const r = remoteApiEnabled[\s\S]{0,100}?cancelRemoteBankIntent\([\s\S]{0,100}?cancelBankIntent\([\s\S]{0,100}?r\.ok/],
  ];
  for (const [file, re] of SITES) {
    check(`⑥ ${file.split("/").pop()} 读到了 ok(返回对象后 \`if (action())\` 恒真,漏读 = 门白接)`,
      re.test(strip(readSrc(...file.split("/")))), file);
  }
  check("⑥ 🔴 六处调用点全部分辨了 conflict(点了没反应 vs 明示「已在别处处理」)",
    SITES.every(([file]) => /r\.conflict|claim\.conflict/.test(strip(readSrc(...file.split("/"))))));

  const locales = ["en", "zh", "vi"];
  samples.locales = locales.length;
  check(`⑥ i18n 冲突提示 ${locales.length} 语齐(errors.staleTitle + errors.staleMsg)`,
    locales.every((l) => {
      const src = readSrc("src", "i18n", "messages", `${l}.ts`);
      return src.includes("staleTitle:") && src.includes("staleMsg:");
    }));
}

console.log(`\n${pass} pass / ${fail} fail(样本:${samples.stores} 个 P1 store · ${samples.tabs} 个 store 实例=${samples.tabs} 标签页共享 1 份序列化 storage`
  + ` · ${samples.targetGroups} 组跨标签页固定靶 · ${samples.locales} 语 i18n)`);
process.exit(fail ? 1 : 0);

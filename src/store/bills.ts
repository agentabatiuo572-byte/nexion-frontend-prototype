import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { mockServerId } from "./mock-id";
import { mockServerNow } from "./server-time";
import { normalizeAccountKey } from "./account-cloud";
import { readAccountRow, writeAccountRow } from "./account-scoped-storage";
import { fundsServerEnabled, walletBillsApi } from "@/api/runtime";
import type { WalletBillRow, WalletBillFilters, WalletBillsSummary } from "@/api/wallet-bills-api";
import { createWalletLedgerPager, type LedgerLoadStatus, type WalletLedgerPager } from "./wallet-ledger-pager";

// Ported from Nexion-prototype/lib/store/bills.ts (zustand → Pinia).
// MOCK-ONLY seed below. Real account history uses demand-paged canonical ledger
// rows; totals always come from the independent server summary, never this page.
export type BillType =
  | "earn" | "refer" | "bonus" | "topup" | "withdraw"
  | "purchase" | "swap" | "verification" | "stake" | "unstake" | "achievement" | "other";
export type BillStatus = "posted" | "pending" | "failed";

export interface Bill {
  id: string;
  type: BillType;
  amount: number; // signed: +credit, -debit
  symbol: "USDT" | "NEX";
  status: BillStatus;
  ts: number; // epoch ms
  /**
   * 已翻译好的文案。⚠️ 语言在写入那一刻被冻住 —— 切语言后旧账单仍是旧语言。
   * 新代码优先用 memoKey(渲染时才翻译);memo 保留给存量数据与暂未迁移的调用方。
   */
  memo: string;
  /**
   * i18n key(相对 t.bills.memo.*)。有它就以它为准渲染,memo 只作兜底。
   * 真后端返回的也应该是**码**而不是某一种语言的句子 —— 这个字段就是那个码位。
   */
  memoKey?: string;
  memoParams?: Record<string, string | number>;
  ref?: string;
  /** 链上转账条目的网络短码。🔴 必须大写(tx 页 `options.net in NET_LINES` 白名单,小写静默丢弃)。
   *  memo 正迁 memoKey(语言码位),网络不能永远靠 memo 文案正则反解 —— 这个字段就是网络的码位;
   *  非链上条目(奖励/兑换/NEX 等)不填。 */
  network?: "TRC20" | "ERC20" | "BEP20";
  balanceAfter?: number;
  reservedAfter?: number;
}

/**
 * 账单入参 —— **落盘的是 `Bill`,不是它**:`id` / `ts` / `balanceAfter` 由 store 与服务端时钟负责,
 * `atMs` 是**构造期字段**,只用来决定这一行的 `ts`,写盘前必须被解构掉(见 `addMany`)。
 */
export type BillDraft = Omit<Bill, "id" | "ts" | "balanceAfter"> & {
  /**
   * 🔴 这**一条**分录自己的事件时刻,覆盖整批的 `atMs`。不传 = 跟整批走(绝大多数分录本来就同时发生)。
   *
   * 为什么需要「单条」这一级(2026-08-12):一组分录**不必然是同一件事**。提现那一族里,
   * USDT 主行与 NEX 抵扣费行发生在**提交**那一刻,而失败退还的 `+N NEX` 冲正行发生在
   * **退款**那一刻 —— 两者可以差几个月。整批盖一个时刻的话,冲正行落进提交那个月的分组
   * (账单页按 `ts` 分月),用户在退款当月的账单里找不到钱回来的记录,而钱包里的 NEX
   * 确实是那个月变的:同一笔钱两个口径对不上。
   *
   * 🔴 它**不是**「随便挑个好看的日期」的口子:值必须指到一个真实事件的时刻,
   * 拿不到真时刻的回落规则要写在构造处并说清(本仓禁令:显示的钱和时间必须指到单源)。
   */
  atMs?: number;
};

/**
 * 单条分录的事件时刻 → 落盘 `ts`。**纵深防御,不是主门**(主门在生产者,如
 * `lib/withdrawal-bill-drafts` 的 `nexRefundAtMs`)。
 *
 * 🔴 为什么原语也要有一道:`?? ` 只挡 `null`/`undefined`,实测 `NaN` / `Infinity` / `0` / 负数 /
 * 字符串全部穿过并落进 `Bill.ts` —— `NaN` 落盘 JSON 序列化成 **null**(该行永久损坏)、`0` 渲染成
 * 1970 年 1 月。而本批把 `ReceiptDraft` 放宽成带 `atMs` 的类型后,全站 6 个 draft 构造点都够得着它:
 * 校验只放在**调用方**等于把信任边界交给一个开放集合。
 *
 * 🔴 非法值回落到 **`mockServerNow()`,不是整批 `ts`**(2026-08-12 修法证伪):唯一的存量调用路径
 * (App.vue ⓪)传的整批 `ts` **就是 `wd.submittedAt`** —— 回落到它等于把本包要修的缺陷原样放回去。
 *
 * 🔴 **不抛错**:`addMany` 跑在 `postMoneyBills` 的扣款**之后**且外层无 try,抛错会绕过
 * `restoreMoney(undo)` 与失败提示 → 钱扣了、无分录、无回滚、无提示,正是 money-receipt 头注要根治的那一格。
 */
function rowTs(atMs: number | undefined, batchTs: number): number {
  // 没传 = 这一条本来就跟整批走(绝大多数分录),用 batchTs —— 这是正常路径,不是降级。
  if (atMs === undefined) return batchTs;
  // 传了但非法 = 生产者有 bug。此时**不能**退回 batchTs(它就是 submittedAt),盖当前时刻。
  return Number.isFinite(atMs) && atMs > 0 ? atMs : mockServerNow();
}

/**
 * Reward-type credits (activity bonus / referral commission / achievement;
 * CS compensation posts as `bonus`) — the "system rewards" family surfaced in
 * My Rewards (/me/rewards) AND its unread dot on the Me entry. Single source:
 * both consumers must share this predicate so the dot can never disagree with
 * the page content.
 */
export const REWARD_BILL_TYPES: readonly BillType[] = ["bonus", "refer", "achievement"];
export function isRewardBill(b: Bill): boolean {
  return REWARD_BILL_TYPES.includes(b.type) && b.amount > 0;
}

// 旧设备级单键 "nexgrid-bills-v1" 废弃(存量无账号归属,mock 可重建);账单按账号分行。
const ACCOUNTS_KEY = "nexgrid-bills-accounts-v1"; // { [accountKey]: { bills: Bill[] } }

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedBills(): Bill[] {
  const now = Date.now();
  const DAY = 24 * 3600 * 1000;
  const list: Omit<Bill, "id" | "balanceAfter">[] = [];
  const rngEarn = mulberry32(1);
  const rngRefer = mulberry32(2);

  for (let i = 30; i > 0; i--) {
    list.push({
      ts: now - i * DAY + 10 * 3600 * 1000,
      type: "earn",
      symbol: "USDT",
      amount: +(0.04 + rngEarn() * 0.08).toFixed(4),
      status: "posted",
      memo: "Daily AI inference earnings", memoKey: "earnDaily",
    });
  }
  for (let i = 26; i > 0; i -= 6) {
    list.push({
      ts: now - i * DAY + 14 * 3600 * 1000,
      type: "refer",
      symbol: "USDT",
      amount: +(0.18 + rngRefer() * 0.4).toFixed(4),
      status: "posted",
      memo: "Direct referral 5% commission", memoKey: "referDirect",
    });
  }
  list.push({ ts: now - 29 * DAY, type: "bonus", symbol: "USDT", amount: 5.0, status: "posted", memo: "Welcome bonus credited on activation", memoKey: "welcomeBonus" });
  list.push({ ts: now - 29 * DAY + 60 * 1000, type: "bonus", symbol: "NEX", amount: 10, status: "posted", memo: "Achievement · First Contribution", memoKey: "achFirstContribution" });
  list.push({ ts: now - 14 * DAY + 5 * 3600 * 1000, type: "achievement", symbol: "NEX", amount: 20, status: "posted", memo: "Achievement · First Dollar", memoKey: "achFirstDollar" });
  list.push({ ts: now - 12 * DAY, type: "topup", symbol: "USDT", amount: 50.0, status: "posted", memo: "Top-up · USDT-TRC20", memoKey: "topupTrc20", ref: "TX-20260503-7621" });
  // 🔴 种子不造 withdraw 行:提现账单行与提现单据(app.withdrawals)必须同源成对 ——
  // 只造账单行的话,追踪页按单号深链必「查无此单」(每个新账号都命中),
  // 还与提现页「这是你第一次提现」自相矛盾(证伪报告 C-2,2026-08-02 起删除)。

  return list.sort((a, b) => b.ts - a.ts).map((b) => ({ ...b, id: mockServerId("BL") }));
}

/**
 * 🔴 只排序,**不再自己算 balanceAfter**(2026-08-01 走查 P0-1)。
 *
 * 原实现从 0 正向累加账单里 status==="posted" 的 USDT 行。两处结构性错误:
 *  ① 账单是**部分**流水 —— 不是每笔余额变动都写账单(收益按 tick 累加就不写),
 *    从 0 累加永远补不齐差额。实测账单写「余额 $60.31」而钱包写「$24,826.56」,
 *    差 400 倍,用户看对账单第一反应是「我的两万四被吞了」。
 *  ② 提现在**提交那一刻**就把钱扣掉(2026-08-10 起扣款发生在服务端 `POST /api/withdrawals`,
 *    不在本地),账单却落 status:"pending" —— 只数 posted 等于把已经扣掉的钱又算回来。
 *
 * balanceAfter 的正主是服务端复式账本(见文件头注释:server owns ids + balanceAfter)。
 * mock 期由 wallet-bills 页以**当前真实余额为锚往回倒推**,store 不编造。
 */
function recomputeBalance(bills: Bill[]): Bill[] {
  return [...bills].sort((a, b) => b.ts - a.ts);
}

function hydrate(accountKey: string): Bill[] {
  const row = readAccountRow<{ bills?: Bill[] }>(ACCOUNTS_KEY, accountKey);
  if (row && Array.isArray(row.bills) && row.bills.length) {
    // 🔴 剥掉存量本地数据里的 balanceAfter。旧实现把**自己算错的**余额写进了每条账单并落盘
    // (实测盘上就有 balanceAfter: 60.3065,而真实余额是两万四)。现在这个字段只认服务端下发,
    // 不剥的话页面会把那批旧错值原样渲染出来 —— 等于把已修的 P0 换个方式放回去。
    // 顺带过一次排序:读盘这条路径原本直接 return,倒序只是「上次写盘时碰巧排过」的巧合。
    return recomputeBalance(row.bills.map(({ balanceAfter: _drop, ...rest }) => rest as Bill));
  }
  return recomputeBalance(seedBills());
}

export const useBills = defineStore("bills", () => {
  // 账号维度。boot 期落 "default";账号确定后由 lib/account-scope 的
  // rebindAccountScopedStores 统一重绑(P-031 store 不互 import)。
  let boundKey = "default";
  const localBills = ref<Bill[]>(fundsServerEnabled ? [] : hydrate(boundKey));
  let requestGeneration = 0;
  const ledgers = new Map<string, WalletLedgerPager>();
  function getLedger(filters: WalletBillFilters = {}): WalletLedgerPager {
    const key = `${filters.asset ?? ""}|${filters.direction ?? ""}|${filters.category ?? ""}`;
    let pager = ledgers.get(key);
    if (!pager) {
      const stableFilters = { ...filters };
      pager = createWalletLedgerPager((page, cursor) => walletBillsApi.list(page, 50, { ...stableFilters, cursor }), productionBill);
      ledgers.set(key, pager);
    }
    return pager;
  }
  const defaultLedger = getLedger();
  const bills = computed<Bill[]>({
    get: () => fundsServerEnabled ? defaultLedger.rows : localBills.value,
    set: rows => { if (fundsServerEnabled) defaultLedger.rows = rows; else localBills.value = rows; },
  });
  const serverStatus = computed(() => fundsServerEnabled ? defaultLedger.status : "ready");
  const serverError = computed(() => fundsServerEnabled ? defaultLedger.error : "");
  const summary = ref<(Omit<WalletBillsSummary, "recentNexBills"> & { recentNexBills: Bill[] }) | null>(null);
  const summaryStatus = ref<LedgerLoadStatus>("idle");
  const summaryError = ref("");
  let summaryFlight: Promise<void> | null = null;
  let summaryGeneration = 0;

  function persist(): boolean {
    if (fundsServerEnabled) return false;
    return writeAccountRow<{ bills: Bill[] }>(ACCOUNTS_KEY, boundKey, { bills: bills.value });
  }

  function productionBill(row: WalletBillRow): Bill {
    const amount = row.direction === "IN" ? row.amount : -row.amount;
    const legacy = legacyPresentation(row.bizType);
    const type = row.category ?? legacy?.type ?? "other";
    const projectedMemoKey = presentationCode(row.presentationCode);
    // Older projections identify every withdrawal leg as generic `withdraw`.
    // A known legacy component is more specific; new component codes still win.
    const memoKey = projectedMemoKey === "bonus" && row.bizType === "LEARNING_REWARD"
      ? "learningReward"
      : projectedMemoKey === "withdraw" && legacy?.memoKey !== undefined && legacy.memoKey !== "withdraw"
      ? legacy.memoKey
      : projectedMemoKey ?? legacy?.memoKey ?? categoryMemoKey(type);
    return {
      id: row.id,
      type,
      amount,
      symbol: row.asset,
      status: row.status === "SUCCESS" ? "posted" : row.status === "PENDING" ? "pending" : "failed",
      ts: row.createdAt,
      // `remark` and `bizNo` are ledger internals. A new server supplies controlled
      // projection fields; the exact legacy allowlist keeps older servers readable.
      memo: "",
      memoKey,
      ref: row.publicReference ?? legacyPublicReference(row.bizType, row.bizNo, legacy?.publicReference),
      balanceAfter: row.balanceAfter,
    };
  }

  type LegacyPublicReference = "direct" | "withdrawalComponent";
  type LegacyPresentation = { type: BillType; memoKey: string; publicReference?: LegacyPublicReference };
  const LEGACY_PRESENTATIONS: Record<string, LegacyPresentation> = {
    COMPUTE_TASK_REWARD: { type: "earn", memoKey: "computeTaskReward" },
    DAILY_CHECK_IN: { type: "bonus", memoKey: "dailyCheckIn" },
    TRIAL_CHARGE: { type: "purchase", memoKey: "trialCharge" },
    TRIAL_BONUS: { type: "bonus", memoKey: "trialBonus" },
    QUEST_REWARD: { type: "achievement", memoKey: "questReward" },
    PURCHASE_REWARD: { type: "bonus", memoKey: "purchaseReward" },
    // 课程奖励(zentao #219):自己的码位,与其它 bonus 区分开。
    LEARNING_REWARD: { type: "bonus", memoKey: "learningReward" },
    ORDER_PURCHASE: { type: "purchase", memoKey: "purchase", publicReference: "direct" },
    GENESIS_PURCHASE: { type: "purchase", memoKey: "purchase", publicReference: "direct" },
    WITHDRAWAL: { type: "withdraw", memoKey: "withdraw", publicReference: "direct" },
    WITHDRAW_PAYOUT: { type: "withdraw", memoKey: "withdraw", publicReference: "direct" },
    // Each current withdrawal writer emits one immutable component row.  The
    // value before ':' is the withdrawal number; suffixes identify internal
    // accounting legs and must never become the user-facing tracking id.
    WITHDRAW_NET_PRINCIPAL: { type: "withdraw", memoKey: "withdrawPrincipal", publicReference: "withdrawalComponent" },
    WITHDRAW_NETWORK_FEE: { type: "withdraw", memoKey: "withdrawNetworkFee", publicReference: "withdrawalComponent" },
    WITHDRAW_PENALTY_FEE: { type: "withdraw", memoKey: "withdrawPenaltyFee", publicReference: "withdrawalComponent" },
    WITHDRAW_FEE_OFFSET: { type: "withdraw", memoKey: "withdrawFeeOffset", publicReference: "withdrawalComponent" },
    WITHDRAW_PAYOUT_REFUND: { type: "withdraw", memoKey: "withdrawPayoutRefund", publicReference: "withdrawalComponent" },
    WITHDRAW_PAYOUT_NEX_REFUND: { type: "withdraw", memoKey: "withdrawPayoutNexRefund", publicReference: "withdrawalComponent" },
    WITHDRAW_REFUND: { type: "withdraw", memoKey: "withdrawRefund", publicReference: "withdrawalComponent" },
    WITHDRAW_FEE_OFFSET_REFUND: { type: "withdraw", memoKey: "withdrawFeeOffsetRefund", publicReference: "withdrawalComponent" },
    DEPOSIT: { type: "topup", memoKey: "topup", publicReference: "direct" },
    TOPUP: { type: "topup", memoKey: "topup", publicReference: "direct" },
    RECHARGE: { type: "topup", memoKey: "topup", publicReference: "direct" },
    VIETQR_DEPOSIT: { type: "topup", memoKey: "topup", publicReference: "direct" },
    EXCHANGE_SELL: { type: "swap", memoKey: "swap" },
    EXCHANGE_BUY: { type: "swap", memoKey: "swap" },
  };
  const PRESENTATION_CODES: Record<string, string> = {
    computeTaskReward: "computeTaskReward",
    dailyCheckIn: "dailyCheckIn",
    trialCharge: "trialCharge",
    trialBonus: "trialBonus",
    questReward: "questReward",
    purchaseReward: "purchaseReward",
    learningReward: "learningReward",
    earn: "earn",
    refer: "refer",
    bonus: "bonus",
    topup: "topup",
    withdraw: "withdraw",
    withdrawPrincipal: "withdrawPrincipal",
    withdrawNetworkFee: "withdrawNetworkFee",
    withdrawPenaltyFee: "withdrawPenaltyFee",
    withdrawFeeOffset: "withdrawFeeOffset",
    withdrawPayoutRefund: "withdrawPayoutRefund",
    withdrawPayoutNexRefund: "withdrawPayoutNexRefund",
    withdrawRefund: "withdrawRefund",
    withdrawFeeOffsetRefund: "withdrawFeeOffsetRefund",
    purchase: "purchase",
    swap: "swap",
    verification: "verification",
    stake: "stake",
    unstake: "unstake",
    achievement: "achievement",
    other: "other",
  };
  const CATEGORY_MEMO_KEYS: Record<BillType, string> = {
    earn: "earn", refer: "refer", bonus: "bonus", topup: "topup", withdraw: "withdraw", purchase: "purchase",
    swap: "swap", verification: "verification", stake: "stake", unstake: "unstake", achievement: "achievement", other: "other",
  };
  function legacyPresentation(bizType: string) {
    return LEGACY_PRESENTATIONS[bizType.trim().toUpperCase()];
  }
  function legacyPublicReference(bizType: string, bizNo: string, kind: LegacyPublicReference | undefined): string | undefined {
    if (bizType === "LEARNING_REWARD") {
      const match = /^LEARN:[1-9][0-9]*:([a-z0-9][a-z0-9-]{2,80}):([A-Za-z0-9][A-Za-z0-9._-]{0,31})$/.exec(bizNo);
      return match ? `${match[1]}@${match[2]}` : undefined;
    }
    if (kind === "direct") return bizNo;
    if (kind !== "withdrawalComponent") return undefined;
    const value = bizType.trim().toUpperCase();
    if (value === "WITHDRAW_REFUND") return validWithdrawalNo(trimKnownPrefix(bizNo, "D2-REFUND-"));
    if (value === "WITHDRAW_FEE_OFFSET_REFUND") return validWithdrawalNo(trimKnownPrefix(bizNo, "D2-NEX-REFUND-"));
    const suffix = withdrawalComponentSuffix(value);
    return suffix ? validWithdrawalNo(trimKnownComponentSuffix(bizNo, suffix)) : undefined;
  }
  function trimKnownPrefix(value: string, prefix: string): string | undefined {
    if (!value.startsWith(prefix)) return undefined;
    const reference = value.slice(prefix.length);
    return reference || undefined;
  }
  function withdrawalComponentSuffix(bizType: string): string | undefined {
    switch (bizType) {
      case "WITHDRAW_NET_PRINCIPAL": return ":USDT:PRINCIPAL";
      case "WITHDRAW_NETWORK_FEE": return ":USDT:NETWORK_FEE";
      case "WITHDRAW_PENALTY_FEE": return ":USDT:PENALTY_FEE";
      case "WITHDRAW_FEE_OFFSET": return ":NEX:OFFSET";
      case "WITHDRAW_PAYOUT_REFUND": return ":PAYOUT:USDT:REFUND";
      case "WITHDRAW_PAYOUT_NEX_REFUND": return ":PAYOUT:NEX:REFUND";
      default: return undefined;
    }
  }
  function trimKnownComponentSuffix(value: string, suffix: string): string | undefined {
    if (!value.endsWith(suffix)) return undefined;
    const reference = value.slice(0, -suffix.length);
    return reference || undefined;
  }
  function validWithdrawalNo(value: string | undefined): string | undefined {
    // AppWithdrawalService emits WD- plus an upper-case UUID without hyphens.
    if (!value?.startsWith("WD-") || value.length !== 35) return undefined;
    for (let index = 3; index < value.length; index += 1) {
      const char = value.charCodeAt(index);
      const digit = char >= 48 && char <= 57;
      const upperHex = char >= 65 && char <= 70;
      if (!digit && !upperHex) return undefined;
    }
    return value;
  }
  function presentationCode(code: string | undefined): string | undefined {
    return code && Object.prototype.hasOwnProperty.call(PRESENTATION_CODES, code) ? PRESENTATION_CODES[code] : undefined;
  }
  function categoryMemoKey(type: BillType): string {
    return CATEGORY_MEMO_KEYS[type];
  }

  function refreshServerLedger(options: { force?: boolean } = {}): Promise<void> {
    return fundsServerEnabled ? defaultLedger.refresh(options) : Promise.resolve();
  }

  /** Coalesce only active reads; a later read must see newly posted financial events. */
  function refreshSummary(options: { force?: boolean } = {}): Promise<void> {
    if (!fundsServerEnabled) return Promise.resolve();
    if (summaryFlight && !options.force) return summaryFlight;
    const expectedAccount = requestGeneration;
    const expected = ++summaryGeneration;
    summaryStatus.value = "loading"; summaryError.value = "";
    const request = walletBillsApi.summary().then(snapshot => {
      if (expectedAccount !== requestGeneration || expected !== summaryGeneration) throw new Error("WALLET_SUMMARY_REQUEST_SUPERSEDED");
      summary.value = { ...snapshot, recentNexBills: snapshot.recentNexBills.map(productionBill) };
      summaryStatus.value = "ready";
    }).catch(cause => {
      if (expectedAccount === requestGeneration && expected === summaryGeneration) {
        summary.value = null;
        summaryStatus.value = "error";
        summaryError.value = cause instanceof Error ? cause.message : "WALLET_SUMMARY_REFRESH_FAILED";
      }
      throw cause;
    }).finally(() => { if (expectedAccount === requestGeneration && expected === summaryGeneration) summaryFlight = null; });
    summaryFlight = request;
    return request;
  }

  /** 账号切换重绑:装载该账号的账单行(变更处处即时 persist,旧账号无需先落盘)。 */
  function bindAccount(rawAccountKey: string) {
    requestGeneration += 1;
    boundKey = normalizeAccountKey(rawAccountKey);
    if (fundsServerEnabled) {
      for (const pager of ledgers.values()) pager.reset();
      summaryGeneration++; summaryFlight = null;
      summary.value = null; summaryStatus.value = "idle"; summaryError.value = "";
      // Binding must not fetch the entire ledger (or any detail page).
      if (boundKey !== "default") void refreshSummary().catch(() => { /* summaryError owns the visible failure */ });
      return;
    }
    bills.value = hydrate(boundKey);
  }

  /**
   * 🔴 按 `ref` 判重地把 N 条分录写到**指定账号**,不看当前绑定(R3 P1 + z4 R1)。
   *
   * 为什么要「指定账号」:提现在 `await` 期间被换号时,钱已经扣在**旧账号**上,而 `add()`
   * 只会写进当前绑定的那本账 —— 写就是别人的流水,不写则旧账号有扣款无凭证。二选一都是错的;
   * 正解是把这一笔写回**真正被扣的那个账号**。
   *
   * 🔴 为什么判重 —— **纵深防御,不是修一个够得着的缺陷**(z4 R1/R2 的诚实结论)。
   * 三路独立审计都报「歧义重试会写出两条同单号的 −$X」,我一度也确认了;再往下追不成立:
   * 提交**成功**那一刻页面会 `clearSubmitIntent()` 换掉幂等键,服务端下次必开新单;
   * 而歧义失败那次根本没走到写账单。runtime 门在真页面上构造不出「两次都成功且返回同一张单」。
   * 判重仍然留着,理由是这条链上**别处全是幂等的**(`app.withdrawals` 按 id 去重、
   * 领奖按 ref 判重、入金按 txHash 判重),独缺账单这一环 = 一半幂等一半不幂等;
   * 而且 App.vue 的自愈补写要反复调它。**别把它当成「已修的 P0」记账。**
   *
   * 判重键 = `ref + type + symbol`(与 `addOnce` 同一把键),**逐腿判**不是整组判:
   * 全在 → 一条不写,返回既有行;全不在 → N 条一次落盘(原子,不存在半边账);
   * 🔴 部分在 → 只补缺的那几条。上一版整组判,于是「主行被跨标签页覆盖掉、NEX 腿还在」时
   * 同 ref 命中即整组跳过,自愈路径(App.vue ⓪)一辈子补不回那条主行 —— 而那一格正是它要救的
   * (z4 R2 独立审计点名)。「分录同生共死」说的是**新写**那一刻的原子性,不是「缺了也不许补」。
   *
   * 目标账号即当前绑定时走 `addMany()`(要同步刷新内存态,页面才能立刻看到);不同才走直写。
   * 直写不碰 `bills.value` —— 那是当前账号的视图,把别人的流水塞进去正是本函数要避免的事。
   */
  function addManyForAccountOnce(
    rawAccountKey: string,
    drafts: BillDraft[],
    /**
     * 🔴 **补记**这一笔时的事件时刻(不传 = 现在)。
     * 只给「把过去发生的事补进账本」用:自愈补写一笔三天前的提现时,若还盖当前时钟,
     * 那一行会落在账单页**今天**这一组的最上面 —— 账本给自己的历史标错日期。
     * 正常提交路径**不要**传:那一刻的「现在」就是事件时刻,由 mockServerNow 单时源给。
     *
     * 🔴 它是**整批**的时刻,而一组分录不必然同时发生 —— 组里某一条另有自己的事件时刻时,
     * 由那一条自带 `atMs` 覆盖(见 `BillDraft.atMs`),不是把整批都改掉。
     */
    atMs?: number,
  ): Bill[] | null {
    // 🔴 服务端账本档下一条都不写(远端线焊在 addForAccount 上的同一道闸,本地线把它改名成了多腿版)。
    // 分录归服务端在同一事务里写,client 只消费权威投影;这里再写一条就是伪造账本。
    // 代价说清楚:提现提交后的本地补写因此只在 mock 档生效(runtime 门 withdraw-bill-runtime 正是跑在 mock),
    // 服务端档下那两条分录得由服务端账本给出。
    if (fundsServerEnabled) return null;
    if (!drafts.length) return [];
    const target = normalizeAccountKey(rawAccountKey);
    // 🔴 同一组分录必须共用一个 ref —— 判重键含 ref,混 ref 的一组会各判各的,
    // 「同生共死」当场失效。不静默降级,直接抛(与 postMoneyBillsOnce 空 ref 抛错同款)。
    const refs = new Set(drafts.map((d) => d.ref ?? ""));
    if (refs.size !== 1 || refs.has("")) throw new Error("BILLS_GROUP_REF_MUST_BE_SINGLE");
    // 🔴 键必须含**方向**(z4 R3 独立审计 P0):同一单号下 NEX 有两条腿 ——
    // 抵扣费的 `−N`(烧)与失败退还的 `+N`(冲正),两者 ref/type/symbol 全同。
    // 不含方向时它们撞成一条:主行被跨标签页覆盖后走自愈,`+N` 会把 `−N` 的位置占住,
    // 于是账上永远只剩「退还 +3 NEX」这条孤行 —— 正好是本包要修的那个形态换了个方向复发。
    const key = (b: { ref?: string; type: BillType; symbol: Bill["symbol"]; amount: number }) =>
      `${b.ref}|${b.type}|${b.symbol}|${b.amount < 0 ? "-" : "+"}`;
    const missing = (existing: Bill[]) => {
      const have = new Set(existing.map(key));
      return drafts.filter((d) => !have.has(key(d)));
    };
    if (target === boundKey) {
      const todo = missing(bills.value);
      if (!todo.length) return bills.value.filter((b) => drafts.some((d) => key(d) === key(b)));
      return addMany(todo, atMs);
    }
    // 🔴 基线走 `hydrate(target)`,不是「读盘,读不到就当空」(z4 R1 独立审计 + 本门 ⑧(e) 实测)。
    //
    // 目标账号如果还没**落过盘**(它的 30 天流水此刻只活在别的标签页内存里,或者压根还没被
    // 打开过),按空数组合并就会把整本账替换成这两条 —— 而 `hydrate` 之后只认「行存在且非空」,
    // 于是再也不会补种子:那个账号的账单页从此只剩这两条提现,历史凭空消失。
    // 实测 39 条 → 2 条。`hydrate` 同时剥掉存量 balanceAfter,与读盘那条路同口径。
    const existing = hydrate(target);
    const todo = missing(existing);
    if (!todo.length) return existing.filter((b) => drafts.some((d) => key(d) === key(b)));
    // 同一笔交易的分录共用一个 ts 并**一次落盘** —— 与 addMany 同一条纪律(半边账不存在)。
    // 自带 `atMs` 的那条走自己的时刻(与 addMany 同一条规则,两条路径不许漂移)。
    const ts = atMs ?? mockServerNow();
    const next: Bill[] = todo.map(({ atMs: rowAtMs, ...b }) => ({
      ...b, id: mockServerId("BL"), ts: rowTs(rowAtMs, ts),
    }));
    const merged = recomputeBalance([...next, ...existing]);
    if (!writeAccountRow<{ bills: Bill[] }>(ACCOUNTS_KEY, target, { bills: merged })) return null;
    return next;
  }

  /**
   * 🔴 一次落盘写 N 条分录 —— 复式账本里「一笔交易」的分录必须同生共死(2026-08-04 R4)。
   *
   * 为什么不是循环调 `add()`:add 每条各 persist 一次,于是存在「第一条落了、第二条没落」
   * 的中间态。兑换这种**一进一出**的交易一旦卡在那儿,账本上只剩半边,而钱两边都已经动了 ——
   * 用户看到「兑换完成」,账单里却只有扣、没有进。把 N 条一次性拼进数组再写一次盘,
   * 那个中间态**根本不存在**:要么 N 条全在,要么一条不留。调用方因此不需要
   * 「删掉第一条」或「补一条冲正分录」这类补丁 —— 没有既成事实要冲正。
   *
   * 同一笔交易的分录**默认**共用一个 ts(它们通常本来就发生在同一时刻);
   * 组里确有另一时刻的那一条自带 `atMs` 覆盖(见 `BillDraft.atMs` —— 提现失败退还的冲正行
   * 与被它冲正的那两行可以差几个月)。「一次落盘」是原子性,不是「必须同一个时间戳」。
   * PROD:服务端在同一事务里写这 N 条分录,client 只消费。
   */
  function addMany(drafts: BillDraft[], atMs?: number): Bill[] | null {
    if (fundsServerEnabled) return null;
    if (!drafts.length) return [];
    // Server-clock domain — the rewards-seen watermark compares against ts,
    // so both must route through the same single time source.
    // `atMs` 只给**补记历史事件**用(见 addManyForAccountOnce 的同名参数);不传即「现在」。
    const ts = atMs ?? mockServerNow();
    // 🔴 `atMs` 是**构造期字段,必须在这里被解构掉**:直接 `{ ...b }` 会把它一起写进落盘的
    // Bill 行,而 `Bill` 上根本没有这个键 —— 渲染、判重、合并、balanceAfter 全不认它,
    // 它只会随存量数据长期留在盘上,并让「Bill 的字段集」这件事从此说不清。
    const next: Bill[] = drafts.map(({ atMs: rowAtMs, ...b }) => ({
      ...b, id: mockServerId("BL"), ts: rowTs(rowAtMs, ts),
    }));
    const previous = bills.value;
    bills.value = recomputeBalance([...next, ...previous]);
    if (!persist()) {
      bills.value = previous;
      return null;
    }
    return next;
  }

  /** 单条 = N=1 的退化情形。走同一条实现,两者的落盘/回滚语义不可能各自漂移。 */
  function add(b: BillDraft): Bill | null {
    return addMany([b])?.[0] ?? null;
  }

  /** Stable ref + type + symbol is the mock server idempotency key. */
  function addOnce(b: BillDraft): Bill | null {
    if (fundsServerEnabled) return null;
    const existing = b.ref
      ? bills.value.find((bill) => bill.ref === b.ref && bill.type === b.type && bill.symbol === b.symbol)
      : null;
    return existing ?? add(b);
  }

  function seed() {
    if (fundsServerEnabled) {
      bills.value = [];
      return;
    }
    bills.value = recomputeBalance(seedBills());
    persist();
  }

  /**
   * 按单号把在途账单行结算到终态。
   *
   * 🔴 为什么必须有:提现建单时写的是 `status: "pending"`,而账单页只把 `posted` 的行
   * 计进流水余额。到账推进以前只改提现单据的状态、不碰账单行 —— 结果是钱到账了、
   * 账单永远停在「处理中」,流水余额与真实余额长期差一整笔(审计 P0)。
   * PROD:服务端 confirm 时 post 这条分录,client 只消费。
   */
  function settleByRef(ref: string, status: Bill["status"]): boolean {
    if (fundsServerEnabled) return false;
    if (!ref) return false;
    const previous = bills.value;
    let changed = false;
    const next = previous.map((b) => {
      // 🔴 只推进**在途(pending)**行。同一单号下可能还挂着已终态的行 —— NEX 燃烧行
      // 落 posted 即事实已发生,失败终态若把它一起翻成 failed,账单说「没烧」而余额里
      // NEX 当时真少了,两个口径必有一个是假(审计 P1,2026-08-02)。
      // 🔴 2026-08-04 修订:这条规则原本用「NEX 费按规则不退」论证,而 R1 已让失败提现
      // 退还烧掉的 NEX —— 那个前提没了,规则本身仍然成立,但理由换成复式账本的通用规矩:
      // **已终态分录是既成事实,冲正靠反向分录,不是改写原分录**。所以退还不改这一行,
      // 而是同单号补一条 +N NEX 的正向行(见 lib/withdrawal-bill-drafts 的退还分录),
      // 账单页两行相抵 = 钱包里 NEX 的净变化,账本与钱包对得上。
      if (b.ref !== ref || b.status !== "pending" || b.status === status) return b;
      changed = true;
      return { ...b, status };
    });
    if (!changed) return false;
    bills.value = recomputeBalance(next);
    if (!persist()) {
      bills.value = previous;
      return false;
    }
    return true;
  }

  return {
    bills, serverStatus, serverError,
    summary, summaryStatus, summaryError, refreshSummary, getLedger,
    add, addMany, addManyForAccountOnce, addOnce, seed, settleByRef, bindAccount,
    refreshServerLedger,
  };
});

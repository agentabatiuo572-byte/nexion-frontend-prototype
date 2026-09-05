import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";
import type { Withdrawal, WithdrawalStatus, WithdrawalTerminalReason } from "../store/types";
import type { WithdrawalRiskRoute } from "../store/config-types";

export type SupportedWithdrawalNetwork = "USDT-TRC20" | "USDT-BEP20" | "USDT-ERC20";

export interface WithdrawalSubmission {
  withdrawalNo: string;
  targetAddress?: string;
  createdAt?: number;
  amount: number;
  chain: SupportedWithdrawalNetwork;
  status: string;
  holdUntil: string;
  networkConfirmUsd: number;
  networkFee: number;
  penaltyFee: number;
  grossFee: number;
  nexBurned: number;
  /** FEAT-WD01 §4.6:服务端已退还的已烧 NEX(既成事实)。后端未上该字段时解析为 0。 */
  nexRefunded: number;
  /**
   * FEAT-WD01 §4.6:退款**发生**的时刻。**线上是 ISO-8601 字符串**,本字段是解析后的 epoch ms
   * (与 `Withdrawal.submittedAt` / `confirmedAt` 同口径,便于直接比较)。
   *
   * 🔴 缺失 / 不可解析 = `undefined`,**不是 0**:0 是 1970-01-01,而消费点
   * (`isUsableRefundInstant`)的合法域是 `[submittedAt, now]` —— 0 会被判越界、退回观测时刻。
   * 「没有」必须长得不像「有」,否则它会在合并层被当成「带时刻的那份」而顶掉真正准确的一份。
   */
  nexRefundedAt?: number;
  feeWaived: number;
  actualFee: number;
  netReceive: number;
  policyVersion: string;
  useNexFeeOffset: boolean;
  riskRoute: string;
  idSource: "server";
}

export interface WithdrawalPolicy {
  minAmount: number;
  dailyLimitCount: number;
  balanceMaxRatio: number;
  smallAmountThresholdUsd: number;
  strongReviewThresholdUsdt: number;
  payoutSlaHours: number;
  networkConfirmFeeUsd: Record<"trc20" | "bep20" | "erc20", number>;
  nexFeeOffsetRate: number;
  policyVersion: string;
  cooldownDays: number;
  complianceHoldEnabled: boolean;
  withdrawalEnabled: boolean;
  enabledNetworks: SupportedWithdrawalNetwork[];
  currentPhase: string;
  currentMonth: number;
  gateSource: "J1" | "FUNDS_SANDBOX";
  source: "D5+H1" | "FUNDS_SANDBOX";
}

/** 单据状态镜像 —— GET /api/withdrawals/:id (PRD §9.11f 的按 id 读单通式)。 */
export interface WithdrawalStatusSnapshot {
  withdrawalNo: string;
  status: WithdrawalStatus;
  /** 服务端记的实际到账时刻(仅 confirmed 有值);缺省由调用方回落到单据预计到账。 */
  confirmedAt: number | null;
  /** 终态原因(仅终态有值)。null = 服务端没给 / 非终态 —— 页面据此决定要不要出原因行。 */
  terminalReason: WithdrawalTerminalReason | null;
  /**
   * 服务端判定「用户能否就这笔重新发起」。null = 不适用 / 服务端没给。
   * 🔴 **不在客户端由原因码推导**:能不能重来是风控与人工处置的结论(同一个
   * `address-risk`,换个地址可以重提、命中黑名单则不能),客户端推一份等于第二个真理源。
   */
  retriable: boolean | null;
  /**
   * 🔴 FEAT-WD01 §4.6:服务端**已经退还**的已烧 NEX 枚数,以及退款**发生**的时刻。
   *
   * 为什么必须在回查响应里(2026-08-12 两包合并时补):提交即拒是零副作用、不烧 NEX,
   * 所以退还只可能发生在**提交之后** —— 而提交之后客户端唯一的信息入口就是这个回查面。
   * 这个面此前只回 5 个字段,于是「退款证据」永远到不了客户端,冲正分录一次都不会触发。
   * 包 z8 预先把这条判据焊进 selfcheck-withdraw-nex-refund ⑪(本仓一旦出现状态回查面而
   * 响应不带该字段即判红),合并当天如期报警 —— 本段就是补那一半。
   *
   * 两个字段是同一件事实的两个面,**成对**取:缺其一时冲正行的日期会掉回「客户端得知的此刻」。
   * null = 服务端没给(不是「没退」);值域校验与「退得比烧的多」的拒绝收在消费点一处。
   */
  nexRefunded: number | null;
  nexRefundedAt: number | null;
}

export interface WithdrawalApi {
  list(): Promise<WithdrawalSubmission[]>;
  policy(): Promise<WithdrawalPolicy>;
  eligibility(input: {
    amount: number;
    chain: SupportedWithdrawalNetwork;
    address: string;
    policyVersion?: string;
  }): Promise<WithdrawalEligibilitySnapshot>;
  get(withdrawalNo: string): Promise<WithdrawalStatusSnapshot>;
  abandonAttempt(input: WithdrawalAttemptAbandonInput): Promise<WithdrawalAttemptAbandonResult>;
  submit(
    amount: number,
    chain: SupportedWithdrawalNetwork,
    targetAddress: string,
    policyVersion: string,
    useNexFeeOffset: boolean,
    idempotencyKey: string,
  ): Promise<WithdrawalSubmission>;
}

export interface WithdrawalAttemptAbandonInput {
  idempotencyKey: string;
  amount: number;
  chain: SupportedWithdrawalNetwork;
  address: string;
  policyVersion: string;
  useNexFeeOffset: boolean;
}

export type WithdrawalAttemptAbandonResult =
  | { state: "ABANDONED"; withdrawal: null }
  | { state: "COMMITTED"; withdrawal: WithdrawalSubmission };

export interface WithdrawalEligibilitySnapshot {
  canSubmit: boolean;
  maxWithdrawableUsdt: number;
  route: "pass" | "delay" | "manual" | "freeze" | "reject";
  riskReasons: string[];
  fastLaneApplied: boolean;
  waivedGates: string[];
  dailyLimitReached: boolean;
  dailyCountResetAt: number;
  configVersion: string;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseAttemptAbandon(value: unknown): WithdrawalAttemptAbandonResult {
  const row = record(value);
  if (!row || (row.state !== "ABANDONED" && row.state !== "COMMITTED")) {
    throw new Error("WITHDRAWAL_ATTEMPT_RESPONSE_INVALID");
  }
  if (row.state === "ABANDONED") {
    if (row.withdrawal !== null && row.withdrawal !== undefined) throw new Error("WITHDRAWAL_ATTEMPT_RESPONSE_INVALID");
    return { state: "ABANDONED", withdrawal: null };
  }
  return { state: "COMMITTED", withdrawal: parseSubmission(row.withdrawal) };
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(value: unknown, min = 0): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= min ? parsed : null;
}

/**
 * 🔴 ISO-8601 **整串**文法(2026-08-12 独立审计后收紧)。带 `$` 收尾锚是本函数的要害:
 * 上一版用 `/^\d{4}-\d{2}-\d{2}/`(只卡前缀),实测 `"2026-08-05junk"` 过卡口、
 * `Date.parse` 给 **2026-06-07** —— 差两个月,正是本字段存在的理由要修掉的形态。
 * 超出严格 ISO 的部分由各引擎的自定义分支接手,V8 与 iOS JSC 可给不同结果 =
 * 同一份报文安卓/iOS 落不同月(双端不变量破了)。
 *
 * 收 `+07:00` 偏移(目标市场越南,后端多半发本地偏移)与 1-3 位毫秒。
 */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/;
/** 只到日的那一支(降级兼容路径,见 parseRefundInstant)。 */
const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 退款发生时刻:ISO-8601 字符串 → epoch ms。缺失 / 形状不对 / 日历非法 → `undefined`(= 没给),
 * **绝不抛协议错**(宽松档,理由同 §4.5:严格必填 = 后端没上该字段就整单被拒,而钱已经扣了)。
 *
 * 🔴 **只到日是「降级兼容路径」,不是契约**(规格 §4.6② 要求带时区偏移的完整 date-time)。
 * 它按**本地正午**解析,不是 `Date.parse` 的 UTC 午夜:账单页按**本地时区**分月分组,
 * 而 UTC 午夜在负时区会落进上一个月 —— 月初那天必错(实测 `2026-08-01` 在 UTC-5 渲染成 July)。
 * 取正午而非本地午夜,是为了让「同一设备解析、同一设备渲染」这个前提下 UTC-12..+14 全部落回原日历日。
 * 已知边界(不假装修了):**同一设备事后改时区 / 用户出境**时,已冻结的 epoch 会换个日历日渲染,量级一天。
 *
 * 🔴 回环校验**只对只到日那一支**做:`Date.parse("2026-02-29")` 会静默进位成 3 月 1 日(实测),
 * 而带偏移的完整串没有进位风险,对它做回环反而会在负时区把合法值判成非法。
 */
function parseRefundInstant(raw: string | null): number | undefined {
  if (!raw || !ISO_INSTANT.test(raw)) return undefined;
  if (ISO_DATE_ONLY.test(raw)) {
    const [y, m, d] = raw.split("-").map(Number);
    const at = new Date(y, m - 1, d, 12, 0, 0, 0);
    // 回环:本地取值,与上一行的本地构造同一套口径(用 getUTC* 会在负时区误杀)。
    const ok = at.getFullYear() === y && at.getMonth() === m - 1 && at.getDate() === d;
    return ok && at.getTime() > 0 ? at.getTime() : undefined;
  }
  const ms = Date.parse(raw);
  return Number.isFinite(ms) && ms > 0 ? ms : undefined;
}

function parseSubmission(value: unknown): WithdrawalSubmission {
  const row = record(value);
  const chain = row?.chain;
  const withdrawalNo = text(row?.withdrawalNo);
  const status = text(row?.status);
  const targetAddress = text(row?.targetAddress) ?? undefined;
  const createdAtRaw = text(row?.createdAt);
  const createdAt = createdAtRaw ? Date.parse(createdAtRaw) : undefined;
  const holdUntil = text(row?.holdUntil);
  const riskRoute = text(row?.riskRoute);
  const amount = number(row?.amount, Number.EPSILON);
  const networkConfirmUsd = number(row?.networkConfirmUsd);
  const networkFee = number(row?.networkFee);
  const penaltyFee = number(row?.penaltyFee);
  const grossFee = number(row?.grossFee);
  const nexBurned = number(row?.nexBurned);
  // 🔴 FEAT-WD01 §4.6 已退还 NEX ——「宽松解析」是刻意的,理由与 §4.5 第二批字段同一条:
  // 严格必填 = 后端还没上这个字段就整单被拒,**而钱已经扣了**(异常6,本规格最贵的失败模式)。
  // 坏值一律读作 0 = 没退,这是安全侧:漏记一条冲正可自愈(下次取到就补),凭空写一条是造假。
  //
  // 🔴 **不能复用共用的 `number()`**(2026-08-11 独立审计实测):它内部是 `Number(value)`,于是
  // `true → 1`、`"3" → 3`、`[3] → 3`、`2.5 → 2.5` 全部通过。后端若发规格 §4.6③ 明确否掉的
  // boolean 形状,客户端会读成 **1**,在烧 3 退 3 的单上落一条「退回 1 NEX」——
  // 账本上那个数指不到任何源,而钱包实收 3。宽松解析赖以成立的「坏值 = 安全侧」前提当场被破。
  // 上一版注释写的正是「非数字一律读作 0」,与实际行为相反(本仓第四次栽在
  // 「注释声称了没验证过的行为」上,这次栽在我自己手上)。
  //
  // 故这里**只认真正的 JSON number**,并按 §4.6② 的值域收口:非有限数 / 负数 / 非整数一律 0。
  // 整数在解析层判(而不是留给消费方):它是**契约值域**,越界即协议不合,与「≤ nexBurned」
  // 那条**跨字段**不变量不同 —— 后者依赖 fee 且存量单走不同来路,仍收在消费点一处。
  const rawNexRefunded = row?.nexRefunded;
  const nexRefunded = typeof rawNexRefunded === "number"
      && Number.isFinite(rawNexRefunded) && Number.isInteger(rawNexRefunded) && rawNexRefunded >= 0
    ? rawNexRefunded
    : 0;
  // §4.6 退款发生时刻(线上 ISO-8601 字符串 → epoch ms)。值域收口与降级路径见 parseRefundInstant。
  const nexRefundedAt = parseRefundInstant(text(row?.nexRefundedAt));
  const feeWaived = number(row?.feeWaived);
  const actualFee = number(row?.actualFee);
  const netReceive = number(row?.netReceive);
  const policyVersion = text(row?.policyVersion);
  const allowedRiskRoutes = new Set([
    "fast-pass",
    "delay",
    "manual",
    "high-manual",
    "escalated-manual",
    "freeze",
  ]);
  if (!row || !withdrawalNo || !status || !holdUntil || !riskRoute
      || !allowedRiskRoutes.has(riskRoute.toLowerCase())
      || !["USDT-TRC20", "USDT-BEP20", "USDT-ERC20"].includes(String(chain))
      || amount === null || networkConfirmUsd === null || networkFee === null || penaltyFee === null || grossFee === null
      || nexBurned === null || feeWaived === null || actualFee === null || netReceive === null
      || !policyVersion || typeof row.useNexFeeOffset !== "boolean"
      || row.idSource !== "server"
      || Math.abs(networkConfirmUsd - networkFee) > 0.000001
      || Math.abs(networkFee + penaltyFee - grossFee) > 0.000001
      || Math.abs(grossFee - feeWaived - actualFee) > 0.000001
      || Math.abs(amount - actualFee - netReceive) > 0.000001) {
    throw new ApiError({ kind: "protocol", message: "WITHDRAWAL_RESPONSE_INVALID" });
  }
  return {
    withdrawalNo,
    ...(targetAddress ? { targetAddress } : {}),
    ...(createdAt !== undefined && Number.isFinite(createdAt) ? { createdAt } : {}),
    amount,
    chain: chain as SupportedWithdrawalNetwork,
    status,
    holdUntil,
    networkConfirmUsd,
    networkFee,
    penaltyFee,
    grossFee,
    nexBurned,
    nexRefunded,
    nexRefundedAt,
    feeWaived,
    actualFee,
    netReceive,
    policyVersion,
    useNexFeeOffset: row.useNexFeeOffset,
    riskRoute,
    idSource: "server",
  };
}

function parseSubmissionList(value: unknown): WithdrawalSubmission[] {
  const row = record(value);
  if (!row || row.source !== "nx_withdrawal_order" || row.sourceEnvironment !== "PRODUCTION"
      || !Array.isArray(row.withdrawals)) {
    throw new ApiError({ kind: "protocol", message: "WITHDRAWAL_LIST_RESPONSE_INVALID" });
  }
  return row.withdrawals.map(parseSubmission);
}

function parseEligibility(value: unknown): WithdrawalEligibilitySnapshot {
  const row = record(value);
  const route = text(row?.route)?.toLowerCase();
  const reasons = row?.riskReasons;
  const waived = row?.waivedGates;
  const max = number(row?.maxWithdrawableUsdt);
  const reset = number(row?.dailyCountResetAt, 1);
  const configVersion = text(row?.configVersion);
  if (!row || typeof row.canSubmit !== "boolean" || max === null
      || !route || !["pass", "delay", "manual", "freeze", "reject"].includes(route)
      || !Array.isArray(reasons) || reasons.some((item) => typeof item !== "string")
      || !Array.isArray(waived) || waived.some((item) => typeof item !== "string")
      || typeof row.fastLaneApplied !== "boolean" || typeof row.dailyLimitReached !== "boolean"
      || reset === null || !configVersion) {
    throw new ApiError({ kind: "protocol", message: "WITHDRAWAL_ELIGIBILITY_RESPONSE_INVALID" });
  }
  return {
    canSubmit: row.canSubmit, maxWithdrawableUsdt: max, route: route as WithdrawalEligibilitySnapshot["route"],
    riskReasons: reasons as string[], fastLaneApplied: row.fastLaneApplied,
    waivedGates: waived as string[], dailyLimitReached: row.dailyLimitReached,
    dailyCountResetAt: reset, configVersion,
  };
}

function parsePolicy(value: unknown): WithdrawalPolicy {
  const row = record(value);
  const minAmount = number(row?.minAmount, Number.EPSILON);
  const dailyLimitCount = number(row?.dailyLimitCount, 1);
  const balanceMaxRatio = number(row?.balanceMaxRatio, Number.EPSILON);
  const smallAmountThresholdUsd = number(row?.smallAmountThresholdUsd);
  const strongReviewThresholdUsdt = number(row?.strongReviewThresholdUsdt, Number.EPSILON);
  const payoutSlaHours = number(row?.payoutSlaHours, 1);
  const networkFees = record(row?.networkConfirmFeeUsd);
  const trc20 = number(networkFees?.trc20);
  const bep20 = number(networkFees?.bep20);
  const erc20 = number(networkFees?.erc20);
  const nexFeeOffsetRate = number(row?.nexFeeOffsetRate);
  const policyVersion = text(row?.policyVersion);
  const cooldownDays = number(row?.cooldownDays, 1);
  const currentPhase = text(row?.currentPhase);
  const currentMonth = number(row?.currentMonth, 1);
  const rawEnabledNetworks = row?.enabledNetworks;
  const enabledNetworks = Array.isArray(rawEnabledNetworks)
    ? rawEnabledNetworks.filter((item): item is SupportedWithdrawalNetwork =>
      item === "USDT-TRC20" || item === "USDT-BEP20" || item === "USDT-ERC20")
    : [];
  if (!row || minAmount === null || dailyLimitCount === null || !Number.isInteger(dailyLimitCount)
      || balanceMaxRatio === null || balanceMaxRatio > 1
      || smallAmountThresholdUsd === null || smallAmountThresholdUsd > 500
      || strongReviewThresholdUsdt === null || strongReviewThresholdUsdt > 10000000
      || payoutSlaHours === null || payoutSlaHours > 168 || !Number.isInteger(payoutSlaHours)
      || trc20 === null || bep20 === null || erc20 === null
      || trc20 > 25 || bep20 > 25 || erc20 > 25
      || [trc20, bep20, erc20].some((fee) => Math.abs(fee * 2 - Math.round(fee * 2)) > 0.000001)
      || nexFeeOffsetRate === null || nexFeeOffsetRate <= 0 || !policyVersion
      || cooldownDays === null || !Number.isInteger(cooldownDays)
      || !currentPhase || currentMonth === null || !Number.isInteger(currentMonth)
      || typeof row.complianceHoldEnabled !== "boolean"
      || typeof row.withdrawalEnabled !== "boolean" || row.gateSource !== "J1"
      || enabledNetworks.length !== (rawEnabledNetworks as unknown[])?.length
      || enabledNetworks.length === 0 || row.source !== "D5+H1") {
    throw new ApiError({ kind: "protocol", message: "WITHDRAWAL_POLICY_INVALID" });
  }
  return {
    minAmount,
    dailyLimitCount,
    balanceMaxRatio,
    smallAmountThresholdUsd,
    strongReviewThresholdUsdt,
    payoutSlaHours,
    networkConfirmFeeUsd: { trc20, bep20, erc20 },
    nexFeeOffsetRate,
    policyVersion,
    cooldownDays,
    complianceHoldEnabled: row.complianceHoldEnabled,
    withdrawalEnabled: row.withdrawalEnabled,
    enabledNetworks,
    currentPhase,
    currentMonth,
    gateSource: "J1",
    source: "D5+H1",
  };
}

function canonicalStatus(status: string): WithdrawalStatus {
  switch (status.trim().toUpperCase()) {
    case "REVIEW_PENDING":
    case "REVIEWING":
    case "EXTENDED_HOLD":
    case "DELAYED":
      return "review-pending";
    case "REVIEW_PASSED":
    case "PENDING_CHAIN":
      return "review-passed";
    case "PROCESSING":
      return "processing";
    case "SENT":
    case "CHAIN_SUBMITTED":
      return "sent";
    case "CONFIRMED":
    case "SUCCESS":
      return "confirmed";
    case "REJECTED":
    case "REVIEW_REJECTED":
      return "review-rejected";
    case "FROZEN":
      return "frozen";
    case "ADDRESS_INVALID":
      return "address-invalid";
    case "FAILED":
    case "TX_FAILED":
    // 🔴 孤块 / 死亡信件(后台 D2 的 TX_ORPHANED·DEAD)。两个码此前**一个都不认**,
    // 于是服务端一发这种终态,canonicalStatus 就抛 protocol → refreshRemoteWithdrawals
    // 的 `.catch(() => null)` 静默吞掉 → 这一单**永久停在「处理中」**,
    // 换绑入口与下一笔提现被连带永久拦死。立卡描述的症状正是以这个窄口径真实存活着。
    //
    // 归到既有 `tx-failed` 而不是新开一个客户端状态:对用户而言两者都是
    // 「转账没走成」,归过来即刻接上既有的失败终态处理(账单结算成失败 + 客服出口);
    // 新增状态要动 6 处枚举与三语文案,零用户可见收益。
    // ⚠️ 两处别把话说满(R1 复核时自查出来的,原文说满了):
    //   · 退款有**两条腿,状态不同**(2026-08-12 并入 z5 后复核):USDT 本金腿已由 z5 改走
    //     `refundWithdrawalDebit`(无远端早退,判据是「扣过才退」)—— **remote 下会真退**;
    //     NEX 抵扣费腿仍走 `creditRewardBucketOnce`,它 `if (remoteApiEnabled) return false`
    //     —— remote 下仍是空转,归 z6。所以这里只声称账单与客服出口,不替 NEX 那条腿打包票。
    //     (本包 fork 时整条腿都空转,那句话已过期;并入主线时复核后改的。)
    //   · **孤块与死亡信件坍缩后不可区分** —— terminalReason 的闭集里没有对应档位,
    //     它承载的是「为什么终结」(风控/地址/资料/撤回/其他),不是「哪一种链上失败」。
    //     用户侧两者本就同一句话;要区分得先在后台加码,那是新契约,不在本包。
    case "TX_ORPHANED":
    case "DEAD":
      return "tx-failed";
    case "REFUNDED":
      return "refunded";
    case "SUBMITTED":
    // PENDING 是后台状态表里 SUBMITTED 的别名(D2 statusLabel 第一行就并列写着)。
    // 漏它的后果和上面 TX_ORPHANED 那族一模一样,而且多一条更重的:建单响应回 PENDING 时,
    // toCanonicalWithdrawal 会在单据入表**之前**抛 —— 服务端已经扣了钱,客户端连单号都没留下,
    // 用户跳到追踪页看见「查无此单」。app.ts 为这个最坏态写的防御在抛点之后,够不着。
    case "PENDING":
      return "submitted";
    default:
      throw new ApiError({ kind: "protocol", message: "WITHDRAWAL_STATUS_INVALID" });
  }
}

function canonicalRiskRoute(route: string): WithdrawalRiskRoute {
  const normalized = route.trim().toLowerCase();
  switch (normalized) {
    case "fast-pass":
      return "pass";
    case "delay":
      return "delay";
    case "manual":
    case "high-manual":
    case "escalated-manual":
    case "strong-review":
      return "manual";
    case "freeze":
      return "freeze";
    default:
      throw new ApiError({ kind: "protocol", message: "WITHDRAWAL_RESPONSE_INVALID" });
  }
}

/**
 * 终态原因码归一。**故意与 canonicalStatus 不对称:未知码回落 `other`,不抛。**
 *
 * 🔴 判据是「这个值驱动什么」:status 驱动钱与状态机(退款、账单结算、单槽占用),
 * 认不出就必须抛、绝不能猜;terminalReason 只驱动**显示哪一句话**。让它抛的话,
 * 运营在后台加一个新原因码,全体客户端就会在解析这一步炸掉 → 整张单据镜像失败 →
 * 单据永久停在「处理中」—— 那正是本包 §Why 第 2 条要消灭的缺陷,不能自己再造一个。
 * 回落到 `other`(闭集里本来就有的兜底档)用户看到的是通用话术 + 客服出口,是诚实降级。
 *
 * 漂移的**预防**在机器门(withdraw-terminal-reason-parity),不在运行期抛异常。
 */
function canonicalTerminalReason(value: string): WithdrawalTerminalReason {
  switch (value.trim().toUpperCase()) {
    case "RISK_HIT":
      return "risk-hit";
    case "ADDRESS_RISK":
      return "address-risk";
    case "DATA_MISMATCH":
      return "data-mismatch";
    case "USER_CANCELLED":
      return "user-cancelled";
    default:
      return "other";
  }
}

export function toCanonicalWithdrawal(
  submission: WithdrawalSubmission,
  address: string,
  submittedAt = submission.createdAt ?? Date.now(),
): Withdrawal {
  const estimatedCompletion = Date.parse(submission.holdUntil);
  if (!address.trim() || !Number.isFinite(estimatedCompletion)) {
    throw new ApiError({ kind: "protocol", message: "WITHDRAWAL_RESPONSE_INVALID" });
  }
  return {
    id: submission.withdrawalNo,
    amount: submission.amount,
    network: submission.chain,
    address: address.trim(),
    // 主线 FEAT-WD02 把 fee 从单数字改成结构化快照;服务端契约字段同语义、异命名:
    // networkFee→networkConfirmUsd · actualFee→actualFeeUsd · nexBurned 同名。
    // penaltyUsd 按主线口径「仅历史单存在,新单不生成」,故只在 >0 时带出。
    fee: {
      networkConfirmUsd: submission.networkFee,
      nexBurned: submission.nexBurned,
      actualFeeUsd: submission.actualFee,
      // 🔴 feeWaived 必须带出来:账单行的「减免 $X」原本用「毛费 − 实付」重建,
      // 漏 penaltyUsd 时会渲染成负数,而且那个数指的是三个源(z4 R2 P1-3)。
      // 服务端这一个字段就是权威值,parseSubmission 已按 `grossFee − feeWaived == actualFee` 校过。
      feeWaivedUsd: submission.feeWaived,
      ...(submission.penaltyFee > 0 ? { penaltyUsd: submission.penaltyFee } : {}),
    },
    status: canonicalStatus(submission.status),
    riskRoute: canonicalRiskRoute(submission.riskRoute),
    riskReasons: [],
    submittedAt,
    estimatedCompletion,
    // 🔴 顶层带出,不进 `fee`(fee 是报价快照,请求/响应同构;退款是事后事件)。
    // 提交回执上它**几乎恒为 0** —— 提交那一刻就被拒的单按规格是「零副作用、不烧 NEX」,
    // 没 NEX 可退。真正会带非 0 值的是**状态回查**端点。
    //
    // 🔴 **别指望那条端点会自动带上这个字段**(2026-08-11 独立审计当场证伪了我上一版的断言)。
    // 上一版这里写的是「那条端点复用本函数,字段自然跟着走,届时无需再改这里」——
    // 而回查端点已经在并行包 z7 里写完了:它有**自己的**响应类型与解析器
    // (`WithdrawalStatusSnapshot` / `parseStatusSnapshot`),只回 withdrawalNo/status/
    // confirmedAt/terminalReason/retriable 五个字段,**不经过本函数**,也就不带 `nexRefunded`。
    // 两包各自合入主线后,这条冲正照样一次都不会触发 —— 与本包声称修好的缺陷完全同形。
    // 我把「另一层会配合」当成了事实写进注释,这正是本包审计出的根因。
    // 现状与需要谁做什么,见 HANDOFF U-9;跨包判据由 `selfcheck-withdraw-nex-refund.mjs`
    // 的「回查响应字段 ⊇ 冲正判据字段」一格盯着。
    nexRefunded: submission.nexRefunded,
    // 🔴 时刻与金额**必须一起带出**:账单页按 `ts` 分月分组,冲正行只有拿到退款发生的时刻
    // 才落得进正确那个月。少带它,冲正行就只能盖提交时刻 —— 7 月提交、8 月退还会显示成 7 月的事
    // (见 lib/withdrawal-bill-drafts 的 `nexRefundAtMs`)。二者是同一件事实的两个面,别拆开传。
    nexRefundedAt: submission.nexRefundedAt,
  };
}

/**
 * 状态镜像解析。🔴 fail-closed:单号 / 状态任一不合法即抛,调用方保持原状再问一次 ——
 * 「问不到」绝不能降级成「自己判一个」,那正是本轮要消灭的东西。
 */
/**
 * 🔴 抛不抛,判据是**这个字段驱动什么**(2026-08-11 R2 审计;上一版按「类型对不对」分,分错了)。
 *
 *   · 驱动钱与状态机的(`status`、单号身份)→ **fail-closed,认不出必抛**。猜一个 = 拿钱赌。
 *   · 只驱动**显示哪一句话**的(`confirmedAt` / `terminalReason` / `retriable`)
 *     → **坏值一律降级成「没给」,绝不抛**。
 *
 * 为什么显示字段不许抛:抛出去被调用方 `.catch(() => null)` 吞掉 → **整张单据镜像失败** →
 * 这一单永久停在「处理中」,换绑入口与下一笔提现连带永久拦死。代价却只是一句话没显示。
 * 上一版让 `retriable` 类型不对就抛,等于「为了不显示错一句话,把用户的单子锁死」——
 * 而这正是本包 §Why 要消灭的那个缺陷,不能自己再造一个。
 */
function parseStatusSnapshot(value: unknown, expectedWithdrawalNo: string): WithdrawalStatusSnapshot {
  const row = record(value);
  const withdrawalNo = text(row?.withdrawalNo);
  const status = text(row?.status);
  if (!row || !withdrawalNo || !status) {
    throw new ApiError({ kind: "protocol", message: "WITHDRAWAL_RESPONSE_INVALID" });
  }
  // 🔴 身份必须对上(R2 审计):响应里的单号此前解析出来就没人看过,而调用方是按**请求的**
  // 单号落补丁的 —— 服务端一旦串号(反代缓存 / 并发 bug),另一张单的状态会被写到这张单上,
  // 顺带触发按状态走的退款与账单结算。这是拿钱赌,归 fail-closed 那一档。
  if (withdrawalNo !== expectedWithdrawalNo) {
    throw new ApiError({ kind: "protocol", message: "WITHDRAWAL_RESPONSE_INVALID" });
  }
  // 到账时刻:毫秒数或 ISO 串。读不出来就当没给 —— 它只用来显示「几点到的」,
  // 而调用方对 null 本来就有回落(取预计到账)。`0` 是服务端最常见的「未设置」哨兵值,
  // 上一版把它判成协议错并抛,一个哨兵值就能把整张单据锁死(R2 审计)。
  const rawConfirmedAt = row.confirmedAt;
  let confirmedAt: number | null = null;
  if (rawConfirmedAt !== null && rawConfirmedAt !== undefined && rawConfirmedAt !== "") {
    const parsed = typeof rawConfirmedAt === "number" ? rawConfirmedAt : Date.parse(String(rawConfirmedAt));
    confirmedAt = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  // 终态原因:只认字符串码;非字符串(对象 / 数组 / 数字)一律当没给,**不当成码吞掉**
  // ——「不认识的码回落 other」说的是码,不是「任何垃圾都是码」。
  // 认识不了的**字符串**码回落 `other`(闭集里本就有的兜底档):运营加新码不该打死老客户端。
  const rawReason = row.terminalReason;
  const terminalReason: WithdrawalTerminalReason | null =
    typeof rawReason === "string" && rawReason.trim() ? canonicalTerminalReason(rawReason) : null;
  // 可重试:只认布尔;其余一律当没给(页面对 null 的处理就是「不显示这句话」)。
  const rawRetriable = row.retriable;
  const retriable: boolean | null = typeof rawRetriable === "boolean" ? rawRetriable : null;
  // 退款事实(金额 + 时刻),**成对**解析。归「显示 / 账本补记」那一档,坏值降级成没给、绝不抛:
  // 抛出去会被调用方 .catch 吞掉,整张单据镜像失败 → 单子永久停在处理中(那正是本文件在修的坑)。
  // 只认正数;`0` / 负数 / 非数一律当没给 —— 「退了 0 枚」与「没退」在账本上是同一件事,
  // 而把 0 当成「有退款事实」会让合并层去覆盖一份真实的非 0 值。
  // 时刻同样接受毫秒数或 ISO 串(线上发 ISO-8601 字符串)。
  const positive = (v: unknown): number | null => {
    const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Date.parse(v) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const nexRefunded = typeof row.nexRefunded === "number" && Number.isFinite(row.nexRefunded) && row.nexRefunded > 0
    ? row.nexRefunded
    : null;
  const nexRefundedAt = positive(row.nexRefundedAt);
  return {
    withdrawalNo, status: canonicalStatus(status), confirmedAt, terminalReason, retriable,
    nexRefunded, nexRefundedAt,
  };
}

export function createWithdrawalApi(client: ApiClient): WithdrawalApi {
  return {
    list: async () => parseSubmissionList(await client.request({
      method: "GET", path: "/api/withdrawals",
    })),
    policy: async () => parsePolicy(await client.request({
      method: "GET",
      path: "/api/withdrawals/policy",
    })),
    eligibility: async (input) => parseEligibility(await client.request({
      method: "POST", path: "/api/withdrawals/eligibility",
      body: input,
      timeoutMs: 30_000,
    })),
    get: async (withdrawalNo) => parseStatusSnapshot(await client.request({
      method: "GET",
      path: `/api/withdrawals/${encodeURIComponent(withdrawalNo)}`,
    }), withdrawalNo),
    abandonAttempt: async (input) => {
      const key = input.idempotencyKey.trim();
      if (!key) throw new Error("WITHDRAWAL_ATTEMPT_KEY_REQUIRED");
      return parseAttemptAbandon(await client.request({
        method: "POST",
        path: `/api/withdrawals/attempts/${encodeURIComponent(key)}/abandon`,
        body: {
          amount: input.amount,
          chain: input.chain,
          address: input.address,
          policyVersion: input.policyVersion,
          useNexFeeOffset: input.useNexFeeOffset,
        },
        timeoutMs: 30_000,
      }));
    },
    submit: async (amount, chain, targetAddress, policyVersion, useNexFeeOffset, idempotencyKey) =>
      parseSubmission(await client.request({
        method: "POST",
        path: "/api/withdrawals",
        body: { amount, chain, address: targetAddress, policyVersion, useNexFeeOffset },
        idempotencyKey,
        timeoutMs: 30_000,
      })),
  };
}

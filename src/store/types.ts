import type { GpuTier, GpuTierId, WithdrawalRiskRoute } from "./config-types";
import type { EntrySurface } from "@/lib/entry-surface";

export type DeviceKind =
  | "phone"
  | "pc-gpu"
  | "stellarbox-s1"
  | "stellarbox-pro"
  | "stellarbox-pro-v2"
  | "stellarrack-p1"
  | "stellarrack-p2"
  | "cloud-share";

// "paused" was removed when manual device pause was dropped (a node is either
// running or involuntarily interrupted — no user opt-in pause). Involuntary
// gating is expressed via `pausedReason` + `interruptedAt`, never `status`.
export type DeviceStatus = "online" | "offline";

export type ThermalState = "nominal" | "fair" | "serious" | "critical";

// Mobile tasks pause below 20% battery or without a reachable network
// (Wi-Fi and cellular both qualify). Charging is telemetry, never a task gate.
// The shared policy lives in lib/phone-runtime.ts.

// 6 AI workload categories per design doc §5.2.4
export type TaskCategory = "IG" | "VG" | "LL" | "FT" | "EM" | "SP";

export const TASK_CATEGORY_LABEL: Record<TaskCategory, string> = {
  IG: "Image Gen",
  VG: "Video Gen",
  LL: "LLM Inference",
  FT: "Fine-tune",
  EM: "Embedding",
  SP: "Speech",
};

export interface CurrentTask {
  id: string;          // e.g. "IG-A78234"  ({category}-A{counter})
  category: TaskCategory;
  type: string;        // human label, e.g. "Image Gen"
  model: string;       // e.g. "Flux.1 [dev]"
  client: string;      // e.g. "Mosaic Studios"
  location: string;    // e.g. "Berlin, DE"
  totalSec: number;
  startedAt: number;   // epoch ms
  reward: number;      // USDT
}

export interface CompletedTask extends CurrentTask {
  completedAt: number;
  /** Server-issued Proof-of-Compute receipt number (remote mode only). */
  receiptNo?: string | null;
}

export interface Device {
  id: string;
  /** Server CAS version. Remote mutations must send this exact value. */
  rowVersion?: number;
  kind: DeviceKind;
  name: string;
  gpu: string;
  gpuTier?: GpuTierId;
  gpuModel?: string;
  vramTotal: number; // GB
  basePower: number; // W
  baseRate: number; // daily USDT (full-efficiency baseline; see lib/store/device-lifecycle.ts for current effective rate)
  baseRateNEX: number; // daily NEX (platform token, §8.1 80% of static yield)
  // Lifecycle (Sprint 2): set on device creation; drives the monthly efficiency
  // degradation curve in lib/store/device-lifecycle.ts. Cloud Share / phone are
  // exempt from degradation (compute is rented or co-located).
  purchasedAt: number; // epoch ms
  // Activation lifecycle (Sprint #146-1): null = purchased but inactive (not consuming a slot,
  // not contributing earnings/quest progress/promo variables);
  // number = epoch ms when user activated this device into one of the 6 slots.
  // Phone is auto-activated on signup; other devices start inactive and require user opt-in.
  activatedAt: number | null;
  // PRD §6.11 登记锚点: epoch ms of the last earnings settlement. Set on
  // activation (= registration), advanced by app.ts settle() on each accrual.
  // Earnings accrue by wall-clock (now - lastSettledAt), NOT by accumulated tick
  // time — so a closed/backgrounded gap is settled in one shot on reopen (mock;
  // PROD: the server holds this anchor and settles on the foreground call).
  // null = not currently earning (inactive / frozen); re-anchored on resume.
  lastSettledAt?: number | null;
  // SPEC-1 R7: last resident device-agent heartbeat. This drives the online
  // factor tier; the shell used to view the account never does. PROD replaces
  // the mock timestamp with the server-canonical conclusion produced from the
  // candidate POST /api/device/:id/heartbeat contract (PRD §6.11/§12.2).
  onlineHeartbeatAt?: number | null;
  // Sprint #146-1 supplement: when user requests "deactivate after current task
  // completes" (instead of forfeit-and-deactivate-now), this flag stays true
  // until tick() sees currentTask transition complete → triggers deactivation.
  // Cleared by activateDevice() and by tick() after auto-deactivation fires.
  pendingDeactivate?: boolean;
  status: DeviceStatus;
  // Live simulation state
  gpuUsage: number; // 0-100
  gpuTemp: number; // °C
  gpuPower: number; // W
  vramUsed: number; // GB
  currentTask: CurrentTask | null;
  recentTasks: CompletedTask[]; // last 10
  /** Server-authoritative post-completion task lock. Remote clients only display this value. */
  taskLockUntil?: number | null;
  todayEarnings: number;
  todayEarningsNEX: number;
  // FEAT-DEV02 置换阶梯分子: lifetime USD output of THIS device. Accrued ONLY by
  // app.ts settleDevice() in lockstep with todayEarnings; NEVER reset by
  // deactivation / today-zeroing. Multi-account snapshots merge it additively
  // (account-cloud ADDITIVE_NUMBER_KEYS three-way diff — no double count).
  // NEX output intentionally excluded from the trade-in base (FEAT-DEV02 ③).
  cumulativeEarningsUsdt: number;
  // FEAT-DEV02 置换阶梯分母: what the user actually paid (catalog price at
  // purchase today; promo pricing would write the actual paid amount). 0 =
  // free/gifted (phone, pc-gpu) → never trade-in eligible. Immutable once set.
  paidPriceUsdt: number;
  // For NexGridBox cards
  location?: string;
  hashRate?: number;
  dayCount?: number;
  // For phone kind (v3.2 mobile-first)
  batteryLevel?: number;       // 0-100 (%)
  isCharging?: boolean;
  /** True when the device has reachable network — Wi-Fi OR cellular both
   *  qualify. Reflects the heartbeat ping-test result; updated by the
   *  device agent on every workload assignment poll. Field name retained
   *  from v3.2 for storage compatibility; semantically "isOnline". */
  isWifiConnected?: boolean;
  thermalState?: ThermalState;
  // Computed each tick from runtime power/network state.
  // null = eligible (earnings accruing); string = paused, with the reason
  // surfaced in the device card status pill. Mirror "real" distributed-
  // compute apps which gate workload pickup on battery + network conditions.
  pausedReason?: "low-battery" | "no-network" | null;
  /** Epoch ms when the current power/network interruption began while a task
   *  was in flight; null/undefined = not interrupted. Drives the reconnect
   *  grace window (see lib/store/interrupt.ts): the task is held (suspended,
   *  no earnings) until conditions recover (same task resumes) or the window
   *  elapses (task cancelled → fresh task on recovery). Server-canonical in
   *  production; client mirrors only. */
  interruptedAt?: number | null;
  // ── Phone capability (calibration baseline) ──
  // Set by the calibration ritual via measureDeviceCapability() (or the legacy
  // fallback for an uncalibrated demo phone). Deterministic per login device →
  // displayed "算力" is monotonic with real device class and reproducible.
  /** Presented capability score 0–100 (typical phone ≈ 87). */
  capabilityScore?: number;
  /** Stable presented NPU throughput (TOPS) — the comparable "ceiling" number. */
  capabilityTops?: number;
  /** 1–5 capability tier. */
  capabilityTier?: number;
  /** Epoch ms when the phone began its CURRENT continuous mining run; null when
   *  paused/interrupted. Drives the live ContinuityFactor (stability bonus);
   *  reset by interruptAllTasks (session kick) and by new-device recalibration. */
  miningSince?: number | null;
}

// NOTE: 提现地址簿在 store/payout-address.ts 独立持久化
// (按账号作用域,localStorage persistence independent of useApp)。

export type UserTier = "L0" | "L1" | "L2" | "L3" | "L4" | "L5";

export interface EarningBuckets {
  withdrawableUsdt: number;
  pendingReviewUsdt: number;
  bonusLockedUsdt: number;
  lockedNex: number;
  policyVersion: string;
  lastBucketedAt: number;
}

export type EarningBucketRoute = "withdrawable" | "pending_review" | "bonus_locked" | "no_issue";

export interface UserState {
  email: string;
  tier: UserTier;
  joinedAt: number; // epoch ms
  referralCode: string;
  usdtBalance: number;
  nexBalance: number;
  pendingEarnings: number;
  earningBuckets: EarningBuckets;
  /** MOCK registration/reward idempotency receipts, merged with the same
   * account snapshot as the credited balances. PROD owns these on the
   * canonical reward transaction instead of client state. */
  appliedRewardKeys?: Record<string, true>;
  /** Lifetime sum of completed USDT deposits/topups. Used by tradein eligibility
   *  `cumulative-deposit-usdt` rule. Seeded 0; incremented ONLY by recordDeposit
   *  action (NOT earnings, NOT exchange, NOT trade-in credit,
   *  NOT weekly-quest reward).
   *  ⚠️ MOCK-ONLY: production server-canonical via
   *  GET /api/users/me.cumulativeDepositUsdt
   *  (TBD; candidate, not in PRD §9.11 — read endpoint name pending). */
  cumulativeDepositUsdt: number;
}

export interface EarningsState {
  today: number;             // USDT
  todayNEX: number;          // NEX (platform token)
  thisWeek: number;          // USDT rolling 7-day. (`GET /api/me/earnings?range=week` per PRD §9.11c.1)
  thisMonth: number;
  total: number;
  history: { ts: number; amount: number }[]; // recent entries
}

export interface GlobalStats {
  activeDevices: number;
  nodes: number;
  countries: number;
  uptime: number;
  activeJobs: number; // concurrent grid jobs (globe stat tile)
}

// SPEC-7 FEAT-RISK03 提现单状态机。主链 submitted → (review-pending →)
// review-passed → processing → sent → confirmed;异常态由风控路由/人工处置进入。
// "address-invalid" / "tx-failed" / "refunded" 为结构补全(mock 不驱动,PROD 服务端驱动)。
// Production: server is canonical; client polls `GET /api/withdrawals/:id`
// or subscribes to a websocket. Client never advances state.
export type WithdrawalStatus =
  | "submitted"
  | "review-pending" // K3 route manual/delay → D2 人工/延迟队列
  | "review-passed"
  | "processing"
  | "sent"
  | "confirmed"
  | "review-rejected" // 异常终态: 人工审核拒绝
  | "frozen" // 异常态: 风控/合规冻结(K3 route freeze 或 D2 处置)
  | "address-invalid"
  | "tx-failed"
  | "refunded";

/**
 * 提现终态原因码。**闭集与运营后台 D2「拒绝原因码」下拉同源**,不是本仓自造:
 * `admin-ops/app/components/domain-views/d-tabs/d2-withdrawals.tsx` 的
 * `options: ["RISK_HIT","ADDRESS_RISK","DATA_MISMATCH","USER_CANCELLED","OTHER"]`
 * —— 运营在那个下拉里选什么,用户这边就该看到对应的业务话术。
 * 逐值 parity 由 `scripts/withdraw-terminal-reason-parity.test.mjs` 焊死(两侧任一改动即红)。
 *
 * 🔴 线上名 ≠ 本地名:服务端发 SCREAMING_SNAKE,本地归一成 kebab-case
 * (与 WithdrawalStatus 同套路,归一在 api/withdrawal-api.ts 的 canonicalTerminalReason)。
 */
export type WithdrawalTerminalReason =
  | "risk-hit"
  | "address-risk"
  | "data-mismatch"
  | "user-cancelled"
  | "other";

/** FEAT-WD02 提现费快照(server 形状,POST /api/withdrawals 请求/响应同构)。
 *  fee 从单数字换成结构化快照;penaltyUsd 仅历史单可能存在(旧双费模型),新单**不生成**。
 *  存量数字 fee 在 account-cloud 读盘升级时归一(actualFeeUsd = 旧数字,
 *  networkConfirmUsd/nexBurned 不可考记 0,🔴 禁按新规则重算 —— 展示层只读 actualFeeUsd)。 */
export interface WithdrawalFeeSnapshot {
  /** 报价时的网络确认费(USD,按网络固定) */
  networkConfirmUsd: number;
  /** 实际烧掉的 NEX(用户开抵扣才 > 0) */
  nexBurned: number;
  /** 实收费用 = max(0, networkConfirmUsd − nexBurned × offsetRate) */
  actualFeeUsd: number;
  /** 仅历史单(旧惩罚费模型)存在;新单不生成该字段 */
  penaltyUsd?: number;
  /** 🔴 服务端下发的**减免额**(NEX 抵扣掉的那部分费用,USD)。
   *  契约里 `grossFee − feeWaived == actualFee` 是被 parseSubmission 校验过的等式,
   *  所以它是权威值。展示层**不许**用「毛费 − 实付」重建 —— 那个式子指的是三个源不是一个源,
   *  而且漏掉 penaltyUsd 时会算出负数(z4 R2 P1-3;本仓禁令:显示的钱必须指到单源)。
   *  历史单没有该字段。 */
  feeWaivedUsd?: number;
}

export interface Withdrawal {
  id: string;
  amount: number;
  network: "USDT-TRC20" | "USDT-BEP20" | "USDT-ERC20";
  address: string;
  fee: WithdrawalFeeSnapshot;
  status: WithdrawalStatus;
  riskRoute?: WithdrawalRiskRoute;
  riskReasons?: string[];
  /** FEAT-WD01a:本单是否命中小额免审快车道。 */
  fastLaneApplied?: boolean;
  /** FEAT-WD01a:被快车道免掉的闸名。必须随单落盘 —— 只算不存 = 事后审计与客服
   *  都还原不出「这单当时免了哪几道」,等于没做。与 riskReasons 同源同去处。 */
  waivedGates?: string[];
  submittedAt: number;
  estimatedCompletion: number;
  /** FEAT-WD01b:实际到账时刻(仅 confirmed 态有值)。推进逻辑见 withdrawal-arrival-core。 */
  confirmedAt?: number;
  /** 终态原因(服务端 GET /api/withdrawals/:id 镜像回来,仅终态有值)。
   *  🔴 必须随单落盘,不能只在内存:客服要查的正是这个,而用户刷新一次页面就该还在。
   *  与 riskReasons / waivedGates 同源同去处(码不直出,渲染时经 lib/risk-reason-text 翻成话术)。 */
  terminalReason?: WithdrawalTerminalReason;
  /** 服务端判定「能否就这笔重新发起」。缺省 = 服务端没说,页面按不限制处理。 */
  retriable?: boolean;
  // 注:本包一度加过一个「最后镜像时刻」字段来给三路合并做仲裁,已按主人 2026-08-12
  // 的范围决定撤回 —— 用设备墙钟做资金状态的裁决者需要可信时钟、跨端协调与字段级冲突
  // 规则,属独立的仲裁重构,不该由一张契约卡附带(独立审计实测:未校验的时钟偏前一小时
  // 即可把单据永久钉死)。同状态两份快照现按字段合并,见 account-cloud.mergeSameStatusWithdrawal。
  /** Server CAS version. Present for the isolated acceptance funds sandbox. */
  serverVersion?: number;
  source?: "mock" | "provider" | "server";
  sourceEnvironment?: "SANDBOX" | "PRODUCTION";
  /** 🔴 FEAT-WD01d:服务端**已经退还**的已烧 NEX 枚数(见 FEAT-WD01 §4.6)。
   *
   *  语义是**既成事实**不是打算退:服务端只在给用户加完 NEX 的同一事务里写它。
   *  客户端拿它当「退款真的发生过」的唯一证据,据此补冲正分录 —— 绝不由「单据是失败终态」
   *  倒推(z4 R2 那么改过,R3 独立审计判定为「账本单方面宣布一笔没有证据的退款」并回滚)。
   *
   *  缺失 / 0 = **没退**(不是「不知道」)。值域 `0 < nexRefunded ≤ fee.nexBurned`,
   *  越界一律不认(退得比烧的多 = 账本凭空造 NEX);判定收在 withdrawal-bill-drafts 一处。
   *  顶层字段而不是塞进 `fee`:`fee` 是**报价快照**且请求/响应同构,退款是事后事件,不属于报价。 */
  nexRefunded?: number;
  /** 🔴 FEAT-WD01 §4.6:退款**发生**的时刻(epoch ms;线上是 ISO-8601 字符串,解析层已转)。
   *
   *  为什么必须有这个字段:它与 `submittedAt` 可以差**几个月**(7 月提交、8 月才判失败退还),
   *  而账单页按分录的 `ts` 分月分组 —— 没有它,冲正行只能盖提交时刻,落进 7 月那一组、
   *  贴在当初「烧掉 N NEX」那行旁边;用户在 8 月的账单里找不到钱回来的记录,
   *  而钱包里的 NEX 确实是 8 月变的,两个口径对不上。
   *
   *  与 `nexRefunded` 是同一件事实的两个面:合并 / 传递 / 落盘一律**成对**,拆开取会配错单
   *  (合并规则见 account-cloud `pickRefundEvidence`)。缺失 = 不知道什么时候退的,
   *  由消费点回落到「客户端得知的此刻」,**绝不回落到 `submittedAt`**(那正是本字段要修的形态)。 */
  nexRefundedAt?: number;
}

// ── 入金(PAY-越南支付架构规格 v1.0 [FEAT-PAY01]③④ / [FEAT-PAY02]③)──────
// 全站唯一通道枚举,前后台单源(后台 D1 渠道配置 / C1 投入卡 channel 同源单写)。
export type DepositChannel =
  | "usdt-trc20"
  | "usdt-erc20"
  | "usdt-bep20"
  | "bank-vietqr"
  | "card-intl";

/** 链上三网络子集(专属地址 / txHash / 确认数仅链上通道适用)。 */
export type ChainDepositChannel = Extract<
  DepositChannel,
  "usdt-trc20" | "usdt-erc20" | "usdt-bep20"
>;

// [FEAT-PAY01] ④ 链上入金状态机:detected → confirming → credited(终态);
// 金额 < 最低额 → dust_hold → (credited | returned,后台人工处置)。
// credited/returned 终态禁任何再处置;status server-canonical,client 绝不本地推进。
export type DepositStatus = "detected" | "confirming" | "credited" | "dust_hold" | "returned";

/** 入金记录(三类通道共用;银行轨由意向单入账时生成并互相关联)。 */
export interface DepositRecord {
  /** server mint `DP-YYYYMMDD-NNNN`(与提现 WD- 同族),禁客户端造。 */
  depositId: string;
  channel: DepositChannel;
  /** 实收金额(链上按实际到账);两位小数。 */
  grossAmountUsdt: number;
  /** 按通道费率表(后台 D1 配置)server 计算;client 仅展示。 */
  feeUsdt: number;
  /** = gross − fee;入账额。 */
  creditedUsdt: number;
  /** 链上必:每用户 × 每网络专属充值地址(server 派发,恒定不轮换)。 */
  address?: string;
  /** 链上必:链上交易哈希 = 幂等键(同 txHash 重复上报 no-op)。 */
  txHash?: string;
  /** 卡轨必:收单方授权号 = 幂等键(同 authCode 重复回调 no-op)。 */
  authCode?: string;
  /** 链上必:当前确认数;server 推进。 */
  confirmations?: number;
  /** 链上必:默认 TRC20 20 · ERC20 12 · BEP20 15(后台 D1 可配)。 */
  requiredConfirmations?: number;
  status: DepositStatus;
  /** ms epoch,服务端时间戳。 */
  createdAt: number;
  creditedAt?: number;
}

// [FEAT-PAY02] ④ 银行轨意向单状态机(本文件只定形状;意向单生命周期动作归 A4)。
export type DepositIntentStatus =
  | "awaiting_payment"
  | "credited"
  | "expired"
  | "mismatch_review"
  | "cancelled"
  | "return_pending";

/** 入金意向单(VietQR 银行轨专用;入账时生成 DepositRecord 并互相关联)。 */
export interface DepositIntent {
  /** server mint `DP-YYYYMMDD-NNNN`(与链上同号段)。 */
  intentId: string;
  /** 用户输入;≥ $10 等值,≤ 单笔上限 $5,000(D1 可配)。 */
  usdtAmount: number;
  /** 下单锁定牌价([FEAT-PAY03] quoteRate);单上恒定,后续调价不影响在途单。 */
  fxRate: number;
  /** = round(usdtAmount × fxRate),精确到盾不凑整千;server 计算。 */
  vndAmount: number;
  /** server mint `NX-` + 6 位大写字母数字;在途期内全局唯一。 */
  memoCode: string;
  /** 收款账户池按轮换策略分配;server 派发(用户需完整账号转账,不脱敏)。 */
  bankAccount: { accountName: string; accountNumber: string; bankName: string };
  /** Optional server/provider-signed QR payload. Never synthesized by the client. */
  qrPayload?: string;
  status: DepositIntentStatus;
  /** 下单时刻(ms epoch,server 时钟)。入账时透传给 DepositRecord.createdAt ——
   *  否则单据的「创建 → 到账」耗时恒为 0,后台对账看不出真实等待时长。 */
  createdAt: number;
  /** ms epoch;创建 + 30min 锁价窗(宽限 10min,D1 可配)。 */
  expireAt: number;
  /** 回单实收金额(VND)。 */
  receivedVnd?: number;
  /** 回单匹配时间(ms epoch)。 */
  matchedAt?: number;
}

export interface AppState {
  accountKey: string;
  entrySurface: EntrySurface;
  accountCloudUpdatedAt: number;
  user: UserState;
  devices: Device[];
  visibleDevices: Device[];
  slotDevices: Device[];
  activeSlotCount: number;
  earnings: EarningsState;
  global: GlobalStats;
  latestWithdrawal: Withdrawal | null;
  // Actions
  bindAccount: (accountKey: string, entrySurface?: EntrySurface) => void;
  persistAccountSnapshot: () => void;
  tick: (deltaMs: number) => void;
  /** Adds a new inventory (inactive) device. Returns the new device id so
   *  callers can sequentially activate / debit / bill without guessing
   *  which device is "the new one" via `.filter(kind).pop()` heuristics
   *  (Batch C Round 1 P0 #4 — pop() picked wrong device when inventory
   *  already had a same-kind device at higher array index). */
  addDevice: (kind: DeviceKind, options?: { gpuModel?: string; gpuTier?: GpuTier; gpuTiers?: GpuTier[] }) => string;
  // Sprint #146-1 — slot lifecycle. activateDevice sets activatedAt=now and
  // refuses if active count already at MAX_DEVICES. deactivateDevice clears
  // activatedAt + zeroes runtime telemetry so the device exits earnings/quest
  // contribution while remaining in inventory.
  activateDevice: (id: string, reservedSlots?: number) => boolean;  // returns false on cap hit / not found / already active
  connectComputeShareDevice: (gpuModel?: string, reservedSlots?: number) => {
    ok: boolean;
    deviceId?: string;
    reason?: "disabled" | "slots-full" | "activation-failed";
  };
  deactivateDevice: (id: string) => void;
  /** Marks device for deactivation after current task completes; tick() picks it up. */
  scheduleDeactivation: (id: string) => void;
  /** ⚠️ MOCK-ONLY: demo helper. Lets the UI toggle isCharging /
   *  isWifiConnected / batteryLevel on a phone device. Real backend pulls
   *  these from device-agent heartbeat — client must NOT mutate. */
  setPhoneRuntime: (
    id: string,
    patch: Partial<Pick<Device, "isCharging" | "isWifiConnected" | "batteryLevel">>,
  ) => void;
  // FEAT-DEV02 upgrade trade-in — there is deliberately NO dedicated store
  // action: the checkout persist block composes it atomically (debit net →
  // remove old device → createOrder{tradeInCredit, tradeInDeviceId} → bill).
  // Credit = computeTradeInCredit(paidPriceUsdt, cumulativeEarningsUsdt,
  // targetPrice) — checkout-only, NEVER credited to balance. Production:
  // POST /api/orders carries tradeInDeviceId; server re-computes the credit
  // and retires the device in the same transaction.
  /** Atomic deposit: credits usdtBalance + bumps cumulativeDepositUsdt in ONE set.
   *  Topup page calls this instead of bare creditBalance so eligibility rules
   *  (`cumulative-deposit-usdt`) stay in sync with actual deposit flow. */
  recordDeposit: (amount: number) => boolean;
  // Sprint 2 third phase — prototype demo helpers (PM-facing, not user-facing)
  _devSeedLegacyDevice: (kind: DeviceKind, monthsAgo: number) => void;
  _devFastForwardAll: (months: number) => void;
  _devResetDevices: () => void;
  // Sprint A-1 / E.2 — bump lifetime earnings to trigger milestone celebrations on demand
  _devBumpEarningsTotal: (amountUSD: number) => void;
  creditBalance: (amount: number) => void;
  debitBalance: (amount: number) => boolean; // returns false if insufficient
  creditNex: (amount: number) => void;
  debitNex: (amount: number) => boolean;
  creditRewardBucket: (route: EarningBucketRoute, usdt: number, nex?: number) => boolean;
  submitWithdrawal: (
    amount: number,
    network: Withdrawal["network"],
    address: string,
    fee: WithdrawalFeeSnapshot,
    offsetWithNex: boolean,
    policyVersion: string,
    idempotencyKey: string,
    riskRoute?: WithdrawalRiskRoute,
    riskReasons?: string[],
    fastLaneApplied?: boolean,
    waivedGates?: string[],
  // FEAT-WD02: fee = 结构化快照(server 复验等式)。回**整张单**,调用方按服务端回执记账,
  // 不拿本地报价编数。🔴 没有 null 返回:所有拒单路径(余额/额度/风控/快照非法)自 2026-08-10
  // 起都在服务端,客户端只会**抛**(ApiError),不会静默回一个空值 —— 保留 `| null` 会让
  // 调用方写出一条永不执行的死分支,并诱导下一个读者以为余额闸还在客户端(z4 R2 P2-5)。
  ) => Promise<Withdrawal>;
  /** 建单成功后把这笔提现的钱**真的**从余额里扣掉(账单主行 `-wd.amount` 的资金面)。
   *  按单号幂等、全有或全无;false = 没扣成(余额不足 / 落盘失败),调用方必须交底。
   *  失败终态由 refundFailedWithdrawals 对称退回 —— 两者是一对,别只接其中一个。 */
  applyWithdrawalDebit: (wd: Withdrawal) => boolean;
  /** ⚠️ DEV/DEMO-ONLY: 仅 pass 路由可推进主链状态(SPEC-7: client 不推进风控队列)。 */
  _devAdvanceWithdrawal: () => void;
  /** ⚠️ DEV/DEMO-ONLY: 模拟 D2 人工放行全部待审收益(mock 双端不打通,DR-7)。 */
  _devGrantManualRelease: () => void;
}

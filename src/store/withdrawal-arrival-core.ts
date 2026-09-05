import type { Withdrawal, WithdrawalStatus } from "@/store/types";

// FEAT-WD01b 到账推进(纯逻辑,零 vue / pinia / uni 依赖 —— 可被 node 直跑做行为测试)。
//
// 拆成纯函数的原因与 withdrawal-eligibility-core 同源(2026-07-31 熔断结论):
// 「非 pass 路由永不自动到账」「补齐不重复推进」都是**行为**约束,
// 只有能直跑的纯函数才守得住;源码结构哨兵历史上被连续攻破四种绕法。
//
// PROD:状态由服务端 webhook/SSE 权威推进,client 只消费。本模块是 mock 期的
// 唯一推进源,形态刻意做成「输入单据 → 输出新单据或 null」,接真后端时整块删掉即可。

/** 到账时效默认值(小时)。后台 D5 `payoutSlaHours` 单源,此处仅坏配置兜底。 */
export const DEFAULT_PAYOUT_SLA_HOURS = 24;
/** 后台 D5 值域:1 小时 – 7 天。前后台同域,防坏配置把到账算成 0 或几年。 */
export const PAYOUT_SLA_HOURS_MIN = 1;
export const PAYOUT_SLA_HOURS_MAX = 168;
/** 大额审查窗口值域(天)。上限 30 —— 运营把「天」当「小时」填(如 3650)会把到账算到十几年后。 */
export const PAYOUT_REVIEW_WINDOW_DAYS_MAX = 30;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export interface ArrivalRules {
  /** 正常到账等待小时数(后台 D5 payoutSlaHours,默认 24 = 次日到账)。 */
  payoutSlaHours: number;
  /** 大额合规审查窗口(天,后台 D5 cooldownDays)。0 = 该阶段不加审查窗口。 */
  payoutReviewWindowDays: number;
  /** 大额线(USD)。金额 ≥ 此值才可能命中审查窗口。 */
  largeAmountUsdt: number;
}

/**
 * 到账时效兜底:坏配置一律回落到 24h 并夹进 [1,168]。
 * 🔴 方向是**故意保守**的 —— 回落到 0 会让所有单据「一提交就已到账」,
 * 那是把钱说成已经付了却没付,比多等一天危险得多。
 */
export function normalizeSlaHours(hours: number): number {
  if (!Number.isFinite(hours) || hours <= 0) return DEFAULT_PAYOUT_SLA_HOURS;
  return Math.min(PAYOUT_SLA_HOURS_MAX, Math.max(PAYOUT_SLA_HOURS_MIN, hours));
}

/**
 * 预计到账时刻 = 提交 + 到账时效;命中大额审查时与「提交 + 审查窗口」**取更晚者**。
 * 命中判定:金额 ≥ 大额线 且 审查窗口 > 0(窗口为 0 = 该运营阶段未开审查)。
 */
/**
 * 大额审查窗口天数的**单源**夹取。
 *
 * 抽出来是因为文案侧也要用:风险披露里那句「进入 N 天增强合规审查窗口」原本直接铺配置原值,
 * 而实现这边夹到 30 天 —— 运营把「天」当「小时」填(如 3650),系统按 30 天算到账,
 * 而**用户勾了「我已阅读」的那份文件**会写「3650 天」。两处口径必须同一个函数(2026-08-01 审计)。
 */
export function normalizeReviewWindowDays(days: number): number {
  if (!Number.isFinite(days) || days <= 0) return 0;
  return Math.min(PAYOUT_REVIEW_WINDOW_DAYS_MAX, days);
}

export function estimateArrivalAt(submittedAt: number, amountUsdt: number, rules: ArrivalRules): number {
  const base = submittedAt + normalizeSlaHours(rules.payoutSlaHours) * HOUR_MS;
  const days = normalizeReviewWindowDays(rules.payoutReviewWindowDays);
  const line = rules.largeAmountUsdt;
  const hitsReview =
    Number.isFinite(days) && days > 0 &&
    Number.isFinite(line) && line > 0 &&
    Number.isFinite(amountUsdt) && amountUsdt >= line;
  if (!hitsReview) return base;
  return Math.max(base, submittedAt + days * DAY_MS);
}

/**
 * 可被自动推进的状态白名单 —— 主链非终态。
 * 🔴 `review-pending` / `frozen` / 各异常终态**不在**其中:人工审核与风控冻结
 * 的推进权在服务端/人工手上,client 自动放行等于绕过审核。
 */
const ADVANCEABLE: readonly WithdrawalStatus[] = ["submitted", "review-passed", "processing", "sent"];

/**
 * 终态清单(穷举)。单槽占用判定用它取反 —— **别去列举在途态**:
 * 那份清单原本是给「在途禁换绑」用的,漏了 sent;拿来当单槽闸就漏出一个洞
 * (sent 状态下再提一笔会把前一单整个顶掉,前一单的钱已扣、单据从此不可达)。
 * 状态枚举加新值时,不主动加进这里就自动按「在途」处理 —— 失败方向偏保守。
 */
const TERMINAL_STATUSES: readonly WithdrawalStatus[] = [
  "confirmed", "review-rejected", "address-invalid", "tx-failed", "refunded",
];

/** 这张单还占着那唯一的单据槽位吗(非终态即占用)。 */
export function occupiesWithdrawalSlot(status: WithdrawalStatus | undefined): boolean {
  return status !== undefined && !TERMINAL_STATUSES.includes(status);
}

/** 本次推进的权威来源。`serverAuthoritative: true` = 远端模式:状态归服务端,client 永不自推。 */
export interface AdvanceContext {
  /**
   * 🔴 必填(不给默认值)。远端模式下单据是**服务端签发**的(app.submitWithdrawal 把
   * 服务端返回的 holdUntil 原样落进 estimatedCompletion),而本函数的判据是设备墙钟 ——
   * 把手机时间往后拨,App 就会宣布「钱已到账」并解掉在途闸(换绑收款地址 / 第二笔提现)。
   * 钱其实一分没动。
   *
   * 做成**必填参数**而不是可选开关:新调用点不写就编译不过,忘记 = 红,而不是默认伪造。
   */
  serverAuthoritative: boolean;
}

/**
 * 到点推进:满足条件返回**新单据**(不可变),否则返回 null 表示不动。
 *
 * 幂等性由「confirmed 不在白名单里」天然保证:推进过的单再进来直接 null,
 * 调用方拿到 null 就不写盘,关 App 三天再打开也只补齐一次。
 *
 * `confirmedAt` 记的是 `estimatedCompletion` 而不是 `now` —— 钱是在到点那刻到的,
 * 不是在用户打开 App 那刻到的;取定值也让补齐结果与打开时机无关(可复现)。
 */
export function advanceArrival(
  wd: Withdrawal | null | undefined,
  now: number,
  ctx: AdvanceContext,
): Withdrawal | null {
  if (!wd) return null;
  // 🔴 第一道:远端模式一律不推进。真状态由 GET /api/withdrawals/:id 回镜像
  //    (app.refreshRemoteWithdrawals),client 只消费不裁决。
  if (ctx.serverAuthoritative) return null;
  // 🔴 双重判定:路由与状态各挡一层。manual/delay 建单即 review-pending、freeze 即 frozen,
  // 状态判定本已覆盖;但 riskRoute 是这条规则的**语义单源**,漏了它以后有人加新状态就破了。
  if (wd.riskRoute !== undefined && wd.riskRoute !== "pass") return null;
  if (!ADVANCEABLE.includes(wd.status)) return null;
  if (!Number.isFinite(wd.estimatedCompletion)) return null;
  if (now < wd.estimatedCompletion) return null;
  // 只改状态与到账时间 —— 金额 / 手续费 / 余额一律不碰(推进不是记账事件,
  // 钱在提交时就已扣。碰了就会「不重复记账」失守)。
  return { ...wd, status: "confirmed", confirmedAt: wd.estimatedCompletion };
}
